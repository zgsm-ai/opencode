import { Show, For, createMemo, createSignal, createEffect, on, onCleanup, batch } from "solid-js"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { createStore, produce, reconcile } from "solid-js/store"
import { createAutoScroll } from "@opencode-ai/ui/hooks"
import { DataProvider } from "@opencode-ai/ui/context"
import { FileComponentProvider } from "@opencode-ai/ui/context/file"
import { File } from "@opencode-ai/ui/file"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { Card } from "@opencode-ai/ui/card"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useDeviceSDK } from "@/context/device-sdk"
import { useDeviceWorkspace } from "@/context/device-workspace"
import { useDeviceSession } from "@/context/device-session"
import { useDeviceLocal } from "@/context/device-local"
import { deviceAdapter, ConversationAdapterContext } from "@/context/device-adapter"
import { useDiff } from "@/context/device-file"
import { useLanguage } from "@/context/language"
import { useFile } from "@/context/file"
import { SyncContext } from "@/context/sync"
import { LocalContext } from "@/context/local"
import { SDKContext } from "@/context/sdk"
import { PromptProvider } from "@/context/prompt"
import { CommentsContext } from "@/context/comments"
import { PermissionContext } from "@/context/permission"
import { CommandContext } from "@/context/command"
import { GlobalSyncContext } from "@/context/global-sync"
import { SettingsContext } from "@/context/settings"
import { DirectoryContext } from "@/context/directory"
import { LayoutContext } from "@/context/layout"
import { FileContext } from "@/context/file"
import { NewSessionView } from "@/components/session/session-new-view"
import { MessageTimeline } from "@/pages/session/message-timeline"
import { SessionComposerRegion } from "@/pages/session/composer/session-composer-region"
import { createDeviceSessionComposerState } from "@/pages/session/composer/device-session-composer-state"
import { createScrollSpy } from "@/pages/session/scroll-spy"
import { useContentTabs } from "@/context/content-tabs"
import type {
  Message,
  Part,
  Session,
  SessionStatus,
  FileDiff,
  Todo,
  Command,
  Agent,
  VcsInfo,
  ProviderListResponse,
  PermissionRequest,
  QuestionRequest,
} from "@opencode-ai/sdk/v2/client"
import type { Project, Path } from "@opencode-ai/sdk/v2/client"
import type { ProviderCapability, ProviderCapabilitiesResponse } from "@/context/global-sync/types"

import { SessionQrCodeContent } from "./session-qrcode-dialog"
import { env } from "@/lib/env"

const emptyMessages: Message[] = []
const idle: SessionStatus = { type: "idle" }
const busySinceMap = new Map<string, number>()

function legacyProvider(input: ProviderCapabilitiesResponse): ProviderListResponse {
  return {
    all: input.connected.map((provider) => ({
      id: provider.id,
      name: provider.name,
      source: provider.source,
      env: [],
      options: {},
      models: Object.fromEntries(
        Object.entries(provider.models).map(([key, model]) => [
          key,
          {
            id: model.id,
            providerID: provider.id,
            api: { id: "", url: "", npm: "" },
            name: model.name,
            ...(model.family ? { family: model.family } : {}),
            capabilities: {
              temperature: model.capabilities.temperature,
              reasoning: model.capabilities.reasoning,
              attachment: model.capabilities.attachment,
              toolcall: model.capabilities.toolcall,
              input: model.capabilities.input,
              output: model.capabilities.output,
              interleaved: model.capabilities.interleaved,
            },
            cost: model.cost
              ? {
                  input: model.cost.input,
                  output: model.cost.output,
                  cache: {
                    read: model.cost.cache.read,
                    write: model.cost.cache.write,
                  },
                  experimentalOver200K: model.cost.experimentalOver200K
                    ? {
                        input: model.cost.experimentalOver200K.input,
                        output: model.cost.experimentalOver200K.output,
                        cache: {
                          read: model.cost.experimentalOver200K.cache.read,
                          write: model.cost.experimentalOver200K.cache.write,
                        },
                      }
                    : undefined,
                }
              : { input: 0, output: 0, cache: { read: 0, write: 0 } },
            limit: model.limit,
            status: model.status,
            options: {},
            headers: {},
            release_date: model.release_date,
            variants: model.variants,
          },
        ]),
      ),
    })),
    default: Object.fromEntries(
      input.connected.flatMap((provider) => (provider.default_model ? [[provider.id, provider.default_model]] : [])),
    ),
    connected: input.connected.map((provider) => provider.id),
  }
}

