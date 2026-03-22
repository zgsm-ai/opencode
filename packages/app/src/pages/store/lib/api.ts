import { env } from "@/lib/env"

// In dev the Vite proxy forwards /api/* to the real backend.
// Set VITE_API_URL only for standalone mode (packages/store dev server on port 3002).
const PREFIX = env.API_PREFIX
const API_BASE = env.API_URL || PREFIX

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Request failed: ${res.status}`)
  }
  return res.json()
}

export interface Repository {
  id: string
  name: string
  displayName: string
  description: string
  visibility: "public" | "private"
  repoType: "normal" | "sync"
  ownerId: string
  createdAt: string
  updatedAt: string
}

export interface SyncJob {
  id: string
  registryId: string
  triggerType: "scheduled" | "manual" | "webhook"
  triggerUser: string
  priority: number
  status: "pending" | "running" | "success" | "failed" | "cancelled"
  retryCount: number
  maxAttempts: number
  lastError: string
  scheduledAt: string
  startedAt?: string
  finishedAt?: string
  syncLogId?: string
  createdAt: string
}

export interface SyncLog {
  id: string
  registryId: string
  triggerType: "scheduled" | "manual" | "webhook"
  triggerUser: string
  status: "running" | "success" | "failed" | "cancelled"
  commitSha: string
  previousSha: string
  totalItems: number
  addedItems: number
  updatedItems: number
  deletedItems: number
  skippedItems: number
  failedItems: number
  errorMessage: string
  durationMs: number
  startedAt: string
  finishedAt?: string
  createdAt: string
}

export interface SyncStatus {
  syncStatus: string
  lastSyncedAt?: string
  lastSyncSha: string
  pendingJobs: number
  lastLog?: SyncLog
}

export interface CreateSyncRegistryInput {
  name?: string
  description?: string
  externalUrl: string
  externalBranch?: string
  syncInterval?: number
  syncEnabled?: boolean
  includePatterns?: string[]
  excludePatterns?: string[]
  conflictStrategy?: string
  webhookSecret?: string
}

export interface RepoMember {
  id: string
  repoId: string
  userId: string
  username: string
  role: "owner" | "admin" | "member"
  createdAt: string
}

export interface CapabilityRegistry {
  id: string
  name: string
  description: string
  sourceType: string
  externalUrl: string
  externalBranch: string
  syncEnabled: boolean
  syncInterval: number
  lastSyncedAt?: string
  lastSyncSha: string
  syncStatus: string
  syncConfig?: Record<string, unknown>
  lastSyncLogId?: string
  visibility: string
  repoId: string
  orgId?: string
  ownerId: string
  createdAt: string
  updatedAt: string
}

export interface CapabilityArtifact {
  id: string
  itemId: string
  version: string
  filename: string
  storageKey: string
  fileSize: number
  checksum: string
  isLatest: boolean
  downloadCount: number
  uploadedBy: string
  createdAt: string
}

export interface ScanResult {
  id: string
  itemId: string
  itemRevision: number
  riskLevel: string
  verdict: string
  summary: string
  scanModel: string
  triggerType: string
  durationMs: number
  createdAt: string
  finishedAt: string
  permissions: Record<string, unknown>
  recommendations: Record<string, unknown>[]
  redFlags: Record<string, unknown>[]
}

export interface CapabilityVersion {
  id: string
  itemId: string
  version: string
  commitMsg: string
  createdBy: string
  createdAt: string
}

export type SecurityStatus = "unscanned" | "pending" | "scanning" | "clean" | "low" | "medium" | "high" | "extreme" | "error" | "skipped"

export interface CapabilityItem {
  id: string
  registryId: string
  slug: string
  itemType: string
  name: string
  description: string
  category: string
  version: string
  content: string
  visibility: string
  status: string
  securityStatus?: SecurityStatus
  lastScanId?: string
  createdBy: string
  createdByName?: string
  createdAt: string
  updatedAt: string
  registry?: CapabilityRegistry
  versions?: CapabilityVersion[]
  artifacts?: CapabilityArtifact[]
}

export interface RepoRegistryStatus {
  registryId: string
  name: string
  externalUrl: string
  syncStatus: string
  lastSyncedAt?: string
  lastSyncSha: string
  pendingJobs: number
}

type RepositoryResponse = {
  id: string
  name: string
  displayName: string
  description: string
  visibility: "public" | "private"
  repoType?: "normal" | "sync"
  orgType?: "normal" | "sync"
  ownerId: string
  createdAt: string
  updatedAt: string
}

type RegistryResponse = CapabilityRegistry & {
  repoId?: string
  orgId?: string
}

type MemberResponse = RepoMember & {
  repoId?: string
  orgId?: string
}

function normalizeRepository(repo: RepositoryResponse): Repository {
  return {
    id: repo.id,
    name: repo.name,
    displayName: repo.displayName,
    description: repo.description,
    visibility: repo.visibility,
    repoType: repo.repoType ?? repo.orgType ?? "normal",
    ownerId: repo.ownerId,
    createdAt: repo.createdAt,
    updatedAt: repo.updatedAt,
  }
}

function normalizeRegistry(registry: RegistryResponse): CapabilityRegistry {
  return {
    ...registry,
    repoId: registry.repoId ?? registry.orgId ?? "",
    orgId: registry.orgId ?? registry.repoId,
  }
}

function normalizeMember(member: MemberResponse, repoId: string): RepoMember {
  return {
    ...member,
    repoId: member.repoId ?? member.orgId ?? repoId,
  }
}

export const repoRegistryApi = {
  async list(repoId: string) {
    const res = await apiFetch<{ registries: RegistryResponse[] }>(`/api/repositories/${repoId}/registries`)
    return { registries: (res.registries ?? []).map(normalizeRegistry) }
  },

  async add(repoId: string, data: CreateSyncRegistryInput) {
    const res = await apiFetch<RegistryResponse>(`/api/repositories/${repoId}/registries`, {
      method: "POST",
      body: JSON.stringify(data),
    })
    return normalizeRegistry(res)
  },

  async update(repoId: string, regId: string, data: Partial<CreateSyncRegistryInput> & { syncEnabled?: boolean }) {
    const res = await apiFetch<RegistryResponse>(`/api/repositories/${repoId}/registries/${regId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
    return normalizeRegistry(res)
  },

  remove: (repoId: string, regId: string) =>
    apiFetch<{ message: string }>(`/api/repositories/${repoId}/registries/${regId}`, { method: "DELETE" }),
}

