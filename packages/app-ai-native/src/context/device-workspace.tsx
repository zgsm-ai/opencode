import { createContext, useContext, type ParentProps } from "solid-js"
import { batch, createEffect, createMemo, onCleanup } from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import { useDeviceSDK } from "./device-sdk"
import type { Session, Command, Agent, VcsInfo } from "@opencode-ai/sdk/v2/client"
import type { ProviderCapabilitiesResponse } from "./global-sync/types"

type WorkspaceData = {
  status: "loading" | "ready" | "unavailable"
  agent: Agent[]
  command: Command[]
  session: Session[]
  sessionTotal: number
  vcs: VcsInfo | undefined
  provider: ProviderCapabilitiesResponse
  agentAvailable: boolean
}

type EventPayload = { type: string; sessionID?: string; messageID?: string; properties?: any; [key: string]: unknown }

type DeviceWorkspaceValue = {
  data: WorkspaceData
  ready: () => boolean
  agentAvailable: () => boolean
  project: {
    worktree: string
    name: string | undefined
    time: { created: number; updated: number }
  }
  session: {
    get: (id: string) => Session | undefined
    fetch(count?: number): Promise<void>
    archive(id: string): Promise<void>
  }
  command: {
    load(): Promise<Command[]>
  }
  vcs: {
    load(): Promise<VcsInfo | undefined>
  }
  subscribe(fn: (payload: EventPayload) => void): () => void
  directory: string
}

const DeviceWorkspaceContext = createContext<DeviceWorkspaceValue>()

export function useDeviceWorkspace() {
  const ctx = useContext(DeviceWorkspaceContext)
  if (!ctx) throw new Error("useDeviceWorkspace must be used within DeviceWorkspaceProvider")
  return ctx
}

export { DeviceWorkspaceContext }

