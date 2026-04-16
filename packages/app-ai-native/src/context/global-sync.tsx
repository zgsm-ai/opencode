import type { OpencodeClient, Project, Todo } from "@opencode-ai/sdk/v2/client"
import { showToast } from "@opencode-ai/ui/toast"
import { getFilename } from "@opencode-ai/util/path"
import {
  createContext,
  getOwner,
  onCleanup,
  onMount,
  type ParentProps,
  Show,
  untrack,
  useContext,
} from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { Persist, persisted } from "@/utils/persist"
import type { InitError } from "../pages/error"
import { useGlobalSDK } from "./global-sdk"
import { bootstrapDirectory, bootstrapGlobal } from "./global-sync/bootstrap"
import { createChildStoreManager } from "./global-sync/child-store"
import { applyDirectoryEvent, applyGlobalEvent } from "./global-sync/event-reducer"
import { createRefreshQueue } from "./global-sync/queue"
import { estimateRootSessionTotal, loadRootSessionsWithFallback } from "./global-sync/session-load"
import { trimSessions } from "./global-sync/session-trim"
import type { ProjectMeta } from "./global-sync/types"
import { SESSION_RECENT_LIMIT } from "./global-sync/types"
import { sanitizeProject } from "./global-sync/utils"
import { formatServerError } from "@/utils/server-errors"
import { useConversationAdapter, sdkAdapter } from "./device-adapter"
import { workspaceKey } from "@/pages/layout/helpers"

type GlobalStore = {
  ready: boolean
  error?: InitError
  project: Project[]
  session_todo: {
    [sessionID: string]: Todo[]
  }
  reload: undefined | "pending" | "complete"
}

