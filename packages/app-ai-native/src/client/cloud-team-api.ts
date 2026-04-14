import { env } from "@/lib/env"
import type {
  TeamSession,
  TeammateRegistration,
  Task,
  ApprovalRequest,
  RepoAffinityEntry,
  SessionProgress,
  ExploreRequest,
  ExploreResult,
  LeaderCandidate,
  LeaderStatus,
  SubTask,
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
    return apiFetch<TeamSession>("/api/sessions", { method: "POST", body: JSON.stringify(body) })
  },
  get(sessionId: string) {
    return apiFetch<TeamSession>(`/api/sessions/${sessionId}`)
  },
  list() {
    return apiFetch<TeamSession[]>("/api/sessions")
  },
  update(sessionId: string, body: UpdateSessionBody) {
    return apiFetch<TeamSession>(`/api/sessions/${sessionId}`, { method: "PATCH", body: JSON.stringify(body) })
  },
  delete(sessionId: string) {
    return apiFetch<void>(`/api/sessions/${sessionId}`, { method: "DELETE" })
  },
}

// ─── Member ───────────────────────────────────────────────

type JoinSessionBody = {
  teammateId?: string
  machineId: string
  machineName: string
  repos?: TeammateRegistration["repos"]
}

const member = {
  join(sessionId: string, body: JoinSessionBody) {
    return apiFetch<TeammateRegistration>(`/api/sessions/${sessionId}/members`, {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  leave(sessionId: string, machineId: string) {
    return apiFetch<void>(`/api/sessions/${sessionId}/members/${machineId}`, { method: "DELETE" })
  },
}

// ─── Task ─────────────────────────────────────────────────

type TaskPlanBody = {
  tasks: SubTask[]
}

type UpdateTaskBody = {
  status?: Task["status"]
  assignedTeammateId?: string
  result?: Task["result"]
}

const task = {
  submitPlan(sessionId: string, body: TaskPlanBody) {
    return apiFetch<Task[]>(`/api/sessions/${sessionId}/tasks`, { method: "POST", body: JSON.stringify(body) })
  },
  list(sessionId: string) {
    return apiFetch<Task[]>(`/api/sessions/${sessionId}/tasks`)
  },
  get(sessionId: string, taskId: string) {
    return apiFetch<Task>(`/api/sessions/${sessionId}/tasks/${taskId}`)
  },
  update(sessionId: string, taskId: string, body: UpdateTaskBody) {
    return apiFetch<Task>(`/api/sessions/${sessionId}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
  },
}

// ─── Approval ─────────────────────────────────────────────

type RespondApprovalBody = {
  status: "approved" | "rejected"
  feedback?: string
  permissionUpdates?: unknown[]
}

const approval = {
  list(sessionId: string) {
    return apiFetch<ApprovalRequest[]>(`/api/sessions/${sessionId}/approvals`)
  },
  respond(sessionId: string, approvalId: string, body: RespondApprovalBody) {
    return apiFetch<ApprovalRequest>(`/api/sessions/${sessionId}/approvals/${approvalId}`, {
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
  registerRepo(body: RegisterRepoBody) {
    return apiFetch<RepoAffinityEntry>("/api/registry/repos", { method: "POST", body: JSON.stringify(body) })
  },
  listRepos(remoteUrl?: string) {
    const query = remoteUrl ? `?remoteUrl=${encodeURIComponent(remoteUrl)}` : ""
    return apiFetch<RepoAffinityEntry[]>(`/api/registry/repos${query}`)
  },
}

// ─── Progress ─────────────────────────────────────────────

const progress = {
  get(sessionId: string) {
    return apiFetch<SessionProgress>(`/api/sessions/${sessionId}/progress`)
  },
}

// ─── Explore ──────────────────────────────────────────────

const explore = {
  submit(sessionId: string, body: ExploreRequest) {
    return apiFetch<{ requestId: string }>(`/api/sessions/${sessionId}/explore`, {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
}

// ─── Leader ───────────────────────────────────────────────

type ElectLeaderBody = {
  candidate: LeaderCandidate
}

const leader = {
  elect(sessionId: string, body: ElectLeaderBody) {
    return apiFetch<LeaderStatus>(`/api/sessions/${sessionId}/leader/elect`, {
      method: "POST",
      body: JSON.stringify(body),
    })
  },
  heartbeat(sessionId: string) {
    return apiFetch<void>(`/api/sessions/${sessionId}/leader/heartbeat`, { method: "POST" })
  },
  getStatus(sessionId: string) {
    return apiFetch<LeaderStatus>(`/api/sessions/${sessionId}/leader`)
  },
}

// ─── Prompt (submit a goal for task decomposition) ────────

type SubmitPromptBody = {
  prompt: string
  context?: unknown
}

const prompt = {
  submit(sessionId: string, body: SubmitPromptBody) {
    return apiFetch<{ taskPlanId: string }>(`/api/sessions/${sessionId}/prompt`, {
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
