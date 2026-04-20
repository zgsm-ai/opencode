import { createContext, useContext, type ParentProps } from "solid-js"
import { batch, createEffect, createMemo, onCleanup } from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import { useDeviceSDK } from "./device-sdk"
import { useDeviceWorkspace } from "./device-workspace"
import type { Message, Part, Session, SessionStatus, FileDiff, Todo, PermissionRequest, QuestionRequest } from "@opencode-ai/sdk/v2/client"
import { sessionTreeIDs } from "@/pages/session/composer/session-request-tree"

type SessionData = {
  session: Session | undefined
  messages: Message[]
  parts: Record<string, Part[]>
  status: SessionStatus | undefined
  diffs: FileDiff[]
  todos: Todo[]
  permissions: Record<string, PermissionRequest[]>
  questions: Record<string, QuestionRequest[]>
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
  if (!input.root || !input.eventSID) return true
  const request =
    input.type === "permission.asked" ||
    input.type === "permission.replied" ||
    input.type === "question.asked" ||
    input.type === "question.replied" ||
    input.type === "question.rejected"
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
  })

  const [permissionStore, setPermissionStore] = createStore<{
    autoAccept: boolean
  }>({
    autoAccept: false,
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
    tree()
    if (sid()) void loadRequests()
  })

  const loadMessages = async (limit: number) => {
    const id = sid()
    if (!id) return
    return runInflight("messages", async () => {
      try {
        const result = await device.client.conversation.messages(id, { limit })
        if (!result) return
        const raw = Array.isArray(result) ? result : []
        const msgs: Message[] = []
        batch(() => {
          for (const item of raw as any[]) {
            if (!item?.info?.id) continue
            msgs.push(item.info as Message)
            if (item.parts && Array.isArray(item.parts)) {
              setStore("parts", item.info.id, reconcile(item.parts as Part[], { key: "id" }))
            }
          }
          setStore("messages", reconcile(msgs, { key: "id" }))
        })
      } catch {}
    })
  }

  const loadRequests = async () => {
    const id = sid()
    if (!id || !workspace.agentAvailable()) return
    return runInflight("requests", async () => {
      try {
        const ids = tree()
        const [perms, questions] = await Promise.all([
          device.client.permission.list(),
          device.client.question.list(),
        ])
        const perm = Array.isArray(perms) ? perms : []
        const question = Array.isArray(questions) ? questions : []
        batch(() => {
          setStore("permissions", reconcile(treeItems(perm, ids)))
          setStore("questions", reconcile(treeItems(question, ids)))
        })
      } catch {}
    })
  }

  const syncSession = async () => {
    const id = sid()
    if (!id || !workspace.agentAvailable()) return
    try {
      const result = await device.client.conversation.get(id)
      if (result) setStore("session", result as Session)
      await Promise.all([loadMessages(MESSAGE_PAGE_SIZE), loadRequests()])
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
    if (!treeEvent({ root: sid(), eventSID, type: payload.type, tree: tree() })) return


    batch(() => {
      switch (payload.type) {
        case "message.updated": {
          const info = (payload.properties as { info?: Message })?.info
          if (!info?.id) break
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
          const existing = store.parts[messageID]
          if (!existing) {
            setStore("parts", messageID, [part])
            break
          }
          setStore("parts", messageID, produce((draft: Part[]) => {
            const idx = draft.findIndex((p) => p.id === part.id)
            if (idx !== -1) draft[idx] = part
            else draft.push(part)
          }))
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
            const field = props.field as keyof typeof draft
            const existing = draft[field] as string | undefined
            ;(draft[field] as string) = (existing ?? "") + props.delta
          }))
          break
        }
        case "session.status": {
          const status = (payload.properties as { status?: SessionStatus })?.status ?? payload.properties as SessionStatus
          setStore("status", status as SessionStatus)
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
        case "permission.asked": {
          const perm = payload.properties as PermissionRequest
          if (perm?.id) {
            const sid = perm.sessionID
            setStore("permissions", produce((draft: Record<string, PermissionRequest[]>) => {
              const list = draft[sid] ?? []
              if (!list.some((p) => p.id === perm.id)) {
                draft[sid] = [...list, perm]
              }
            }))
            if (permissionStore.autoAccept) {
              device.client.permission.respond(perm.id, {
                decision: "once",
              }).catch(() => {})
            }
          }
          break
        }
        case "permission.replied": {
          const props = payload.properties as { sessionID?: string; requestID?: string }
          const sid = props?.sessionID
          const rid = props?.requestID
          if (sid && rid) {
            setStore("permissions", produce((draft: Record<string, PermissionRequest[]>) => {
              const list = draft[sid]
              if (list) {
                draft[sid] = list.filter((p) => p.id !== rid)
              }
            }))
          }
          break
        }
        case "question.asked": {
          const q = payload.properties as QuestionRequest
          if (q?.id) {
            const sid = q.sessionID
            setStore("questions", produce((draft: Record<string, QuestionRequest[]>) => {
              const list = draft[sid] ?? []
              if (!list.some((r) => r.id === q.id)) {
                draft[sid] = [...list, q]
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
            setStore("questions", produce((draft: Record<string, QuestionRequest[]>) => {
              const list = draft[sid]
              if (list) {
                draft[sid] = list.filter((r) => r.id !== rid)
              }
            }))
          }
          break
        }
      }
    })
  })
  onCleanup(() => unsubscribe())

  const permissionRespond = (input: { permissionID: string; response: "once" | "always" | "reject" }) => {
    if (!workspace.agentAvailable()) return
    device.client.permission.respond(input.permissionID, {
      decision: input.response,
    }).catch(() => {})
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
        return permissionStore.autoAccept
      },
      toggleAutoAccept() {
        setPermissionStore("autoAccept", (v) => !v)
      },
      enableAutoAccept() {
        setPermissionStore("autoAccept", true)
      },
      disableAutoAccept() {
        setPermissionStore("autoAccept", false)
      },
      enabled() {
        return workspace.agentAvailable()
      },
    },
  }

  return <DeviceSessionContext.Provider value={value}>{props.children}</DeviceSessionContext.Provider>
}
