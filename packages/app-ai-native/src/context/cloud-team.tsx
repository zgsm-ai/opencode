import { createSimpleContext } from "@opencode-ai/ui/context"
import { batch, createEffect, createMemo, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { useServer } from "@/context/server"
import { cloudTeamApi } from "@/client/cloud-team-api"
import { createCloudTeamWS } from "@/client/cloud-team-ws"
import type {
  TeammateRegistration,
  Task,
  SubTask,
  ApprovalRequest,
  CloudEvent,
  ProgressUpdate,
  SessionProgress,
} from "@/client/cloud-team-types"
import { applyCloudEvent } from "./cloud-team/event-reducer"

type CloudTeamStore = {
  active: boolean
  decomposing: boolean
  pendingPlan?: Task[]   // Tasks returned by decompose, held for Leader review before submitting
  session?: {
    id: string
    title: string
    status: "active" | "paused" | "completed" | "failed"
    repoUrl?: string
    leaderId?: string
  }
  teammates: TeammateRegistration[]
  tasks: Task[]
  messages: CloudEvent[]
  approvals: ApprovalRequest[]
  progress: Record<string, ProgressUpdate>
  sessionProgress?: SessionProgress
  wsConnected: boolean
  lastEventId?: string
  leader?: {
    elected: boolean
    fencingToken: number
    leaderId: string
    score?: import("@/client/cloud-team-types").LeaderScore
  }
  leaderScore?: import("@/client/cloud-team-types").LeaderScore
  runtimeMode: "auto" | "manual"
}

const CLOUD_TEAM_AGENT_NAME = "CloudTeam"
const CLOUD_TEAM_RUNTIME_MODE_KEY = "cloud-team-runtime-mode.v1"
const MACHINE_ID_KEY = "cloud-team-machine-id"

function loadRuntimeMode(): "auto" | "manual" {
  if (typeof window === "undefined") return "auto"
  const raw = window.localStorage.getItem(CLOUD_TEAM_RUNTIME_MODE_KEY)
  return raw === "manual" ? "manual" : "auto"
}

export const { use: useCloudTeam, provider: CloudTeamProvider, context: CloudTeamContext } = createSimpleContext({
  name: "CloudTeam",
  gate: false,
  init() {
    const server = useServer()

    const [store, setStore] = createStore<CloudTeamStore>({
      active: false,
      decomposing: false,
      teammates: [],
      tasks: [],
      messages: [],
      approvals: [],
      progress: {},
      sessionProgress: undefined,
      wsConnected: false,
      runtimeMode: loadRuntimeMode(),
    })

    createEffect(() => {
      if (typeof window === "undefined") return
      window.localStorage.setItem(CLOUD_TEAM_RUNTIME_MODE_KEY, store.runtimeMode)
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
      for (const t of store.teammates) map.set(t.id, t)
      return map
    })
    const isCurrentLeader = createMemo(() => {
      const mid = getMachineId()
      if (store.leader?.elected && store.leader.leaderId === mid) return true
      return store.session?.leaderId === mid
    })

    // ── WebSocket management ───────────────────────────────

    let wsClient: ReturnType<typeof createCloudTeamWS> | undefined
    let heartbeatInterval: ReturnType<typeof setInterval> | undefined
    let progressPollInterval: ReturnType<typeof setInterval> | undefined

    const sameSessionProgress = (
      a: SessionProgress | undefined,
      b: SessionProgress | undefined,
    ): boolean => {
      if (!a && !b) return true
      if (!a || !b) return false
      if (
        a.totalTasks !== b.totalTasks
        || a.completedTasks !== b.completedTasks
        || a.failedTasks !== b.failedTasks
        || a.runningTasks !== b.runningTasks
        || a.pendingTasks !== b.pendingTasks
      ) {
        return false
      }
      const at = Array.isArray(a.teammates) ? a.teammates : []
      const bt = Array.isArray(b.teammates) ? b.teammates : []
      if (at.length !== bt.length) return false
      for (let i = 0; i < at.length; i += 1) {
        const x = at[i]
        const y = bt[i]
        if (
          x.memberId !== y.memberId
          || x.machineName !== y.machineName
          || x.currentTaskId !== y.currentTaskId
          || x.completed !== y.completed
          || x.failed !== y.failed
          || x.running !== y.running
        ) {
          return false
        }
      }
      return true
    }

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
          // Ensure this machine is registered as a session member once WS is ready.
          // This is required for scheduler online-member filtering.
          wsClient?.send({
            type: "session.join",
            payload: {
              machineName: navigator.userAgent.split(" ").pop() ?? "Web Client",
            },
          })
        },
        onDisconnect: () => {
          setStore("wsConnected", false)
        },
      })
      wsClient.connect()

      // Leader heartbeat (only if this client is the leader)
      heartbeatInterval = setInterval(() => {
        if (store.session?.leaderId === getMachineId()) {
          cloudTeamApi.leader.heartbeat(sessionId, getMachineId()).catch(() => {})
        }
      }, 10_000)

      // Poll session progress every 5 seconds
      progressPollInterval = setInterval(() => {
        cloudTeamApi.progress.get(sessionId).then((p) => {
          if (!sameSessionProgress(store.sessionProgress, p)) {
            setStore("sessionProgress", p)
          }
        }).catch(() => {})
      }, 5_000)

      // Initial fetch
      cloudTeamApi.progress.get(sessionId).then((p) => {
        if (!sameSessionProgress(store.sessionProgress, p)) {
          setStore("sessionProgress", p)
        }
      }).catch(() => {})
    }

    function disconnectWS() {
      if (heartbeatInterval !== undefined) {
        clearInterval(heartbeatInterval)
        heartbeatInterval = undefined
      }
      if (progressPollInterval !== undefined) {
        clearInterval(progressPollInterval)
        progressPollInterval = undefined
      }
      if (wsClient) {
        wsClient.disconnect()
        wsClient = undefined
      }
      setStore("wsConnected", false)
    }

    // ── Machine ID ─────────────────────────────────────────

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
      const machineId = getMachineId()
      batch(() => {
        setStore("session", {
          id: result.id,
          title: result.name,
          status: result.status,
          repoUrl,
          leaderId: result.leaderMachineId,
        })
        setStore("teammates", result.teammates ?? [])
      })
      connectWS(result.id)
      // Attempt leader election as the session creator
      try {
        const electResult = await cloudTeamApi.leader.elect(result.id, {
          machineId,
          // Best-effort capability estimation from browser APIs
          cpuIdlePercent: navigator.hardwareConcurrency ? 50 : undefined,
          memoryFreeMB: (navigator as any).deviceMemory ? (navigator as any).deviceMemory * 1024 : undefined,
        })
        if (electResult.elected) {
          batch(() => {
            setStore("session", "leaderId", machineId)
            setStore("leader", electResult)
            if (electResult.score) {
              setStore("leaderScore", electResult.score)
            }
          })
        }
      } catch {
        // Election best effort — another client may have won
      }
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
          id: result.id,
          title: result.name,
          status: result.status,
          repoUrl: undefined,
          leaderId: result.leaderMachineId,
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
        // Find our member record ID to pass to the leave endpoint
        const myMember = store.teammates.find((t) => t.machineId === getMachineId())
        if (myMember) {
          try {
            await cloudTeamApi.member.leave(myMember.id)
          } catch {
            // Best effort leave
          }
        }
      }
      disconnectWS()
      batch(() => {
        setStore("session", undefined)
        setStore("teammates", [])
        setStore("tasks", [])
        setStore("pendingPlan", undefined)
        setStore("messages", [])
        setStore("approvals", [])
        setStore("progress", {})
        setStore("sessionProgress", undefined)
      })
    }

    // ── Mode activation ────────────────────────────────────

    function activate() {
      setStore("active", true)
    }

    function deactivate() {
      setStore("active", false)
      setStore("pendingPlan", undefined)
      if (store.session) {
        void leaveSession()
      }
    }

    // ── Prompt submission ──────────────────────────────────

    async function submitPrompt(text: string, context?: unknown) {
      setStore("decomposing", true)
      let sessionId = store.session?.id
      try {
        if (!sessionId) {
          const session = await createSession(text.slice(0, 100))
          sessionId = session.id
        }
        const result = await cloudTeamApi.prompt.decompose(sessionId, { prompt: text, context })
        batch(() => {
          // Store as pendingPlan for Leader review — do NOT write to tasks yet
          setStore("pendingPlan", result.tasks)
          setStore("decomposing", false)
        })
        return result
      } catch (err) {
        setStore("decomposing", false)
        throw err
      }
    }

    // ── Plan confirmation ──────────────────────────────────

    async function confirmPlan(editedTasks: SubTask[]) {
      const sessionId = store.session?.id
      if (!sessionId) return
      const tasks = await cloudTeamApi.task.submitPlan(sessionId, {
        tasks: editedTasks,
        fencingToken: store.leader?.fencingToken,
      })
      batch(() => {
        setStore("tasks", tasks)
        setStore("pendingPlan", undefined)
      })
    }

    function discardPlan() {
      setStore("pendingPlan", undefined)
    }

    // ── Approval operations ────────────────────────────────

    async function respondApproval(approvalId: string, status: "approved" | "rejected", feedback?: string) {
      if (!store.session?.id) return
      await cloudTeamApi.approval.respond(approvalId, { status, feedback })
    }

    // ── Message operations ─────────────────────────────────

    async function sendMessage(content: string, type: string = "task_message") {
      if (!store.session?.id) return
      if (wsClient) {
        wsClient.send({
          type: "message.send",
          payload: {
            from: getMachineId(),
            to: "broadcast",
            messageType: type,
            content,
          },
        })
      }
    }

    // ── Repo registration ─────────────────────────────────

    async function registerRepo(body: {
      repoRemoteUrl: string
      repoLocalPath: string
      currentBranch: string
      hasUncommittedChanges: boolean
    }) {
      if (!store.session?.id) return
      return cloudTeamApi.registry.registerRepo(store.session.id, body)
    }

    async function listRepos(remoteUrl?: string) {
      if (!store.session?.id) return []
      return cloudTeamApi.registry.listRepos(store.session.id, remoteUrl)
    }

    // ── Runtime policy ─────────────────────────────────────

    function setRuntimeMode(mode: "auto" | "manual") {
      setStore("runtimeMode", mode)
    }

    // ── Task control ───────────────────────────────────────

    async function terminateTask(taskId: string, reason?: string) {
      if (!store.session?.id) return
      const updated = await cloudTeamApi.task.terminate(store.session.id, taskId, {
        reason,
        fencingToken: store.leader?.fencingToken,
      })
      batch(() => {
        setStore("tasks", (tasks) => tasks.map((t) => (t.id === updated.id ? updated : t)))
      })
      return updated
    }

    // ── Cleanup ────────────────────────────────────────────

    onCleanup(() => {
      disconnectWS()
    })

    return {
      // State accessors
      isAvailable,
      active: () => store.active,
      decomposing: () => store.decomposing,
      pendingPlan: () => store.pendingPlan,
      session: () => store.session,
      teammates: () => store.teammates,
      tasks: () => store.tasks,
      messages: () => store.messages,
      approvals: () => store.approvals,
      progress: () => store.progress,
      sessionProgress: () => store.sessionProgress,
      wsConnected: () => store.wsConnected,
      completedPercentage,
      activeTasks,
      pendingApprovals,
      teammateById,
      leader: () => store.leader,
      leaderScore: () => store.leaderScore,
      isCurrentLeader,
      runtimeMode: () => store.runtimeMode,
      autoApprovePermissions: () => store.runtimeMode === "auto",
      autoAnswerFirstOption: () => store.runtimeMode === "auto",

      // Agent name constant
      agentName: CLOUD_TEAM_AGENT_NAME,

      // Actions
      activate,
      deactivate,
      createSession,
      joinSession,
      leaveSession,
      submitPrompt,
      confirmPlan,
      discardPlan,
      respondApproval,
      sendMessage,
      registerRepo,
      listRepos,
      setRuntimeMode,
      terminateTask,
    }
  },
})
