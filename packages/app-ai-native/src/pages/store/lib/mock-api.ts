/**
 * Mock API interceptor for demo mode.
 *
 * Intercepts `apiFetch` calls and returns mock data based on URL pattern matching.
 * This module is only loaded when VITE_DEMO_MODE=true.
 */

import {
  filterMockItems,
  getMockItemById,
  getMockVersions,
  getMockScanResults,
  getMockTags,
  getMockUserInfo,
  getMockUserNames,
  getMockSearchedUsers,
  getMockDistributions,
  getMockReceipts,
  seedAdminDistributions,
  seedAdminReceipts,
  seedResourcePermissions,
  seedUserSystemRoles,
  seedPermissionGrants,
  seedAdminUsers,
  getMockAdminUserProfile,
  getMockAdminOrganizations,
  seedAdminDeptTree,
  getMockAdminDeptMembers,
  seedSystemNotificationChannels,
  seedSystemSettings,
  seedAuditLogs,
  seedAdminItems,
  seedEnterpriseCustomers,
  toAdminEnterprise,
  type DemoEnterpriseCustomer,
  ADMIN_ITEM_SECURITY_GROUPS,
  MOCK_CATEGORIES,
  MOCK_FILTER_OPTIONS,
  MOCK_REGISTRIES,
  MOCK_REPOSITORIES,
  MOCK_USER,
  MOCK_PERMISSIONS,
} from "./mock-data"
import { uuid } from "@/utils/uuid"
import type {
  AdminAuditLog,
  AdminItem,
  AdminUser,
  DistributionReceipt,
  DistributionResult,
  ResourcePermission,
  PermissionGrant,
  SystemNotificationChannel,
} from "./api"

/**
 * Parse URL path and query from a full URL string.
 */
function parseUrl(url: string): { path: string; params: URLSearchParams } {
  try {
    // Handle both absolute and relative URLs
    const u = new URL(url, "http://localhost")
    return { path: u.pathname, params: u.searchParams }
  } catch {
    const [path, qs = ""] = url.split("?")
    return { path: path ?? url, params: new URLSearchParams(qs) }
  }
}

/**
 * Extract a path segment after a given prefix.
 * e.g. extractSegment("/api/items/abc123/versions", "/api/items/") → "abc123"
 */
function extractSegment(path: string, prefix: string): string | undefined {
  if (!path.startsWith(prefix)) return undefined
  const rest = path.slice(prefix.length)
  const slashIdx = rest.indexOf("/")
  return slashIdx === -1 ? rest : rest.slice(0, slashIdx)
}

/**
 * Check if the path matches a sub-resource pattern.
 * e.g. matchesSubResource("/api/items/abc123/versions", "/api/items/", "/versions") → true
 */
function matchesSubResource(path: string, prefix: string, suffix: string): boolean {
  if (!path.startsWith(prefix)) return false
  const rest = path.slice(prefix.length)
  return rest.endsWith(suffix)
}

// Resolve a department's materialized dept_path from the seeded dept-sync tree.
// Mirrors the backend's GetDepartmentPath (tree walk) so department grants stored
// in demo mode carry the same dept_path used for prefix-based inheritance.
function findMockDeptPath(deptId: string): string {
  const walk = (nodes: { deptId: string; deptPath: string; children?: typeof nodes }[]): string => {
    for (const n of nodes) {
      if (n.deptId === deptId) return n.deptPath
      if (n.children?.length) {
        const found = walk(n.children)
        if (found) return found
      }
    }
    return ""
  }
  return walk(seedAdminDeptTree())
}

// In-memory enterprise customers store for demo mode. Customers are anchored on
// universal_id (matching the real backend) and back ONLY the admin read + admin CRUD,
// so the admin page + form people-picker render real-looking data in demo mode.
//
// The PUBLIC read (`GET /api/enterprise-customers`) deliberately returns an empty list
// (see below) — NOT this seed — so the store's one-shot ensureEnterpriseLoaded() keeps its
// built-in DEMO_FALLBACK branding (招行/工行/建行 with real logos + the blue 建行 control case)
// intact on first paint. Seeding the public read would blank out that curated demo branding.
let enterpriseCustomers: DemoEnterpriseCustomer[] = seedEnterpriseCustomers()

