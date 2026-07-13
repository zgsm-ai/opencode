import { env } from "@/lib/env"
import { onUnauthorized } from "@/lib/session-expired"
import type {
  Device,
  DeviceCommandAck,
  DeviceCommandRequest,
  ListDevicesResponse,
  UpdateCheckResponse,
  UpdateDeviceRequest,
  CommandStatusResponse,
} from "@/pages/workspace/types"

// In dev the Vite proxy forwards /api/* to the real backend.
// Set VITE_API_URL only for standalone mode (packages/store dev server on port 3002).
const PREFIX = env.API_PREFIX
const API_BASE = env.API_URL || PREFIX

// Lazy import to avoid bundling mock data in production builds
let _mockApiFetch: typeof import("./mock-api").mockApiFetch | undefined
async function getMockApiFetch() {
  if (!_mockApiFetch) {
    const mod = await import("./mock-api")
    _mockApiFetch = mod.mockApiFetch
  }
  return _mockApiFetch
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  // In demo mode, intercept all API calls and return mock data
  if (env.DEMO_MODE) {
    const mockFetch = await getMockApiFetch()
    return mockFetch<T>(`${API_BASE}${path}`, options)
  }

  const headers =
    options?.body instanceof FormData ? options.headers : { "Content-Type": "application/json", ...options?.headers }
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...options,
    headers,
  })
  if (!res.ok) {
    if (res.status === 401) onUnauthorized(path)
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || err.message || `Request failed: ${res.status}`)
  }
  return res.json()
}

// downloadViaFetch fetches an authenticated file (cookie session) as a blob and
// triggers a browser download. Use this instead of navigating an <a href> to an
// /api/... URL: a top-level navigation to /api/* hits the Vite SPA fallback (dev)
// and lands on a blank index.html page, and it also can't carry non-cookie auth.
// Going through fetch rides the same proxy + credentials path as apiFetch.
export async function downloadViaFetch(url: string, filename: string): Promise<void> {
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) {
    if (res.status === 401) onUnauthorized(url)
    throw new Error(`Download failed: ${res.status}`)
  }
  const blob = await res.blob()
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = objUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objUrl)
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
  id: string
  name: string
  displayName?: string
  avatarUrl?: string
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
  revision: number
  name?: string
  description?: string
  descriptions?: Record<string, string>
  category?: string
  version?: string
  versionLabel?: string
  content?: string
  contentMd5?: string
  metadata?: Record<string, unknown>
  sourcePath?: string
  assets?: CapabilityItemAsset[]
  commitMsg: string
  createdBy: string
  createdAt: string
}

export interface CapabilityItemAsset {
  relPath: string
  textContent?: string
  mimeType?: string
  fileSize?: number
  contentSha?: string
}

export interface ItemTag {
  id: string
  slug: string
  tagClass: string
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
  descriptions?: Record<string, string>
  category: string
  version: string
  content: string
  visibility: string
  repoVisibility?: string
  status: string
  currentRevision?: number
  sourcePath?: string
  sourceType?: string
  source?: string
  previewCount?: number
  installCount?: number
  favoriteCount?: number
  favorited?: boolean
  securityStatus?: SecurityStatus
  lastScanId?: string
  experienceScore?: number
  repoName?: string
  parentPluginId?: string
  parentPluginName?: string
  parentPluginSlug?: string
  createdBy: string
  forkedFromItemId?: string
  forkedFromOwnerId?: string
  isBuiltIn?: boolean
  forkCount?: number
  myForkItemId?: string
  createdAt: string
  updatedAt: string
  registry?: CapabilityRegistry
  versions?: CapabilityVersion[]
  artifacts?: CapabilityArtifact[]
  assets?: CapabilityItemAsset[]
  tags?: ItemTag[]
  health?: {
    score?: number
    // effective_score is the star-routing-aware weighted health the blended
    // final_score actually uses (provided by the upstream catalog bundle); score
    // is the raw simple-mean of the radar signals. excluded_signals lists the
    // heuristic signals dropped from the blend (e.g. "popularity" on star-noise).
    effective_score?: number
    excluded_signals?: string[]
    signals: { freshness: number; popularity: number; source_trust: number; manifest_completeness?: number }
    freshness_label?: string
    last_commit?: string
  }
  evaluation?: {
    coding_relevance?: number
    doc_completeness?: number
    desc_accuracy?: number
    writing_quality?: number
    specificity?: number
    install_clarity?: number
    // content_quality is the authoritative per-type weighted LLM quality
    // subtotal (内容质量, 0-100, whole number) provided by the upstream catalog
    // bundle. Prefer it over the client-side computeContentQuality fallback,
    // which uses skill weights for every type.
    content_quality?: number
    final_score: number
    decision?: string
    model_id?: string
    rubric_version?: string
    evaluated_at?: string
  }
  // Normalized single-server MCP install template ({command,args,env,...}). Present for mcp
  // items; the frontend heuristic (lib/mcp-config.ts) parses it to detect fillable placeholders.
  metadata?: Record<string, unknown>
  // Per-user MCP config status. Only present for an mcp item the logged-in user has configured,
  // and it is only ever returned to that owner (anonymous/other users get no mcpConfig at all),
  // so `value` carries the saved value for every field — secret included — to pre-fill the inline
  // editor. `secret` only drives display masking elsewhere. See design.md §3.4.
  mcpConfig?: {
    fields: { key: string; hasValue: boolean; secret: boolean; value?: string }[]
  }
}

