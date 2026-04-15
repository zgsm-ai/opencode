/**
 * Cloud Team Agent types
 * Field names aligned with server Go model JSON tags.
 */

// ─── Session ──────────────────────────────────────────────

export type TeamSessionStatus = "active" | "paused" | "completed" | "failed"

export interface TeamSession {
  id: string
  name: string
  creatorId: string
  createdAt: string
  updatedAt: string
  status: TeamSessionStatus
  leaderMachineId: string
  leaderUserId: string
  fencingToken: number
  metadata: Record<string, unknown>
  // Joined data (not in DB model, assembled by handler)
  leaderId?: string
  teammates?: TeammateRegistration[]
}

export type TeammateStatus = "online" | "offline" | "busy"

export interface RepoInfo {
  remoteUrl: string
  localPath: string
  branch: string
  hasUncommittedChanges: boolean
}

export interface TeammateRegistration {
  id: string
  sessionId: string
  userId: string
  machineId: string
  machineName: string
  role: string
  status: TeammateStatus
  repos: RepoInfo[]
  currentTaskId?: string
  connectedAt: string
  lastHeartbeat: string
  createdAt: string
  updatedAt: string
}

// ─── Task ─────────────────────────────────────────────────

export type TaskStatus = "pending" | "assigned" | "claimed" | "running" | "completed" | "failed" | "interrupted"

export interface TaskResult {
  summary: string
  filesChanged: string[]
  artifacts?: unknown
}

export interface Task {
  id: string
  sessionId: string
  description: string
  repoAffinity: string[]
  fileHints: string[]
  dependencies: string[]
  assignedMemberId: string | null
  status: TaskStatus
  priority: number
  result: TaskResult | null
  retryCount: number
  maxRetries: number
  errorMessage: string
  createdAt: string
  claimedAt: string | null
  startedAt: string | null
  completedAt: string | null
  updatedAt: string
}

export interface SubTask {
  taskId: string
  description: string
  repoAffinity: string[]
  fileHints: string[]
  dependencies: string[]
  assignedMemberId?: string | null
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
  id: string
  sessionId: string
  requesterId: string
  requesterName: string
  toolName: string
  toolInput: Record<string, unknown> | null
  description: string
  riskLevel: RiskLevel
  status: ApprovalStatus
  feedback: string
  permissionUpdates: unknown[] | null
  createdAt: string
  resolvedAt: string | null
}

// ─── Progress ─────────────────────────────────────────────

export interface TaskSummary {
  id: string
  description: string
  status: TaskStatus
  progress?: number
}

export interface TeammateProgress {
  memberId: string
  machineName: string
  currentTaskId: string | null
  completed: number
  failed: number
  running: number
}

export interface SessionProgress {
  totalTasks: number
  completedTasks: number
  failedTasks: number
  runningTasks: number
  pendingTasks: number
  teammates: TeammateProgress[]
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
  id: string
  sessionId: string
  memberId: string
  repoRemoteUrl: string
  repoLocalPath: string
  currentBranch: string
  hasUncommittedChanges: boolean
  lastSyncedAt: string
  createdAt: string
  updatedAt: string
}

// ─── Explore (Remote Code Exploration) ────────────────────

export type ExploreQueryType = "file_tree" | "symbol_search" | "content_search" | "git_log" | "dependency_graph"

export interface ExploreQuery {
  type: ExploreQueryType
  params: Record<string, unknown>
}

export interface ExploreRequest {
  targetMachineId: string
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
  | "task.fail"
  | "decompose.request"
  | "decompose.result"
  | "approval.request"
  | "approval.respond"
  | "message.send"
  | "repo.register"
  | "explore.request"
  | "explore.result"
  | "leader.elect"
  | "leader.heartbeat"
  // Cloud → Client
  | "task.assigned"
  | "task.interrupted"
  | "approval.push"
  | "approval.response"
  | "message.receive"
  | "session.updated"
  | "teammate.status"
  | "leader.elected"
  | "leader.expired"
  | "error"

export interface CloudEvent {
  eventId: string
  type: CloudEventType
  sessionId: string
  timestamp: number
  payload: Record<string, unknown>
}

// ─── Leader Election ──────────────────────────────────────

export interface LeaderScore {
  machineId: string
  totalScore: number
  repoCoverageScore: number
  heartbeatScore: number
  performanceScore: number
  latencyScore: number
}

export interface LeaderCandidate {
  machineId: string
  repos?: string[]
  heartbeatSuccessRate?: number
  cpuIdlePercent?: number
  memoryFreeMB?: number
  rttMs?: number
}

export interface LeaderStatus {
  elected: boolean
  fencingToken: number
  leaderId: string
  score?: LeaderScore
}

// ─── Task Assignment ──────────────────────────────────────

export interface TaskAssignmentInfo {
  taskId: string
  assignedMemberId: string
  priorityTier: number
  assignmentReason: string
}