function createGlobalSync() {
  const globalSDK = useGlobalSDK()
  const language = useLanguage()
  const owner = getOwner()
  if (!owner) throw new Error("GlobalSync must be created within owner")

  const sdkCache = new Map<string, OpencodeClient>()
  const booting = new Map<string, Promise<void>>()
  const booted = new Map<string, number>()
  const sessionLoads = new Map<string, Promise<void>>()
  const sessionMeta = new Map<string, { limit: number }>()

  const [projectCache, setProjectCache, projectInit] = persisted(
    Persist.global("globalSync.project", ["globalSync.project.v1"]),
    createStore({ value: [] as Project[] }),
  )

  const [globalStore, setGlobalStore] = createStore<GlobalStore>({
    ready: false,
    project: projectCache.value,
    session_todo: {},
    reload: undefined,
  })

  let active = true
  let projectWritten = false

  onCleanup(() => {
    active = false
  })

  const cacheProjects = () => {
    setProjectCache(
      "value",
      untrack(() => globalStore.project.map(sanitizeProject)),
    )
  }

  const setProjects = (next: Project[] | ((draft: Project[]) => void)) => {
    projectWritten = true
    if (typeof next === "function") {
      setGlobalStore("project", produce(next))
      cacheProjects()
      return
    }
    setGlobalStore("project", reconcile(next, { key: "id" }))
    cacheProjects()
  }

  const setBootStore = ((...input: unknown[]) => {
    if (input[0] === "project" && Array.isArray(input[1])) {
      setProjects(input[1] as Project[])
      return input[1]
    }
    return (setGlobalStore as (...args: unknown[]) => unknown)(...input)
  }) as typeof setGlobalStore

  const set = ((...input: unknown[]) => {
    if (input[0] === "project" && (Array.isArray(input[1]) || typeof input[1] === "function")) {
      setProjects(input[1] as Project[] | ((draft: Project[]) => void))
      return input[1]
    }
    return (setGlobalStore as (...args: unknown[]) => unknown)(...input)
  }) as typeof setGlobalStore

  if (projectInit instanceof Promise) {
    void projectInit.then(() => {
      if (!active) return
      if (projectWritten) return
      const cached = projectCache.value
      if (cached.length === 0) return
      setGlobalStore("project", cached)
    })
  }

  const setSessionTodo = (sessionID: string, todos: Todo[] | undefined) => {
    if (!sessionID) return
    if (!todos) {
      setGlobalStore(
        "session_todo",
        produce((draft) => {
          delete draft[sessionID]
        }),
      )
      return
    }
    setGlobalStore("session_todo", sessionID, reconcile(todos, { key: "id" }))
  }

  const paused = () => untrack(() => globalStore.reload) !== undefined

  const queue = createRefreshQueue({
    paused,
    bootstrap,
    bootstrapInstance,
  })

  const children = createChildStoreManager({
    owner,
    isBooting: (directory) => booting.has(directory),
    isLoadingSessions: (directory) => sessionLoads.has(directory),
    onBootstrap: (directory) => {
      void bootstrapInstance(directory)
    },
    onDispose: (directory) => {
      queue.clear(directory)
      sessionMeta.delete(directory)
      sdkCache.delete(directory)
    },
  })

  const sdkFor = (directory: string) => {
    const cached = sdkCache.get(directory)
    if (cached) return cached
    const sdk = globalSDK.createClient({
      directory,
      throwOnError: true,
    })
    sdkCache.set(directory, sdk)
    return sdk
  }

  async function loadSessions(directory: string) {
    if (!active) return
    const pending = sessionLoads.get(directory)
    if (pending) return pending

    children.pin(directory)
    const [store, setStore] = children.child(directory, { bootstrap: false })
    const meta = sessionMeta.get(directory)
    if (meta && meta.limit >= store.limit) {
      const next = trimSessions(store.session, {
        limit: store.limit,
        permission: store.permission,
      })
      if (next.length !== store.session.length) {
        setStore("session", reconcile(next, { key: "id" }))
      }
      children.unpin(directory)
      return
    }

    const limit = Math.max(store.limit + SESSION_RECENT_LIMIT, SESSION_RECENT_LIMIT)
    const api = useConversationAdapter()
    const promise = loadRootSessionsWithFallback({
      directory,
      limit,
      list: (query) => api.sessionList(query.directory) as Promise<{ data?: import("@opencode-ai/sdk/v2/client").Session[] }>,
    })
      .then((x) => {
        if (!active) return
        const nonArchived = (x.data ?? [])
          .filter((s) => !!s?.id)
          .filter((s) => !s.time?.archived)
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        const limit = store.limit
        const childSessions = store.session.filter((s) => !!s.parentID)
        const sessions = trimSessions([...nonArchived, ...childSessions], {
          limit,
          permission: store.permission,
        })
        setStore(
          "sessionTotal",
          estimateRootSessionTotal({
            count: nonArchived.length,
            limit: x.limit,
            limited: x.limited,
          }),
        )
        setStore("session", reconcile(sessions, { key: "id" }))
        sessionMeta.set(directory, { limit })
      })
      .catch((err) => {
        console.error("Failed to load sessions", err)
        const project = getFilename(directory)
        showToast({
          variant: "error",
          title: language.t("toast.session.listFailed.title", { project }),
          description: formatServerError(err, language.t),
        })
      })

    sessionLoads.set(directory, promise)
    promise.finally(() => {
      sessionLoads.delete(directory)
      children.unpin(directory)
    })
    return promise
  }

  async function bootstrapInstance(directory: string) {
    if (!active) return
    if (!directory) return
    const pending = booting.get(directory)
    if (pending) {
      return pending
    }
    const last = booted.get(directory)
    if (last && Date.now() - last < BOOT_COOLDOWN_MS) return

    children.pin(directory)
    const promise = (async () => {
      if (!active) return
      const child = children.ensureChild(directory)
      const cache = children.vcsCache.get(directory)
      if (!cache) return
      const sdk = sdkFor(directory)
      await bootstrapDirectory({
        directory,
        sdk,
        api: sdkAdapter(sdk),
        baseUrl: globalSDK.createClient({ directory, throwOnError: true }).getConfig().baseUrl ?? "",
        store: child[0],
        setStore: child[1],
        vcsCache: cache,
        loadSessions,
        translate: language.t,
      })
    })()

    booting.set(directory, promise)
    promise.finally(() => {
      booting.delete(directory)
      booted.set(directory, Date.now())
      children.unpin(directory)
    })
    return promise
  }

  const unsub = globalSDK.event.listen((e) => {
    if (!active) return
    const event = e.details
    const raw = e.name === "global" ? (inferDirectory(event) ?? e.name) : e.name
    const directory = raw === "global" ? raw : workspaceKey(raw)

    if (directory === "global") {
      applyGlobalEvent({
        event,
        project: globalStore.project,
        refresh: queue.refresh,
        setGlobalProject: setProjects,
      })
      if (event.type === "server.connected" || event.type === "global.disposed") {
        if (event.type === "global.disposed") {
          lastBoot = 0
          booted.clear()
        }
        const skip = event.type !== "global.disposed" && globalSDK.isReconnect()
        const dirs = Object.keys(children.children)
        if (!skip) {
          for (const directory of dirs) {
            queue.push(directory)
          }
        }
      }
      return
    }

    const existing = children.children[directory]
    if (!existing) return
    children.mark(directory)
    if (event.type === "server.instance.disposed") {
      booted.delete(directory)
    }
    const [store, setStore] = existing
    applyDirectoryEvent({
      event,
      directory,
      store,
      setStore,
      push: queue.push,
      setSessionTodo,
      vcsCache: children.vcsCache.get(directory),
      loadLsp: () => {
        if (!active) return
        sdkFor(directory)
          .agent.lsp()
          .then((x) => {
            if (!active) return
            setStore("lsp", (x as any)?.data ?? x ?? [])
          })
      },
    })
  })

  onCleanup(unsub)
  onCleanup(() => {
    queue.dispose()
  })
  onCleanup(() => {
    for (const directory of Object.keys(children.children)) {
      children.disposeDirectory(directory)
    }
  })

  let pending: Promise<void> | undefined
  let lastBoot = 0
  const BOOT_COOLDOWN_MS = 2_000

  const dirForSession = (sessionID: string | undefined) => {
    if (!sessionID) return
    return Object.entries(children.children).find(([, child]) => child[0].session.some((s) => s.id === sessionID))?.[0]
  }

  const dirForMessage = (messageID: string | undefined) => {
    if (!messageID) return
    return Object.entries(children.children).find(([, child]) =>
      Object.values(child[0].message).some((messages) => messages?.some((m) => m.id === messageID)),
    )?.[0]
  }

  const inferDirectory = (event: { type: string; properties?: unknown }) => {
    switch (event.type) {
      case "session.created":
      case "session.updated":
      case "session.deleted":
        return (event.properties as { info?: { directory?: string | null } })?.info?.directory ?? undefined
      case "session.diff":
      case "todo.updated":
      case "session.status":
      case "permission.replied":
      case "question.replied":
      case "question.rejected":
        return dirForSession((event.properties as { sessionID?: string })?.sessionID)
      case "message.updated":
        return dirForSession((event.properties as { info?: { sessionID?: string } })?.info?.sessionID)
      case "message.removed":
        return dirForSession((event.properties as { sessionID?: string })?.sessionID)
      case "message.part.updated":
        return dirForMessage((event.properties as { part?: { messageID?: string } })?.part?.messageID)
      case "message.part.removed":
      case "message.part.delta":
        return dirForMessage((event.properties as { messageID?: string })?.messageID)
      case "permission.asked":
      case "question.asked":
        return dirForSession((event.properties as { sessionID?: string })?.sessionID)
    }
  }

  async function bootstrap() {
    if (!active) return
    if (pending) {
      return pending
    }
    if (Date.now() - lastBoot < BOOT_COOLDOWN_MS) return
    pending = bootstrapGlobal({
      api: sdkAdapter(globalSDK.client),
      connectErrorTitle: language.t("dialog.server.add.error"),
      connectErrorDescription: language.t("error.globalSync.connectFailed", {
        url: globalSDK.url,
      }),
      requestFailedTitle: language.t("common.requestFailed"),
      translate: language.t,
      formatMoreCount: (count) => language.t("common.moreCountSuffix", { count }),
      setGlobalStore: setBootStore,
    }).finally(() => {
      pending = undefined
      lastBoot = Date.now()
    })
    await pending
  }

  onMount(() => {
    void bootstrap()
  })

  const projectApi = {
    loadSessions,
    meta(directory: string, patch: ProjectMeta) {
      children.projectMeta(directory, patch)
    },
    icon(directory: string, value: string | undefined) {
      children.projectIcon(directory, value)
    },
  }

  return {
    data: globalStore,
    set,
    get ready() {
      return globalStore.ready
    },
    get error() {
      return globalStore.error
    },
    child: children.child,
    bootstrap,
    project: projectApi,
    todo: {
      set: setSessionTodo,
    },
  }
}

