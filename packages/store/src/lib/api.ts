// In dev the Vite proxy forwards /api/* to the real backend.
// Set VITE_API_URL only for standalone mode (packages/store dev server on port 3002).
const API_BASE = import.meta.env.VITE_API_URL ?? ""

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

export interface Organization {
  id: string
  name: string
  displayName: string
  description: string
  visibility: "public" | "private"
  orgType: "normal" | "sync"
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

export interface OrgMember {
  id: string
  orgId: string
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
  orgId: string
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

export interface CapabilityVersion {
  id: string
  itemId: string
  version: string
  commitMsg: string
  createdBy: string
  createdAt: string
}

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
  createdBy: string
  createdAt: string
  updatedAt: string
  registry?: CapabilityRegistry
  versions?: CapabilityVersion[]
  artifacts?: CapabilityArtifact[]
}

export interface OrgRegistryStatus {
  registryId: string
  name: string
  externalUrl: string
  syncStatus: string
  lastSyncedAt?: string
  lastSyncSha: string
  pendingJobs: number
}

export const orgRegistryApi = {
  list: (orgId: string) => apiFetch<{ registries: CapabilityRegistry[] }>(`/api/organizations/${orgId}/registries`),

  add: (orgId: string, data: CreateSyncRegistryInput) =>
    apiFetch<CapabilityRegistry>(`/api/organizations/${orgId}/registries`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (orgId: string, regId: string, data: Partial<CreateSyncRegistryInput> & { syncEnabled?: boolean }) =>
    apiFetch<CapabilityRegistry>(`/api/organizations/${orgId}/registries/${regId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  remove: (orgId: string, regId: string) =>
    apiFetch<{ message: string }>(`/api/organizations/${orgId}/registries/${regId}`, { method: "DELETE" }),
}

export const orgApi = {
  listMy: (userId: string) =>
    apiFetch<{ organizations: Organization[] }>(`/api/organizations/my?userId=${encodeURIComponent(userId)}`),

  create: (data: {
    name: string
    displayName?: string
    description?: string
    visibility?: string
    ownerId: string
    orgType?: "normal" | "sync"
    syncRegistry?: CreateSyncRegistryInput
    syncRegistries?: CreateSyncRegistryInput[]
  }) =>
    apiFetch<Organization | { organization: Organization; registries: CapabilityRegistry[] }>("/api/organizations", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: { name?: string; displayName?: string; description?: string; visibility?: string }) =>
    apiFetch<Organization>(`/api/organizations/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  delete: (id: string) => apiFetch<{ message: string }>(`/api/organizations/${id}`, { method: "DELETE" }),

  listMembers: (orgId: string) => apiFetch<{ members: OrgMember[] }>(`/api/organizations/${orgId}/members`),

  addMember: (orgId: string, data: { userId: string; username?: string; role?: string }) =>
    apiFetch<OrgMember>(`/api/organizations/${orgId}/members`, { method: "POST", body: JSON.stringify(data) }),

  removeMember: (orgId: string, userId: string) =>
    apiFetch<{ message: string }>(`/api/organizations/${orgId}/members/${userId}`, { method: "DELETE" }),
}

export const syncApi = {
  triggerOrgSync: (orgId: string, dryRun?: boolean, registryId?: string) => {
    const params = new URLSearchParams()
    if (dryRun) params.set("dryRun", "true")
    if (registryId) params.set("registryId", registryId)
    const qs = params.toString()
    return apiFetch<{
      jobId?: string
      status?: string
      jobs?: { jobId: string; registryId: string; status: string }[]
    }>(`/api/organizations/${orgId}/sync${qs ? "?" + qs : ""}`, { method: "POST" })
  },

  cancelOrgSync: (orgId: string, registryId?: string) => {
    const qs = registryId ? `?registryId=${registryId}` : ""
    return apiFetch<{ message: string }>(`/api/organizations/${orgId}/sync/cancel${qs}`, { method: "POST" })
  },

  getOrgSyncStatus: (orgId: string, registryId?: string) => {
    const qs = registryId ? `?registryId=${registryId}` : ""
    return apiFetch<SyncStatus | { registries: OrgRegistryStatus[] }>(`/api/organizations/${orgId}/sync-status${qs}`)
  },

  listOrgSyncLogs: (orgId: string, page = 1, pageSize = 20, registryId?: string) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (registryId) params.set("registryId", registryId)
    return apiFetch<{ logs: SyncLog[]; total: number }>(`/api/organizations/${orgId}/sync-logs?${params.toString()}`)
  },

  listOrgSyncJobs: (orgId: string, page = 1, pageSize = 20, registryId?: string) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (registryId) params.set("registryId", registryId)
    return apiFetch<{ jobs: SyncJob[]; total: number }>(`/api/organizations/${orgId}/sync-jobs?${params.toString()}`)
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