export const repoApi = {
  async listMy(userId: string) {
    const res = await apiFetch<{ repositories: RepositoryResponse[] }>(
      `/api/repositories/my?userId=${encodeURIComponent(userId)}`,
    )
    return { repositories: (res.repositories ?? []).map(normalizeRepository) }
  },

  getRegistry: (repoId: string) => apiFetch<{ id: string }>(`/api/repositories/${repoId}/registry`),

  create: (data: {
    name: string
    displayName?: string
    description?: string
    visibility?: string
    ownerId: string
    repoType?: "normal" | "sync"
    orgType?: "normal" | "sync"
    syncRegistry?: CreateSyncRegistryInput
    syncRegistries?: CreateSyncRegistryInput[]
  }) =>
    apiFetch<RepositoryResponse | { repository: RepositoryResponse; registries: RegistryResponse[] }>(
      "/api/repositories",
      {
        method: "POST",
        body: JSON.stringify({
          ...data,
          repoType: data.repoType ?? data.orgType,
        }),
      },
    ).then((result) => {
      if ("repository" in result) {
        return {
          repository: normalizeRepository(result.repository),
          registries: (result.registries ?? []).map(normalizeRegistry),
        }
      }
      return normalizeRepository(result)
    }),

  update: (id: string, data: { name?: string; displayName?: string; description?: string; visibility?: string }) =>
    apiFetch<RepositoryResponse>(`/api/repositories/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(
      normalizeRepository,
    ),

  delete: (id: string) => apiFetch<{ message: string }>(`/api/repositories/${id}`, { method: "DELETE" }),

  async listMembers(repoId: string) {
    const res = await apiFetch<{ members: MemberResponse[] }>(`/api/repositories/${repoId}/members`)
    return { members: (res.members ?? []).map((member) => normalizeMember(member, repoId)) }
  },

  addMember: (repoId: string, data: { userId: string; username?: string; role?: string }) =>
    apiFetch<MemberResponse>(`/api/repositories/${repoId}/members`, {
      method: "POST",
      body: JSON.stringify(data),
    }).then((member) => normalizeMember(member, repoId)),

  removeMember: (repoId: string, userId: string) =>
    apiFetch<{ message: string }>(`/api/repositories/${repoId}/members/${userId}`, { method: "DELETE" }),
}

export const syncApi = {
  triggerRepoSync: (repoId: string, dryRun?: boolean, registryId?: string) => {
    const params = new URLSearchParams()
    if (dryRun) params.set("dryRun", "true")
    if (registryId) params.set("registryId", registryId)
    const qs = params.toString()
    return apiFetch<{
      jobId?: string
      status?: string
      jobs?: { jobId: string; registryId: string; status: string }[]
    }>(`/api/repositories/${repoId}/sync${qs ? "?" + qs : ""}`, { method: "POST" })
  },

  cancelRepoSync: (repoId: string, registryId?: string) => {
    const qs = registryId ? `?registryId=${registryId}` : ""
    return apiFetch<{ message: string }>(`/api/repositories/${repoId}/sync/cancel${qs}`, { method: "POST" })
  },

  getRepoSyncStatus: (repoId: string, registryId?: string) => {
    const qs = registryId ? `?registryId=${registryId}` : ""
    return apiFetch<SyncStatus | { registries: RepoRegistryStatus[] }>(`/api/repositories/${repoId}/sync-status${qs}`)
  },

  listRepoSyncLogs: (repoId: string, page = 1, pageSize = 20, registryId?: string) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (registryId) params.set("registryId", registryId)
    return apiFetch<{ logs: SyncLog[]; total: number }>(`/api/repositories/${repoId}/sync-logs?${params.toString()}`)
  },

  listRepoSyncJobs: (repoId: string, page = 1, pageSize = 20, registryId?: string) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (registryId) params.set("registryId", registryId)
    return apiFetch<{ jobs: SyncJob[]; total: number }>(`/api/repositories/${repoId}/sync-jobs?${params.toString()}`)
  },

  triggerRegistrySync: (registryId: string, dryRun?: boolean) =>
    apiFetch<{ jobId: string; status: string }>(`/api/registries/${registryId}/sync${dryRun ? "?dryRun=true" : ""}`, {
      method: "POST",
    }),

  getRegistrySyncStatus: (registryId: string) => apiFetch<SyncStatus>(`/api/registries/${registryId}/sync-status`),

  listRegistrySyncLogs: (registryId: string, page = 1, pageSize = 20) =>
    apiFetch<{ logs: SyncLog[]; total: number }>(
      `/api/registries/${registryId}/sync-logs?page=${page}&pageSize=${pageSize}`,
    ),
}

export const registryApi = {
  listMy: (ownerId: string) =>
    apiFetch<{ registries: CapabilityRegistry[] }>(`/api/registries/my?ownerId=${encodeURIComponent(ownerId)}`),

  ensurePersonal: (ownerId: string, username?: string) =>
    apiFetch<CapabilityRegistry>("/api/registries/ensure-personal", {
      method: "POST",
      body: JSON.stringify({ ownerId, username }),
    }),

  create: (data: { name: string; description?: string; visibility?: string; orgId?: string; ownerId: string }) =>
    apiFetch<CapabilityRegistry>("/api/registries", {
      method: "POST",
      body: JSON.stringify({ ...data, sourceType: "internal" }),
    }),
}

export const itemApi = {
  listMy: (ownerId: string, type?: string) =>
    apiFetch<{ items: CapabilityItem[] }>(
      `/api/items/my?ownerId=${encodeURIComponent(ownerId)}${type ? `&type=${type}` : ""}`,
    ),

  list: (params?: {
    type?: string
    search?: string
    category?: string
    registryId?: string
    limit?: number
    offset?: number
    status?: string
  }) => {
    const p = new URLSearchParams()
    if (params?.type) p.set("type", params.type)
    if (params?.search) p.set("search", params.search)
    if (params?.category) p.set("category", params.category)
    if (params?.registryId) p.set("registryId", params.registryId)
    if (params?.limit) p.set("limit", String(params.limit))
    if (params?.offset) p.set("offset", String(params.offset))
    if (params?.status) p.set("status", params.status)
    return apiFetch<{ items: CapabilityItem[]; total: number; hasMore: boolean }>(`/api/items?${p.toString()}`)
  },

  createDirect: (data: {
    itemType: string
    name: string
    description?: string
    category?: string
    version?: string
    content?: string
    visibility?: string
    registryId?: string
    slug?: string
    createdBy?: string
  }) => apiFetch<CapabilityItem>("/api/items", { method: "POST", body: JSON.stringify(data) }),

  create: (
    registryId: string,
    data: {
      slug: string
      itemType: string
      name: string
      description?: string
      category?: string
      version?: string
      content?: string
      visibility?: string
      createdBy: string
    },
  ) =>
    apiFetch<CapabilityItem>(`/api/registries/${registryId}/items`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<CapabilityItem> & { commitMsg?: string }) =>
    apiFetch<CapabilityItem>(`/api/items/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  delete: (id: string) => apiFetch<{ message: string }>(`/api/items/${id}`, { method: "DELETE" }),

  get: (id: string) => apiFetch<CapabilityItem>(`/api/items/${id}`),
}

export const registryApi2 = {
  getPublic: () => apiFetch<CapabilityRegistry>("/api/registries/public"),
}

export const artifactApi = {
  list: (itemId: string) => apiFetch<{ artifacts: CapabilityArtifact[] }>(`/api/items/${itemId}/artifacts`),
  downloadUrl: (artifactId: string) => `${API_BASE}/api/artifacts/${artifactId}/download`,
  delete: (artifactId: string) => apiFetch<{ message: string }>(`/api/artifacts/${artifactId}`, { method: "DELETE" }),
}

export interface ScanStatus {
  scanStatus: SecurityStatus
  lastScannedAt?: string
  latestResult?: {
    id: string
    riskLevel: string
    verdict: string
    summary: string
    scanModel: string
  }
}

export const scanApi = {
  list: (itemId: string) => apiFetch<{ results: ScanResult[]; total: number }>(`/api/items/${itemId}/scan-results`),
  getStatus: (itemId: string) => apiFetch<ScanStatus>(`/api/items/${itemId}/scan-status`),
  trigger: (itemId: string) =>
    apiFetch<{ jobId: string; status: string }>(`/api/items/${itemId}/scan`, { method: "POST" }),
}

export interface SearchRequest {
  query: string
  limit?: number
  offset?: number
  types?: string[]
  categories?: string[]
  registryIds?: string[]
  minScore?: number
}

export interface SearchResultItem {
  item: CapabilityItem
  score: number
}

export interface SearchResult {
  items: SearchResultItem[]
  total: number
  hasMore: boolean
}

export const searchApi = {
  semantic: (params: SearchRequest) =>
    apiFetch<SearchResult>("/api/marketplace/items/search", {
      method: "POST",
      body: JSON.stringify(params),
    }),
}

// 通知渠道类型
export interface NotificationChannel {
  id: string
  name: string
  type: "wecom" // 企业微信
  webhook: string
  events: string[]
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateNotificationChannelInput {
  name: string
  type: "wecom"
  webhook: string
  events: string[]
  enabled?: boolean
}

export interface UpdateNotificationChannelInput {
  name?: string
  webhook?: string
  events?: string[]
  enabled?: boolean
}

// Mock 数据
let mockChannels: NotificationChannel[] = [
  {
    id: "ch-1",
    name: "企微通知",
    type: "wecom",
    webhook: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx-xxx-xxx",
    events: ["session.created", "session.completed", "session.failed"],
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

// 通知渠道 API
export const notificationChannelApi = {
  list: async (): Promise<{ channels: NotificationChannel[] }> => {
    // Mock: 返回模拟数据
    return { channels: [...mockChannels] }
  },

  get: async (id: string): Promise<NotificationChannel> => {
    // Mock: 返回模拟数据
    const channel = mockChannels.find((c) => c.id === id)
    if (!channel) throw new Error("Channel not found")
    return { ...channel }
  },

  create: async (data: CreateNotificationChannelInput): Promise<NotificationChannel> => {
    // Mock: 创建新渠道
    const newChannel: NotificationChannel = {
      id: `ch-${Date.now()}`,
      name: data.name,
      type: data.type,
      webhook: data.webhook,
      events: data.events,
      enabled: data.enabled ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    mockChannels.push(newChannel)
    return { ...newChannel }
  },

  update: async (id: string, data: UpdateNotificationChannelInput): Promise<NotificationChannel> => {
    // Mock: 更新渠道
    const index = mockChannels.findIndex((c) => c.id === id)
    if (index === -1) throw new Error("Channel not found")
    mockChannels[index] = {
      ...mockChannels[index],
      ...data,
      updatedAt: new Date().toISOString(),
    }
    return { ...mockChannels[index] }
  },

  delete: async (id: string): Promise<{ message: string }> => {
    // Mock: 删除渠道
    const index = mockChannels.findIndex((c) => c.id === id)
    if (index === -1) throw new Error("Channel not found")
    mockChannels.splice(index, 1)
    return { message: "Channel deleted" }
  },

  toggle: async (id: string, enabled: boolean): Promise<NotificationChannel> => {
    // Mock: 切换启用状态
    const index = mockChannels.findIndex((c) => c.id === id)
    if (index === -1) throw new Error("Channel not found")
    mockChannels[index].enabled = enabled
    mockChannels[index].updatedAt = new Date().toISOString()
    return { ...mockChannels[index] }
  },
}
