import { env } from "@/lib/env"
import type { Device, ListDevicesResponse, UpdateDeviceRequest } from "@/pages/workspace/types"

// In dev the Vite proxy forwards /api/* to the real backend.
// Set VITE_API_URL only for standalone mode (packages/store dev server on port 3002).
const PREFIX = env.API_PREFIX
const API_BASE = env.API_URL || PREFIX

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers =
    options?.body instanceof FormData ? options.headers : { "Content-Type": "application/json", ...options?.headers }
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || err.message || `Request failed: ${res.status}`)
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

export interface SearchedUser {
  email: string
  id: string
  name: string
  owner: string
  picture: string
  preferred_username: string
  sub: string
}

export interface Invitation {
  id: string
  inviteeId: string
  inviteeUsername: string
  inviterId: string
  inviterUsername: string
  repoId: string
  role: string
  status: string
  autoAccepted: boolean
  createdAt: string
  updatedAt: string
  expiresAt: string
  repository: Repository
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

export type SecurityStatus =
  | "unscanned"
  | "pending"
  | "scanning"
  | "clean"
  | "low"
  | "medium"
  | "high"
  | "extreme"
  | "error"
  | "skipped"

export interface CapabilityItem {
  id: string
  registryId: string
  repoId?: string
  slug: string
  itemType: string
  name: string
  description: string
  category: string
  version: string
  content: string
  visibility: string
  repoVisibility?: string
  status: string
  sourceType?: string
  previewCount?: number
  installCount?: number
  favoriteCount?: number
  favorited?: boolean
  securityStatus?: SecurityStatus
  lastScanId?: string
  repoName?: string
  createdBy: string
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

type DeviceResponse = Partial<Device> & {
  id: string
  deviceId: string
  displayName?: string
  platform?: string
  version?: string
  userId?: string
  workspaceId?: string
  status?: Device["status"] | null
  label?: string | null
  description?: string | null
  tokenRotatedAt?: string | null
  lastConnectedAt?: string | null
  lastSeenAt?: string | null
  createdAt?: string
  updatedAt?: string
}

type NotificationChannelType = "wecom" | "feishu" | "webhook"

type NotificationTriggerEvent = "permission" | "question" | "idle"

export type AvailableChannel = {
  name: string
  systemChannelId: string
  type: NotificationChannelType
}

type WecomChannelResponse = {
  id: string
  channelType: NotificationChannelType
  name: string
  enabled: boolean
  triggerEvents?: string[]
  userConfig?: {
    webhookUrl?: string
  }
  systemChannelId?: string
  userId?: string
  lastError?: string
  lastUsedAt?: string
  createdAt?: string
  updatedAt?: string
}

export type WecomChannelPayload = {
  channelType: "wecom"
  name: string
  triggerEvents: NotificationTriggerEvent[]
  userConfig: {
    webhookUrl: string
  }
  systemChannelId?: string
}

function normalizeDevice(device: DeviceResponse): Device {
  return {
    id: device.id,
    deviceId: device.deviceId,
    displayName: device.displayName ?? device.label ?? device.deviceId,
    platform: device.platform ?? "",
    version: device.version ?? "",
    userId: device.userId ?? "",
    workspaceId: device.workspaceId ?? undefined,
    status: device.status ?? "",
    label: device.label ?? undefined,
    description: device.description ?? undefined,
    tokenRotatedAt: device.tokenRotatedAt ?? undefined,
    lastConnectedAt: device.lastConnectedAt ?? undefined,
    lastSeenAt: device.lastSeenAt ?? undefined,
    createdAt: device.createdAt ?? "",
    updatedAt: device.updatedAt ?? "",
  }
}

function normalizeWecomChannel(channel: WecomChannelResponse) {
  const triggerEvents = new Set(channel.triggerEvents ?? [])
  const webhook = channel.userConfig?.webhookUrl ?? ""

  return {
    id: channel.id,
    name: channel.name,
    webhook,
    enabled: Boolean(channel.enabled),
    events: {
      permission: triggerEvents.has("permission"),
      question: triggerEvents.has("question"),
      idle: triggerEvents.has("idle"),
    },
  }
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

export const deviceApi = {
  async list() {
    const res = await apiFetch<ListDevicesResponse>("/api/devices")
    return { devices: (res.devices ?? []).map(normalizeDevice) }
  },

  async get(deviceId: string) {
    const res = await apiFetch<{ device: DeviceResponse }>(`/api/devices/${deviceId}`)
    return { device: normalizeDevice(res.device) }
  },

  async update(deviceId: string, data: UpdateDeviceRequest) {
    const res = await apiFetch<{ device: DeviceResponse }>(`/api/devices/${deviceId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
    return { device: normalizeDevice(res.device) }
  },

  async listByWorkspace(workspaceId: string, page = 1, pageSize = 20) {
    const res = await apiFetch<{
      devices?: DeviceResponse[]
      total: number
      page: number
      pageSize: number
      hasMore: boolean
    }>(`/api/workspaces/${workspaceId}/devices?page=${page}&pageSize=${pageSize}`)
    return {
      ...res,
      devices: (res.devices ?? []).map(normalizeDevice),
    }
  },
}

export const notificationChannelApi = {
  async listWecom() {
    const res = await apiFetch<{ channels: WecomChannelResponse[] }>("/api/notification-channels")
    return {
      channels: (res.channels ?? []).filter((channel) => channel.channelType === "wecom").map(normalizeWecomChannel),
    }
  },

  available: () => apiFetch<{ channelTypes: AvailableChannel[] }>("/api/notification-channels/available"),

  async createWecom(data: WecomChannelPayload) {
    const res = await apiFetch<{ channel: WecomChannelResponse }>("/api/notification-channels", {
      method: "POST",
      body: JSON.stringify(data),
    })
    return { channel: normalizeWecomChannel(res.channel) }
  },

  async updateWecom(
    channelId: string,
    data: Partial<Pick<WecomChannelPayload, "name" | "triggerEvents" | "userConfig">>,
  ) {
    const res = await apiFetch<{ channel: WecomChannelResponse }>(`/api/notification-channels/${channelId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
    return { channel: normalizeWecomChannel(res.channel) }
  },

  removeWecom(channelId: string) {
    return apiFetch<{ success: boolean }>(`/api/notification-channels/${channelId}`, {
      method: "DELETE",
    })
  },

  async testWecom(channelId: string) {
    const res = await apiFetch<{ success: boolean }>(`/api/notification-channels/${channelId}/test`, {
      method: "POST",
    })
    if (!res.success) throw new Error("测试发送失败")
    return { success: true, message: "测试消息已发送" }
  },
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

  invite: (repoId: string, data: { inviteeId: string; inviteeUsername: string; role: string }) =>
    apiFetch<Invitation>(`/api/repositories/${repoId}/invitations`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
}

// ---------------------------------------------------------------------------
// User name cache (in-memory, TTL 10 min)
// ---------------------------------------------------------------------------
const _userNameCache = new Map<string, { name: string; expiresAt: number }>()
const USER_NAME_CACHE_TTL = 10 * 60 * 1000 // 10 minutes

async function resolveUserNames(ids: string[]): Promise<Record<string, string>> {
  const now = Date.now()
  const result: Record<string, string> = {}
  const missIds: string[] = []

  for (const id of ids) {
    const entry = _userNameCache.get(id)
    if (entry && now < entry.expiresAt) {
      result[id] = entry.name
    } else {
      missIds.push(id)
    }
  }

  if (missIds.length === 0) return result

  try {
    const resp = await apiFetch<{ names: Record<string, string> }>(
      `/api/users/names?ids=${missIds.map(encodeURIComponent).join(",")}`,
    )
    const expiry = now + USER_NAME_CACHE_TTL
    for (const id of missIds) {
      const name = resp.names[id] ?? id
      _userNameCache.set(id, { name, expiresAt: expiry })
      result[id] = name
    }
  } catch {
    // On error, fall back to raw IDs for the misses
    for (const id of missIds) result[id] = id
  }

  return result
}

export const userApi = {
  search: (q: string) => apiFetch<{ users: SearchedUser[] }>(`/api/users/search?q=${encodeURIComponent(q)}`),
  getNames: (ids: string[]) => resolveUserNames(ids),
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

  create: (data: { name: string; description?: string; visibility?: string; orgId?: string; ownerId: string }) =>
    apiFetch<CapabilityRegistry>("/api/registries", {
      method: "POST",
      body: JSON.stringify({ ...data, sourceType: "internal" }),
    }),
}

export const itemApi = {
  listMy: (ownerId: string, opts?: { type?: string; page?: number; pageSize?: number }) => {
    const p = new URLSearchParams({ ownerId })
    if (opts?.type) p.set("type", opts.type)
    if (opts?.page) p.set("page", String(opts.page))
    if (opts?.pageSize) p.set("pageSize", String(opts.pageSize))
    return apiFetch<{ items: CapabilityItem[]; total: number }>(`/api/items/my?${p.toString()}`)
  },

  list: (params?: {
    type?: string
    search?: string
    category?: string
    registryId?: string
    page?: number
    pageSize?: number
    status?: string
  }) => {
    const p = new URLSearchParams()
    if (params?.type) p.set("type", params.type)
    if (params?.search) p.set("search", params.search)
    if (params?.category) p.set("category", params.category)
    if (params?.registryId) p.set("registryId", params.registryId)
    if (params?.page) p.set("page", String(params.page))
    if (params?.pageSize) p.set("pageSize", String(params.pageSize))
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
    file?: File | null
  }) => {
    if (data.file) {
      const form = new FormData()
      form.append("file", data.file)
      if (data.itemType) form.append("itemType", data.itemType)
      if (data.name) form.append("name", data.name)
      if (data.slug) form.append("slug", data.slug)
      if (data.description) form.append("description", data.description)
      if (data.category) form.append("category", data.category)
      if (data.version) form.append("version", data.version)
      if (data.registryId) form.append("registryId", data.registryId)
      if (data.createdBy) form.append("createdBy", data.createdBy)
      return apiFetch<CapabilityItem>("/api/items", { method: "POST", body: form })
    }
    const { file: _file, ...rest } = data
    return apiFetch<CapabilityItem>("/api/items", { method: "POST", body: JSON.stringify(rest) })
  },

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

  update: (id: string, data: Partial<CapabilityItem> & { commitMsg?: string; file?: File | null }) => {
    if (data.file) {
      const form = new FormData()
      form.append("file", data.file)
      if (data.name) form.append("name", data.name)
      if (data.description) form.append("description", data.description)
      if (data.category) form.append("category", data.category)
      if (data.version) form.append("version", data.version)
      if (data.commitMsg) form.append("commitMsg", data.commitMsg)
      return apiFetch<CapabilityItem>(`/api/items/${id}`, { method: "PUT", body: form })
    }
    const { file: _file, ...rest } = data
    return apiFetch<CapabilityItem>(`/api/items/${id}`, { method: "PUT", body: JSON.stringify(rest) })
  },

  delete: (id: string) => apiFetch<{ message: string }>(`/api/items/${id}`, { method: "DELETE" }),

  get: (id: string) => apiFetch<CapabilityItem>(`/api/items/${id}`, { credentials: "include" }),

  transfer: (id: string, targetRepoId: string) =>
    apiFetch<CapabilityItem>(`/api/items/${id}/transfer`, {
      method: "PUT",
      body: JSON.stringify({ targetRepoId }),
    }),
}

export const registryApi2 = {
  getPublic: () => apiFetch<CapabilityRegistry>("/api/registries/public"),
}

export const artifactApi = {
  list: (itemId: string) => apiFetch<{ artifacts: CapabilityArtifact[] }>(`/api/items/${itemId}/artifacts`),
  // upload removed: zip creation is handled atomically by createDirect via multipart POST /api/items
  downloadUrl: (artifactId: string) => `${API_BASE}/api/artifacts/${artifactId}/download`,
  delete: (artifactId: string) => apiFetch<{ message: string }>(`/api/artifacts/${artifactId}`, { method: "DELETE" }),
}

export const behaviorApi = {
  log: (itemId: string, body: { actionType: string; context?: string; durationMs?: number; metadata?: Record<string, unknown> }) =>
    apiFetch(`/api/items/${itemId}/behavior`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  favorite: (itemId: string) =>
    apiFetch<{ favorited: boolean; created?: boolean; favoriteCount: number }>(`/api/items/${itemId}/favorite`, {
      method: "POST",
      credentials: "include",
    }),

  unfavorite: (itemId: string) =>
    apiFetch<{ favorited: boolean; removed?: boolean; favoriteCount: number }>(`/api/items/${itemId}/favorite`, {
      method: "DELETE",
      credentials: "include",
    }),
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
  page?: number
  pageSize?: number
  types?: string[]
  categories?: string[]
  registryIds?: string[]
  minScore?: number
}

export interface SearchResult {
  items: CapabilityItem[]
  total: number
  hasMore: boolean
  query: string
  durationMs: number
}

export const searchApi = {
  semantic: (params: SearchRequest) =>
    apiFetch<SearchResult>("/api/marketplace/items/search", {
      method: "POST",
      body: JSON.stringify(params),
    }),
}
