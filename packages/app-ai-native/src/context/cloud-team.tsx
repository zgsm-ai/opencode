import { createSimpleContext } from "@opencode-ai/ui/context"
import { batch, createMemo, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { useServer } from "@/context/server"
import { cloudTeamApi } from "@/client/cloud-team-api"
import { createCloudTeamWS } from "@/client/cloud-team-ws"
import type {
  TeammateRegistration,
  Task,
  ApprovalRequest,
  CloudMessage,
  ProgressUpdate,
  ApprovalStatus,
} from "@/client/cloud-team-types"
import { applyCloudEvent } from "./cloud-team/event-reducer"

type CloudTeamStore = {
  active: boolean
  session?: {
    id: string
    title: string
    status: "active" | "paused" | "completed" | "failed"
    repoUrl?: string
    leaderId?: string
  }
  teammates: TeammateRegistration[]
  tasks: Task[]
  messages: CloudMessage[]
  approvals: ApprovalRequest[]
  progress: Record<string, ProgressUpdate>
  wsConnected: boolean
  lastEventId?: string
}

const CLOUD_TEAM_AGENT_NAME = "CloudTeam"

export const { use: useCloudTeam, provider: CloudTeamProvider } = createSimpleContext({
  name: "CloudTeam",
  init() {
    const server = useServer()

    const [store, setStore] = createStore<CloudTeamStore>({
      active: false,
      teammates: [],
      tasks: [],
      messages: [],
      approvals: [],
      progress: {},
      wsConnected: false,
    })

    // ── Reactive computations ──────────────────────────────

    const isAvailable = createMemo(() => !server.isLocal())

    const activeTasks = createMemo(() => store.tasks.filter((t) => t.status === "running"))

    const pendingApprovals = createMemo(() => store.approvals.filter((a) => a.status === "pending"))

    const completedPercentage = createMemo(() => {
      if (store.tasks.length === 0) return 0
      return Math.round((store.tasks.filter((t) => t.status === "completed").length / store.tasks.length) * 100)
    })

    const teammateById = createMemo(() => {
      const map = new Map<string, TeammateRegistration>()
      for (const t of store.teammates) map.set(t.teammateId, t)
      return map
    })

    // ── WebSocket management ───────────────────────────────

    let wsClient: ReturnType<typeof createCloudTeamWS> | undefined
    let heartbeatInterval: ReturnType<typeof setInterval> | undefined

    function connectWS(sessionId: string) {
      disconnectWS()
      const token = "" // Auth token comes from cookie-based auth; this is a placeholder
      const machineId = getMachineId()
      wsClient = createCloudTeamWS({
        sessionId,
        token,
        machineId,
        onEvent: (event) => {
          applyCloudEvent(store, (fn) => {
            batch(() => fn(store))
          }, event)
        },
        onConnect: () => {
          setStore("wsConnected", true)
        },
        onDisconnect: () => {
          setStore("wsConnected", false)
        },
      })
      wsClient.connect()

      // Leader heartbeat (only if this client is the leader)
      heartbeatInterval = setInterval(() => {
        if (store.session?.leaderId === getMachineId()) {
          cloudTeamApi.leader.heartbeat(sessionId).catch(() => {})
        }
      }, 10_000)
    }

    function disconnectWS() {
      if (heartbeatInterval !== undefined) {
        clearInterval(heartbeatInterval)
        heartbeatInterval = undefined
      }
      if (wsClient) {
        wsClient.disconnect()
        wsClient = undefined
      }
      setStore("wsConnected", false)
    }

    // ── Machine ID ─────────────────────────────────────────

    const MACHINE_ID_KEY = "cloud-team-machine-id"

    function getMachineId(): string {
      let id = localStorage.getItem(MACHINE_ID_KEY)
      if (!id) {
        id = `machine-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        localStorage.setItem(MACHINE_ID_KEY, id)
      }
      return id
    }

    // ── Session lifecycle ──────────────────────────────────

    async function createSession(title: string, repoUrl?: string) {
      const result = await cloudTeamApi.session.create({ name: title, repoUrl })
      batch(() => {
        setStore("session", {
          id: result.sessionId,
          title: result.name,
          status: result.status,
          repoUrl,
          leaderId: result.leaderId,
        })
        setStore("teammates", result.teammates ?? [])
      })
      connectWS(result.sessionId)
      return result
    }

    async function joinSession(sessionId: string) {
      const machineId = getMachineId()
      await cloudTeamApi.member.join(sessionId, {
        machineId,
        machineName: navigator.userAgent.split(" ").pop() ?? "Web Client",
      })
      const result = await cloudTeamApi.session.get(sessionId)
      batch(() => {
        setStore("session", {
          id: result.sessionId,
          title: result.name,
          status: result.status,
          repoUrl: undefined,
          leaderId: result.leaderId,
        })
        setStore("teammates", result.teammates ?? [])
      })
      // Fetch existing tasks and approvals
      const [tasks, approvals] = await Promise.all([
        cloudTeamApi.task.list(sessionId),
        cloudTeamApi.approval.list(sessionId),
      ])
      batch(() => {
        setStore("tasks", tasks)
        setStore("approvals", approvals)
      })
      connectWS(sessionId)
    }

    async function leaveSession() {
      if (store.session?.id) {
        try {
          await cloudTeamApi.member.leave(store.session.id, getMachineId())
        } catch {
          // Best effort leave
        }
      }
      disconnectWS()
      batch(() => {
        setStore("session", undefined)
        setStore("teammates", [])
        setStore("tasks", [])
        setStore("messages", [])
        setStore("approvals", [])
        setStore("progress", {})
      })
    }

    // ── Mode activation ────────────────────────────────────

    function activate() {
      setStore("active", true)
    }

    function deactivate() {
      setStore("active", false)
      if (store.session) {
        void leaveSession()
      }
    }

    // ── Prompt submission ──────────────────────────────────

    async function submitPrompt(text: string, context?: unknown) {
      let sessionId = store.session?.id
      if (!sessionId) {
        const session = await createSession(text.slice(0, 100))
        sessionId = session.sessionId
      }
      return cloudTeamApi.prompt.submit(sessionId, { prompt: text, context })
    }

    // ── Approval operations ────────────────────────────────

    async function respondApproval(approvalId: string, status: ApprovalStatus, feedback?: string) {
      if (!store.session?.id) return
      await cloudTeamApi.approval.respond(store.session.id, approvalId, { status, feedback })
    }

    // ── Message operations ─────────────────────────────────

    async function sendMessage(content: string, type: string = "task_message") {
      if (!store.session?.id) return
      // Send via REST; the event will come back through WebSocket
      const message: CloudMessage = {
        messageId: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        sessionId: store.session.id,
        from: getMachineId(),
        to: "broadcast",
        type: type as CloudMessage["type"],
        payload: { content },
        timestamp: Date.now(),
      }
      if (wsClient) {
        wsClient.send(message)
      }
    }

    // ── Cleanup ────────────────────────────────────────────

    onCleanup(() => {
      disconnectWS()
    })

    return {
      // State accessors
      isAvailable,
      active: () => store.active,
      session: () => store.session,
      teammates: () => store.teammates,
      tasks: () => store.tasks,
      messages: () => store.messages,
      approvals: () => store.approvals,
      progress: () => store.progress,
      wsConnected: () => store.wsConnected,
      completedPercentage,
      activeTasks,
      pendingApprovals,
      teammateById,

      // Agent name constant
      agentName: CLOUD_TEAM_AGENT_NAME,

      // Actions
      activate,
      deactivate,
      createSession,
      joinSession,
      leaveSession,
      submitPrompt,
      respondApproval,
      sendMessage,
    }
  },
})
