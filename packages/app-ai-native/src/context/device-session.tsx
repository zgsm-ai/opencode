import { createContext, createSignal, useContext, type ParentProps } from "solid-js"
import { batch, createEffect, createMemo, onCleanup } from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import { useDeviceSDK } from "./device-sdk"
import { useDeviceWorkspace } from "./device-workspace"
import type { Message, Part, Session, SessionStatus, FileDiff, Todo, PermissionRequest, QuestionRequest } from "@opencode-ai/sdk/v2/client"
import { sessionTreeIDs } from "@/pages/session/composer/session-request-tree"

export type SessionError = {
  subtype?: string
  level?: string
  message?: string
  retryInMs?: number
  retryAttempt?: number
  maxRetries?: number
}

export type TaskState = {
  taskID: string
  status: "running" | "completed" | "failed" | "stopped"
  description: string
  taskType?: string
  summary?: string
  usage?: { total_tokens: number; tool_uses: number; duration_ms: number }
  startTime: number
  endTime?: number
}

type SessionData = {
  session: Session | undefined
  messages: Message[]
  parts: Record<string, Part[]>
  status: SessionStatus | undefined
  diffs: FileDiff[]
  todos: Todo[]
  permissions: Record<string, PermissionRequest[]>
  questions: Record<string, QuestionRequest[]>
  error: SessionError | undefined
  toolProgress: Record<string, string>
  partProgress: Record<string, string[]>
  tasks: Record<string, TaskState>
}

type DeviceSessionValue = {
  data: SessionData
  set: ReturnType<typeof createStore<SessionData>>[1]
  sessionID: () => string | undefined
  sync: () => Promise<void>
  diff: () => Promise<void>
  todo: () => Promise<void>
  optimistic: {
    add(input: { message: Message; parts: Part[] }): void
    remove(input: { messageID: string }): void
  }
  addOptimisticMessage(input: {
    messageID: string
    parts: Part[]
    agent: string
    model: { providerID: string; modelID: string }
  }): void
  history: {
    more(): boolean
    loading(): boolean
    loadMore(count?: number): Promise<void>
  }
  permission: {
    respond(input: { permissionID: string; response: "once" | "always" | "reject" }): void
    isAutoAccepting(): boolean
    toggleAutoAccept(): void
    enableAutoAccept(): void
    disableAutoAccept(): void
    enabled(): boolean
  }
}

const DeviceSessionContext = createContext<DeviceSessionValue>()

export function useDeviceSession() {
  const ctx = useContext(DeviceSessionContext)
  if (!ctx) throw new Error("useDeviceSession must be used within DeviceSessionProvider")
  return ctx
}

export { DeviceSessionContext }

const MESSAGE_PAGE_SIZE = 50
const idle: SessionStatus = { type: "idle" }

export function group<T extends { id: string; sessionID: string }>(input: T[]) {
  return input.reduce<Record<string, T[]>>((acc, item) => {
    const list = acc[item.sessionID]
    if (list) list.push(item)
    if (!list) acc[item.sessionID] = [item]
    return acc
  }, {})
}

export function treeItems<T extends { id?: string; sessionID?: string }>(input: T[], ids: Set<string>) {
  return group(
    input.filter((item): item is T & { id: string; sessionID: string } => {
      return !!item?.id && !!item.sessionID && ids.has(item.sessionID)
    }),
  )
}

export function treeEvent(input: {
  root?: string
  eventSID?: string
  type: string
  tree: Set<string>
}) {
  if (!input.root) return false
  if (!input.eventSID) return true
  const request =
    input.type === "permission.asked" ||
    input.type === "permission.replied" ||
    input.type === "question.asked" ||
    input.type === "question.replied" ||
    input.type === "question.rejected" ||
    input.type === "task.started" ||
    input.type === "task.progress" ||
    input.type === "task.completed"
  if (request) return input.tree.has(input.eventSID)
  return input.eventSID === input.root
}

