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
  MOCK_CATEGORIES,
  MOCK_FILTER_OPTIONS,
  MOCK_REGISTRIES,
  MOCK_REPOSITORIES,
  MOCK_ITEMS,
  MOCK_USER,
  MOCK_PERMISSIONS,
} from "./mock-data"

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

  // POST /api/items/:id/distribute
  if (matchesSubResource(path, "/api/items/", "/distribute") && method === "POST") {
    return { distributions: [] } as T
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

  // ── Fallback: log and return empty object ───────────────────────────────
  console.warn(`[demo] Unmocked API call: ${method} ${path}`)
  return {} as T
}