export type ItemSort = "favoriteCount" | "installCount" | "previewCount" | "experienceScore" | "updatedAt"
export type ItemOrder = "asc" | "desc"

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
  canUpdate?: boolean | null
  latestVersion?: string | null
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
    canUpdate: device.canUpdate ?? undefined,
    latestVersion: device.latestVersion ?? undefined,
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

  async remove(deviceId: string) {
    const res = await fetch(`${API_BASE}/api/devices/${deviceId}`, { method: "DELETE" })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || err.message || `Request failed: ${res.status}`)
    }
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
  async listMy() {
    const res = await apiFetch<{ repositories: RepositoryResponse[] }>("/api/repositories/my")
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
const _userInfoCache = new Map<string, UserBasicInfo>()
const _userInfoPending = new Map<string, Promise<UserBasicInfo>>()

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

async function resolveUserInfo(userIds: string[]) {
  const unique = Array.from(new Set(userIds.filter(Boolean)))
  if (unique.length === 0) return {} as Record<string, UserBasicInfo>

  const entries = await Promise.all(
    unique.map(async (userId) => {
      const cached = _userInfoCache.get(userId)
      if (cached) return [userId, cached] as const

      const pending = _userInfoPending.get(userId)
      if (pending) return [userId, await pending] as const

      const request = apiFetch<{ user: UserBasicInfo & { picture?: string; avatar_url?: string } }>(`/api/users/info?id=${encodeURIComponent(userId)}`)
        .then((res) => {
          const raw = res.user ?? { id: userId, name: userId }
          const user = {
            id: raw.id ?? userId,
            name: raw.name ?? userId,
            avatarUrl: raw.avatarUrl ?? raw.picture ?? raw.avatar_url,
          } satisfies UserBasicInfo
          _userInfoCache.set(userId, user)
          _userInfoPending.delete(userId)
          return user
        })
        .catch(() => {
          const fallback = { id: userId, name: userId, avatarUrl: undefined } satisfies UserBasicInfo
          _userInfoCache.set(userId, fallback)
          _userInfoPending.delete(userId)
          return fallback
        })

      _userInfoPending.set(userId, request)
      return [userId, await request] as const
    }),
  )

  return Object.fromEntries(entries)
}

export const userApi = {
  search: (q: string) => apiFetch<{ users: SearchedUser[] }>(`/api/users/search?q=${encodeURIComponent(q)}`),
  getNames: (ids: string[]) => resolveUserNames(ids),
  getInfo: (ids: string[]) => resolveUserInfo(ids),
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
  listMy: (opts?: {
    type?: string
    page?: number
    pageSize?: number
    search?: string
    categories?: string[]
    source?: string[]
    tags?: string[]
    securityStatuses?: string[]
    sortBy?: ItemSort
    sortOrder?: ItemOrder
  }) => {
    const p = new URLSearchParams()
    if (opts?.type) p.set("type", opts.type)
    if (opts?.page) p.set("page", String(opts.page))
    if (opts?.pageSize) p.set("pageSize", String(opts.pageSize))
    if (opts?.search) p.set("search", opts.search)
    if (opts?.categories?.length) p.set("categories", opts.categories.join(","))
    if (opts?.source?.length) p.set("source", opts.source.join(","))
    if (opts?.tags?.length) p.set("tags", opts.tags.join(","))
    if (opts?.securityStatuses?.length) p.set("securityStatuses", opts.securityStatuses.join(","))
    if (opts?.sortBy) p.set("sortBy", opts.sortBy)
    if (opts?.sortOrder) p.set("sortOrder", opts.sortOrder)
    return apiFetch<{ items: CapabilityItem[]; total: number }>(`/api/items/my?${p.toString()}`)
  },

  list: (params?: {
    type?: string
    search?: string
    category?: string
    categories?: string[]
    source?: string[]
    tags?: string[]
    securityStatuses?: string[]
    registryId?: string
    page?: number
    pageSize?: number
    status?: string
    sortBy?: ItemSort
    sortOrder?: ItemOrder
    favorited?: boolean
    includeForks?: boolean
    paginated?: boolean
    parentPluginId?: string
    excludeSubSkills?: boolean
  }) => {
    const p = new URLSearchParams()
    if (params?.type) p.set("type", params.type)
    if (params?.search) p.set("search", params.search)
    if (params?.categories?.length) p.set("categories", params.categories.join(","))
    if (params?.category) p.set("category", params.category)
    if (params?.source?.length) p.set("source", params.source.join(","))
    if (params?.tags?.length) p.set("tags", params.tags.join(","))
    if (params?.securityStatuses?.length) p.set("securityStatuses", params.securityStatuses.join(","))
    if (params?.registryId) p.set("registryId", params.registryId)
    if (params?.page) p.set("page", String(params.page))
    if (params?.pageSize) p.set("pageSize", String(params.pageSize))
    if (params?.status) p.set("status", params.status)
    if (params?.sortBy) p.set("sortBy", params.sortBy)
    if (params?.sortOrder) p.set("sortOrder", params.sortOrder)
    if (params?.favorited) p.set("favorited", "true")
    if (params?.includeForks) p.set("includeForks", "true")
    if (params?.paginated) p.set("paginated", "true")
    if (params?.parentPluginId) p.set("parentPluginId", params.parentPluginId)
    if (params?.excludeSubSkills) p.set("excludeSubSkills", "true")
    return apiFetch<{ items: CapabilityItem[]; total: number; hasMore: boolean }>(`/api/items?${p.toString()}`)
  },

  createDirect: (data: {
    itemType: string
    name: string
    description?: string
    category?: string
    tags?: string[]
    version?: string
    content?: string
    visibility?: string
    registryId?: string
    slug?: string
    sourcePath?: string
    assets?: CapabilityItemAsset[]
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

  // Batch delete (max 200) of the caller's own items in a single backend
  // transaction; a platform admin may delete any. `forbidden` counts ids the
  // caller may not delete, `skipped` ids that no longer existed.
  batchDelete: (ids: string[]) =>
    apiFetch<{ deleted: number; skipped: number; forbidden: number; deletedIds: string[]; forbiddenIds: string[] }>(
      "/api/items",
      { method: "DELETE", body: JSON.stringify({ ids }) },
    ),

  get: (id: string) => apiFetch<CapabilityItem>(`/api/items/${id}`, { credentials: "include" }),

  getAssets: (id: string) => apiFetch<{ assets: CapabilityItemAsset[] }>(`/api/items/${id}/assets`, { credentials: "include" }).then((res) => res.assets ?? []),

  listVersions: (id: string) => apiFetch<{ versions: CapabilityVersion[] }>(`/api/items/${id}/versions`, { credentials: "include" }).then((res) => res.versions ?? []),

  getVersion: (id: string, revision: number) => apiFetch<CapabilityVersion>(`/api/items/${id}/versions/${revision}`, { credentials: "include" }),

  transfer: (id: string, targetRepoId: string) =>
    apiFetch<CapabilityItem>(`/api/items/${id}/transfer`, {
      method: "PUT",
      body: JSON.stringify({ targetRepoId }),
    }),

  fork: (id: string) =>
    apiFetch<CapabilityItem>(`/api/items/${id}/fork`, {
      method: "POST",
      credentials: "include",
    }),

  setTags: (id: string, tags: string[]) =>
    apiFetch<{ tags: ItemTag[] }>(`/api/items/${id}/tags`, {
      method: "POST",
      body: JSON.stringify({ tags }),
    }),
}

export interface DistributionTarget {
  scopeType: "user" | "department"
  targetId: string
}

export interface DistributionResult {
  distribution: {
    id: string
    itemId: string
    distributorId: string
    permissionMode: string
    status: string
    scopeType: string
    targetId: string
    message?: string
    createdAt: string
    item?: CapabilityItem
  }
  recipientCount: number
}

export const distributionApi = {
  distribute: (itemId: string, data: {
    targets: DistributionTarget[]
    permissionMode: "readonly" | "dismissible"
    message?: string
  }) =>
    apiFetch<{ distributions: DistributionResult[] }>(`/api/items/${itemId}/distribute`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  listByItem: (itemId: string) =>
    apiFetch<{ distributions: DistributionResult["distribution"][] }>(`/api/items/${itemId}/distributions`),

  listMySent: () =>
    apiFetch<{ distributions: DistributionResult["distribution"][] }>("/api/distributions/my/sent"),

  listMyReceived: () =>
    apiFetch<{ receipts: { id: string; distributionId: string; userId: string; receiptStatus: string; forkedItemId?: string; distribution: DistributionResult["distribution"] & { item?: CapabilityItem } }[] }>("/api/distributions/my/received"),

  // The caller's own distribution reach, used to gate the distribute entry and
  // scope the department picker. unlimited === true for platform admins (full tree);
  // otherwise departments lists the subtrees the user leads
  // (manages) — empty means the user may not distribute at all.
  myAuthority: () =>
    apiFetch<{ unlimited: boolean; departments: AdminDept[] }>("/api/distributions/my/authority"),

  searchEligibleUsers: (q: string) =>
    apiFetch<{ users: SearchedUser[] }>(`/api/distributions/eligible-users?q=${encodeURIComponent(q)}`),

  update: (id: string, data: { status?: string; permissionMode?: string; message?: string }) =>
    apiFetch<DistributionResult["distribution"]>(`/api/distributions/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  revoke: (id: string) =>
    apiFetch<{ message: string }>(`/api/distributions/${id}`, { method: "DELETE" }),

  dismiss: (id: string) =>
    apiFetch<{ message: string }>(`/api/distributions/${id}/dismiss`, { method: "POST" }),

  markRead: (id: string) =>
    apiFetch<{ message: string }>(`/api/distributions/${id}/read`, { method: "POST" }),

  fork: (id: string) =>
    apiFetch<CapabilityItem>(`/api/distributions/${id}/fork`, { method: "POST" }),
}

export interface DistributionReceipt {
  id: string
  distributionId: string
  userId: string
  receiptStatus: string
  forkedItemId?: string
  createdAt: string
}

// Platform-admin global distribution management (M3).
export const adminDistributionApi = {
  listAll: (filter?: {
    status?: string
    scope?: string
    search?: string
    page?: number
    pageSize?: number
  }) => {
    const p = new URLSearchParams()
    if (filter?.status) p.set("status", filter.status)
    if (filter?.scope) p.set("scope", filter.scope)
    if (filter?.search) p.set("search", filter.search)
    if (filter?.page) p.set("page", String(filter.page))
    if (filter?.pageSize) p.set("pageSize", String(filter.pageSize))
    const qs = p.toString()
    return apiFetch<{ distributions: DistributionResult["distribution"][]; total: number }>(
      `/api/admin/distributions${qs ? `?${qs}` : ""}`,
    )
  },

  listReceipts: (id: string) =>
    apiFetch<{ receipts: DistributionReceipt[] }>(`/api/admin/distributions/${id}/receipts`),
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

// Outward-facing masked MCP config status — matches CapabilityItem["mcpConfig"] and the
// PUT /items/:id/mcp-config response (design.md §3.3–3.4).
export type McpConfigStatus = NonNullable<CapabilityItem["mcpConfig"]>
// One field value sent on upsert. Empty `v` clears the key (merge semantics, design.md §3.3).
export type McpFieldValue = { v: string; secret: boolean }

export const mcpConfigApi = {
  // Merge-upsert the current user's filled placeholder values for an MCP item. Returns the
  // masked status. The backend ignores any key not matching `env:<NAME>` / `args:<INDEX>`.
  upsert: (itemId: string, fields: Record<string, McpFieldValue>) =>
    apiFetch<{ mcpConfig: McpConfigStatus }>(`/api/items/${itemId}/mcp-config`, {
      method: "PUT",
      credentials: "include",
      body: JSON.stringify({ fields }),
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

export interface Category {
  id: string
  slug: string
  icon: string
  sortOrder: number
  names: Record<string, string>
  descriptions: Record<string, string>
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface FilterOption {
  value: string
  names: Record<string, string>
}

export type SecurityRiskGroup = "unknown" | "low" | "medium" | "high"

export interface SourceOption {
  value: string
  label: string
  url: string
}

export interface UserBasicInfo {
  id: string
  name: string
  avatarUrl?: string
}

export interface ItemFilterOptions {
  categories: Category[]
  securityStatuses: FilterOption[]
  securityRiskGroups: FilterOption[]
  sources: SourceOption[]
}

export interface TagListResponse {
  tags: ItemTag[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export const categoryApi = {
  list: () => apiFetch<{ categories: Category[] }>("/api/categories").then((res) => res.categories),
}

export const itemFilterApi = {
  list: () => apiFetch<ItemFilterOptions>("/api/items/filter-options"),
}

export const tagApi = {
  list: (params?: { query?: string; page?: number; pageSize?: number; tagClass?: string }, options?: RequestInit) => {
    const p = new URLSearchParams()
    if (params?.query) p.set("q", params.query)
    if (params?.page) p.set("page", String(params.page))
    if (params?.pageSize) p.set("pageSize", String(params.pageSize))
    if (params?.tagClass) p.set("tagClass", params.tagClass)
    return apiFetch<TagListResponse>(`/api/tags?${p.toString()}`, options)
  },
}

// 大客户 (enterprise customer) branding config. Each entry binds one customer's bound accounts
// to a display name + logo, so store items whose uploader matches get branded.
//
// Account binding is anchored on Casdoor `universal_id` (stable identity that survives re-login /
// subject_id churn). The backend resolves universal_id ↔ local subject_id internally:
//   - The PUBLIC read (`enterpriseApi.list`) returns `ids` already resolved to subject_id[], which
//     store/lib/enterprise.ts matches against `item.created_by`. Do NOT change that contract.
//   - The ADMIN read (`adminEnterpriseApi.list`) returns the raw universal_id[] plus a `members`
//     roster (one entry per universal_id) so the admin UI can render people-not-IDs.
// In demo mode the public endpoint is absent and the call rejects (the frontend then falls back to
// its built-in demo roster — see lib/enterprise.ts).
export interface EnterpriseCustomer {
  id: string
  ids: string[]
  name: string
  logo: string
}

// One bound account in the admin view. `universalId` is the durable anchor; `subjectId` is the
// resolved local subject_id (empty string when the universal_id is configured but its owner has not
// yet logged in / is not a local user). username/displayName/avatarUrl are best-effort enrichment.
export interface EnterpriseMember {
  universalId: string
  subjectId: string
  username: string
  displayName: string
  avatarUrl: string
}

// Admin-shaped enterprise customer: carries universal_id[] + the resolved member roster.
export interface AdminEnterpriseCustomer {
  id: string
  name: string
  logo: string
  universalIds: string[]
  members: EnterpriseMember[]
}

// Create/update payload. `ids` is a list of Casdoor universal_id (NOT subject_id) — the backend
// stores them and resolves to subject_id for the public read.
export interface EnterpriseCustomerInput {
  name: string
  logo: string
  ids: string[]
}

export const enterpriseApi = {
  // Public read: `ids` are resolved subject_id[] (consumed by store/lib/enterprise.ts). Unchanged.
  list: () => apiFetch<{ customers: EnterpriseCustomer[] }>("/api/enterprise-customers"),

  // Admin read: universal_id[] + member roster, platform_admin only.
  adminList: () =>
    apiFetch<{ customers: AdminEnterpriseCustomer[] }>("/api/admin/enterprise-customers"),

  // `data.ids` = universal_id list.
  create: (data: EnterpriseCustomerInput) =>
    apiFetch<{ customer: AdminEnterpriseCustomer }>("/api/admin/enterprise-customers", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // `data.ids` = universal_id list.
  update: (id: string, data: EnterpriseCustomerInput) =>
    apiFetch<{ customer: AdminEnterpriseCustomer }>(`/api/admin/enterprise-customers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/admin/enterprise-customers/${id}`, { method: "DELETE" }),
}

// ── Admin · Permission management (M2) ─────────────────────────────────────
// System roles reuse the existing systemrole backend; resource-permission
// matrix uses the authz endpoints added for M2.

export type SystemRole = "platform_admin" | "business_admin"

export interface ResourcePermission {
  id: string
  resourceCode: string
  resourceType: "menu" | "api"
  allowedRoles: string[]
}

export const adminPermissionApi = {
  // System role grant/revoke (reuses systemrole routes).
  listUserRoles: (userId: string) =>
    apiFetch<{ userId: string; roles: string[] }>(`/api/admin/system-roles/users/${encodeURIComponent(userId)}`),

  grantRole: (userId: string, role: SystemRole) =>
    apiFetch<{ success: boolean }>(`/api/admin/system-roles/users/${encodeURIComponent(userId)}`, {
      method: "POST",
      body: JSON.stringify({ role }),
    }),

  revokeRole: (userId: string, role: SystemRole) =>
    apiFetch<{ success: boolean }>(
      `/api/admin/system-roles/users/${encodeURIComponent(userId)}/${encodeURIComponent(role)}`,
      { method: "DELETE" },
    ),

  // Resource-permission matrix (authz, added for M2).
  listResourcePermissions: () =>
    apiFetch<{ permissions: ResourcePermission[] }>("/api/admin/resource-permissions"),

  updateResourcePermission: (code: string, allowedRoles: string[]) =>
    apiFetch<{ success: boolean }>(`/api/admin/resource-permissions/${encodeURIComponent(code)}`, {
      method: "PUT",
      body: JSON.stringify({ allowedRoles }),
    }),
}

// ── Admin · Fine-grained permission grants (mentor RBAC, Phase 2) ───────────
// A grant binds a permission_code to a subject (user | department). Department
// grants inherit to descendants via the materialized dept_path (resolved from
// dept-sync at grant time and stored redundantly server-side). Coexists with the
// resource-permission role matrix: final authz = role path ∪ grant path.
export type GrantSubjectType = "user" | "department"

export interface PermissionGrant {
  id: string
  permissionCode: string
  subjectType: GrantSubjectType
  subjectId: string
  deptPath: string
  grantedBy: string
  createdAt: string
}

export const adminGrantApi = {
  listGrants: (permissionCode?: string) => {
    const qs = permissionCode ? `?permissionCode=${encodeURIComponent(permissionCode)}` : ""
    return apiFetch<{ grants: PermissionGrant[] }>(`/api/admin/permission-grants${qs}`)
  },

  // targetDeptId is used only for the metrics-view preset kanban.scope.dept on a
  // USER subject: the backend resolves that target department's dept_path and
  // stores it on the grant, which ResolveUserScope reads as the user's extra
  // visible subtree. It is ignored for department subjects (whose dept_path is
  // their own, resolved from subjectId).
  grant: (payload: {
    permissionCode: string
    subjectType: GrantSubjectType
    subjectId: string
    targetDeptId?: string
  }) =>
    apiFetch<{ grant: PermissionGrant }>("/api/admin/permission-grants", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  revoke: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/admin/permission-grants/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
}

// ── Admin · Member management (M1) ─────────────────────────────────────────
// Platform-admin member console: paginated/searchable/status-filtered user list,
// per-member profile aggregation, account-status switch, and organization roll-up.
// Backed by /api/admin/users + /api/admin/organizations (platform_admin gated).
// Reads the LOCAL users table shape (subject_id/status/organization), NOT the
// Casdoor-shaped SearchedUser returned by userApi.search.

export type AdminUserStatus = "active" | "disabled" | "banned"

export interface AdminUser {
  subject_id: string
  // Casdoor universal_id: the durable identity anchor used by enterprise-customer bindings.
  // Empty string when the user has no universal_id on record.
  universalId: string
  username: string
  displayName: string
  email: string
  avatarUrl: string
  organization: string
  status: AdminUserStatus
  roles: string[]
  lastLoginAt: string | null
  createdAt: string
}

export interface AdminUserProfile {
  createdItemCount: number
  distributedCount: number
  receivedCount: number
}

export interface AdminOrganization {
  organization: string
  memberCount: number
}

export const adminUserApi = {
  list: (filter?: { search?: string; organization?: string; status?: string; page?: number; pageSize?: number }) => {
    const p = new URLSearchParams()
    if (filter?.search) p.set("search", filter.search)
    if (filter?.organization) p.set("organization", filter.organization)
    if (filter?.status) p.set("status", filter.status)
    if (filter?.page) p.set("page", String(filter.page))
    if (filter?.pageSize) p.set("pageSize", String(filter.pageSize))
    const qs = p.toString()
    return apiFetch<{ users: AdminUser[]; total: number; page: number; pageSize: number }>(
      `/api/admin/users${qs ? `?${qs}` : ""}`,
    )
  },

  getProfile: (id: string) =>
    apiFetch<{ user: AdminUser; profile: AdminUserProfile }>(`/api/admin/users/${encodeURIComponent(id)}/profile`),

  setStatus: (id: string, status: AdminUserStatus) =>
    apiFetch<{ success: boolean }>(`/api/admin/users/${encodeURIComponent(id)}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),

  listOrganizations: () => apiFetch<{ organizations: AdminOrganization[] }>("/api/admin/organizations"),
}

// ── Admin · Department tree (M1 org view, via dept-sync) ───────────────────
// Proxies the external dept-sync service (real org tree). dept-sync is an
// optional backend dependency: when it is not configured/unreachable the
// endpoints return 503 and the UI shows a "department service unavailable"
// notice instead of crashing.
export interface AdminDept {
  deptId: string
  deptName: string
  deptPath: string
  parentDeptId: string
  deptLevel: number
  childDeptCount: number
  leaderId: string
  orderNum: number
  children?: AdminDept[]
}

// One member of a department: the dept-sync record plus the correlated local
// user (linked === null when the dept-sync member has no costrict-web account).
export interface AdminDeptMember {
  userId: string
  username: string
  universalId: string
  isMain: boolean
  position: string
  registered: boolean
  linked: {
    subjectId: string
    displayName: string
    email: string
    avatarUrl: string
    organization: string
    status: AdminUserStatus
    roles: string[]
  } | null
}

export const adminDeptApi = {
  tree: () => apiFetch<{ departments: AdminDept[] }>("/api/admin/departments/tree"),

  // Lazy-load one level of the department tree: the direct children of `parentId`
  // (depth-1, each carrying childDeptCount so the UI can show an expand affordance).
  // Omit parentId for the top-level roots.
  children: (parentId?: string) =>
    apiFetch<{ departments: AdminDept[] }>(
      `/api/admin/departments/children${parentId ? `?parentId=${encodeURIComponent(parentId)}` : ""}`,
    ),

  deptUsers: (id: string) =>
    apiFetch<{ members: AdminDeptMember[] }>(`/api/admin/departments/${encodeURIComponent(id)}/users`),
}

// ── Admin · Content management (M6) ────────────────────────────────────────
// Platform-admin moderation surface for capability items: a cross-registry list
// (all statuses by default), an across-author status switch (上下架), and an
// across-author delete. These target /api/admin/items/* (platform_admin gated),
// NOT the bare /api/items/:id paths — those now enforce author/admin ownership
// and are meant for the item's own author, while these are the admin override.
export type AdminItemStatus = "active" | "archived"

export interface AdminItem {
  id: string
  name: string
  itemType: string
  status: AdminItemStatus
  securityStatus: SecurityStatus
  experienceScore: number
  createdBy: string
  registryId: string
  repoName: string
  updatedAt: string
  createdAt: string
}

// Shared filter fields for the admin item list + CSV export. `missingSecurityEval`
// narrows to items NEVER security-evaluated (security_status=unscanned — a
// stricter set than the "unknown" group); `missingScore` to items with no
// positive experience score. Both AND-combine with the type/status/security
// filters, server-side.
export interface AdminItemFilter {
  type?: string
  status?: string
  securityStatus?: string
  search?: string
  createdBy?: string
  missingSecurityEval?: boolean
  missingScore?: boolean
}

function adminItemFilterParams(filter?: AdminItemFilter): URLSearchParams {
  const p = new URLSearchParams()
  if (filter?.type) p.set("type", filter.type)
  if (filter?.status) p.set("status", filter.status)
  if (filter?.securityStatus) p.set("securityStatus", filter.securityStatus)
  if (filter?.search) p.set("search", filter.search)
  if (filter?.createdBy) p.set("createdBy", filter.createdBy)
  if (filter?.missingSecurityEval) p.set("missingSecurityEval", "true")
  if (filter?.missingScore) p.set("missingScore", "true")
  return p
}

export const adminItemApi = {
  list: (filter?: AdminItemFilter & { page?: number; pageSize?: number }) => {
    const p = adminItemFilterParams(filter)
    if (filter?.page) p.set("page", String(filter.page))
    if (filter?.pageSize) p.set("pageSize", String(filter.pageSize))
    const qs = p.toString()
    return apiFetch<{ items: AdminItem[]; total: number; page: number; pageSize: number }>(
      `/api/admin/items${qs ? `?${qs}` : ""}`,
    )
  },

  // Build a browser-navigable CSV export URL honoring the same filters as list().
  // Downloaded via an <a download> click — auth rides the session cookie, so no
  // apiFetch wrapper is involved. Not paginated: the backend streams all matches.
  exportCsvUrl: (filter?: AdminItemFilter) => {
    const qs = adminItemFilterParams(filter).toString()
    return `${API_BASE}/api/admin/items/export.csv${qs ? `?${qs}` : ""}`
  },

  setStatus: (id: string, status: AdminItemStatus) =>
    apiFetch<{ success: boolean }>(`/api/admin/items/${encodeURIComponent(id)}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/admin/items/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // Batch delete (max 200 ids) in a single backend transaction: all succeed or
  // none do. `skipped` counts ids that no longer existed (e.g. a sub-skill
  // already removed via its parent plugin's cascade earlier in the same batch).
  batchRemove: (ids: string[]) =>
    apiFetch<{ success: boolean; deleted: number; skipped: number; skippedIds: string[] }>(
      "/api/admin/items/batch-delete",
      { method: "POST", body: JSON.stringify({ ids }) },
    ),

  // Batch take items online/offline (active|archived) in one transaction.
  batchSetStatus: (ids: string[], status: AdminItemStatus) =>
    apiFetch<{ success: boolean; updated: number; skipped: number; skippedIds: string[] }>(
      "/api/admin/items/batch-status",
      { method: "POST", body: JSON.stringify({ ids, status }) },
    ),
}

// ── Admin · Catalog bundle import ───────────────────────────────────────────
// Platform-admin surface to import a catalog bundle (skills / MCP / plugins) by
// re-fetchable URL (preferred) or file upload, preview it as a dry-run, then
// confirm to apply. Backed by /api/admin/import-* (platform_admin gated). The
// import runs asynchronously on a leader-elected runner, so the flow is
// submit → poll → (previewed) → confirm → poll → (success|failed).
export type ImportJobStatus =
  | "pending"
  | "running"
  | "previewed"
  | "success"
  | "failed"
  | "expired"
  | "cancelled"

// camelCase projection of the backend IngestResult. On a freshly-queued job the
// server returns an empty object, so every field is treated as optional here.
export interface ImportResult {
  bundleEntries?: number
  added?: number
  updated?: number
  metadataUpdated?: number
  skipped?: number
  deleted?: number
  failed?: number
  incomplete?: number
  errors?: string[]
  incompleteErrors?: string[]
  manifestSha256?: string
  generatedAt?: string
  durationMs?: number
}

export interface CapabilityImportJob {
  id: string
  sourceKind: "url" | "upload"
  sourceUrl?: string
  filename: string
  fileSize: number
  status: ImportJobStatus
  dryRun: boolean
  reparse: boolean
  triggerUser: string
  result: ImportResult
  errorMessage?: string
  retryCount: number
  maxAttempts: number
  scheduledAt: string
  startedAt?: string
  finishedAt?: string
  createdAt: string
  updatedAt: string
}

export interface ImportStatsRow {
  itemType: string
  count: number
}

// Error thrown by adminImportApi.confirm carrying the backend `code` so the
// caller can special-case `large_delete_unconfirmed` (apiFetch discards it).
export interface ImportConfirmError extends Error {
  code?: string
  status?: number
}

export const adminImportApi = {
  stats: () => apiFetch<{ byType: ImportStatsRow[]; total: number }>("/api/admin/import-stats"),

  createFromUrl: (sourceUrl: string, reparse: boolean) =>
    apiFetch<{ jobId: string; status: string }>("/api/admin/import-jobs", {
      method: "POST",
      body: JSON.stringify({ sourceUrl, reparse }),
    }),

  createFromFile: (file: File, reparse: boolean) => {
    const form = new FormData()
    form.append("file", file)
    form.append("reparse", reparse ? "true" : "false")
    return apiFetch<{ jobId: string; status: string }>("/api/admin/import-jobs", {
      method: "POST",
      body: form,
    })
  },

  get: (id: string) => apiFetch<CapabilityImportJob>(`/api/admin/import-jobs/${encodeURIComponent(id)}`),

  list: (page = 1, pageSize = 20) => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    return apiFetch<{ items: CapabilityImportJob[]; total: number; page: number; pageSize: number }>(
      `/api/admin/import-jobs?${p.toString()}`,
    )
  },

  // Promote a previewed dry-run to the real import. A 409 with
  // code=large_delete_unconfirmed means the take-offline ratio is high and the
  // caller must retry with confirmLargeDelete=true. That code lives only on the
  // raw response body (apiFetch discards it), so this does its own fetch and
  // rethrows an Error carrying `.code`.
  confirm: async (id: string, confirmLargeDelete = false): Promise<{ status: string }> => {
    const path = `/api/admin/import-jobs/${encodeURIComponent(id)}/confirm`
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmLargeDelete }),
    })
    if (!res.ok) {
      if (res.status === 401) onUnauthorized(path)
      const err = await res.json().catch(() => ({ error: res.statusText }))
      const wrapped: ImportConfirmError = Object.assign(
        new Error(err.error || err.message || `Request failed: ${res.status}`),
        { code: err.code as string | undefined, status: res.status },
      )
      throw wrapped
    }
    return res.json()
  },

  errorsLogUrl: (id: string) => `${API_BASE}/api/admin/import-jobs/${encodeURIComponent(id)}/errors.log`,
}

// ── Admin · Ops (M5): system notification channels ─────────────────────────
// System-level notification channels configured by platform admins. This is a
// DIFFERENT surface from `channelApi` (/api/channels, user two-way channels) and
// `notificationChannelApi` (/api/notification-channels, user one-way channels):
// it targets /api/admin/notification-channels (platform_admin gated), whose
// backend CRUD already exists (internal/notification). systemConfig is free-form
// JSON whose shape depends on `type` (wecom / webhook).
export interface SystemNotificationChannel {
  id: string
  type: string
  name: string
  workspaceId: string
  enabled: boolean
  systemConfig: Record<string, unknown>
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface SystemNotificationChannelCreateInput {
  type: string
  name: string
  workspaceId?: string
  systemConfig?: Record<string, unknown>
}

export interface SystemNotificationChannelUpdateInput {
  name?: string
  enabled?: boolean
  systemConfig?: Record<string, unknown>
}

export const adminNotificationChannelApi = {
  list: () =>
    apiFetch<{ channels: SystemNotificationChannel[] }>("/api/admin/notification-channels"),

  create: (data: SystemNotificationChannelCreateInput) =>
    apiFetch<{ channel: SystemNotificationChannel }>("/api/admin/notification-channels", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: SystemNotificationChannelUpdateInput) =>
    apiFetch<{ channel: SystemNotificationChannel }>(`/api/admin/notification-channels/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/admin/notification-channels/${id}`, { method: "DELETE" }),
}

// ── Admin · Ops (M5): system settings (feature flags / maintenance mode) ────
// Global system-level KV configured by platform admins. Backed by the new
// /api/admin/settings endpoints (internal/settings). Values are arbitrary JSON
// (bool for flags, string/object for richer config).
export const adminSettingsApi = {
  list: () => apiFetch<{ settings: Record<string, unknown> }>("/api/admin/settings"),

  update: (key: string, value: unknown) =>
    apiFetch<{ setting: { key: string; value: unknown; updatedBy: string } }>(
      `/api/admin/settings/${encodeURIComponent(key)}`,
      {
        method: "PUT",
        body: JSON.stringify({ value }),
      },
    ),
}

// ── Admin · Ops (M5): audit log ─────────────────────────────────────────────
// Read-only feed of management write-operations (enterprise / role / permission
// / distribution / channel / setting / announcement). Backed by the new
// /api/admin/audit-logs endpoint (internal/audit). Records are written
// fire-and-forget at each management write-site.
export interface AdminAuditLog {
  id: string
  actorId: string
  action: string
  targetType: string
  targetId: string
  payload: Record<string, unknown>
  createdAt: string
}

export const adminAuditApi = {
  list: (filter?: {
    action?: string
    actorId?: string
    targetType?: string
    from?: string
    to?: string
    page?: number
    pageSize?: number
  }) => {
    const p = new URLSearchParams()
    if (filter?.action) p.set("action", filter.action)
    if (filter?.actorId) p.set("actorId", filter.actorId)
    if (filter?.targetType) p.set("targetType", filter.targetType)
    if (filter?.from) p.set("from", filter.from)
    if (filter?.to) p.set("to", filter.to)
    if (filter?.page) p.set("page", String(filter.page))
    if (filter?.pageSize) p.set("pageSize", String(filter.pageSize))
    const qs = p.toString()
    return apiFetch<{ logs: AdminAuditLog[]; total: number; page: number; pageSize: number }>(
      `/api/admin/audit-logs${qs ? `?${qs}` : ""}`,
    )
  },
}

// ── Admin · Ops (M5): announcements / broadcast ─────────────────────────────
// Send an in-app announcement to all users / an organization / a single user.
// Backed by the new /api/admin/announcements endpoint (internal/notification
// Broadcast helper). Returns the number of recipients reached.
export interface AnnouncementPayload {
  scope: { type: "all" | "organization" | "user"; targetId?: string }
  title: string
  content: string
  pushExternal?: boolean
}

export const adminAnnouncementApi = {
  send: (payload: AnnouncementPayload) =>
    apiFetch<{ sentCount: number }>("/api/admin/announcements", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
}

export interface ChannelConfig {
  id: string
  userId: string
  channelType: string
  name: string
  enabled: boolean
  config: Record<string, string>
  webhookVerified: boolean
  lastActiveAt?: string
  lastError?: string
  botQRCode?: string
  createdAt: string
  updatedAt: string
}

export interface ChannelType {
  type: string
  capabilities: {
    inboundMessages: boolean
    outboundMessages: boolean
    directChat: boolean
    groupChat: boolean
    markdown: boolean
    media: boolean
    contentTypes: string[]
  }
  schema: Array<{
    key: string
    label: string
    type: string
    required: boolean
    placeholder?: string
    helpText?: string
  }>
}

export const channelApi = {
  list: () =>
    apiFetch<{ channels: ChannelConfig[] }>("/api/channels").then((res) => res.channels ?? []),

  get: (id: string) =>
    apiFetch<{ channel: ChannelConfig; webhookUrl: string }>(`/api/channels/${id}`),

  create: (data: { channelType: string; name: string; config: Record<string, string> }) =>
    apiFetch<{ channel: ChannelConfig; webhookUrl: string }>("/api/channels", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: { name?: string; config?: Record<string, string>; enabled?: boolean }) =>
    apiFetch<{ channel: ChannelConfig; webhookUrl: string }>(`/api/channels/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/channels/${id}`, { method: "DELETE" }),

  test: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/channels/${id}/test`, { method: "POST" }),

  available: () =>
    apiFetch<{ channelTypes: ChannelType[] }>("/api/channels/available"),

  wechatQRCode: () =>
    apiFetch<{ qrcode: string; qrcodeImageUrl: string }>("/api/channels/wechat/login/qrcode", {
      method: "POST",
    }),

  wechatLoginStatus: (qrcode: string) =>
    apiFetch<{ status: string; token?: string }>(
      `/api/channels/wechat/login/status?qrcode=${encodeURIComponent(qrcode)}`,
    ),
}

export const updateApi = {
  check: (platform: string, version: string) =>
    apiFetch<UpdateCheckResponse>(`/api/updates/check?platform=${encodeURIComponent(platform)}&version=${encodeURIComponent(version)}`),

  sendCommand: (deviceId: string, cmd: DeviceCommandRequest) =>
    apiFetch<DeviceCommandAck>(`/cloud/device/${deviceId}/proxy/api/v1/commands`, {
      method: "POST",
      body: JSON.stringify(cmd),
    }),

  getCommandStatus: async (deviceId: string, commandId: string): Promise<CommandStatusResponse | null> => {
    const res = await fetch(`${API_BASE}/cloud/device/${deviceId}/proxy/api/v1/commands/status?command_id=${encodeURIComponent(commandId)}`, { headers: { "Content-Type": "application/json" } })
    if (res.status === 404) return null
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || err.message || `Request failed: ${res.status}`)
    }
    const json = await res.json()
    return json?.data ?? json
  },
}

export const pluginApi = {
  upload: (repoId: string, file: File, onProgress?: (p: number) => void) => {
    return new Promise<CapabilityItem>((resolve, reject) => {
      const form = new FormData()
      form.append("repo_id", repoId)
      form.append("file", file)

      const xhr = new XMLHttpRequest()
      xhr.open("POST", `${API_BASE}/api/plugins/upload`)
      xhr.withCredentials = true

      if (onProgress) {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            onProgress(e.loaded / e.total)
          }
        })
      }

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText))
        } else {
          let err: any
          try {
            err = JSON.parse(xhr.responseText)
          } catch {
            err = { error: xhr.statusText }
          }
          reject(new Error(err.error || err.message || `Request failed: ${xhr.status}`))
        }
      })
      xhr.addEventListener("error", () => reject(new Error("Network error")))
      xhr.send(form)
    })
  },
  listBuiltin: (page = 1, pageSize = 20) =>
    apiFetch<{ items: CapabilityItem[]; total: number; page: number; pageSize: number }>(
      `/api/plugins/builtin?page=${page}&pageSize=${pageSize}`,
    ),
}