const GlobalSyncContext = createContext<ReturnType<typeof createGlobalSync>>()

export { GlobalSyncContext }

export function GlobalSyncProvider(props: ParentProps) {
  const value = createGlobalSync()

  return (
    <GlobalSyncContext.Provider value={value}>
      <Show
        when={value.ready}
        fallback={
          <div class="flex h-full w-full min-h-0">
            <div class="flex flex-col gap-2 p-3 w-[var(--sidebar-width,280px)] shrink-0 border-r border-border-base">
              <div class="h-6 w-3/4 rounded-md bg-surface-raised-base opacity-60 animate-pulse" />
              <div class="flex flex-col gap-1 mt-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <div class="h-8 w-full rounded-md bg-surface-raised-base opacity-60 animate-pulse" />
                ))}
              </div>
            </div>
            <div class="flex-1 min-h-0 flex items-center justify-center">
              <div class="h-5 w-5 rounded-full border-2 border-border-base border-t-text-dimmed animate-spin" />
            </div>
          </div>
        }
      >
        {props.children}
      </Show>
    </GlobalSyncContext.Provider>
  )
}

export function useGlobalSync() {
  const context = useContext(GlobalSyncContext)
  if (!context) throw new Error("useGlobalSync must be used within GlobalSyncProvider")
  return context
}

export { canDisposeDirectory, pickDirectoriesToEvict } from "./global-sync/eviction"
export { estimateRootSessionTotal, loadRootSessionsWithFallback } from "./global-sync/session-load"
