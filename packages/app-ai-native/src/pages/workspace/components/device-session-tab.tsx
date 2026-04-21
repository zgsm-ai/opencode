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
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useDeviceSDK } from "@/context/device-sdk"
import { useDeviceWorkspace } from "@/context/device-workspace"
import { useDeviceSession } from "@/context/device-session"
import { useDeviceLocal } from "@/context/device-local"
import { useDeviceProject } from "@/context/device-project"
import { deviceAdapter, ConversationAdapterContext } from "@/context/device-adapter"
import { useLanguage } from "@/context/language"
import { useFile } from "@/context/file"
import { SyncContext } from "@/context/sync"
import { LocalContext } from "@/context/local"
import { SDKContext } from "@/context/sdk"
import { PromptContext } from "@/context/prompt"
import { CommentsContext } from "@/context/comments"
import { PermissionContext } from "@/context/permission"
import { CommandContext } from "@/context/command"
import { GlobalSyncContext } from "@/context/global-sync"
import { SettingsContext } from "@/context/settings"
import { DirectoryContext } from "@/context/directory"
import { LayoutContext } from "@/context/layout"
import { FileContext } from "@/context/file"
import { CloudTeamProvider, useCloudTeam } from "@/context/cloud-team"
import { NewSessionView } from "@/components/session/session-new-view"
import { MessageTimeline } from "@/pages/session/message-timeline"
import { SessionComposerRegion } from "@/pages/session/composer/session-composer-region"
import { createDeviceSessionComposerState } from "@/pages/session/composer/device-session-composer-state"
import { createScrollSpy } from "@/pages/session/scroll-spy"
import { CloudTeamStatusBar } from "@/components/cloud-team"
import { useContentTabs } from "@/context/content-tabs"
import type { Message, Part, Session, SessionStatus, FileDiff, Todo, Command, Agent, VcsInfo, ProviderListResponse, PermissionRequest, QuestionRequest } from "@opencode-ai/sdk/v2/client"
import type { Project, Path } from "@opencode-ai/sdk/v2/client"
import type { ProviderCapability, ProviderCapabilitiesResponse } from "@/context/global-sync/types"

const emptyMessages: Message[] = []
const idle: SessionStatus = { type: "idle" }

function legacyProvider(input: ProviderCapabilitiesResponse): ProviderListResponse {
  return {
    all: input.connected.map((provider) => ({
      id: provider.id,
      name: provider.name,
      source: provider.source,
      env: [],
      models: Object.fromEntries(
        Object.entries(provider.models).map(([key, model]) => [
          key,
          {
            id: model.id,
            name: model.name,
            ...(model.family ? { family: model.family } : {}),
            release_date: model.release_date,
            attachment: model.capabilities.attachment,
            reasoning: model.capabilities.reasoning,
            temperature: model.capabilities.temperature,
            tool_call: model.capabilities.toolcall,
            interleaved: model.capabilities.interleaved === false ? undefined : model.capabilities.interleaved,
            cost: model.cost
              ? {
                  input: model.cost.input,
                  output: model.cost.output,
                  cache_read: model.cost.cache.read,
                  cache_write: model.cost.cache.write,
                  context_over_200k: model.cost.experimentalOver200K
                    ? {
                        input: model.cost.experimentalOver200K.input,
                        output: model.cost.experimentalOver200K.output,
                        cache_read: model.cost.experimentalOver200K.cache.read,
                        cache_write: model.cost.experimentalOver200K.cache.write,
                      }
                    : undefined,
                }
              : undefined,
            limit: model.limit,
            modalities: {
              input: Object.entries(model.capabilities.input)
                .filter(([, enabled]) => enabled)
                .map(([name]) => name as "text" | "audio" | "image" | "video" | "pdf"),
              output: Object.entries(model.capabilities.output)
                .filter(([, enabled]) => enabled)
                .map(([name]) => name as "text" | "audio" | "image" | "video" | "pdf"),
            },
            status: model.status === "active" ? undefined : model.status,
            options: {},
            variants: model.variants,
          },
        ]),
      ),
    })),
    default: Object.fromEntries(input.connected.flatMap((provider) => (provider.default_model ? [[provider.id, provider.default_model]] : []))),
    connected: input.connected.map((provider) => provider.id),
  }
}

