import { createSimpleContext } from "@opencode-ai/ui/context"
import { batch, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useServer } from "@/context/server"
import { cloudTeamApi } from "@/client/cloud-team-api"
import { createCloudTeamWS } from "@/client/cloud-team-ws"
import { getProxyUrl } from "@/pages/workspace/lib/url"
import { env } from "@/lib/env"
import type {
  TeammateRegistration,
  Task,
  SubTask,
  ApprovalRequest,
  CloudEvent,
  ProgressUpdate,
  SessionProgress,
  OrchestratePhase,
} from "@/client/cloud-team-types"
import type { Device } from "@/pages/workspace/types"
import { applyCloudEvent } from "./cloud-team/event-reducer"

type CloudTeamStore = {
  active: boolean
  mode: "local" | "cloud"
  decomposing: boolean
  pendingPlan?: Task[]   // Tasks returned by decompose, held for Leader review before submitting
  session?: {
    id: string
    title: string
    status: "active" | "paused" | "completed" | "failed"
    repoUrl?: string
    leaderId?: string
  }
  sessions: { id: string; title: string; status: string; updatedAt: string }[]
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
  orchestrating: boolean
  orchestratePhase?: OrchestratePhase
  selectedModel?: {
    providerID: string
    modelID: string
    name: string
  }
}

const CLOUD_TEAM_AGENT_NAME = "CloudTeam"
const CLOUD_TEAM_RUNTIME_MODE_KEY = "cloud-team-runtime-mode.v1"
const CLOUD_TEAM_MODE_KEY = "cloud-team-mode.v1"
const MACHINE_ID_KEY = "cloud-team-machine-id"

function loadRuntimeMode(): "auto" | "manual" {
  if (typeof window === "undefined") return "auto"
  const raw = window.localStorage.getItem(CLOUD_TEAM_RUNTIME_MODE_KEY)
  return raw === "manual" ? "manual" : "auto"
}

function loadMode(): "local" | "cloud" {
  if (typeof window === "undefined") return "local"
  const raw = window.localStorage.getItem(CLOUD_TEAM_MODE_KEY)
  return raw === "cloud" ? "cloud" : "local"
}