export function DeviceWorkspaceProvider(props: ParentProps) {
  const device = useDeviceSDK()

  const [store, setStore] = createStore<WorkspaceData>({
    status: "loading",
    agent: [],
    command: [],
    session: [],
    sessionTotal: 0,
    vcs: undefined,
    provider: { connected: [] } as ProviderCapabilitiesResponse,
    agentAvailable: true,
  })

  const checkAgentAvailable = async () => {
    try {
      const res = await device.client.agent.health() as any
      const agents = res?.agents ?? res
      if (Array.isArray(agents) && agents.length > 0) {
        const anyAvailable = agents.some((a: any) => a.available)
        setStore("agentAvailable", anyAvailable)
        return anyAvailable
      }
      setStore("agentAvailable", true)
      return true
    } catch {
      setStore("agentAvailable", false)
      return false
    }
  }

  const bootstrap = async () => {
    setStore("status", "loading")
    try {
      const agentAvailable = await checkAgentAvailable()
      if (!agentAvailable) {
        setStore("status", "unavailable")
        return
      }

      const [agentsRes, commandsRes, sessionsRes, vcsRes, providersRes] = await Promise.all([
        device.client.agent.sessionModes().catch(() => undefined),
        device.client.agent.commands().catch(() => undefined),
        device.client.conversation.list({ roots: "true", limit: 50, directory: device.directory }).catch(() => undefined),
        device.client.runtime.vcs().catch(() => undefined),
        device.client.agent.models().catch(() => undefined),
      ])

      batch(() => {
        setStore("agent", reconcile((agentsRes as Agent[]) ?? [], { key: "name" }))
        setStore("command", reconcile((commandsRes as Command[]) ?? [], { key: "name" }))
        const sessions = (sessionsRes as Session[]) ?? []
        setStore("session", reconcile(sessions.filter((s) => !!s?.id).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)), { key: "id" }))
        setStore("sessionTotal", sessions.length)
        setStore("vcs", vcsRes as VcsInfo | undefined)
        const providerData = (providersRes as ProviderCapabilitiesResponse) ?? { connected: [] }
        setStore("provider", reconcile(providerData, { key: "id" }))
        setStore("status", "ready")
      })
    } catch {
      setStore("status", "unavailable")
    }
  }

  void bootstrap()

  let retryTimer: ReturnType<typeof setTimeout> | undefined
  const RETRY_INTERVAL = 5000

  const scheduleRetry = () => {
    if (retryTimer) return
    retryTimer = setTimeout(async () => {
      retryTimer = undefined
      if (store.agentAvailable) return
      const available = await checkAgentAvailable()
      if (available) {
        await bootstrap()
      } else {
        scheduleRetry()
      }
    }, RETRY_INTERVAL)
  }

  createEffect(() => {
    if (!store.agentAvailable) scheduleRetry()
  })

  onCleanup(() => {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = undefined
    }
  })

  const getSession = (id: string) => store.session.find((s) => s.id === id)

  const fetchSessions = async (count = 10) => {
    if (!store.agentAvailable) return
    try {
      const result = await device.client.conversation.list({ roots: "true", limit: 50, directory: device.directory })
      const sessions = (result as Session[]) ?? []
      batch(() => {
        setStore("session", reconcile(sessions.filter((s) => !!s?.id).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)), { key: "id" }))
        setStore("sessionTotal", sessions.length)
      })
    } catch {}
  }

  const archiveSession = async (id: string) => {
    if (!store.agentAvailable) return
    try {
      await device.client.conversation.update(id, { time: { archived: Date.now() } })
      setStore("session", produce((draft) => {
        const idx = draft.findIndex((s) => s.id === id)
        if (idx !== -1) draft.splice(idx, 1)
      }))
    } catch {}
  }

  const loadCommands = async (): Promise<Command[]> => {
    if (!store.agentAvailable) return []
    if (store.command.length > 0) return store.command
    try {
      const result = await device.client.agent.commands()
      const list = (result as Command[]) ?? []
      setStore("command", reconcile(list, { key: "name" }))
      return list
    } catch {
      return []
    }
  }

  const loadVcs = async (): Promise<VcsInfo | undefined> => {
    if (store.vcs !== undefined) return store.vcs
    try {
      const result = await device.client.runtime.vcs()
      setStore("vcs", result as VcsInfo | undefined)
      return result as VcsInfo | undefined
    } catch {
      return undefined
    }
  }

  const listeners = new Set<(payload: EventPayload) => void>()

  const subscribe = (fn: (payload: EventPayload) => void) => {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }

  const dispatch = (payload: EventPayload) => {
    for (const fn of listeners) {
      try { fn(payload) } catch {}
    }
  }

  let streamAbort: AbortController | undefined

  const startEventStream = async () => {
    streamAbort?.abort()
    streamAbort = new AbortController()
    const signal = streamAbort.signal
    try {
      const { stream } = await device.client.event.stream({ signal })
      const readLoop = async () => {
        try {
          for await (const event of stream as any) {
            if (signal.aborted) break
            if (!event) continue
            const payload = (event.payload ?? event) as EventPayload
            if (!payload?.type) continue

            batch(() => {
              switch (payload.type) {
                case "session.created":
                case "session.updated": {
                  const info = (payload.properties as { info?: Session })?.info ?? payload.properties as Session
                  if (!info?.id) break
                  setStore("session", produce((draft) => {
                    const idx = draft.findIndex((s) => s.id === info.id)
                    if (idx !== -1) draft[idx] = info
                    else {
                      draft.push(info)
                      draft.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
                    }
                  }))
                  break
                }
                case "session.deleted": {
                  const props = payload.properties as { sessionID?: string; info?: Session }
                  const id = props?.sessionID ?? props?.info?.id ?? payload.sessionID
                  if (!id) break
                  setStore("session", produce((draft) => {
                    const idx = draft.findIndex((s) => s.id === id)
                    if (idx !== -1) draft.splice(idx, 1)
                  }))
                  break
                }
              }
              dispatch(payload)
            })
          }
        } catch (e) {
          if ((e as any)?.name === "AbortError") return
        }
      }
      void readLoop()
    } catch (e) {
      if ((e as any)?.name === "AbortError") return
    }
  }

  void startEventStream()

  onCleanup(() => {
    streamAbort?.abort()
    streamAbort = undefined
  })

  const projectValue = createMemo(() => ({
    id: device.directory,
    worktree: device.directory,
    name: undefined as string | undefined,
    time: { created: Date.now(), updated: Date.now() },
  }))

  const value: DeviceWorkspaceValue = {
    get data() { return store },
    ready: () => store.status !== "loading",
    agentAvailable: () => store.agentAvailable,
    get project() { return projectValue() },
    session: {
      get: getSession,
      fetch: fetchSessions,
      archive: archiveSession,
    },
    command: { load: loadCommands },
    vcs: { load: loadVcs },
    subscribe,
    directory: device.directory,
  }

  return <DeviceWorkspaceContext.Provider value={value}>{props.children}</DeviceWorkspaceContext.Provider>
}