export function DeviceSessionTab(props: { tabId: string }) {
  const device = useDeviceSDK()
  const workspace = useDeviceWorkspace()
  const session = useDeviceSession()
  const local = useDeviceLocal()
  const language = useLanguage()
  const file = useFile()
  const diffCtx = useDiff()
  const tabStore = useContentTabs()
  const dialog = useDialog()

  const [createdSessionID, setCreatedSessionID] = createSignal<string | undefined>()
  const [viewingStack, setViewingStack] = createSignal<{ id: string; name: string }[]>([])
  const [loadedMessages, setLoadedMessages] = createStore<Record<string, Message[]>>({})
  const [loadedParts, setLoadedParts] = createStore<Record<string, Part[]>>({})
  const [phase, setPhase] = createStore<Record<string, "loading" | "ready" | "error">>({})
  const [loadedDiffs, setLoadedDiffs] = createStore<FileDiff[]>([])
  const [loadedTodos, setLoadedTodos] = createStore<Todo[]>([])

  createEffect((prev: string[]) => {
    const stack = viewingStack()
    const currentIds = stack.map((e) => e.id)
    if (prev.length > currentIds.length) {
      const removed = prev.filter((id) => !currentIds.includes(id))
      batch(() => {
        for (const id of removed) {
          const mids = loadedMessages[id]?.map((msg) => msg.id) ?? []
          setLoadedMessages(
            produce((draft: Record<string, Message[]>) => {
              delete draft[id]
            }),
          )
          setLoadedParts(
            produce((draft: Record<string, Part[]>) => {
              for (const mid of mids) delete draft[mid]
            }),
          )
          setPhase(
            produce((draft: Record<string, "loading" | "ready" | "error">) => {
              delete draft[id]
            }),
          )
        }
        setLoadedDiffs(reconcile([] as FileDiff[], { key: "file" }))
        setLoadedTodos(reconcile([] as Todo[], { key: "id" }))
      })
    }
    return currentIds
  }, [] as string[])

  const containerRef = (el: HTMLDivElement) => {
    el.addEventListener(
      "click",
      (e) => {
        const target = e.target as HTMLElement
        const anchor = target.closest("a")
        if (!anchor) return
        const href = anchor.getAttribute("href")
        if (!href?.startsWith("#subagent-")) return
        e.preventDefault()
        e.stopPropagation()
        const id = href.slice("#subagent-".length)
        const name = anchor.textContent?.trim() || id.slice(0, 8)
        setViewingStack((prev) => [...prev, { id, name }])
      },
      true,
    )
  }

  const isNew = createMemo(() => !createdSessionID() && !session.sessionID())

  const rootSessionID = createMemo(() => createdSessionID() ?? session.sessionID())
  const isMobile = createMemo(() => location.pathname.startsWith("/m"))

  const mobileUrl = createMemo(() => {
    const host = `${env.MOBILE_HOST}${env.BASE_PATH ? `/${env.BASE_PATH}` : ""}`
    if (!host) return ""
    const wsId = workspace.workspaceId
    const sid = rootSessionID()
    if (!wsId || !sid) return ""
    return `${host}/m/workspace/${wsId}?session=${sid}`
  })
  const viewingSessionID = createMemo(() => {
    const stack = viewingStack()
    return stack.length > 0 ? stack[stack.length - 1].id : undefined
  })
  const currentSessionID = createMemo(() => viewingSessionID() ?? rootSessionID())

  createEffect(() => {
    if (isNew()) return
    const msgs = effectiveMessages()
    const last = [...msgs].reverse().find((m) => m.role === "user")
    if (!last) return
    if (last.agent) local.agent.set(last.agent)
    if (last.model) local.model.set(last.model)
  })

  const adapter = createMemo(() => deviceAdapter(device.client))

  const effectiveMessages = createMemo(() => {
    const cid = currentSessionID()
    if (!cid) return [] as Message[]
    if (viewingSessionID()) {
      return loadedMessages[cid] ?? ([] as Message[])
    }
    const fromSession = session.data.messages
    if (fromSession.length > 0) return fromSession
    const fromLoaded = loadedMessages[cid]
    if (fromLoaded && fromLoaded.length > 0) return fromLoaded
    return fromSession
  })

  const effectiveStatus = createMemo(() => {
    const cid = currentSessionID()
    if (cid) return workspace.data.sessionStatus[cid] ?? ({ type: "idle" } as SessionStatus)
    return session.data.status
  })

  const isWorking = createMemo(() => {
    const t = effectiveStatus()?.type
    return t === "busy" || t === "retry"
  })

  const busySince = createMemo(() => {
    const cid = currentSessionID()
    if (!cid || !isWorking()) return undefined
    let t = busySinceMap.get(cid)
    if (t === undefined) {
      t = Date.now()
      busySinceMap.set(cid, t)
    }
    return t
  })

  createEffect(() => {
    const cid = currentSessionID()
    if (!cid) return
    if (!isWorking()) {
      busySinceMap.delete(cid)
    }
  })

  const effectiveParts = createMemo(() => {
    if (viewingSessionID()) return loadedParts as Record<string, Part[]>
    const fromSession = session.data.parts
    if (Object.keys(fromSession).length > 0) return fromSession
    return loadedParts as Record<string, Part[]>
  })

  const effectiveDiffs = createMemo(() => {
    if (viewingSessionID()) return loadedDiffs as unknown as FileDiff[]
    return session.data.diffs
  })

  const effectiveTodos = createMemo(() => {
    if (viewingSessionID()) return loadedTodos as unknown as Todo[]
    return session.data.todos
  })

  createEffect(
    on(currentSessionID, async (id) => {
      if (!id) return
      if (id === rootSessionID() && !viewingSessionID()) return
      const mids = loadedMessages[id]?.map((msg) => msg.id) ?? []
      batch(() => {
        setLoadedMessages(
          produce((draft: Record<string, Message[]>) => {
            delete draft[id]
          }),
        )
        setLoadedParts(
          produce((draft: Record<string, Part[]>) => {
            for (const mid of mids) delete draft[mid]
          }),
        )
        setPhase(id, "loading")
      })
      const messagesRes = await Promise.allSettled([device.client.conversation.messages(id, { limit: 50 })])
      if (currentSessionID() !== id) return
      const messagesResult = messagesRes[0]
      if (messagesResult?.status !== "fulfilled") {
        setPhase(id, "error")
        return
      }
      const raw = Array.isArray(messagesResult.value) ? messagesResult.value : []
      const items: { info: Message; parts?: Part[] }[] = []
      for (const item of raw as any[]) {
        if (!item?.info?.id) continue
        items.push({
          info: item.info as Message,
          parts: Array.isArray(item.parts) ? (item.parts as Part[]) : undefined,
        })
      }
      batch(() => {
        for (const item of items) {
          if (item.parts) {
            setLoadedParts(item.info.id, reconcile(item.parts, { key: "id" }))
          }
        }
      })
      const msgs: Message[] = []
      const CHUNK = 10
      for (let i = 0; i < items.length; i += CHUNK) {
        const chunk = items.slice(i, i + CHUNK)
        batch(() => {
          for (const item of chunk) msgs.push(item.info)
          setLoadedMessages(id, reconcile(msgs, { key: "id" }))
          setPhase(id, "ready")
        })
        if (i + CHUNK < items.length) {
          await new Promise<void>((r) => requestAnimationFrame(() => r()))
        }
      }
    }),
  )

  const unsubscribe = workspace.subscribe((payload) => {
    if (payload.type === "session.created") {
      const info = (payload.properties as { info?: Session })?.info ?? (payload.properties as Session)
      if (info?.id) {
        const current = tabStore.tabs().find((t) => t.id === props.tabId)
        if (current && (current.meta as any)?.sessionID === info.id && info.title) {
          tabStore.setTitle(props.tabId, info.title)
        }
      }
    }

    if (payload.type === "session.updated") {
      const info = (payload.properties as { info?: Session })?.info ?? (payload.properties as Session)
      const cid = currentSessionID()
      if (info?.id === cid && info.title) {
        tabStore.setTitle(props.tabId, info.title)
      }
    }

    if (!viewingSessionID()) return

    const cid = currentSessionID()
    if (!cid) return

    const eventSID =
      payload.sessionID ??
      (payload.properties as any)?.sessionID ??
      ((payload.properties as any)?.part as any)?.sessionID ??
      ((payload.properties as any)?.info as any)?.sessionID ??
      ((payload.properties as any)?.status as any)?.sessionID
    if (eventSID && eventSID !== cid) return

    batch(() => {
      switch (payload.type) {
        case "message.updated": {
          const info = (payload.properties as { info?: Message })?.info
          if (!info?.id) break
          setLoadedMessages(
            cid,
            produce((draft: Message[]) => {
              const idx = draft.findIndex((m) => m.id === info.id)
              if (idx !== -1) draft[idx] = info
              else draft.push(info)
            }),
          )
          break
        }
        case "message.part.updated": {
          const part = (payload.properties as { part?: Part })?.part
          if (!part?.id) break
          const messageID = part.messageID
          if (!messageID) break
          const partCallID = (part as any).callID as string | undefined
          const partStatus = (part as any).state?.status as string | undefined
          const existing = loadedParts[messageID]
          if (!existing) {
            setLoadedParts(messageID, [part])
            break
          }
          setLoadedParts(
            messageID,
            produce((draft: Part[]) => {
              const idx = draft.findIndex((p) => p.id === part.id)
              if (idx !== -1) {
                draft[idx] = part
              } else {
                const callID = (part as any).callID
                if (callID) {
                  const byCall = draft.findIndex((p) => (p as any).callID === callID)
                  if (byCall !== -1) {
                    draft[byCall] = { ...part, id: draft[byCall].id }
                    return
                  }
                }
                draft.push(part)
              }
            }),
          )
          break
        }
        case "message.part.delta": {
          const d = payload.properties as { messageID: string; partID: string; field: string; delta: string }
          if (!d.messageID || !d.partID) break
          const parts = loadedParts[d.messageID]
          if (!parts) break
          const idx = parts.findIndex((p) => p.id === d.partID)
          if (idx === -1) break
          setLoadedParts(
            d.messageID,
            idx,
            produce((draft: any) => {
              if (d.field === "input" && draft.type === "tool" && draft.state) {
                const existing = (draft.state.input as string) ?? ""
                draft.state.input = existing + d.delta
              } else {
                const field = d.field as keyof typeof draft
                const existing = draft[field] as string | undefined
                ;(draft[field] as string) = (existing ?? "") + d.delta
              }
            }),
          )
          break
        }
        case "session.diff": {
          const props = payload.properties as { diff?: FileDiff[] }
          if (props.diff) setLoadedDiffs(reconcile(props.diff, { key: "file" }))
          break
        }
        case "session.todo":
        case "todo.updated": {
          const props = payload.properties as { todos?: Todo[] }
          if (props.todos) setLoadedTodos(reconcile(props.todos, { key: "id" }))
          break
        }
      }
    })
  })
  onCleanup(() => {
    unsubscribe()
    if (snapFrame !== undefined) cancelAnimationFrame(snapFrame)
  })

  // ── Adapt device providers to original context interfaces ──

  // SDKContext value
  const sdkValue = {
    client: device.client,
    directory: device.directory,
    url: device.url,
    createClient: device.createClient,
    event: {
      listen(cb: (e: any) => void) {
        return () => {}
      },
    },
  }

  // SyncContext value — adapt DeviceWorkspaceProvider + DeviceSessionProvider
  type SyncDataShape = {
    status: "complete" | "loading"
    agent: Agent[] | undefined
    agentRuntimes: unknown[]
    command: Command[] | undefined
    project: string
    projectMeta: any
    icon: string | undefined
    provider: ProviderCapabilitiesResponse | undefined
    path: Path
    session: Session[]
    sessionTotal: number
    session_status: Record<string, SessionStatus>
    session_diff: Record<string, FileDiff[]>
    todo: Record<string, Todo[]>
    permission: Record<string, PermissionRequest[]>
    question: Record<string, QuestionRequest[]>
    mcp: Record<string, any>
    lsp: any[]
    vcs: VcsInfo | undefined
    limit: number
    message: Record<string, Message[]>
    part: Record<string, Part[]>
    partProgress: Record<string, string[]>
  }

  const [syncData, setSyncData] = createStore<SyncDataShape>({
    status: "complete",
    agent: undefined,
    agentRuntimes: [],
    command: undefined,
    project: "",
    projectMeta: undefined,
    icon: undefined,
    provider: undefined,
    path: { directory: device.directory } as Path,
    session: [],
    sessionTotal: 0,
    session_status: {},
    session_diff: {},
    todo: {},
    permission: {},
    question: {},
    mcp: {},
    lsp: [],
    vcs: undefined,
    limit: 50,
    message: {},
    part: {},
    partProgress: {},
  })

  createEffect(() => {
    const s = workspace.data.status
    setSyncData(
      "status",
      s === "unavailable" ? ("complete" as const) : s === "loading" ? ("loading" as const) : ("complete" as const),
    )
  })
  createEffect(() => setSyncData("agent", workspace.data.agent))
  createEffect(() => setSyncData("command", workspace.data.command))
  createEffect(() => setSyncData("provider", workspace.data.provider))
  createEffect(() => setSyncData("session", workspace.data.session))
  createEffect(() => setSyncData("sessionTotal", workspace.data.sessionTotal))
  createEffect(() => setSyncData("permission", workspace.data.permissions))
  createEffect(() => setSyncData("question", workspace.data.questions))
  createEffect(() => setSyncData("vcs", workspace.data.vcs))
  createEffect(() => {
    const cid = currentSessionID()
    const status = effectiveStatus()
    setSyncData("session_status", {
      ...workspace.data.sessionStatus,
      ...(cid ? { [cid]: status } : {}),
      "": status,
      undefined: status,
    })
  })
  createEffect(() => {
    const cid = currentSessionID() ?? ""
    setSyncData("session_diff", { [cid]: effectiveDiffs() })
  })
  createEffect(() => {
    const cid = currentSessionID() ?? ""
    setSyncData("todo", { [cid]: effectiveTodos() })
  })
  createEffect(() => {
    const msgs = effectiveMessages()
    const cid = currentSessionID() ?? ""
    setSyncData("message", { [cid]: msgs, "": msgs, undefined: msgs })
  })
  createEffect(() => {
    setSyncData("partProgress", session.data.partProgress)
  })

  const syncSet = (...args: any[]) => {
    if (!viewingSessionID()) return
    if (args[0] === "session_status" && args[1]) {
      workspace.session.setStatus(args[1] as string, args[2] as SessionStatus | undefined)
    }
    if (args[0] === "todo" && args[1]) {
      setLoadedTodos(reconcile((args[2] as Todo[]) ?? [], { key: "id" }))
    }
  }

  const syncValue = {
    get data() {
      return syncData
    },
    get set() {
      return syncSet
    },
    get status() {
      return syncData.status
    },
    get ready() {
      return workspace.data.status !== "loading"
    },
    get project() {
      return {
        id: device.directory,
        worktree: device.directory,
        name: undefined as string | undefined,
        time: { created: Date.now(), updated: Date.now() },
      } as Project
    },
    session: {
      get(id: string) {
        return workspace.data.session.find((s) => s.id === id)
      },
      optimistic: {
        add(input: { directory?: string; sessionID: string; message: Message; parts: Part[] }) {
          session.optimistic.add({ message: input.message, parts: input.parts })
          const cid = currentSessionID() ?? input.sessionID
          if (!loadedMessages[cid]) {
            setLoadedMessages(cid, [])
          }
          setLoadedMessages(
            cid,
            produce((draft: Message[]) => {
              const idx = draft.findIndex((m) => m.id === input.message.id)
              if (idx === -1) draft.push(input.message)
            }),
          )
          if (input.message.id) {
            if (!loadedParts[input.message.id]) {
              setLoadedParts(input.message.id, [])
            }
            setLoadedParts(
              input.message.id,
              produce((draft: Part[]) => {
                for (const p of input.parts) {
                  const idx = draft.findIndex((x) => x.id === p.id)
                  if (idx === -1) draft.push(p)
                }
              }),
            )
          }
        },
        remove(input: { directory?: string; sessionID: string; messageID: string }) {
          session.optimistic.remove({ messageID: input.messageID })
          const cid = currentSessionID() ?? input.sessionID
          if (cid && loadedMessages[cid]) {
            setLoadedMessages(
              cid,
              produce((draft: Message[]) => {
                const idx = draft.findIndex((m) => m.id === input.messageID)
                if (idx !== -1) draft.splice(idx, 1)
              }),
            )
          }
        },
      },
      addOptimisticMessage(input: {
        sessionID: string
        messageID: string
        parts: Part[]
        agent: string
        model: { providerID: string; modelID: string }
      }) {
        session.addOptimisticMessage(input)
        if (!createdSessionID() && !session.sessionID()) {
          setCreatedSessionID(input.sessionID)
        }
        const cid = currentSessionID() ?? input.sessionID
        const message: Message = {
          id: input.messageID,
          sessionID: cid,
          role: "user",
          time: { created: Date.now() },
          agent: input.agent,
          model: input.model,
        }
        if (!loadedMessages[cid]) {
          setLoadedMessages(cid, [])
        }
        setLoadedMessages(
          cid,
          produce((draft: Message[]) => {
            const idx = draft.findIndex((m) => m.id === message.id)
            if (idx === -1) draft.push(message)
          }),
        )
        if (!loadedParts[input.messageID]) {
          setLoadedParts(input.messageID, [])
        }
        setLoadedParts(
          input.messageID,
          produce((draft: Part[]) => {
            for (const p of input.parts) {
              const idx = draft.findIndex((x) => x.id === p.id)
              if (idx === -1) draft.push(p)
            }
          }),
        )
      },
      replaceTab(input: { sessionID: string; title?: string }) {
        const current = tabStore.tabs().find((t) => t.id === props.tabId)
        if (current && !(current.meta as any)?.sessionID) {
          tabStore.updateMeta(props.tabId, { sessionID: input.sessionID })
          if (input.title) tabStore.setTitle(props.tabId, input.title)
        }
      },
      async sync(id: string) {
        await session.sync()
      },
      async diff(id: string) {
        if (diffCtx.scheduler.active) await session.diff()
      },
      async todo(id: string) {
        await session.todo()
      },
      history: {
        more(id: string) {
          return session.history.more()
        },
        loading(id: string) {
          return session.history.loading()
        },
        async loadMore(id: string, count?: number) {
          await session.history.loadMore(count)
        },
      },
      async fetch(count?: number) {
        await workspace.session.fetch(count)
      },
      async remove(id: string) {
        await workspace.session.remove(id)
      },
    },
    command: {
      async load() {
        return workspace.command.load()
      },
    },
    vcs: {
      async load() {
        return workspace.vcs.load()
      },
    },
    directory: device.directory,
    currentSessionID,
    navigateBack: () => setViewingStack((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev)),
  }

  // LocalContext value
  const localValue = local

  // CommentsContext value
  const commentsValue = {
    add() {},
    update() {},
    remove() {},
    clear() {},
    all: () => [] as any[],
    focus() {},
    setFocus() {},
    active: () => false,
    setActive() {},
    replace() {},
  }

  // PermissionContext value
  const permissionValue = {
    ready: () => true,
    respond(input: any) {
      session.permission.respond(input)
    },
    autoResponds(...args: any[]) {
      return session.permission.isAutoAccepting(...args)
    },
    isAutoAccepting(...args: any[]) {
      return session.permission.isAutoAccepting(...args)
    },
    toggleAutoAccept(...args: any[]) {
      session.permission.toggleAutoAccept(...args)
    },
    enableAutoAccept(...args: any[]) {
      session.permission.enableAutoAccept(...args)
    },
    disableAutoAccept(...args: any[]) {
      session.permission.disableAutoAccept(...args)
    },
    permissionsEnabled: () => session.permission.enabled(),
  }

  // SettingsContext value
  const settingsValue = {
    ready: () => true,
    general: {
      showReasoningSummaries: () => true,
      shellToolPartsExpanded: () => false,
      editToolPartsExpanded: () => false,
    },
  }

  // CommandContext value — stub
  const commandValue = {
    ready: () => true,
    register: () => {},
    trigger: () => {},
    keybind: () => "",
    show: () => {},
    keybinds: () => {},
    suspended: () => false,
    get catalog() {
      return []
    },
    get options() {
      return []
    },
  }

  // LayoutContext value — reuse DeviceLayoutProvider's
  // Already provided by DeviceInterface

  const composer = createDeviceSessionComposerState()

  const [composerMounted, setComposerMounted] = createSignal(true)
  createEffect(() => {
    const id = currentSessionID()
    void id
    setComposerMounted(false)
    const frame = requestAnimationFrame(() => setComposerMounted(true))
    onCleanup(() => cancelAnimationFrame(frame))
  })

  const [snap, setSnap] = createSignal(true)

  const done = createMemo(() => {
    const id = currentSessionID()
    if (!id) return false
    if (viewingSessionID()) return phase[id] === "ready" || phase[id] === "error"
    return session.data.session?.id === id && !session.history.loading()
  })

  const ready = createMemo(() => {
    const id = currentSessionID()
    if (!id) return false
    if (viewingSessionID()) return phase[id] === "ready"
    return session.data.session?.id === id && !session.history.loading()
  })

  const autoScroll = createAutoScroll({
    working: () => snap() || effectiveStatus()?.type === "busy",
    overflowAnchor: "dynamic",
  })

  const scrollSpy = createScrollSpy({
    onActive: () => {},
  })

  let scroller: HTMLDivElement | undefined
  let content: HTMLDivElement | undefined
  let promptDock: HTMLDivElement | undefined
  let snapFrame: number | undefined
  let dockHeight = 0

  const messages = createMemo(() => effectiveMessages())
  const messagesReady = createMemo(() => true)

  const enrichedMessages = createMemo(() => {
    const raw = effectiveMessages()
    if (!raw || raw.length === 0) return raw ?? []
    const userIDs = new Set<string>()
    for (const m of raw) {
      if (m.role === "user") userIDs.add(m.id)
    }
    let orphanID: string | undefined
    let orphanCreated = false
    const orphan = {
      id: "",
      sessionID: currentSessionID() ?? "",
      role: "user",
      time: { created: 0 },
    } as any
    const enriched: any[] = []
    for (const m of raw) {
      if (m.role === "assistant" && m.parentID && !userIDs.has(m.parentID)) {
        if (!orphanCreated) {
          orphan.id = m.parentID
          orphan.time = { created: m.time?.created ?? 0 }
          orphanID = m.parentID
          enriched.push(orphan)
          userIDs.add(m.parentID)
          orphanCreated = true
        }
        if (m.parentID !== orphanID) {
          enriched.push({ ...m, parentID: orphanID })
          continue
        }
      }
      enriched.push(m)
    }
    return enriched
  })

  createEffect(on(currentSessionID, () => setSnap(true), { defer: true }))

  createEffect(() => {
    if (!snap()) return
    if (!scroller) return
    if (!done()) return
    if (snapFrame !== undefined) cancelAnimationFrame(snapFrame)
    snapFrame = requestAnimationFrame(() => {
      snapFrame = undefined
      if (ready()) resumeScroll()
      setSnap(false)
    })
  })

  const userMessages = createMemo(
    () => enrichedMessages().filter((m) => m.role === "user") as any[],
    emptyMessages as any[],
  )

  const setScrollRef = (el: HTMLDivElement | undefined) => {
    scroller = el
    autoScroll.scrollRef(el)
    scrollSpy.setContainer(el)
  }

  const resumeScroll = () => {
    autoScroll.forceScrollToBottom()
  }

  createResizeObserver(
    () => promptDock,
    ({ height }) => {
      const next = Math.ceil(height)
      if (next === dockHeight) return
      const el = scroller
      const delta = next - dockHeight
      const stick = el
        ? snap() ||
          !autoScroll.userScrolled() ||
          el.scrollHeight - el.clientHeight - el.scrollTop < 10 + Math.max(0, delta)
        : false
      dockHeight = next
      if (stick) autoScroll.forceScrollToBottom()
    },
  )

  const anchor = (id: string) => `message-${id}`

  const childStore = createMemo(() => {
    const result = {
      project: "",
      projectMeta: undefined as any,
      icon: undefined as string | undefined,
      provider: workspace.data.provider,
      agent: workspace.data.agent,
      agentRuntimes: [] as unknown[],
      command: workspace.data.command ?? [],
      path: { directory: device.directory } as Path,
      session: workspace.data.session,
      sessionTotal: workspace.data.sessionTotal,
      session_status: {} as Record<string, SessionStatus>,
      session_diff: {} as Record<string, FileDiff[]>,
      todo: {} as Record<string, Todo[]>,
      permission: {} as Record<string, PermissionRequest[]>,
      question: {} as Record<string, QuestionRequest[]>,
      mcp: {} as Record<string, any>,
      lsp: [] as any[],
      vcs: workspace.data.vcs,
      limit: 50,
      message: {} as Record<string, Message[]>,
      part: {} as Record<string, Part[]>,
      partProgress: {} as Record<string, string[]>,
    }
    return result
  })

  const globalSyncValue = {
    data: { ready: true, error: undefined as string | undefined, project: [] as any[] },
    set: () => {},
    get ready() {
      return true
    },
    get error() {
      return undefined
    },
    child: (_dir?: string) => [childStore(), () => {}] as const,
    bootstrap: async () => {},
    project: {
      loadSessions: async () => {},
      meta: () => {},
      icon: () => {},
    },
    todo: { set: () => {} },
  }

  const dataProps = createMemo(() => {
    const cid = currentSessionID()
    const parts = effectiveParts()
    return {
      ...syncData,
      message: { [cid ?? ""]: enrichedMessages(), "": enrichedMessages(), undefined: enrichedMessages() } as Record<
        string,
        Message[]
      >,
      part: { ...parts } as Record<string, Part[]>,
      partProgress: session.data.partProgress,
      provider: legacyProvider(workspace.data.provider),
    }
  })

  return (
    <ConversationAdapterContext.Provider value={adapter() as any}>
      <GlobalSyncContext.Provider value={globalSyncValue as any}>
        <SDKContext.Provider value={sdkValue as any}>
          <SyncContext.Provider value={syncValue as any}>
            <LocalContext.Provider value={localValue as any}>
              <PromptProvider>
                <CommentsContext.Provider value={commentsValue as any}>
                  <PermissionContext.Provider value={permissionValue as any}>
                    <CommandContext.Provider value={commandValue as any}>
                      <SettingsContext.Provider value={settingsValue as any}>
                        <DataProvider
                          data={dataProps()!}
                          directory={device.directory}
                          onNavigateToSession={(id: string) => {
                            const s = workspace.data.session.find((s) => s.id === id)
                            const name = s?.title ?? id.slice(0, 8)
                            setViewingStack((prev) => [...prev, { id, name }])
                          }}
                          onSessionHref={(id: string) => `#subagent-${id}`}
                        >
                          <FileComponentProvider component={File}>
                            <div class="relative bg-background-base size-full overflow-hidden flex flex-col">
                              <div class="shrink-0 flex items-center gap-0.5 px-3 h-8 border-b bg-background-base z-10">
                                <div class="flex items-center gap-0.5 min-w-0 flex-1 overflow-hidden">
                                  <button
                                    class="text-12-medium flex items-center min-w-0 truncate"
                                    classList={{
                                      "text-text-base": viewingStack().length === 0,
                                      "text-text-weak hover:text-text-base": viewingStack().length > 0,
                                    }}
                                    onClick={() => setViewingStack([])}
                                  >
                                    {tabStore.tabs().find((t) => t.id === props.tabId)?.title ??
                                      language.t("command.session.new")}
                                  </button>
                                  <For each={viewingStack()}>
                                    {(entry, idx) => (
                                      <>
                                        <Icon name="chevron-right" class="size-3 shrink-0 text-text-weak" />
                                        <button
                                          class="text-12-medium min-w-0 truncate"
                                          classList={{
                                            "text-text-base": idx() === viewingStack().length - 1,
                                            "text-text-weak hover:text-text-base": idx() !== viewingStack().length - 1,
                                          }}
                                          onClick={() => setViewingStack((prev) => prev.slice(0, idx() + 1))}
                                        >
                                          {entry.name}
                                        </button>
                                      </>
                                    )}
                                  </For>
                                </div>
                                <Show when={!isNew()}>
                                  <div class="shrink-0 flex items-center gap-0.5 ml-1">
                                    <Show when={autoScroll.userScrolled()}>
                                      <Tooltip value={language.t("session.messages.jumpToLatest")} placement="bottom">
                                        <IconButton
                                          icon="arrow-down-to-line"
                                          variant="ghost"
                                          iconSize="small"
                                          class="size-6 rounded-md"
                                          onClick={resumeScroll}
                                        />
                                      </Tooltip>
                                    </Show>
                                    <Show when={!viewingSessionID()}>
                                      <Show when={mobileUrl() && !isMobile()}>
                                        <Tooltip value={language.t("session.qrcode.title")} placement="bottom">
                                          <IconButton
                                            icon="scan-qr-code"
                                            variant="ghost"
                                            iconSize="small"
                                            class="size-6 rounded-md"
                                            aria-label={language.t("session.qrcode.title")}
                                            onClick={() => {
                                              dialog.show(() => (
                                                <SessionQrCodeContent
                                                  url={mobileUrl()!}
                                                  sessionTitle={
                                                    tabStore.tabs().find((t) => t.id === props.tabId)?.title ??
                                                    language.t("command.session.new")
                                                  }
                                                />
                                              ))
                                            }}
                                          />
                                        </Tooltip>
                                      </Show>
                                      <DropdownMenu gutter={4} placement="bottom-end">
                                        <DropdownMenu.Trigger
                                          as={IconButton}
                                          icon="dot-grid"
                                          variant="ghost"
                                          iconSize="small"
                                          class="size-6 rounded-md"
                                          aria-label={language.t("common.moreOptions")}
                                        />
                                        <DropdownMenu.Portal>
                                          <DropdownMenu.Content style={{ "min-width": "104px" }}>
                                            <DropdownMenu.Item
                                              onSelect={() => {
                                                const sid = rootSessionID()
                                                if (!sid) return
                                                const name =
                                                  workspace.data.session.find((s) => s.id === sid)?.title ??
                                                  language.t("command.session.new")
                                                dialog.show(() => (
                                                  <Dialog title={language.t("session.delete.title")} fit>
                                                    <div class="flex flex-col gap-4 pl-6 pr-2.5 pb-3">
                                                      <div class="flex flex-col gap-1">
                                                        <span class="text-14-regular text-text-strong">
                                                          {language.t("session.delete.confirm", { name })}
                                                        </span>
                                                      </div>
                                                      <div class="flex justify-end gap-2">
                                                        <Button
                                                          variant="ghost"
                                                          size="large"
                                                          onClick={() => dialog.close()}
                                                        >
                                                          {language.t("common.cancel")}
                                                        </Button>
                                                        <Button
                                                          variant="primary"
                                                          size="large"
                                                          onClick={async () => {
                                                            await device.client.conversation.delete(sid).catch(() => {})
                                                            tabStore.close(props.tabId)
                                                            dialog.close()
                                                          }}
                                                        >
                                                          {language.t("session.delete.button")}
                                                        </Button>
                                                      </div>
                                                    </div>
                                                  </Dialog>
                                                ))
                                              }}
                                            >
                                              <DropdownMenu.ItemLabel>
                                                {language.t("common.delete")}
                                              </DropdownMenu.ItemLabel>
                                            </DropdownMenu.Item>
                                          </DropdownMenu.Content>
                                        </DropdownMenu.Portal>
                                      </DropdownMenu>
                                    </Show>
                                  </div>
                                </Show>
                              </div>
                              <div ref={containerRef} class="flex-1 min-h-0 flex flex-col">
                                <div class="@container relative shrink-0 flex flex-col min-h-0 h-full bg-background-stronger flex-1">
                                  <div class="flex-1 min-h-0 overflow-hidden">
                                    <Show
                                      when={!isNew()}
                                      fallback={<NewSessionView worktree="main" onWorktreeChange={() => {}} />}
                                    >
                                      <MessageTimeline
                                        hideHeader
                                        mobileChanges={false}
                                        mobileFallback={<div />}
                                        scroll={{ overflow: false, bottom: true }}
                                        onResumeScroll={resumeScroll}
                                        setScrollRef={setScrollRef}
                                        onScheduleScrollState={() => {}}
                                        onAutoScrollHandleScroll={autoScroll.handleScroll}
                                        onMarkScrollGesture={() => {}}
                                        hasScrollGesture={() => false}
                                        isDesktop={true}
                                        onScrollSpyScroll={scrollSpy.onScroll}
                                        onTurnBackfillScroll={() => {}}
                                        onAutoScrollInteraction={autoScroll.handleInteraction}
                                        centered={true}
                                        setContentRef={(el) => {
                                          content = el
                                          autoScroll.contentRef(el)
                                        }}
                                        turnStart={0}
                                        historyMore={false}
                                        historyLoading={false}
                                        onLoadEarlier={() => {}}
                                        renderedUserMessages={userMessages() as any[]}
                                        anchor={anchor}
                                        onRegisterMessage={scrollSpy.register}
                                        onUnregisterMessage={scrollSpy.unregister}
                                      />
                                    </Show>
                                  </div>

                                  <Show when={workspace.agentAvailable() && composerMounted()}>
                                    <SessionComposerRegion
                                      state={composer}
                                      ready={true}
                                      centered={true}
                                      inputRef={(el: HTMLDivElement) => {
                                        if (!el) return
                                        const handler = () => {
                                          const sid = rootSessionID()
                                          if (sid) workspace.session.clearUnread(sid)
                                        }
                                        el.addEventListener("focusin", handler)
                                        el.addEventListener("pointerdown", handler)
                                      }}
                                      newSessionWorktree="main"
                                      onNewSessionWorktreeReset={() => {}}
                                      onSubmit={() => {
                                        resumeScroll()
                                        const sid = rootSessionID()
                                        if (sid) workspace.session.clearUnread(sid)
                                      }}
                                      onResponseSubmit={resumeScroll}
                                      setPromptDockRef={(el) => {
                                        promptDock = el
                                      }}
                                      hideAttachButton
                                      hidePrompt={!!viewingSessionID()}
                                      working={isWorking()}
                                      busySince={busySince()}
                                    />
                                  </Show>
                                  <Show when={!workspace.agentAvailable()}>
                                    <div class="shrink-0 w-full pb-3 flex justify-center items-center">
                                      <span class="text-12-regular text-text-weak">
                                        {language.t("workspace.device.offline")}
                                      </span>
                                    </div>
                                  </Show>
                                </div>
                              </div>
                            </div>
                          </FileComponentProvider>
                        </DataProvider>
                      </SettingsContext.Provider>
                    </CommandContext.Provider>
                  </PermissionContext.Provider>
                </CommentsContext.Provider>
              </PromptProvider>
            </LocalContext.Provider>
          </SyncContext.Provider>
        </SDKContext.Provider>
      </GlobalSyncContext.Provider>
    </ConversationAdapterContext.Provider>
  )
}
