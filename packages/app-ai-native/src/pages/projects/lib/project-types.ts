export interface Project {
  id: string
  name: string
  description?: string
  creatorId: string
  isPinned?: boolean
  pinnedAt?: string
  enabledAt?: string
  archivedAt?: string
  createdAt: string
  updatedAt: string
}

export interface ProjectBasicInfo {
  id: string
  name: string
  description?: string
  enabledAt?: string
  archivedAt?: string
}

export interface ProjectMember {
  id: string
  projectId: string
  userId: string
  role: "admin" | "member"
  joinedAt: string
  createdAt: string
  updatedAt: string
}

export interface ProjectInvitation {
  id: string
  projectId: string
  projectName?: string
  inviterId: string
  inviteeId: string
  role: "admin" | "member"
  status: "pending" | "accepted" | "rejected" | "cancelled"
  message?: string
  respondedAt?: string
  expiresAt?: string
  createdAt: string
  updatedAt: string
}

export interface ProjectRepository {
  id: string
  projectId: string
  gitRepoUrl: string
  displayName?: string
  source: string
  boundByUserId: string
  lastActivityAt?: string
  createdAt: string
  updatedAt: string
}

export interface ProjectRepoActiveMember {
  userId: string
  username: string
  requestCount: number
  lastActiveDate: string
}

export interface ProjectRepoDailyRequest {
  date: string
  requestCount: number
}

export interface ProjectRepositoryActivityItem {
  repositoryId: string
  displayName: string
  gitRepoUrl: string
  activeMemberCount: number
  totalRequests: number
  activeMembers: ProjectRepoActiveMember[]
  dailyRequests: ProjectRepoDailyRequest[]
}

export interface ProjectMemberActiveRepo {
  repositoryId: string
  displayName: string
  gitRepoUrl: string
  requestCount: number
  lastActiveDate: string
  inputTokens: number
  outputTokens: number
  cost: number
}

export interface ProjectMemberActivityItem {
  userId: string
  username: string
  role: "admin" | "member"
  activeRepoCount: number
  totalRequests: number
  activeRepos: ProjectMemberActiveRepo[]
}

export interface ProjectRepoActivitySummary {
  member_count: number
  repository_count: number
  active_member_count: number
  active_repository_count: number
  total_requests: number
}

export interface ProjectRepoActivityRange {
  days: number
  from: string
  to: string
}

export interface ProjectRepoActivity {
  project: { id: string; name: string }
  range: ProjectRepoActivityRange
  summary: ProjectRepoActivitySummary
  members: ProjectMemberActivityItem[]
  repositories: ProjectRepositoryActivityItem[]
}

export interface UserBasicInfo {
  id: string
  name: string
  avatarUrl?: string
}

export interface SearchedUser {
  id: string
  name?: string
  displayName?: string
  avatarUrl?: string
}

export interface ProjectListItem extends Project {
  memberCount: number
  repositoryCount: number
  pendingInvitationCount: number
}

export interface ProjectDetailBundle {
  project: Project
  members: ProjectMember[]
  invitations: ProjectInvitation[]
  repositories: ProjectRepository[]
  activity: ProjectRepoActivity
  users: Record<string, UserBasicInfo>
}

export interface CreateProjectRequest {
  name: string
  description?: string
  enabledAt?: string
}

export interface UpdateProjectRequest {
  name?: string
  description?: string
  enabledAt?: string
}

export interface BindProjectRepositoryRequest {
  gitRepoUrl: string
  displayName?: string
}

export interface ProjectRepositoryCandidate {
  displayName: string
  gitRepoUrl: string
  requestCount: number
  lastActiveDate: string
}

export interface RespondInvitationRequest {
  accept: boolean
}