export function DeviceSessionTab(props: { tabId: string }) {
  const device = useDeviceSDK()
  const workspace = useDeviceWorkspace()
  const session = useDeviceSession()
  const local = useDeviceLocal()
  const project = useDeviceProject()
  const language = useLanguage()
  const file = useFile()
  const tabStore = useContentTabs()
  const dialog = useDialog()

  const [createdSessionID, setCreatedSessionID] = createSignal<string | undefined>()
  const [viewingStack, setViewingStack] = createSignal<{ id: string; name: string }[]>([])
  const [loadedMessages, setLoadedMessages] = createStore<Record<string, Message[]>>({})
  const [loadedParts, setLoadedParts] = createStore<Record<string, Part[]>>({})
  const [phase, setPhase] = createStore<Record<string, "loading" | "ready" | "error">>({})
  const [loadedStatus, setLoadedStatus] = createSignal<SessionStatus | undefined>()
  const [loadedDiffs, setLoadedDiffs] = createStore<FileDiff[]>([])
  const [loadedTodos, setLoadedTodos] = createStore<Todo[]>([])
  const [loadedPermissions, setLoadedPermissions] = createStore<Record<string, PermissionRequest[]>>({})
  const [loadedQuestions, setLoadedQuestions] = createStore<Record<string, QuestionRequest[]>>({})

  createEffect((prev: string[]) => {
    const stack = viewingStack()
    const currentIds = stack.map((e) => e.id)
    if (prev.length > currentIds.length) {
      const removed = prev.filter((id) => !currentIds.includes(id))
      batch(() => {
        for (const id of removed) {
          const mids = loadedMessages[id]?.map((msg) => msg.id) ?? []
          setLoadedMessages(produce((draft: Record<string, Message[]>) => {
            delete draft[id]
          }))
          setLoadedParts(produce((draft: Record<string, Part[]>) => {
            for (const mid of mids) delete draft[mid]
          }))
          setPhase(produce((draft: Record<string, "loading" | "ready" | "error">) => {
            delete draft[id]
          }))
        }
        setLoadedDiffs(reconcile([] as FileDiff[], { key: "file" }))
        setLoadedTodos(reconcile([] as Todo[], { key: "id" }))
        setLoadedPermissions(reconcile({} as Record<string, PermissionRequest[]>))
        setLoadedQuestions(reconcile({} as Record<string, QuestionRequest[]>))
        setLoadedStatus(undefined)
      })
    }
    return currentIds
  }, [] as string[])

  const containerRef = (el: HTMLDivElement) => {
    el.addEventListener("click", (e) => {
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
    }, true)
  }

  const isNew = createMemo(() => !createdSessionID() && !session.sessionID())

  const rootSessionID = createMemo(() => createdSessionID() ?? session.sessionID())
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
    const fromLoaded = cid ? loadedMessages[cid] : undefined
    if (fromLoaded) return fromLoaded
    if (cid === rootSessionID()) return session.data.messages
    return [] as Message[]
  })

  const effectiveStatus = createMemo(() => {
    if (viewingSessionID()) return loadedStatus() ?? { type: "idle" } as SessionStatus
    return session.data.status
  })

  const effectiveParts = createMemo(() => {
    if (viewingSessionID()) return loadedParts as Record<string, Part[]>
    return session.data.parts
  })

  const effectiveDiffs = createMemo(() => {
    if (viewingSessionID()) return loadedDiffs as unknown as FileDiff[]
    return session.data.diffs
  })

  const effectiveTodos = createMemo(() => {
    if (viewingSessionID()) return loadedTodos as unknown as Todo[]
    return session.data.todos
  })

  const effectivePermissions = createMemo(() => {
    if (viewingSessionID()) return loadedPermissions as Record<string, PermissionRequest[]>
    return session.data.permissions
  })

  const effectiveQuestions = createMemo(() => {
    if (viewingSessionID()) return loadedQuestions as Record<string, QuestionRequest[]>
    return session.data.questions
  })

  createEffect(on(currentSessionID, async (id) => {
    if (!id) return
    if (id === rootSessionID() && !viewingSessionID()) return
    const mids = loadedMessages[id]?.map((msg) => msg.id) ?? []
    batch(() => {
      setLoadedMessages(produce((draft: Record<string, Message[]>) => {
        delete draft[id]
      }))
      setLoadedParts(produce((draft: Record<string, Part[]>) => {
        for (const mid of mids) delete draft[mid]
      }))
      setLoadedStatus(undefined)
      setPhase(id, "loading")
    })
    const [sessionRes, messagesRes] = await Promise.allSettled([
      device.client.conversation.get(id),
      device.client.conversation.messages(id, { limit: 50 }),
    ])
    if (currentSessionID() !== id) return
    if (messagesRes.status !== "fulfilled") {
      setPhase(id, "error")
      return
    }
    const raw = Array.isArray(messagesRes.value) ? messagesRes.value : []
    const msgs: Message[] = []
    batch(() => {
      for (const item of raw as any[]) {
        if (!item?.info?.id) continue
        msgs.push(item.info as Message)
        if (item.parts && Array.isArray(item.parts)) {
          setLoadedParts(item.info.id, reconcile(item.parts as Part[], { key: "id" }))
        }
      }
      setLoadedMessages(id, reconcile(msgs, { key: "id" }))
      if (sessionRes.status === "fulfilled" && sessionRes.value) {
        setLoadedStatus({ type: "idle" } as SessionStatus)
      }
      setPhase(id, "ready")
    })
  }))

  const unsubscribe = workspace.subscribe((payload) => {
    if (payload.type === "session.created") {
      const info = (payload.properties as { info?: Session })?.info ?? payload.properties as Session
      if (info?.id && !createdSessionID() && !session.sessionID()) {
        setCreatedSessionID(info.id)
        tabStore.updateMeta(props.tabId, { sessionID: info.id })
        if (info.title) tabStore.setTitle(props.tabId, info.title)
      }
    }

    if (payload.type === "session.updated") {
      const info = (payload.properties as { info?: Session })?.info ?? payload.properties as Session
      const cid = currentSessionID()
      if (info?.id === cid && info.title) {
        tabStore.setTitle(props.tabId, info.title)
      }
    }

    if (!viewingSessionID()) return

    const cid = currentSessionID()
    if (!cid) return

    const eventSID = payload.sessionID ?? (payload.properties as any)?.sessionID ?? ((payload.properties as any)?.part as any)?.sessionID ?? ((payload.properties as any)?.info as any)?.sessionID ?? ((payload.properties as any)?.status as any)?.sessionID
    if (eventSID && eventSID !== cid) return

    batch(() => {
      switch (payload.type) {
        case "message.updated": {
          const info = (payload.properties as { info?: Message })?.info
          if (!info?.id) break
          setLoadedMessages(cid, produce((draft: Message[]) => {
            const idx = draft.findIndex((m) => m.id === info.id)
            if (idx !== -1) draft[idx] = info
            else draft.push(info)
          }))
          break
        }
        case "message.part.updated": {
          const part = (payload.properties as { part?: Part })?.part
          if (!part?.id) break
          const messageID = part.messageID
          if (!messageID) break
          const existing = loadedParts[messageID]
          if (!existing) {
            setLoadedParts(messageID, [part])
            break
          }
          setLoadedParts(messageID, produce((draft: Part[]) => {
            const idx = draft.findIndex((p) => p.id === part.id)
            if (idx !== -1) draft[idx] = part
            else draft.push(part)
          }))
          break
        }
        case "message.part.delta": {
          const d = payload.properties as { messageID: string; partID: string; field: string; delta: string }
          if (!d.messageID || !d.partID) break
          const parts = loadedParts[d.messageID]
          if (!parts) break
          const idx = parts.findIndex((p) => p.id === d.partID)
          if (idx === -1) break
          setLoadedParts(d.messageID, idx, produce((draft: any) => {
            const field = d.field as keyof typeof draft
            const existing = draft[field] as string | undefined
            ;(draft[field] as string) = (existing ?? "") + d.delta
          }))
          break
        }
        case "session.status": {
          const status = (payload.properties as { status?: SessionStatus })?.status ?? payload.properties as SessionStatus
          setLoadedStatus(status as SessionStatus)
          break
        }
        case "session.diff": {
          const props = payload.properties as { diff?: FileDiff[] }
          if (props.diff) setLoadedDiffs(reconcile(props.diff, { key: "file" }))
          break
        }
        case "todo.updated": {
          const props = payload.properties as { todos?: Todo[] }
          if (props.todos) setLoadedTodos(reconcile(props.todos, { key: "id" }))
          break
        }
        case "permission.asked": {
          const perm = payload.properties as PermissionRequest
          if (perm?.id) {
            const sid = perm.sessionID
            setLoadedPermissions(sid, produce((draft: PermissionRequest[]) => {
              if (!draft.some((p) => p.id === perm.id)) {
                draft.push(perm)
              }
            }))
          }
          break
        }
        case "permission.replied": {
          const props = payload.properties as { sessionID?: string; requestID?: string }
          const sid = props?.sessionID
          const rid = props?.requestID
          if (sid && rid) {
            setLoadedPermissions(sid, produce((draft: PermissionRequest[]) => {
              const idx = draft.findIndex((p) => p.id === rid)
              if (idx !== -1) draft.splice(idx, 1)
            }))
          }
          break
        }
        case "question.asked": {
          const q = payload.properties as QuestionRequest
          if (q?.id) {
            const sid = q.sessionID
            setLoadedQuestions(sid, produce((draft: QuestionRequest[]) => {
              if (!draft.some((r) => r.id === q.id)) {
                draft.push(q)
              }
            }))
          }
          break
        }
        case "question.replied":
        case "question.rejected": {
          const props = payload.properties as { sessionID?: string; requestID?: string }
          const sid = props?.sessionID
          const rid = props?.requestID
          if (sid && rid) {
            setLoadedQuestions(sid, produce((draft: QuestionRequest[]) => {
              const idx = draft.findIndex((r) => r.id === rid)
              if (idx !== -1) draft.splice(idx, 1)
            }))
          }
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
  const syncStore = createMemo(() => ({
    status: workspace.data.status === "unavailable" ? "complete" as const : workspace.data.status === "loading" ? "loading" as const : "complete" as const,
    agent: workspace.data.agent,
    agentRuntimes: [] as unknown[],
    command: workspace.data.command,
    project: "",
    projectMeta: undefined as any,
    icon: undefined as string | undefined,
    provider: workspace.data.provider,
    path: { directory: device.directory } as Path,
    session: workspace.data.session,
    sessionTotal: workspace.data.sessionTotal,
    session_status: { [currentSessionID() ?? ""]: effectiveStatus(), "": effectiveStatus(), undefined: effectiveStatus() } as Record<string, SessionStatus>,
    session_diff: { [currentSessionID() ?? ""]: effectiveDiffs() } as Record<string, FileDiff[]>,
    todo: { [currentSessionID() ?? ""]: effectiveTodos() } as Record<string, Todo[]>,
    permission: effectivePermissions(),
    question: effectiveQuestions(),
    mcp: {} as Record<string, any>,
    lsp: [] as any[],
    vcs: workspace.data.vcs,
    limit: 50,
    message: { [currentSessionID() ?? ""]: effectiveMessages(), "": effectiveMessages(), undefined: effectiveMessages() } as Record<string, Message[]>,
    part: effectiveParts() as Record<string, Part[]>,
  }))

  const syncSet = (...args: any[]) => {
    if (!viewingSessionID()) return
    if (args[0] === "session_status" && args[1]) {
      setLoadedStatus(args[2] as SessionStatus)
    }
    if (args[0] === "todo" && args[1]) {
      setLoadedTodos(reconcile(args[2] as Todo[] ?? [], { key: "id" }))
    }
  }

  const syncValue = {
    get data() { return syncStore() },
    get set() { return syncSet },
    get status() { return syncStore().status },
    get ready() { return workspace.data.status !== "loading" },
    get project() {
      return {
        id: device.directory,
        worktree: device.directory,
        name: undefined as string | undefined,
        time: { created: Date.now(), updated: Date.now() },
      } as Project
    },
    session: {
      get(id: string) { return workspace.data.session.find((s) => s.id === id) },
      optimistic: {
        add(input: { directory?: string; sessionID: string; message: Message; parts: Part[] }) {
          session.optimistic.add({ message: input.message, parts: input.parts })
          if (!viewingSessionID()) return
          const cid = currentSessionID()
          if (cid) {
            setLoadedMessages(cid, produce((draft: Message[]) => {
              const idx = draft.findIndex((m) => m.id === input.message.id)
              if (idx === -1) draft.push(input.message)
            }))
            if (input.message.id) {
              setLoadedParts(input.message.id, produce((draft: Part[]) => {
                for (const p of input.parts) {
                  const idx = draft.findIndex((x) => x.id === p.id)
                  if (idx === -1) draft.push(p)
                }
              }))
            }
          }
        },
        remove(input: { directory?: string; sessionID: string; messageID: string }) {
          session.optimistic.remove({ messageID: input.messageID })
          if (!viewingSessionID()) return
          const cid = currentSessionID()
          if (cid) {
            setLoadedMessages(cid, produce((draft: Message[]) => {
              const idx = draft.findIndex((m) => m.id === input.messageID)
              if (idx !== -1) draft.splice(idx, 1)
            }))
          }
        },
      },
      addOptimisticMessage(input: { sessionID: string; messageID: string; parts: Part[]; agent: string; model: { providerID: string; modelID: string } }) {
        session.addOptimisticMessage(input)
        if (!viewingSessionID()) return
        const cid = currentSessionID()
        if (cid) {
          const message: Message = {
            id: input.messageID,
            sessionID: cid,
            role: "user",
            time: { created: Date.now() },
            agent: input.agent,
            model: input.model,
          }
          setLoadedMessages(cid, produce((draft: Message[]) => {
            const idx = draft.findIndex((m) => m.id === message.id)
            if (idx === -1) draft.push(message)
          }))
          setLoadedParts(input.messageID, produce((draft: Part[]) => {
            for (const p of input.parts) {
              const idx = draft.findIndex((x) => x.id === p.id)
              if (idx === -1) draft.push(p)
            }
          }))
        }
      },
      async sync(id: string) { await session.sync() },
      async diff(id: string) { await session.diff() },
      async todo(id: string) { await session.todo() },
      history: {
        more(id: string) { return session.history.more() },
        loading(id: string) { return session.history.loading() },
        async loadMore(id: string, count?: number) { await session.history.loadMore(count) },
      },
      async fetch(count?: number) { await workspace.session.fetch(count) },
      async archive(id: string) { await workspace.session.archive(id) },
    },
    command: { async load() { return workspace.command.load() } },
    vcs: { async load() { return workspace.vcs.load() } },
    directory: device.directory,
    currentSessionID,
    navigateBack: () => setViewingStack((prev) => prev.length > 0 ? prev.slice(0, -1) : prev),
  }

  // LocalContext value
  const localValue = local

  // PromptContext value — minimal standalone prompt state
  const [promptParts, setPromptParts] = createStore<{ items: any[] }>({ items: [] })
  const [promptCursor, setPromptCursor] = createSignal(0)
  const isDefaultPrompt = (parts: any[]) => {
    if (parts.length === 0) return true
    if (parts.length === 1 && parts[0].type === "text" && (parts[0].content ?? "") === "") return true
    return false
  }
  const promptValue = {
    ready: () => true,
    current: () => promptParts.items,
    cursor: () => promptCursor(),
    dirty: () => !isDefaultPrompt(promptParts.items),
    set(parts: any[], cursor: number) {
      setPromptParts("items", parts)
      setPromptCursor(cursor)
    },
    reset() {
      setPromptParts("items", [])
      setPromptCursor(0)
    },
    context: {
      items: () => [],
      add() {},
      remove() {},
      replaceComments() {},
      updateComment() {},
      removeComment() {},
    },
  }

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
    respond(input: any) { session.permission.respond(input) },
    autoResponds() { return session.permission.isAutoAccepting() },
    isAutoAccepting() { return session.permission.isAutoAccepting() },
    toggleAutoAccept() { session.permission.toggleAutoAccept() },
    enableAutoAccept() { session.permission.enableAutoAccept() },
    disableAutoAccept() { session.permission.disableAutoAccept() },
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
    get catalog() { return [] },
    get options() { return [] },
  }

  // LayoutContext value — reuse DeviceLayoutProvider's
  // Already provided by DeviceInterface

  const composer = createDeviceSessionComposerState()

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
    () => messages().filter((m) => m.role === "user") as any[],
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
        ? snap() || !autoScroll.userScrolled() || el.scrollHeight - el.clientHeight - el.scrollTop < 10 + Math.max(0, delta)
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
      command: workspace.data.command,
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
    }
    return result
  })

  const globalSyncValue = {
    data: { ready: true, error: undefined as string | undefined, project: [] as any[] },
    set: () => {},
    get ready() { return true },
    get error() { return undefined },
    child: (_dir?: string) => [childStore(), () => {}] as const,
    bootstrap: async () => {},
    project: {
      loadSessions: async () => {},
      meta: () => {},
      icon: () => {},
    },
    todo: { set: () => {} },
  }

  const dataProps = createMemo(() => ({
    ...syncStore(),
    provider: legacyProvider(workspace.data.provider),
  }))

  const DeviceCloudTeamBar = (props: { centered: boolean }) => {
    const cloudTeam = useCloudTeam()
    return (
      <Show when={cloudTeam.active()}>
        <div class="shrink-0 w-full pb-1">
          <div
            classList={{
              "w-full px-3": true,
              "md:max-w-200 md:mx-auto 2xl:max-w-[1000px]": props.centered,
            }}
          >
            <CloudTeamStatusBar />
          </div>
        </div>
      </Show>
    )
  }

  return (
    <ConversationAdapterContext.Provider value={adapter() as any}>
    <CloudTeamProvider>
    <GlobalSyncContext.Provider value={globalSyncValue as any}>
    <SDKContext.Provider value={sdkValue as any}>
      <SyncContext.Provider value={syncValue as any}>
        <LocalContext.Provider value={localValue as any}>
          <PromptContext.Provider value={promptValue as any}>
            <CommentsContext.Provider value={commentsValue as any}>
              <PermissionContext.Provider value={permissionValue as any}>
                <CommandContext.Provider value={commandValue as any}>
                <SettingsContext.Provider value={settingsValue as any}>
                  <DataProvider data={dataProps()} directory={device.directory}
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
                          {tabStore.tabs().find((t) => t.id === props.tabId)?.title ?? language.t("command.session.new")}
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
                      <Show when={!isNew() && !viewingSessionID()}>
                        <div class="shrink-0 flex items-center gap-0.5 ml-1">
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
                                <DropdownMenu.Item onSelect={() => {
                                  const sid = rootSessionID()
                                  if (sid) void workspace.session.archive(sid)
                                }}>
                                  <DropdownMenu.ItemLabel>{language.t("common.archive")}</DropdownMenu.ItemLabel>
                                </DropdownMenu.Item>
                                <DropdownMenu.Separator />
                                <DropdownMenu.Item onSelect={() => {
                                  const sid = rootSessionID()
                                  if (!sid) return
                                  const name = workspace.data.session.find((s) => s.id === sid)?.title ?? language.t("command.session.new")
                                  dialog.show(() => (
                                    <Dialog title={language.t("session.delete.title")} fit>
                                      <div class="flex flex-col gap-4 pl-6 pr-2.5 pb-3">
                                        <div class="flex flex-col gap-1">
                                          <span class="text-14-regular text-text-strong">
                                            {language.t("session.delete.confirm", { name })}
                                          </span>
                                        </div>
                                        <div class="flex justify-end gap-2">
                                          <Button variant="ghost" size="large" onClick={() => dialog.close()}>
                                            {language.t("common.cancel")}
                                          </Button>
                                          <Button variant="primary" size="large" onClick={async () => {
                                            await device.client.conversation.delete(sid).catch(() => {})
                                            tabStore.close(props.tabId)
                                            dialog.close()
                                          }}>
                                            {language.t("session.delete.button")}
                                          </Button>
                                        </div>
                                      </div>
                                    </Dialog>
                                  ))
                                }}>
                                  <DropdownMenu.ItemLabel>{language.t("common.delete")}</DropdownMenu.ItemLabel>
                                </DropdownMenu.Item>
                              </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                          </DropdownMenu>
                        </div>
                      </Show>
                    </div>
                    <div ref={containerRef} class="flex-1 min-h-0 flex flex-col">
                      <div class="@container relative shrink-0 flex flex-col min-h-0 h-full bg-background-stronger flex-1">
                        <div class="flex-1 min-h-0 overflow-hidden">
                          <Show
                            when={!isNew()}
                            fallback={
                              <NewSessionView
                                worktree="main"
                                onWorktreeChange={() => {}}
                              />
                            }
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

                        <Show
                          when={workspace.agentAvailable()}
                          fallback={
                            <div class="shrink-0 w-full pb-3 flex justify-center items-center">
                              <span class="text-12-regular text-text-weak">{language.t("workspace.device.offline")}</span>
                            </div>
                          }
                        >
                          <DeviceCloudTeamBar centered={!isNew()} />
                          <SessionComposerRegion
                            state={composer}
                            ready={true}
                            centered={!isNew()}
                            inputRef={() => {}}
                            newSessionWorktree="main"
                            onNewSessionWorktreeReset={() => {}}
                            onSubmit={() => {
                              resumeScroll()
                            }}
                            onResponseSubmit={resumeScroll}
                            setPromptDockRef={(el) => { promptDock = el }}
                          />
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
          </PromptContext.Provider>
        </LocalContext.Provider>
      </SyncContext.Provider>
    </SDKContext.Provider>
    </GlobalSyncContext.Provider>
    </CloudTeamProvider>
    </ConversationAdapterContext.Provider>
  )
}
