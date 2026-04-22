import { env } from "@/lib/env"
import type {
  TeamSession,
  TeammateRegistration,
  Task,
  ApprovalRequest,
  RepoAffinityEntry,
  SessionProgress,
  ExploreRequest,
  LeaderStatus,
  SubTask,
  TaskAssignmentInfo,
  OrchestrateResponse,
} from "./cloud-team-types"

const PREFIX = env.API_PREFIX
const API_BASE = env.API_URL || PREFIX

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers =
    options?.body instanceof FormData ? options.headers : { "Content-Type": "application/json", ...options?.headers }
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || err.message || `Request failed: ${res.status}`)
  }
  return res.json()
}

// ─── Session ──────────────────────────────────────────────

type CreateSessionBody = {
  name: string
  repoUrl?: string
}

type UpdateSessionBody = {
  name?: string
  status?: TeamSession["status"]
}

const session = {
  create(body: CreateSessionBody) {
    return apiFetch<TeamSession>("/api/team/sessions", { method: "POST", body: JSON.stringify(body) })
  },
  get(sessionId: string) {
    return apiFetch<TeamSession>(`/api/team/sessions/${sessionId}`)
  },
  list() {
    return apiFetch<{ sessions: TeamSession[] }>("/api/team/sessions").then((r) => r.sessions)
  },
  update(sessionId: string, body: UpdateSessionBody) {
    return apiFetch<TeamSession>(`/api/team/sessions/${sessionId}`, { method: "PATCH", body: JSON.stringify(body) })
  },
  delete(sessionId: string) {
    return apiFetch<void>(`/api/team/sessions/${sessionId}`, { method: "DELETE" })
  },
}

// ─── Member ───────────────────────────────────────────────

type JoinSessionBody = {
  machineId: string
  machineName: string
}

const member = {
  join(sessionId: string, body: JoinSessionBody) {
    return apiFetch<TeammateRegistration>(`/api/team/sessions/${sessionId}/members`, {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  leave(sessionId: string, memberId: string) {
    return apiFetch<void>(`/api/team/sessions/${sessionId}/members/${memberId}`, { method: "DELETE" })
  },
}

// ─── Task ─────────────────────────────────────────────────

type TaskPlanBody = {
  tasks: SubTask[]
  fencingToken?: number
}

type UpdateTaskBody = {
  status?: Task["status"]
  result?: Task["result"]
  errorMessage?: string
}

type TerminateTaskBody = {
  reason?: string
  fencingToken?: number
}

const task = {
  submitPlan(sessionId: string, body: TaskPlanBody) {
    return apiFetch<{ tasks: Task[] }>(`/api/team/sessions/${sessionId}/tasks`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.tasks)
  },
  list(sessionId: string) {
    return apiFetch<{ tasks: Task[] }>(`/api/team/sessions/${sessionId}/tasks`).then((r) => r.tasks)
  },
  get(taskId: string) {
    return apiFetch<Task>(`/api/team/tasks/${taskId}`)
  },
  update(taskId: string, body: UpdateTaskBody) {
    return apiFetch<Task>(`/api/team/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
  },
  terminate(sessionId: string, taskId: string, body?: TerminateTaskBody) {
    return apiFetch<Task>(`/api/team/sessions/${sessionId}/tasks/${taskId}/terminate`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    })
  },
}

// ─── Approval ─────────────────────────────────────────────

type RespondApprovalBody = {
  status: "approved" | "rejected"
  feedback?: string
}

const approval = {
  list(sessionId: string) {
    return apiFetch<{ approvals: ApprovalRequest[] }>(`/api/team/sessions/${sessionId}/approvals`).then((r) => r.approvals)
  },
  respond(approvalId: string, body: RespondApprovalBody) {
    return apiFetch<ApprovalRequest>(`/api/team/approvals/${approvalId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
  },
}

// ─── Repo Registry ────────────────────────────────────────

type RegisterRepoBody = {
  repoRemoteUrl: string
  repoLocalPath: string
  currentBranch: string
  hasUncommittedChanges: boolean
}

const registry = {
  registerRepo(sessionId: string, body: RegisterRepoBody) {
    return apiFetch<RepoAffinityEntry>(`/api/team/sessions/${sessionId}/repos`, { method: "POST", body: JSON.stringify(body) })
  },
  listRepos(sessionId: string, remoteUrl?: string) {
    const query = remoteUrl ? `?remoteUrl=${encodeURIComponent(remoteUrl)}` : ""
    return apiFetch<{ repos: RepoAffinityEntry[] }>(`/api/team/sessions/${sessionId}/repos${query}`).then((r) => r.repos)
  },
}

// ─── Progress ─────────────────────────────────────────────

const progress = {
  get(sessionId: string) {
    return apiFetch<SessionProgress>(`/api/team/sessions/${sessionId}/progress`)
  },
}

// ─── Explore ──────────────────────────────────────────────

const explore = {
  submit(sessionId: string, body: ExploreRequest) {
    return apiFetch<{ result: unknown }>(`/api/team/sessions/${sessionId}/explore`, {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
}

// ─── Leader ───────────────────────────────────────────────

type ElectLeaderBody = {
  machineId: string
  repos?: string[]
  heartbeatSuccessRate?: number
  cpuIdlePercent?: number
  memoryFreeMB?: number
  rttMs?: number
}

const leader = {
  elect(sessionId: string, body: ElectLeaderBody) {
    return apiFetch<LeaderStatus>(`/api/team/sessions/${sessionId}/leader/elect`, {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  heartbeat(sessionId: string, machineId: string, caps?: Omit<ElectLeaderBody, "machineId">) {
    return apiFetch<{ renewed: boolean }>(`/api/team/sessions/${sessionId}/leader/heartbeat`, {
      method: "POST",
      body: JSON.stringify({ machineId, ...caps }),
    })
  },
  getStatus(sessionId: string) {
    return apiFetch<LeaderStatus>(`/api/team/sessions/${sessionId}/leader`)
  },
}

// ─── Prompt / Decompose ───────────────────────────────────

type DecomposeBody = {
  prompt: string
  context?: unknown
  dryRun?: boolean
  model?: { providerID: string; modelID: string }
}

type DecomposeResponse = {
  tasks: Task[]
  assignments?: TaskAssignmentInfo[]
}

const prompt = {
  decompose(sessionId: string, body: DecomposeBody) {
    return apiFetch<DecomposeResponse>(`/api/team/sessions/${sessionId}/decompose`, {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  orchestrate(sessionId: string, body: { prompt: string; fencingToken?: number; model?: { providerID: string; modelID: string } }) {
    return apiFetch<OrchestrateResponse>(`/api/team/sessions/${sessionId}/orchestrate`, {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
}

export const cloudTeamApi = {
  session,
  member,
  task,
  approval,
  registry,
  progress,
  explore,
  leader,
  prompt,
}