export const { use: useCloudTeam, provider: CloudTeamProvider, context: CloudTeamContext } = createSimpleContext({
  name: "CloudTeam",
  gate: false,
  init() {
    const server = useServer()

    const initialMode = loadMode()
    const [store, setStore] = createStore<CloudTeamStore>({
      active: initialMode === "cloud",
      mode: initialMode,
      decomposing: false,
      teammates: [],
      tasks: [],
      messages: [],
      approvals: [],
      progress: {},
      sessionProgress: undefined,
      wsConnected: false,
      runtimeMode: loadRuntimeMode(),
      orchestrating: false,
      sessions: [],
    })

    createEffect(() => {
      if (typeof window === "undefined") return
      window.localStorage.setItem(CLOUD_TEAM_RUNTIME_MODE_KEY, store.runtimeMode)
    })
    createEffect(() => {
      if (typeof window === "undefined") return
      window.localStorage.setItem(CLOUD_TEAM_MODE_KEY, store.mode)
    })

    // ── Auto-restore last active session on mount ──────────
    onMount(async () => {
      void loadModels()
      if (server.isLocal()) return
      try {
        const sessions = await cloudTeamApi.session.list()
        setStore("sessions", sessions.map((s) => ({ id: s.id, title: s.name, status: s.status, updatedAt: s.updatedAt })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
        // Find the most recent active session
        const active = sessions
          .filter((s) => s.status === "active")
          .sort((a, b) => (b.updatedAt ?? b.createdAt ?? "").localeCompare(a.updatedAt ?? a.createdAt ?? ""))[0]
        if (active) {
          await joinSession(active.id)
        }
      } catch {
        // Silently fail — user can create a new session
      }
    })

    // ── Reactive computations ──────────────────────────────

    const isAvailable = createMemo(() => !server.isLocal())

    // ── Model management ────────────────────────────────────

    type ModelOption = { providerID: string; modelID: string; name: string; providerName: string }
    const [modelList, setModelList] = createSignal<ModelOption[]>([])
    const [deviceList, setDeviceList] = createSignal<Device[]>([])

    const API_BASE = env.API_URL || env.API_PREFIX || ""

    // Fetch models via a device proxy (same path workspace uses)
    const loadModels = async () => {
      try {
        // 1. List available devices
        const deviceRes = await fetch(`${API_BASE}/api/devices`, { credentials: "include" })
        if (!deviceRes.ok) {
          console.warn("[cloud-team] loadModels: failed to list devices", deviceRes.status)
          return
        }
        const deviceData = await deviceRes.json()
        const devices = (deviceData?.devices ?? []) as Device[]
        setDeviceList(devices)
        if (devices.length === 0) {
          console.warn("[cloud-team] loadModels: no devices available")
          return
        }

        // 2. Try online devices first, then fall back to all devices
        const candidates = [
          ...devices.filter((d) => d.status === "online"),
          ...devices.filter((d) => d.status !== "online"),
        ]

        let lastErr: unknown
        for (const device of candidates) {
          try {
            const proxyUrl = getProxyUrl(device.deviceId)
            const res = await fetch(`${proxyUrl}/api/v1/agents/models`, { credentials: "include" })
            if (!res.ok) {
              console.warn("[cloud-team] loadModels: models fetch failed for device", device.deviceId, res.status)
              lastErr = res.status
              continue
            }
            const data = await res.json()
            const providers: { id: string; name: string; models: Record<string, { name: string; status: string }> }[] = data?.connected ?? []
            const result: ModelOption[] = []
            for (const p of providers) {
              for (const [id, m] of Object.entries(p.models)) {
                if (m.status === "deprecated") continue
                result.push({ providerID: p.id, modelID: id, name: m.name || id, providerName: p.name })
              }
            }
            console.log("[cloud-team] loadModels:", result.length, "models via device", device.deviceId)
            setModelList(result)
            if (!store.selectedModel && result.length > 0) {
              setStore("selectedModel", { providerID: result[0].providerID, modelID: result[0].modelID, name: result[0].name })
            }
            return
          } catch (err) {
            console.warn("[cloud-team] loadModels: error fetching from device", device.deviceId, err)
            lastErr = err
          }
        }
        console.warn("[cloud-team] loadModels: all devices failed", lastErr)
      } catch (err) {
        console.warn("[cloud-team] loadModels error:", err)
      }
    }

    const setSelectedModel = (key?: { providerID: string; modelID: string }) => {
      if (!key) {
        setStore("selectedModel", undefined)
        return
      }
      const model = modelList().find((m) => m.providerID === key.providerID && m.modelID === key.modelID)
      if (model) {
        setStore("selectedModel", { providerID: model.providerID, modelID: model.modelID, name: model.name })
      }
    }

    const activeTasks = createMemo(() => store.tasks.filter((t) => t.status === "running"))

    const pendingApprovals = createMemo(() => store.approvals.filter((a) => a.status === "pending"))

    const completedPercentage = createMemo(() => {
      if (store.sessionProgress?.totalTasks && store.sessionProgress.totalTasks > 0) {
        return Math.round((store.sessionProgress.completedTasks / store.sessionProgress.totalTasks) * 100)
      }
      if (store.tasks.length === 0) return 0
      return Math.round((store.tasks.filter((t) => t.status === "completed").length / store.tasks.length) * 100)
    })

    const teammateById = createMemo(() => {
      const map = new Map<string, TeammateRegistration>()
      for (const t of store.teammates) map.set(t.id, t)
      return map
    })

    const deviceById = createMemo(() => {
      const map = new Map<string, Device>()
      for (const d of deviceList()) {
        map.set(d.deviceId, d)
        map.set(d.id, d)
      }
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
    let syncingTasksFromProgress = false
    let lastProgressTaskSyncAt = 0

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

    const summarizeLocalTasks = () => {
      const tasks = store.tasks
      let completed = 0
      let failed = 0
      let running = 0
      let pending = 0
      for (const t of tasks) {
        if (t.status === "completed") completed += 1
        else if (t.status === "failed") failed += 1
        else if (t.status === "running") running += 1
        else if (t.status === "pending" || t.status === "assigned" || t.status === "claimed") pending += 1
      }
      return {
        totalTasks: tasks.length,
        completedTasks: completed,
        failedTasks: failed,
        runningTasks: running,
        pendingTasks: pending,
      }
    }

    const shouldSyncTasksFromProgress = (p: SessionProgress): boolean => {
      const local = summarizeLocalTasks()
      return (
        local.totalTasks !== p.totalTasks
        || local.completedTasks !== p.completedTasks
        || local.failedTasks !== p.failedTasks
        || local.runningTasks !== p.runningTasks
        || local.pendingTasks !== p.pendingTasks
      )
    }

    function syncTasksFromProgress(sessionId: string, p: SessionProgress) {
      if (!shouldSyncTasksFromProgress(p)) return
      const now = Date.now()
      if (syncingTasksFromProgress) return
      if (now - lastProgressTaskSyncAt < 1200) return
      syncingTasksFromProgress = true
      lastProgressTaskSyncAt = now
      cloudTeamApi.task.list(sessionId).then((tasks) => {
        setStore("tasks", tasks)
      }).catch(() => {
        // Best effort sync
      }).finally(() => {
        syncingTasksFromProgress = false
      })
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
          // Auto re-elect on leader.expired (Feature 3)
          if (event.type === "leader.expired" && store.session?.id) {
            cloudTeamApi.leader.elect(store.session.id, { machineId: getMachineId() })
              .then((result) => {
                if (result.elected) {
                  batch(() => {
                    setStore("session", "leaderId", getMachineId())
                    setStore("leader", result)
                    if (result.score) {
                      setStore("leaderScore", result.score)
                    }
                  })
                }
              })
              .catch(() => { /* best effort */ })
          }
        },
        onConnect: () => {
          setStore("wsConnected", true)
          // Ensure this machine is registered as a session member once WS is ready.
          // This is required for scheduler online-member filtering.
          wsClient?.send({
            type: "session.join",
            payload: {
              machineName: getMachineName(),
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
          syncTasksFromProgress(sessionId, p)
        }).catch(() => {})
      }, 5_000)

      // Initial fetch
      cloudTeamApi.progress.get(sessionId).then((p) => {
        if (!sameSessionProgress(store.sessionProgress, p)) {
          setStore("sessionProgress", p)
        }
        syncTasksFromProgress(sessionId, p)
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

    function getMachineName(): string {
      const mid = getMachineId()
      const device = deviceById().get(mid)
      if (device) return device.displayName
      return navigator.platform || "Web Client"
    }

    function getMachineVersion(): string {
      const mid = getMachineId()
      const device = deviceById().get(mid)
      if (device) return `${device.platform} · ${device.version}`
      return ""
    }

    // ── Session lifecycle ──────────────────────────────────

    async function createSession(title: string, repoUrl?: string) {
      const result = await cloudTeamApi.session.create({ name: title, repoUrl })
      const machineId = getMachineId()
      const machineName = getMachineName()
      batch(() => {
        setStore("mode", "cloud")
        setStore("active", true)
        setStore("session", {
          id: result.id,
          title: result.name,
          status: result.status,
          repoUrl,
          leaderId: result.leaderMachineId,
        })
        // Include self as a teammate so the sidebar tree has a node to render under
        const existing = (result.teammates ?? [])
        const selfAlready = existing.some((t) => t.machineId === machineId)
        if (!selfAlready) {
          existing.push({
            id: `local-${machineId}`,
            sessionId: result.id,
            userId: "",
            machineId,
            machineName,
            role: "leader",
            status: "online",
            repos: [],
            connectedAt: new Date().toISOString(),
            lastHeartbeat: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        }
        setStore("teammates", existing)
      })
      setStore("sessions", (prev) => [{ id: result.id, title: result.name, status: result.status, updatedAt: result.updatedAt }, ...prev.filter((s) => s.id !== result.id)])
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
      const machineName = getMachineName()
      await cloudTeamApi.member.join(sessionId, {
        machineId,
        machineName,
      })
      const result = await cloudTeamApi.session.get(sessionId)
      // Ensure self is present in the local teammate list
      const teammates = result.teammates ?? []
      const selfAlready = teammates.some((t) => t.machineId === machineId)
      if (!selfAlready) {
        teammates.push({
          id: `local-${machineId}`,
          sessionId,
          userId: "",
          machineId,
          machineName,
          role: "member",
          status: "online",
          repos: [],
          connectedAt: new Date().toISOString(),
          lastHeartbeat: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      }
      batch(() => {
        setStore("mode", "cloud")
        setStore("active", true)
        setStore("session", {
          id: result.id,
          title: result.name,
          status: result.status,
          repoUrl: undefined,
          leaderId: result.leaderMachineId,
        })
        setStore("teammates", teammates)
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
            await cloudTeamApi.member.leave(store.session!.id, myMember.id)
          } catch {
            // Best effort leave
          }
        }
      }
      disconnectWS()
      batch(() => {
        setStore("mode", "local")
        setStore("active", false)
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

    function setMode(mode: "local" | "cloud") {
      batch(() => {
        setStore("mode", mode)
        setStore("active", mode === "cloud")
      })
    }

    function enterLocalMode() {
      setMode("local")
    }

    async function enterCloudMode(sessionId?: string) {
      if (sessionId) {
        if (store.session?.id === sessionId) {
          setMode("cloud")
          return
        }
        await joinSession(sessionId)
        return
      }
      setMode("cloud")
    }

    function activate() {
      setMode("cloud")
    }

    function deactivate() {
      setStore("pendingPlan", undefined)
      setMode("local")
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
        const result = await cloudTeamApi.prompt.decompose(sessionId, { prompt: text, context, dryRun: true, model: store.selectedModel ? { providerID: store.selectedModel.providerID, modelID: store.selectedModel.modelID } : undefined })
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

    // ── Orchestrate (Explore → Decompose → Schedule in one call) ──

    async function orchestratePrompt(text: string) {
      batch(() => {
        setStore("orchestrating", true)
        setStore("orchestratePhase", "exploring")
      })
      let sessionId = store.session?.id
      try {
        if (!sessionId) {
          const session = await createSession(text.slice(0, 100))
          sessionId = session.id
          console.log("[cloud-team] orchestrate: created session", sessionId, "teammates:", store.teammates.length)
        }
        const result = await cloudTeamApi.prompt.orchestrate(sessionId, {
          prompt: text,
          fencingToken: store.leader?.fencingToken,
          model: store.selectedModel ? { providerID: store.selectedModel.providerID, modelID: store.selectedModel.modelID } : undefined,
        })
        console.log("[cloud-team] orchestrate: got", result.tasks.length, "tasks, store.tasks before set:", store.tasks.length)
        batch(() => {
          setStore("pendingPlan", result.tasks)
          setStore("orchestrating", false)
          setStore("orchestratePhase", "ready_for_review")
        })
        return result
      } catch (err) {
        batch(() => {
          setStore("orchestrating", false)
          setStore("orchestratePhase", undefined)
        })
        throw err
      }
    }

    // ── Plan confirmation ──────────────────────────────────

    async function confirmPlan(editedTasks: SubTask[]) {
      const sessionId = store.session?.id
      if (!sessionId) {
        throw new Error("No active session — cannot submit plan")
      }
      console.log("[cloud-team] confirmPlan: submitting", editedTasks.length, "tasks to session", sessionId, "fencingToken:", store.leader?.fencingToken)
      const tasks = await cloudTeamApi.task.submitPlan(sessionId, {
        tasks: editedTasks,
        fencingToken: store.leader?.fencingToken,
      })
      console.log("[cloud-team] confirmPlan: got", tasks.length, "tasks back")
      batch(() => {
        setStore("tasks", tasks)
        setStore("pendingPlan", undefined)
      })
      return tasks
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
      active: () => store.mode === "cloud",
      mode: () => store.mode,
      isCloudMode: () => store.mode === "cloud",
      decomposing: () => store.decomposing,
      pendingPlan: () => store.pendingPlan,
      session: () => store.session,
      sessions: () => store.sessions,
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
      orchestrating: () => store.orchestrating,
      orchestratePhase: () => store.orchestratePhase,
      models: modelList,
      selectedModel: () => store.selectedModel,
      setSelectedModel,
      devices: deviceList,
      deviceById,

      // Identity
      machineId: getMachineId,
      machineName: getMachineName,
      machineVersion: getMachineVersion,

      // Agent name constant
      agentName: CLOUD_TEAM_AGENT_NAME,

      // Actions
      setMode,
      enterLocalMode,
      enterCloudMode,
      activate,
      deactivate,
      createSession,
      joinSession,
      leaveSession,
      submitPrompt,
      orchestratePrompt,
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