export function DeviceSessionProvider(props: ParentProps<{ sessionID?: string }>) {
  const device = useDeviceSDK()
  const workspace = useDeviceWorkspace()

  const [store, setStore] = createStore<SessionData>({
    session: undefined,
    messages: [],
    parts: {},
    status: undefined,
    diffs: [],
    todos: [],
    permissions: {},
    questions: {},
    error: undefined,
    toolProgress: {},
    partProgress: {},
    tasks: {},
  })

  const inflight = new Map<string, Promise<void>>()

  const runInflight = (key: string, task: () => Promise<void>) => {
    const pending = inflight.get(key)
    if (pending) return pending
    const promise = task().finally(() => inflight.delete(key))
    inflight.set(key, promise)
    return promise
  }

  const sid = createMemo(() => props.sessionID)

  const tree = createMemo(() => new Set(sessionTreeIDs(workspace.data.session, sid())))

  createEffect(() => {
    if (sid()) void syncSession()
  })

  createEffect(() => {
    const id = sid()
    if (!id) {
      setStore("status", undefined)
      return
    }
    setStore("status", workspace.data.sessionStatus[id] ?? idle)
  })

  // When SSE streaming completes (session transitions from busy/retry to idle),
  // run a reconciliation pass to catch any content that might have been missed
  // during streaming. The small delay ensures pending SSE events settle first.
  let reconcileTimer: ReturnType<typeof setTimeout> | undefined
  let wasActive = false

  createEffect(() => {
    const id = sid()
    if (!id) {
      wasActive = false
      return
    }
    const status = workspace.data.sessionStatus[id]
    const isActive = status?.type === "busy" || status?.type === "retry"
    if (wasActive && !isActive) {
      if (reconcileTimer) clearTimeout(reconcileTimer)
      const sessionId = id
      reconcileTimer = setTimeout(() => {
        reconcileTimer = undefined
        if (sid() === sessionId) {
          void loadMessages(MESSAGE_PAGE_SIZE)
        }
      }, 150)
    }
    wasActive = isActive
  })

  onCleanup(() => {
    if (reconcileTimer) {
      clearTimeout(reconcileTimer)
      reconcileTimer = undefined
    }
  })

  const BATCH_SIZE = 10

  const loadMessages = async (limit: number) => {
    const id = sid()
    if (!id) return
    return runInflight("messages", async () => {
      try {
        const result = await device.client.conversation.messages(id, { limit })
        if (!result) return
        const raw = Array.isArray(result) ? result : []
        const fetched = new Map<string, { info: Message; parts?: Part[] }>()
        for (const item of raw as any[]) {
          if (!item?.info?.id) continue
          fetched.set(item.info.id, {
            info: item.info as Message,
            parts: Array.isArray(item.parts) ? (item.parts as Part[]) : undefined,
          })
        }

        batch(() => {
          for (const [mid, data] of fetched) {
            if (data.parts && data.parts.length > 0) {
              const existing = store.parts[mid]
              if (!existing || existing.length !== data.parts.length) {
                setStore("parts", mid, data.parts)
              } else {
                for (let i = 0; i < data.parts.length; i++) {
                  const existingPart = existing[i] as any
                  const newPart = data.parts[i] as any
                  if (existingPart?.state?.status === "running" && newPart?.state?.status !== "running") {
                    continue
                  }
                  setStore("parts", mid, i, newPart)
                }
              }
            }
          }
        })

        const entries = [...fetched]
        for (let i = 0; i < entries.length; i += BATCH_SIZE) {
          const chunk = entries.slice(i, i + BATCH_SIZE)
          batch(() => {
            setStore("messages", produce((draft: Message[]) => {
              const index = new Map(draft.map((m, j) => [m.id, j]))
              for (const [mid, data] of chunk) {
                const idx = index.get(mid)
                if (idx !== undefined) {
                  draft[idx] = data.info
                } else {
                  draft.push(data.info)
                }
              }
              draft.sort((a, b) => (a.time?.created ?? 0) - (b.time?.created ?? 0))
            }))
          })
          if (i + BATCH_SIZE < entries.length) {
            await new Promise<void>(r => requestAnimationFrame(() => r()))
          }
        }
      } catch {}
    })
  }

  const syncSession = async () => {
    const id = sid()
    if (!id || !workspace.agentAvailable()) return
    try {
      const [,] = await Promise.allSettled([
        device.client.conversation.get(id).then((result) => {
          if (result) setStore("session", result as Session)
        }),
        loadMessages(MESSAGE_PAGE_SIZE),
        loadTasks(id),
      ])
    } catch {}
  }

  const loadTasks = async (id: string) => {
    try {
      const result = await device.client.conversation.tasks(id) as any
      if (!result?.tasks || !Array.isArray(result.tasks)) return
      const taskMap: Record<string, TaskState> = {}
      for (const t of result.tasks) {
        if (t?.taskID) {
          taskMap[t.taskID] = {
            taskID: t.taskID,
            status: t.status ?? "completed",
            description: t.description ?? "",
            taskType: t.taskType,
            summary: t.summary,
            usage: t.usage,
            startTime: t.startTime ?? Date.now(),
            endTime: t.endTime,
          }
        }
      }
      setStore("tasks", reconcile(taskMap, { key: "taskID" }))
    } catch {}
  }

  const diffSession = async () => {
    const id = sid()
    if (!id || !workspace.agentAvailable()) return
    if (store.diffs.length > 0) return
    return runInflight("diff", async () => {
      try {
        const result = await device.client.conversation.diff(id)
        setStore("diffs", reconcile((result as FileDiff[]) ?? [], { key: "file" }))
      } catch {}
    })
  }

  const todoSession = async () => {
    const id = sid()
    if (!id || !workspace.agentAvailable()) return
    if (store.todos.length > 0) return
    return runInflight("todo", async () => {
      try {
        const result = await device.client.conversation.todo(id)
        setStore("todos", reconcile((result as Todo[]) ?? [], { key: "id" }))
      } catch {}
    })
  }

  const optimisticAdd = (input: { message: Message; parts: Part[] }) => {
    setStore(produce((draft) => {
      draft.messages.push(input.message)
      if (input.parts.length > 0 && input.message.id) {
        draft.parts[input.message.id] = input.parts
      }
    }))
  }

  const optimisticRemove = (input: { messageID: string }) => {
    setStore(produce((draft) => {
      const idx = draft.messages.findIndex((m) => m.id === input.messageID)
      if (idx !== -1) draft.messages.splice(idx, 1)
      delete draft.parts[input.messageID]
    }))
  }

  const addOptimisticMessage = (input: {
    messageID: string
    parts: Part[]
    agent: string
    model: { providerID: string; modelID: string }
  }) => {
    const message: Message = {
      id: input.messageID,
      sessionID: sid() ?? "",
      role: "user",
      time: { created: Date.now() },
      agent: input.agent,
      model: input.model,
    }
    optimisticAdd({ message, parts: input.parts })
  }

  const unsubscribe = workspace.subscribe((payload) => {
    const eventSID = payload.sessionID ?? (payload.properties as any)?.sessionID ?? ((payload.properties as any)?.part as any)?.sessionID ?? ((payload.properties as any)?.info as any)?.sessionID ?? ((payload.properties as any)?.status as any)?.sessionID ?? ((payload.properties as any)?.diff as any[])?.[0]?.sessionID ?? ((payload.properties as any)?.todos as any[])?.[0]?.sessionID
    if (!treeEvent({ root: sid(), eventSID, type: payload.type, tree: tree() })) {
      return
    }


    batch(() => {
      switch (payload.type) {
        case "message.updated": {
          const info = (payload.properties as { info?: Message })?.info
          if (!info?.id) break
          if (info.role === "user" && store.error) setStore("error", undefined)
          setStore("messages", produce((draft: Message[]) => {
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
          const partTool = (part as any).tool as string | undefined
          const partStatus = (part as any).state?.status as string | undefined
          const partCallID = (part as any).callID as string | undefined
          const partProgress = (part as any).state?.progress as string[] | undefined
          if (partCallID) {
            if (partStatus === "completed" || partStatus === "error") {
              setStore("partProgress", partCallID, undefined as any)
            } else if (Array.isArray(partProgress)) {
              setStore("partProgress", partCallID, partProgress.length > 10 ? partProgress.slice(-10) : partProgress)
            }
          }
          const existing = store.parts[messageID]
          if (!existing) {
            setStore("parts", messageID, [part])
            break
          }
          const idx = existing.findIndex((p) => p.id === part.id)
          if (idx !== -1) {
            const prev = existing[idx] as any
            const merged = (part as any).state?.output === undefined && prev?.state?.output !== undefined
              ? { ...part, state: { ...(part as any).state, output: prev.state.output } }
              : part
            setStore("parts", messageID, idx, merged)
          } else {
            const callID = (part as any).callID
            if (callID) {
              const byCall = existing.findIndex((p) => (p as any).callID === callID)
              if (byCall !== -1) {
                const prev = existing[byCall] as any
                const base = { ...part, id: existing[byCall].id }
                const patched = (part as any).state?.output === undefined && prev?.state?.output !== undefined
                  ? { ...base, state: { ...(part as any).state, output: prev.state.output } }
                  : base
                setStore("parts", messageID, byCall, patched)
                break
              }
            }
            setStore("parts", messageID, existing.length, part)
          }
          break
        }
        case "message.part.delta": {
          const props = payload.properties as { messageID: string; partID: string; field: string; delta: string }
          if (!props.messageID || !props.partID) break
          const parts = store.parts[props.messageID]
          if (!parts) break
          const idx = parts.findIndex((p) => p.id === props.partID)
          if (idx === -1) break
          setStore("parts", props.messageID, idx, produce((draft: any) => {
            if (props.field === "input" && draft.type === "tool" && draft.state) {
              const existing = (draft.state.input as string) ?? ""
              draft.state.input = existing + props.delta
            } else {
              const field = props.field as keyof typeof draft
              const existing = draft[field] as string | undefined
              ;(draft[field] as string) = (existing ?? "") + props.delta
            }
          }))
          break
        }
        case "session.diff": {
          const props = payload.properties as { sessionID?: string; diff?: FileDiff[] }
          if (props.diff) setStore("diffs", reconcile(props.diff, { key: "file" }))
          break
        }
        case "todo.updated": {
          const props = payload.properties as { sessionID?: string; todos?: Todo[] }
          if (props.todos) setStore("todos", reconcile(props.todos, { key: "id" }))
          break
        }
        case "session.error": {
          const props = payload.properties as { sessionID?: string; error?: SessionError }
          if (props.error) setStore("error", props.error)
          setStore("status", idle)
          break
        }
        case "message.removed": {
          const props = payload.properties as { sessionID?: string; messageID?: string }
           if (!props.messageID) break
           setStore(produce((draft) => {
            const idx = draft.messages.findIndex((m) => m.id === props.messageID)
            if (idx !== -1) draft.messages.splice(idx, 1)
            delete draft.parts[props.messageID!]
          }))
          break
        }
        case "tool.progress": {
          const props = payload.properties as { sessionID?: string; toolUseID?: string; parentToolUseID?: string; data?: string }
          const toolUseID = props.toolUseID ?? props.parentToolUseID
          if (!toolUseID || !props.data) break
          setStore("toolProgress", toolUseID, (existing: string | undefined) => (existing ?? "") + props.data)
          break
        }
        case "task.started": {
          const props = payload.properties as { sessionID?: string; taskID?: string; description?: string; taskType?: string }
          if (!props.taskID) break
          setStore("tasks", props.taskID, {
            taskID: props.taskID,
            status: "running",
            description: props.description ?? "",
            taskType: props.taskType,
            startTime: Date.now(),
          })
          break
        }
        case "task.progress": {
          const props = payload.properties as { sessionID?: string; taskID?: string; description?: string; usage?: { total_tokens: number; tool_uses: number; duration_ms: number }; summary?: string }
          if (!props.taskID) break
          const existing = store.tasks[props.taskID]
          if (!existing) break
          setStore("tasks", props.taskID, produce((draft: TaskState) => {
            if (props.description) draft.description = props.description
            if (props.usage) draft.usage = props.usage
            if (props.summary) draft.summary = props.summary
          }))
          break
        }
        case "task.completed": {
          const props = payload.properties as { sessionID?: string; taskID?: string; status?: string; summary?: string; usage?: { total_tokens: number; tool_uses: number; duration_ms: number } }
          if (!props.taskID) break
          const existing = store.tasks[props.taskID]
          const endTime = Date.now()
          setStore("tasks", props.taskID, {
            taskID: props.taskID,
            status: (props.status === "completed" || props.status === "failed" || props.status === "stopped") ? props.status : "completed",
            description: existing?.description ?? "",
            taskType: existing?.taskType,
            summary: props.summary ?? existing?.summary,
            usage: props.usage ?? existing?.usage,
            startTime: existing?.startTime ?? endTime,
            endTime,
          })
          break
        }

      }
    })
  })
  onCleanup(() => unsubscribe())

  const permissionRespond = (input: { permissionID: string; response: "once" | "always" | "reject" }) => {
    if (!workspace.agentAvailable()) return
    const id = sid()
    device.client.permission.respond(input.permissionID, {
      decision: input.response,
    }).catch(() => {
      if (id) workspace.session.removePermission(id, input.permissionID)
    })
  }

  const value: DeviceSessionValue = {
    get data() { return store },
    set: setStore as any,
    sessionID: sid,
    sync: syncSession,
    diff: diffSession,
    todo: todoSession,
    optimistic: {
      add: optimisticAdd,
      remove: optimisticRemove,
    },
    addOptimisticMessage,
    history: {
      more() {
        return store.messages.length >= MESSAGE_PAGE_SIZE
      },
      loading() {
        return inflight.has("messages")
      },
      async loadMore(count?: number) {
        await loadMessages(store.messages.length + (count ?? MESSAGE_PAGE_SIZE))
      },
    },
    permission: {
      respond: permissionRespond,
      isAutoAccepting() {
        return workspace.autoAccept.enabled()
      },
      toggleAutoAccept() {
        workspace.autoAccept.toggle()
      },
      enableAutoAccept() {
        workspace.autoAccept.enable()
      },
      disableAutoAccept() {
        workspace.autoAccept.disable()
      },
      enabled() {
        return workspace.agentAvailable()
      },
    },
  }

  return <DeviceSessionContext.Provider value={value}>{props.children}</DeviceSessionContext.Provider>
}