// ── In-memory admin-console stores (M1/M2/M3/M5) ──────────────────────────
// Seeded non-empty so each admin page renders real-looking data on first paint;
// write operations mutate these arrays/maps so demo CRUD behaves like the real
// backend (changes persist for the lifetime of the page session).
type AdminDistribution = DistributionResult["distribution"] & { status: string }
let adminDistributions: AdminDistribution[] = seedAdminDistributions()
const adminReceipts: Record<string, DistributionReceipt[]> = seedAdminReceipts()
const resourcePermissions: ResourcePermission[] = seedResourcePermissions()
const userSystemRoles: Record<string, string[]> = seedUserSystemRoles()
let permissionGrants: PermissionGrant[] = seedPermissionGrants()
let adminUsers: AdminUser[] = seedAdminUsers()
let notificationChannels: SystemNotificationChannel[] = seedSystemNotificationChannels()
const systemSettings: Record<string, unknown> = seedSystemSettings()
const auditLogs: AdminAuditLog[] = seedAuditLogs()
let adminItems: AdminItem[] = seedAdminItems()

/**
 * Mock implementation of apiFetch that returns appropriate mock data.
 */
export async function mockApiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const { path, params } = parseUrl(url)
  const method = (options?.method || "GET").toUpperCase()

  // Simulate network latency (50-150ms)
  await new Promise((r) => setTimeout(r, 50 + Math.random() * 100))

  // ── Auth ────────────────────────────────────────────────────────────────
  if (path.endsWith("/api/auth/me")) {
    return { user: MOCK_USER } as T
  }
  if (path.endsWith("/api/auth/permissions")) {
    return MOCK_PERMISSIONS as T
  }
  if (path.endsWith("/api/auth/logout")) {
    return { success: true } as T
  }

  // ── Items ───────────────────────────────────────────────────────────────
  // GET /api/items/filter-options
  if (path.endsWith("/api/items/filter-options")) {
    return MOCK_FILTER_OPTIONS as T
  }

  // GET /api/items/my?type=...&page=...
  if (path.endsWith("/api/items/my") || path.includes("/api/items/my?")) {
    const result = filterMockItems({
      type: params.get("type") ?? undefined,
      search: params.get("search") ?? undefined,
      categories: params.get("categories")?.split(","),
      source: params.get("source")?.split(","),
      tags: params.get("tags")?.split(","),
      securityStatuses: params.get("securityStatuses")?.split(","),
      page: params.get("page") ? Number(params.get("page")) : undefined,
      pageSize: params.get("pageSize") ? Number(params.get("pageSize")) : undefined,
      sortBy: params.get("sortBy") ?? undefined,
      sortOrder: params.get("sortOrder") ?? undefined,
    })
    return { items: result.items.filter((i) => i.createdBy === MOCK_USER.id), total: result.items.length } as T
  }

  // POST /api/items/:id/favorite
  if (matchesSubResource(path, "/api/items/", "/favorite") && method === "POST") {
    const id = extractSegment(path, "/api/items/")?.replace(/\/favorite$/, "")
    const item = id ? getMockItemById(id) : undefined
    return { favorited: true, created: true, favoriteCount: (item?.favoriteCount ?? 0) + 1 } as T
  }

  // DELETE /api/items/:id/favorite
  if (matchesSubResource(path, "/api/items/", "/favorite") && method === "DELETE") {
    const id = extractSegment(path, "/api/items/")?.replace(/\/favorite$/, "")
    const item = id ? getMockItemById(id) : undefined
    return { favorited: false, removed: true, favoriteCount: Math.max(0, (item?.favoriteCount ?? 1) - 1) } as T
  }

  // POST /api/items/:id/behavior (no-op)
  if (matchesSubResource(path, "/api/items/", "/behavior")) {
    return {} as T
  }

  // GET /api/items/:id/versions
  if (matchesSubResource(path, "/api/items/", "/versions")) {
    const id = extractSegment(path, "/api/items/")
    return { versions: getMockVersions(id ?? "") } as T
  }

  // GET /api/items/:id/assets
  if (matchesSubResource(path, "/api/items/", "/assets")) {
    return { assets: [] } as T
  }

  // GET /api/items/:id/scan-results
  if (matchesSubResource(path, "/api/items/", "/scan-results")) {
    const id = extractSegment(path, "/api/items/")
    return { results: getMockScanResults(id ?? ""), total: 1 } as T
  }

  // GET /api/items/:id/scan-status
  if (matchesSubResource(path, "/api/items/", "/scan-status")) {
    return {
      scanStatus: "clean",
      lastScannedAt: new Date(Date.now() - 86400000).toISOString(),
      latestResult: {
        id: "scan-1", riskLevel: "low", verdict: "pass",
        summary: "No issues found", scanModel: "claude-sonnet-4-20250514",
      },
    } as T
  }

  // GET /api/items/:id/artifacts
  if (matchesSubResource(path, "/api/items/", "/artifacts")) {
    return { artifacts: [] } as T
  }

  // GET /api/items/:id/distributions
  if (matchesSubResource(path, "/api/items/", "/distributions")) {
    return { distributions: getMockDistributions() } as T
  }

  // POST /api/items/:id/distribute — create one distribution per target, append
  // to the admin store, and return DistributionResult[] (with recipientCount so
  // the wizard's success summary tallies correctly).
  if (matchesSubResource(path, "/api/items/", "/distribute") && method === "POST") {
    const id = extractSegment(path, "/api/items/")?.replace(/\/distribute$/, "")
    const item = id ? getMockItemById(id) : undefined
    const body = options?.body ? JSON.parse(options.body as string) : {}
    const targets: { scopeType: string; targetId: string }[] = body.targets ?? []
    const created: DistributionResult[] = targets.map((t, i) => {
      const dist: AdminDistribution = {
        id: `adist-${Date.now()}-${i}`,
        itemId: id ?? "",
        distributorId: MOCK_USER.id,
        permissionMode: body.permissionMode ?? "readonly",
        status: "active",
        scopeType: t.scopeType,
        targetId: t.targetId,
        message: body.message,
        createdAt: new Date().toISOString(),
        item,
      }
      adminDistributions = [dist, ...adminDistributions]
      return { distribution: dist, recipientCount: 1 }
    })
    return { distributions: created } as T
  }

  // GET /api/items/:id (specific item)
  const itemId = extractSegment(path, "/api/items/")
  if (itemId && path.match(/^\/api\/items\/[^/]+\/?$/) && method === "GET") {
    const item = getMockItemById(itemId)
    if (item) return item as T
    throw new Error(`Item not found: ${itemId}`)
  }

  // GET /api/items?... (list)
  if (path.endsWith("/api/items") && method === "GET") {
    const result = filterMockItems({
      type: params.get("type") ?? undefined,
      search: params.get("search") ?? undefined,
      category: params.get("category") ?? undefined,
      categories: params.get("categories")?.split(","),
      source: params.get("source")?.split(","),
      tags: params.get("tags")?.split(","),
      securityStatuses: params.get("securityStatuses")?.split(","),
      registryId: params.get("registryId") ?? undefined,
      page: params.get("page") ? Number(params.get("page")) : undefined,
      pageSize: params.get("pageSize") ? Number(params.get("pageSize")) : undefined,
      status: params.get("status") ?? undefined,
      sortBy: params.get("sortBy") ?? undefined,
      sortOrder: params.get("sortOrder") ?? undefined,
      favorited: params.get("favorited") === "true",
      paginated: params.get("paginated") === "true",
    })
    return result as T
  }

  // POST /api/items (create) - mock success
  if (path.endsWith("/api/items") && method === "POST") {
    const body = options?.body ? JSON.parse(options.body as string) : {}
    return {
      id: `mock-new-${Date.now()}`,
      ...body,
      createdBy: MOCK_USER.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as T
  }

  // ── Categories ──────────────────────────────────────────────────────────
  if (path.endsWith("/api/categories")) {
    return { categories: MOCK_CATEGORIES } as T
  }

  // ── Tags ────────────────────────────────────────────────────────────────
  if (path.endsWith("/api/tags") || path.includes("/api/tags?")) {
    return getMockTags({
      query: params.get("q") ?? undefined,
      page: params.get("page") ? Number(params.get("page")) : undefined,
      pageSize: params.get("pageSize") ? Number(params.get("pageSize")) : undefined,
      tagClass: params.get("tagClass") ?? undefined,
    }) as T
  }

  // ── Users ───────────────────────────────────────────────────────────────
  if (path.endsWith("/api/users/search") || path.includes("/api/users/search?")) {
    return { users: getMockSearchedUsers(params.get("q") ?? "") } as T
  }
  if (path.endsWith("/api/users/names") || path.includes("/api/users/names?")) {
    const ids = (params.get("ids") ?? "").split(",").filter(Boolean)
    return { names: getMockUserNames(ids) } as T
  }
  if (path.endsWith("/api/users/info") || path.includes("/api/users/info?")) {
    const id = params.get("id") ?? ""
    return { user: getMockUserInfo(id) } as T
  }

  // ── Repositories ────────────────────────────────────────────────────────
  if (path.endsWith("/api/repositories/my")) {
    return { repositories: MOCK_REPOSITORIES } as T
  }
  if (path.includes("/api/repositories/") && path.includes("/members")) {
    return { members: [] } as T
  }
  if (path.includes("/api/repositories/") && path.includes("/registries")) {
    return { registries: MOCK_REGISTRIES } as T
  }

  // ── Registries ──────────────────────────────────────────────────────────
  if (path.endsWith("/api/registries/public")) {
    return MOCK_REGISTRIES[0] as T
  }
  if (path.endsWith("/api/registries/my") || path.includes("/api/registries/my?")) {
    return { registries: MOCK_REGISTRIES } as T
  }

  // ── Distributions ───────────────────────────────────────────────────────
  if (path.endsWith("/api/distributions/my/sent")) {
    return { distributions: getMockDistributions() } as T
  }
  if (path.endsWith("/api/distributions/my/received")) {
    return { receipts: getMockReceipts() } as T
  }

  // PUT /api/distributions/:id — update status / permissionMode / message.
  if (matchesSubResource(path, "/api/distributions/", "") && method === "PUT") {
    const id = extractSegment(path, "/api/distributions/")
    const body = options?.body ? JSON.parse(options.body as string) : {}
    const dist = adminDistributions.find((d) => d.id === id)
    if (!dist) throw new Error(`Distribution not found: ${id}`)
    if (body.status !== undefined) dist.status = body.status
    if (body.permissionMode !== undefined) dist.permissionMode = body.permissionMode
    if (body.message !== undefined) dist.message = body.message
    return { ...dist } as T
  }

  // DELETE /api/distributions/:id — revoke (mark status=revoked).
  if (matchesSubResource(path, "/api/distributions/", "") && method === "DELETE") {
    const id = extractSegment(path, "/api/distributions/")
    const dist = adminDistributions.find((d) => d.id === id)
    if (dist) dist.status = "revoked"
    return { message: "revoked" } as T
  }

  // ── Admin · Distributions (M3) ────────────────────────────────────────────
  // GET /api/admin/distributions?status&scope&search&page&pageSize
  if ((path.endsWith("/api/admin/distributions") || path.includes("/api/admin/distributions?")) && method === "GET") {
    const status = params.get("status") ?? ""
    const scope = params.get("scope") ?? ""
    const search = (params.get("search") ?? "").toLowerCase()
    let rows = adminDistributions
    if (status) rows = rows.filter((d) => d.status === status)
    if (scope) rows = rows.filter((d) => d.scopeType === scope)
    if (search) rows = rows.filter((d) => (d.item?.name ?? d.itemId).toLowerCase().includes(search) || d.targetId.toLowerCase().includes(search))
    const page = params.get("page") ? Number(params.get("page")) : 1
    const pageSize = params.get("pageSize") ? Number(params.get("pageSize")) : 20
    const start = (page - 1) * pageSize
    return { distributions: rows.slice(start, start + pageSize).map((d) => ({ ...d })), total: rows.length } as T
  }

  // GET /api/admin/distributions/:id/receipts
  if (matchesSubResource(path, "/api/admin/distributions/", "/receipts") && method === "GET") {
    const rest = path.slice("/api/admin/distributions/".length)
    const id = rest.replace(/\/receipts$/, "")
    return { receipts: (adminReceipts[id] ?? []).map((r) => ({ ...r })) } as T
  }

  // ── Search ──────────────────────────────────────────────────────────────
  if (path.endsWith("/api/marketplace/items/search") && method === "POST") {
    const body = options?.body ? JSON.parse(options.body as string) : {}
    const result = filterMockItems({
      search: body.query,
      type: body.types?.[0],
      categories: body.categories,
      page: body.page,
      pageSize: body.pageSize,
    })
    return { ...result, query: body.query ?? "", durationMs: 42 } as T
  }

  // ── Devices ─────────────────────────────────────────────────────────────
  if (path.endsWith("/api/devices") || path.includes("/api/devices?")) {
    return { devices: [] } as T
  }

  // ── Notification Channels ───────────────────────────────────────────────
  if (path.endsWith("/api/notification-channels") && method === "GET") {
    return { channels: [] } as T
  }
  if (path.endsWith("/api/notification-channels/available")) {
    return { channelTypes: [] } as T
  }

  // ── Channels ────────────────────────────────────────────────────────────
  if (path.endsWith("/api/channels") && method === "GET") {
    return { channels: [] } as T
  }
  if (path.endsWith("/api/channels/available")) {
    return { channelTypes: [] } as T
  }

  // ── Sync (no-op) ───────────────────────────────────────────────────────
  if (path.includes("/sync-status") || path.includes("/sync-logs") || path.includes("/sync-jobs")) {
    if (path.includes("/sync-logs")) return { logs: [], total: 0 } as T
    if (path.includes("/sync-jobs")) return { jobs: [], total: 0 } as T
    return { syncStatus: "idle", lastSyncSha: "", pendingJobs: 0 } as T
  }

  // ── Updates ─────────────────────────────────────────────────────────────
  if (path.includes("/api/updates/check")) {
    return { hasUpdate: false, currentVersion: "1.0.0" } as T
  }

  // ── Admin · Permission management (M2) ────────────────────────────────────
  // GET /api/admin/resource-permissions
  if (path.endsWith("/api/admin/resource-permissions") && method === "GET") {
    return { permissions: resourcePermissions.map((p) => ({ ...p, allowedRoles: [...p.allowedRoles] })) } as T
  }
  // PUT /api/admin/resource-permissions/:code
  if (matchesSubResource(path, "/api/admin/resource-permissions/", "") && method === "PUT") {
    const code = decodeURIComponent(extractSegment(path, "/api/admin/resource-permissions/") ?? "")
    const body = options?.body ? JSON.parse(options.body as string) : {}
    const row = resourcePermissions.find((p) => p.resourceCode === code)
    if (row) row.allowedRoles = Array.isArray(body.allowedRoles) ? body.allowedRoles : []
    return { success: true } as T
  }

  // Fine-grained permission grants (mentor RBAC Phase 2).
  // GET /api/admin/permission-grants?permissionCode=
  if (path.endsWith("/api/admin/permission-grants") && method === "GET") {
    const code = params.get("permissionCode") ?? ""
    const rows = code ? permissionGrants.filter((g) => g.permissionCode === code) : permissionGrants
    return { grants: rows.map((g) => ({ ...g })) } as T
  }
  // POST /api/admin/permission-grants  body {permissionCode,subjectType,subjectId}
  if (path.endsWith("/api/admin/permission-grants") && method === "POST") {
    const body = options?.body ? JSON.parse(options.body as string) : {}
    const permissionCode = String(body.permissionCode ?? "").trim()
    const subjectType = body.subjectType === "department" ? "department" : "user"
    const subjectId = String(body.subjectId ?? "").trim()
    // Department grants store the materialized dept_path so descendants inherit.
    const deptPath = subjectType === "department" ? findMockDeptPath(subjectId) : ""
    // Idempotent: return the existing grant if (code,type,id) already exists.
    const existing = permissionGrants.find(
      (g) => g.permissionCode === permissionCode && g.subjectType === subjectType && g.subjectId === subjectId,
    )
    if (existing) return { grant: { ...existing } } as T
    const grant: PermissionGrant = {
      id: `pg-${Date.now()}`,
      permissionCode,
      subjectType,
      subjectId,
      deptPath,
      grantedBy: MOCK_USER.subjectId,
      createdAt: new Date().toISOString(),
    }
    permissionGrants = [grant, ...permissionGrants]
    return { grant: { ...grant } } as T
  }
  // DELETE /api/admin/permission-grants/:id
  if (matchesSubResource(path, "/api/admin/permission-grants/", "") && method === "DELETE") {
    const id = decodeURIComponent(extractSegment(path, "/api/admin/permission-grants/") ?? "")
    permissionGrants = permissionGrants.filter((g) => g.id !== id)
    return { success: true } as T
  }

  // System roles (per-user grant/revoke).
  // GET /api/admin/system-roles/users/:id
  if (matchesSubResource(path, "/api/admin/system-roles/users/", "") && method === "GET") {
    const userId = decodeURIComponent(extractSegment(path, "/api/admin/system-roles/users/") ?? "")
    return { userId, roles: [...(userSystemRoles[userId] ?? [])] } as T
  }
  // POST /api/admin/system-roles/users/:id  body {role}
  if (matchesSubResource(path, "/api/admin/system-roles/users/", "") && method === "POST") {
    const userId = decodeURIComponent(extractSegment(path, "/api/admin/system-roles/users/") ?? "")
    const body = options?.body ? JSON.parse(options.body as string) : {}
    const current = userSystemRoles[userId] ?? []
    if (body.role && !current.includes(body.role)) userSystemRoles[userId] = [...current, body.role]
    return { success: true } as T
  }
  // DELETE /api/admin/system-roles/users/:id/:role
  if (path.includes("/api/admin/system-roles/users/") && method === "DELETE") {
    const rest = path.slice("/api/admin/system-roles/users/".length)
    const [rawUserId, rawRole] = rest.split("/")
    const userId = decodeURIComponent(rawUserId ?? "")
    const role = decodeURIComponent(rawRole ?? "")
    if (userSystemRoles[userId]) userSystemRoles[userId] = userSystemRoles[userId].filter((r) => r !== role)
    return { success: true } as T
  }

  // ── Admin · Member management (M1) ────────────────────────────────────────
  // GET /api/admin/users/:id/profile
  if (matchesSubResource(path, "/api/admin/users/", "/profile") && method === "GET") {
    const rest = path.slice("/api/admin/users/".length)
    const id = decodeURIComponent(rest.replace(/\/profile$/, ""))
    const user = adminUsers.find((u) => u.subject_id === id)
    if (!user) throw new Error(`User not found: ${id}`)
    return { user: { ...user, roles: [...user.roles] }, profile: getMockAdminUserProfile(id) } as T
  }
  // PUT /api/admin/users/:id/status  body {status}
  if (matchesSubResource(path, "/api/admin/users/", "/status") && method === "PUT") {
    const rest = path.slice("/api/admin/users/".length)
    const id = decodeURIComponent(rest.replace(/\/status$/, ""))
    const body = options?.body ? JSON.parse(options.body as string) : {}
    const user = adminUsers.find((u) => u.subject_id === id)
    if (user && body.status) user.status = body.status
    return { success: true } as T
  }
  // GET /api/admin/organizations
  if (path.endsWith("/api/admin/organizations") && method === "GET") {
    return { organizations: getMockAdminOrganizations(adminUsers) } as T
  }

  // ── Admin · Department tree (M1, dept-sync proxy) ─────────────────────────
  // GET /api/admin/departments/tree
  if (path.endsWith("/api/admin/departments/tree") && method === "GET") {
    return { departments: seedAdminDeptTree() } as T
  }
  // GET /api/admin/departments/children?parentId= — depth-1 lazy load (empty = roots).
  // Mirrors the backend: slice the seeded full tree to one level, dropping deeper
  // children so the org tab's lazy expand works the same in demo mode.
  if (path.endsWith("/api/admin/departments/children") && method === "GET") {
    const parentId = params.get("parentId") ?? ""
    const tree = seedAdminDeptTree()
    const find = (nodes: typeof tree, id: string): (typeof tree)[number] | undefined => {
      for (const n of nodes) {
        if (n.deptId === id) return n
        const hit = n.children && find(n.children, id)
        if (hit) return hit
      }
      return undefined
    }
    const level = parentId ? (find(tree, parentId)?.children ?? []) : tree
    return { departments: level.map((n) => ({ ...n, children: undefined })) } as T
  }
  // GET /api/admin/departments/:id/users
  if (matchesSubResource(path, "/api/admin/departments/", "/users") && method === "GET") {
    const rest = path.slice("/api/admin/departments/".length)
    const id = decodeURIComponent(rest.replace(/\/users$/, ""))
    return { members: getMockAdminDeptMembers(id, adminUsers) } as T
  }
  // GET /api/admin/users?search&status&organization&page&pageSize
  if ((path.endsWith("/api/admin/users") || path.includes("/api/admin/users?")) && method === "GET") {
    const search = (params.get("search") ?? "").toLowerCase()
    const status = params.get("status") ?? ""
    const organization = params.get("organization") ?? ""
    let rows = adminUsers
    if (search)
      rows = rows.filter(
        (u) =>
          u.username.toLowerCase().includes(search) ||
          u.displayName.toLowerCase().includes(search) ||
          u.email.toLowerCase().includes(search),
      )
    if (status) rows = rows.filter((u) => u.status === status)
    if (organization) rows = rows.filter((u) => u.organization === organization)
    const page = params.get("page") ? Number(params.get("page")) : 1
    const pageSize = params.get("pageSize") ? Number(params.get("pageSize")) : 20
    const start = (page - 1) * pageSize
    return {
      users: rows.slice(start, start + pageSize).map((u) => ({ ...u, roles: [...u.roles] })),
      total: rows.length,
      page,
      pageSize,
    } as T
  }

  // ── Admin · Ops (M5) ──────────────────────────────────────────────────────
  // System notification channels.
  if (path.endsWith("/api/admin/notification-channels") && method === "GET") {
    return { channels: notificationChannels.map((c) => ({ ...c, systemConfig: { ...c.systemConfig } })) } as T
  }
  if (path.endsWith("/api/admin/notification-channels") && method === "POST") {
    const body = options?.body ? JSON.parse(options.body as string) : {}
    const now = new Date().toISOString()
    const channel: SystemNotificationChannel = {
      id: uuid(),
      type: body.type ?? "wecom",
      name: body.name ?? "",
      workspaceId: body.workspaceId ?? "ws-default",
      enabled: true,
      systemConfig: body.systemConfig ?? {},
      createdBy: MOCK_USER.id,
      createdAt: now,
      updatedAt: now,
    }
    notificationChannels = [...notificationChannels, channel]
    return { channel: { ...channel, systemConfig: { ...channel.systemConfig } } } as T
  }
  if (matchesSubResource(path, "/api/admin/notification-channels/", "") && method === "PUT") {
    const id = extractSegment(path, "/api/admin/notification-channels/")
    const body = options?.body ? JSON.parse(options.body as string) : {}
    const channel = notificationChannels.find((c) => c.id === id)
    if (!channel) throw new Error(`Notification channel not found: ${id}`)
    if (body.name !== undefined) channel.name = body.name
    if (body.enabled !== undefined) channel.enabled = body.enabled
    if (body.systemConfig !== undefined) channel.systemConfig = body.systemConfig
    channel.updatedAt = new Date().toISOString()
    return { channel: { ...channel, systemConfig: { ...channel.systemConfig } } } as T
  }
  if (matchesSubResource(path, "/api/admin/notification-channels/", "") && method === "DELETE") {
    const id = extractSegment(path, "/api/admin/notification-channels/")
    notificationChannels = notificationChannels.filter((c) => c.id !== id)
    return { success: true } as T
  }

  // System settings (KV).
  if (path.endsWith("/api/admin/settings") && method === "GET") {
    return { settings: { ...systemSettings } } as T
  }
  if (matchesSubResource(path, "/api/admin/settings/", "") && method === "PUT") {
    const key = decodeURIComponent(extractSegment(path, "/api/admin/settings/") ?? "")
    const body = options?.body ? JSON.parse(options.body as string) : {}
    systemSettings[key] = body.value
    return { setting: { key, value: body.value, updatedBy: MOCK_USER.id } } as T
  }

  // Audit logs.
  if ((path.endsWith("/api/admin/audit-logs") || path.includes("/api/admin/audit-logs?")) && method === "GET") {
    const action = params.get("action") ?? ""
    const from = params.get("from") ?? ""
    const to = params.get("to") ?? ""
    let rows = auditLogs
    if (action) rows = rows.filter((l) => l.action === action)
    if (from) rows = rows.filter((l) => l.createdAt >= from)
    if (to) rows = rows.filter((l) => l.createdAt <= `${to}T23:59:59.999Z`)
    const page = params.get("page") ? Number(params.get("page")) : 1
    const pageSize = params.get("pageSize") ? Number(params.get("pageSize")) : 20
    const start = (page - 1) * pageSize
    return { logs: rows.slice(start, start + pageSize).map((l) => ({ ...l })), total: rows.length, page, pageSize } as T
  }

  // Announcements (broadcast).
  if (path.endsWith("/api/admin/announcements") && method === "POST") {
    const body = options?.body ? JSON.parse(options.body as string) : {}
    const scopeType = body?.scope?.type ?? "all"
    const sentCount = scopeType === "user" ? 1 : scopeType === "organization" ? 24 : adminUsers.length
    auditLogs.unshift({
      id: uuid(),
      actorId: MOCK_USER.id,
      action: "announcement.send",
      targetType: "announcement",
      targetId: "broadcast",
      payload: { scope: scopeType, sentCount },
      createdAt: new Date().toISOString(),
    })
    return { sentCount } as T
  }

  // ── Admin · Content management (M6) ───────────────────────────────────────
  // PUT /api/admin/items/:id/status  body {status}
  if (matchesSubResource(path, "/api/admin/items/", "/status") && method === "PUT") {
    const rest = path.slice("/api/admin/items/".length)
    const id = decodeURIComponent(rest.replace(/\/status$/, ""))
    const body = options?.body ? JSON.parse(options.body as string) : {}
    const item = adminItems.find((i) => i.id === id)
    if (item && (body.status === "active" || body.status === "archived")) item.status = body.status
    return { success: true } as T
  }
  // DELETE /api/admin/items/:id
  if (matchesSubResource(path, "/api/admin/items/", "") && method === "DELETE") {
    const id = decodeURIComponent(extractSegment(path, "/api/admin/items/") ?? "")
    adminItems = adminItems.filter((i) => i.id !== id)
    return { success: true } as T
  }
  // GET /api/admin/items?type&status&securityStatus&search&createdBy&page&pageSize
  if ((path.endsWith("/api/admin/items") || path.includes("/api/admin/items?")) && method === "GET") {
    const type = params.get("type") ?? ""
    const status = params.get("status") ?? ""
    const security = params.get("securityStatus") ?? ""
    const search = (params.get("search") ?? "").toLowerCase()
    const createdBy = params.get("createdBy") ?? ""
    let rows = adminItems
    if (type) rows = rows.filter((i) => i.itemType === type)
    if (status) rows = rows.filter((i) => i.status === status)
    if (security) {
      const allowed = ADMIN_ITEM_SECURITY_GROUPS[security] ?? [security]
      rows = rows.filter((i) => allowed.includes(i.securityStatus))
    }
    if (createdBy) rows = rows.filter((i) => i.createdBy === createdBy)
    if (search) rows = rows.filter((i) => i.name.toLowerCase().includes(search))
    const page = params.get("page") ? Number(params.get("page")) : 1
    const pageSize = params.get("pageSize") ? Number(params.get("pageSize")) : 20
    const start = (page - 1) * pageSize
    return {
      items: rows.slice(start, start + pageSize).map((i) => ({ ...i })),
      total: rows.length,
      page,
      pageSize,
    } as T
  }

  // ── Enterprise customers (大客户) ─────────────────────────────────────────
  // body.ids = universal_id list (anchored identity). The admin read resolves it
  // into a member roster; the public read resolves it to subject_id[] for store
  // branding.
  // GET /api/admin/enterprise-customers (admin read: universalIds + members)
  if (path.endsWith("/api/admin/enterprise-customers") && method === "GET") {
    return { customers: enterpriseCustomers.map((e) => toAdminEnterprise(e)) } as T
  }
  // POST /api/admin/enterprise-customers (create)
  if (path.endsWith("/api/admin/enterprise-customers") && method === "POST") {
    const body = options?.body ? JSON.parse(options.body as string) : {}
    const c: DemoEnterpriseCustomer = {
      id: uuid(),
      name: body.name,
      logo: body.logo,
      ids: body.ids ?? [],
    }
    enterpriseCustomers.push(c)
    return { customer: toAdminEnterprise(c) } as T
  }
  // PUT /api/admin/enterprise-customers/:id (update)
  if (matchesSubResource(path, "/api/admin/enterprise-customers/", "") && method === "PUT") {
    const id = extractSegment(path, "/api/admin/enterprise-customers/")
    const body = options?.body ? JSON.parse(options.body as string) : {}
    const existing = enterpriseCustomers.find((e) => e.id === id)
    if (!existing) throw new Error(`Enterprise customer not found: ${id}`)
    existing.name = body.name
    existing.logo = body.logo
    existing.ids = body.ids ?? []
    return { customer: toAdminEnterprise(existing) } as T
  }
  // DELETE /api/admin/enterprise-customers/:id (remove)
  if (matchesSubResource(path, "/api/admin/enterprise-customers/", "") && method === "DELETE") {
    const id = extractSegment(path, "/api/admin/enterprise-customers/")
    enterpriseCustomers = enterpriseCustomers.filter((e) => e.id !== id)
    return { success: true } as T
  }
  // GET /api/enterprise-customers (public read).
  // Intentionally returns an EMPTY list in demo mode: ensureEnterpriseLoaded() treats an empty
  // public read as "no backend roster" and keeps the built-in DEMO_FALLBACK store branding
  // (招行/工行/建行 + real logos + blue 建行 control case). The admin seed lives only behind the
  // admin read above so admin-page demos still work without leaking into store branding.
  if (path.endsWith("/api/enterprise-customers") && method === "GET") {
    return { customers: [] } as T
  }

  // ── Fallback: log and return empty object ───────────────────────────────
  console.warn(`[demo] Unmocked API call: ${method} ${path}`)
  return {} as T
}
