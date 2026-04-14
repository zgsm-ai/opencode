/**
 * Cloud Team Agent types
 * Aligned with docs/proposals/CLOUD_TEAM_ARCHITECTURE.md v0.1.0
 */

// ─── Session ──────────────────────────────────────────────

export type TeamSessionStatus = "active" | "paused" | "completed" | "failed"

export interface TeamSession {
  sessionId: string
  name: string
  createdAt: number
  status: TeamSessionStatus
  leaderId: string
  leaderMachineId: string
  teammates: TeammateRegistration[]
  taskPlanId?: string
}

export type TeammateStatus = "online" | "offline" | "busy"

export interface RepoInfo {
  remoteUrl: string
  localPath: string
  branch: string
  hasUncommittedChanges: boolean
}

export interface TeammateRegistration {
  teammateId: string
  machineId: string
  machineName: string
  status: TeammateStatus
  repos: RepoInfo[]
  currentTaskId?: string
  connectedAt: number
  lastHeartbeat: number
}

// ─── Task ─────────────────────────────────────────────────

export type TaskStatus = "pending" | "assigned" | "claimed" | "running" | "completed" | "failed"

export interface TaskResult {
  summary: string
  filesChanged: string[]
  artifacts?: unknown
}

export interface Task {
  taskId: string
  sessionId: string
  description: string
  repoAffinity: string[]
  fileHints: string[]
  dependencies: string[]
  assignedTeammateId: string
  status: TaskStatus
  createdAt: number
  claimedAt?: number
  startedAt?: number
  completedAt?: number
  result?: TaskResult
  retryCount: number
}

export interface SubTask {
  taskId: string
  description: string
  repoAffinity: string[]
  fileHints: string[]
  dependencies: string[]
  assignedTeammateId?: string
}

// ─── Message ──────────────────────────────────────────────

export type MessageType =
  | "task_message"
  | "progress_update"
  | "approval_request"
  | "approval_response"
  | "task_complete"
  | "teammate_idle"
  | "session_event"

export interface CloudMessage {
  messageId: string
  sessionId: string
  from: string
  to: string
  type: MessageType
  payload: unknown
  timestamp: number
}

// ─── Approval ─────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high"
export type ApprovalStatus = "pending" | "approved" | "rejected"

export interface ApprovalRequest {
  approvalId: string
  sessionId: string
  requesterId: string
  requesterName: string
  toolName: string
  toolInput: Record<string, unknown>
  description: string
  riskLevel: RiskLevel
  status: ApprovalStatus
  feedback?: string
  permissionUpdates?: unknown[]
  createdAt: number
  resolvedAt?: number
}

// ─── Progress ─────────────────────────────────────────────

export interface TaskSummary {
  taskId: string
  description: string
  status: TaskStatus
  progress?: number
}

export interface TeammateProgress {
  teammateId: string
  name: string
  machineId: string
  currentTask?: TaskSummary
  completedCount: number
  failedCount: number
  lastActivity: number
}

export interface SessionProgress {
  sessionId: string
  totalTasks: number
  completedTasks: number
  failedTasks: number
  runningTasks: number
  pendingTasks: number
  teammates: TeammateProgress[]
  timeline: ProgressEvent[]
}

export interface ProgressEvent {
  eventId: string
  type: string
  timestamp: number
  data: unknown
}

export interface ProgressUpdate {
  taskId: string
  percentage: number
  message: string
  artifacts?: unknown
}

// ─── Repo Affinity ────────────────────────────────────────

export interface RepoAffinityEntry {
  repoRemoteUrl: string
  repoLocalPath: string
  machineId: string
  teammateId: string
  lastSyncedAt: number
  currentBranch: string
  hasUncommittedChanges: boolean
}

// ─── Explore (Remote Code Exploration) ────────────────────

export type ExploreQueryType = "file_tree" | "symbol_search" | "content_search" | "git_log" | "dependency_graph"

export interface ExploreQuery {
  type: ExploreQueryType
  params: Record<string, unknown>
}

export interface ExploreRequest {
  requestId: string
  sessionId: string
  fromLeaderId: string
  targetTeammateId: string
  repoRemoteUrl: string
  queries: ExploreQuery[]
}

export interface ExploreQueryResult {
  type: string
  output: string
  truncated: boolean
}

export interface ExploreResult {
  requestId: string
  queryResults: ExploreQueryResult[]
}

// ─── Cloud Event (WebSocket envelope) ─────────────────────

export type CloudEventType =
  // Client → Cloud
  | "session.create"
  | "session.join"
  | "task.plan.submit"
  | "task.claim"
  | "task.progress"
  | "task.complete"
  | "approval.request"
  | "approval.respond"
  | "message.send"
  | "repo.register"
  | "explore.request"
  | "explore.result"
  // Cloud → Client
  | "task.assigned"
  | "approval.request"
  | "approval.response"
  | "message.receive"
  | "session.updated"
  | "teammate.status"

export interface CloudEvent {
  eventId: string
  type: CloudEventType
  sessionId: string
  timestamp: number
  payload: unknown
}

// ─── Leader Election ──────────────────────────────────────

export interface LeaderCandidate {
  teammateId: string
  machineId: string
  capabilities: {
    repoCoverage: number
    heartbeatStability: number
    cpuScore: number
    rttMs: number
  }
}

export interface LeaderStatus {
  leaderId: string
  machineId: string
  fencingToken: number
  electedAt: number
  lastHeartbeat: number
}
