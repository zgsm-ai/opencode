import { env } from "@/lib/env"
import type {
  CorrectionHistoryItem,
  CorrectionPayload,
  CommitDetailResult,
  CommitListQuery,
  CommitListResult,
  CommitManualPayload,
  CommitRow,
  DashboardSummary,
  DashboardSummaryQuery,
  Data,
  DateRangeValue,
  DateValue,
  DimensionKeysQuery,
  EfficiencyQuery,
  EfficiencyQueryResult,
  EfficiencyRow,
  EfficiencySummary,
  FetchOpts,
  Granularity,
  OrgAggregatePoint,
  OrgAggregateQuery,
  OrgAggregateResult,
  OrgDetailQuery,
  OrgDetailResult,
  OrgListQuery,
  ProjectConflict,
  ProjectCreatePayload,
  ProjectOption,
  ProjectRow,
  RepoAggregateRow,
  RepoBindingPayload,
  RepoCommitRow,
  RepoDetailQuery,
  RepoDetailResult,
  RepoListQuery,
  RepoListResult,
  RepoTaskRow,
  Shape,
  TaskConversation,
  TaskDetailResult,
  TaskListQuery,
  TaskListResult,
  TaskManualPayload,
  TaskProjectBindingPayload,
  TaskRow,
  TimeSegment,
  UserAggregateRow,
  UserDetailQuery,
  UserDetailResult,
  UserDetailSummary,
  UserGroupDetailResult,
  UserGroupMemberRow,
  UserGroupSummary,
  UserListQuery,
  UserListResult,
  UserOption,
  UserSeries,
  UserSeriesPoint,
  WorkDirDetailResult,
  WorkDirCommitRow,
  WorkDirMatchedTask,
  WorkDirSilicaEntry,
  WorkDirSummary,
  ProjectDetailResult,
  ProjectManualPayload,
  ProjectUpdatePayload,
  ProjectRepoRow,
  ProjectCommitRow,
  ProjectTaskRow,
  GlobalConfig,
} from "./types"

const PREFIX = env.DASHBOARD_PREFIX
const BASE = env.API_URL || PREFIX
const LONG = 600000
const API = "/api"

function plain(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date)
}

function clean(v: unknown): unknown {
  if (typeof v === "string") return v.trim()
  if (Array.isArray(v)) return v.map(clean).filter((item) => item !== undefined)
  if (!plain(v)) return v

  return Object.fromEntries(
    Object.entries(v)
      .map(([k, item]) => [k, clean(item)] as const)
      .filter(([, item]) => item !== undefined),
  )
}

function append(q: URLSearchParams, k: string, v: unknown) {
  if (v === undefined || v === null) return
  if (Array.isArray(v)) {
    v.forEach((item) => append(q, k, item))
    return
  }
  if (v instanceof Date) {
    q.append(k, v.toISOString())
    return
  }
  if (plain(v)) {
    q.append(k, JSON.stringify(v))
    return
  }
  q.append(k, String(v))
}

function query(params?: Shape) {
  if (!params) return ""

  const q = new URLSearchParams()
  const data = clean(params)
  if (plain(data)) {
    Object.entries(data).forEach(([k, v]) => append(q, k, v))
  }
  const txt = q.toString()
  return txt ? `?${txt}` : ""
}

function body(data: unknown) {
  if (data === undefined) return undefined
  return JSON.stringify(clean(data))
}

function fail(err: string, raw?: unknown): never {
  throw new Error(err, raw ? { cause: raw } : undefined)
}

function takeArray(raw: unknown, keys: string[]) {
  if (Array.isArray(raw)) return raw
  if (!plain(raw)) return undefined
  for (const key of keys) {
    const value = raw[key]
    if (Array.isArray(value)) return value
    if (plain(value)) {
      for (const nested of keys) {
        const child = value[nested]
        if (Array.isArray(child)) return child
      }
    }
  }
}

function toDay(v?: DateValue | null) {
  if (!v) return undefined
  if (v instanceof Date) {
    return `${v.getFullYear()}${String(v.getMonth() + 1).padStart(2, "0")}${String(v.getDate()).padStart(2, "0")}`
  }
  const txt = v.trim()
  if (!txt) return undefined
  if (/^\d{8}$/.test(txt)) return txt
  return txt.replace(/-/g, "")
}

function range(range?: DateRangeValue) {
  if (!range) return {}
  return {
    startDate: toDay(range[0]),
    endDate: toDay(range[1]),
  }
}

function org(value?: Record<string, string | undefined>) {
  if (!value) return {}
  return Object.fromEntries(
    Object.entries(value)
      .map(([k, v]) => [k, v?.trim() || undefined] as const)
      .filter(([, v]) => !!v),
  )
}

function orgPath(value?: Record<string, string | undefined>) {
  const current = org(value)
  return [current.org1, current.org2, current.org3, current.org4].filter(Boolean).join("/")
}

function orgScope(value?: Record<string, string | undefined>) {
  const current = org(value)
  if (current.org3 || current.org4) {
    return {
      level: "org4",
      parent: [current.org1, current.org2, current.org3].filter(Boolean).join("/"),
    } as const
  }
  if (current.org2) {
    return {
      level: "org3",
      parent: [current.org1, current.org2].filter(Boolean).join("/"),
    } as const
  }
  if (current.org1) {
    return {
      level: "org2",
      parent: current.org1,
    } as const
  }
  return {
    level: "org1",
    parent: "",
  } as const
}

function toNumber(v: unknown) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  if (typeof v === "string") {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function toText(v: unknown) {
  return typeof v === "string" ? v : undefined
}

function toRows(raw: unknown) {
  if (!Array.isArray(raw)) return [] as EfficiencyRow[]
  return raw.filter(plain).map((item) => ({ ...item })) as EfficiencyRow[]
}

function toObjects<T extends Record<string, unknown>>(raw: unknown) {
  if (!Array.isArray(raw)) return [] as T[]
  return raw.filter(plain).map((item) => ({ ...item } as T))
}

function toGranularity(v: unknown): Granularity {
  if (v === "week" || v === "month" || v === "year") return v
  return "day"
}

function unwrap(raw: unknown) {
  return plain(raw) && plain(raw.data) ? raw.data : raw
}

function userSummary(raw: unknown): UserDetailSummary {
  if (!plain(raw)) return {}
  return {
    user_id: toText(raw.user_id),
    user_name: toText(raw.user_name),
    day_count: toNumber(raw.day_count),
    task_count: toNumber(raw.task_count),
    commit_count: toNumber(raw.commit_count),
    task_efficiency_ratio: raw.task_efficiency_ratio == null ? null : toNumber(raw.task_efficiency_ratio),
    commit_efficiency_ratio: raw.commit_efficiency_ratio == null ? null : toNumber(raw.commit_efficiency_ratio),
    cost: raw.cost == null ? null : toNumber(raw.cost),
  }
}

function userRows(raw: unknown) {
  return toObjects<UserAggregateRow>(raw)
}

function userPeriods(raw: unknown) {
  if (!Array.isArray(raw)) return [] as string[]
  return raw.filter((item): item is string => typeof item === "string")
}

function userPoints(raw: unknown) {
  return toObjects<UserSeriesPoint>(raw)
}

function userSeries(raw: unknown) {
  if (!Array.isArray(raw)) return [] as UserSeries[]
  return raw.filter(plain).map((item) => ({
    user_id: toText(item.user_id),
    user_name: toText(item.user_name),
    points: userPoints(item.points),
  }))
}

function groupSummary(raw: unknown): UserGroupSummary {
  if (!plain(raw)) return {}
  return {
    task_count: toNumber(raw.task_count),
    commit_count: toNumber(raw.commit_count),
    task_efficiency_ratio: raw.task_efficiency_ratio == null ? null : toNumber(raw.task_efficiency_ratio),
    commit_efficiency_ratio: raw.commit_efficiency_ratio == null ? null : toNumber(raw.commit_efficiency_ratio),
    cost: raw.cost == null ? null : toNumber(raw.cost),
  }
}

function groupMembers(raw: unknown) {
  return toObjects<UserGroupMemberRow>(raw)
}

function pageResult(raw: unknown) {
  const data = unwrap(raw)
  const rows = takeArray(data, ["data", "items"]) ?? []
  const meta = plain(data) ? data : {}
  return {
    rows,
    total: toNumber(meta.total),
    page: toNumber(meta.page),
    pageSize: toNumber(meta.pageSize),
  }
}

function summary(raw: unknown): EfficiencySummary {
  if (!plain(raw)) fail("Invalid efficiency response", raw)

  const ai = plain(raw.ai_estimated) ? raw.ai_estimated : {}
  const actual = plain(raw.actual_time) ? raw.actual_time : {}
  const eff = plain(raw.efficiency) ? raw.efficiency : {}
  const cost = plain(raw.cost) ? raw.cost : {}
  const users = toRows(Array.isArray(actual.users) ? actual.users : [])

  return {
    dimension: raw.dimension === "repo" ? "repo" : "work_dir",
    dimension_id: toText(raw.dimension_id) ?? "",
    analysis_date: toText(raw.analysis_date),
    ai_estimated: {
      raw_days: toNumber(ai.raw_days),
      corrected_days: ai.corrected_days == null ? null : toNumber(ai.corrected_days),
      is_corrected: Boolean(ai.is_corrected),
      reasons: Array.isArray(ai.reasons) ? ai.reasons.filter((item): item is string => typeof item === "string") : [],
    },
    actual_time: {
      total_lead_time_ms: toNumber(actual.total_lead_time_ms),
      total_process_time_ms: toNumber(actual.total_process_time_ms),
      total_code_lines: toNumber(actual.total_code_lines),
      user_count: toNumber(actual.user_count),
      start_time: toText(actual.start_time),
      end_time: toText(actual.end_time),
      users,
    },
    efficiency: {
      ratio_lead: toNumber(eff.ratio_lead),
      ratio_process: toNumber(eff.ratio_process),
      reason: toText(eff.reason),
    },
    cost: {
      api_cost: toNumber(cost.api_cost),
      daily_rate: toNumber(cost.daily_rate),
      cost_saving: toNumber(cost.cost_saving),
      roi: toNumber(cost.roi),
    },
    analysis_file: toText(raw.analysis_file),
  }
}

function dashboard(raw: unknown): DashboardSummary {
  const data = plain(raw) && plain(raw.data) ? raw.data : raw
  if (!plain(data)) fail("Invalid dashboard response", raw)

  return {
    total_tasks: toNumber(data.total_tasks),
    total_users: toNumber(data.total_users),
    total_repos: toNumber(data.total_repos),
    total_commits: toNumber(data.total_commits),
    total_work_dirs: toNumber(data.total_work_dirs),
    total_cost: toNumber(data.total_cost),
    total_tokens: toNumber(data.total_tokens),
    total_diff_lines: toNumber(data.total_diff_lines),
    total_task_ancient_minutes: toNumber(data.total_task_ancient_minutes),
    total_real_minutes: toNumber(data.total_real_minutes),
    avg_efficiency_ratio: data.avg_efficiency_ratio == null ? null : toNumber(data.avg_efficiency_ratio),
  }
}

function page<T>(items: T[], index = 1, size = items.length || 1) {
  const start = Math.max(index - 1, 0) * Math.max(size, 1)
  return items.slice(start, start + Math.max(size, 1))
}

async function apiFetch<T = unknown>(path: string, opts: FetchOpts = {}): Promise<T> {
  const ctrl = new AbortController()
  const timeout = opts.timeout ?? 0
  const id = timeout > 0 ? globalThis.setTimeout(() => ctrl.abort(), timeout) : undefined
  const method = opts.method ?? (opts.data === undefined ? "GET" : "POST")
  const init: RequestInit = {
    method,
    // credentials: "include",
    signal: ctrl.signal,
  }
  const payload = body(opts.data)

  if (payload !== undefined) {
    init.body = payload
    init.headers = { "Content-Type": "application/json" }
  }

  try {
    const res = await fetch(`${BASE}${path}${query(opts.params)}`, init)
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || err.message || `Request failed: ${res.status}`)
    }
    return res.json()
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(timeout > 0 ? `Request timed out after ${timeout}ms` : "Request aborted")
    }
    throw err
  } finally {
    if (id !== undefined) globalThis.clearTimeout(id)
  }
}

function get<T = unknown>(path: string, params?: Shape, timeout?: number) {
  return apiFetch<T>(path, { method: "GET", params, timeout })
}

function post<T = unknown>(path: string, data?: Data, params?: Shape, timeout?: number) {
  return apiFetch<T>(path, { method: "POST", data, params, timeout })
}

function put<T = unknown>(path: string, data?: Data, params?: Shape, timeout?: number) {
  return apiFetch<T>(path, { method: "PUT", data, params, timeout })
}

function del<T = unknown>(path: string, data?: Data, params?: Shape, timeout?: number) {
  return apiFetch<T>(path, { method: "DELETE", data, params, timeout })
}

export async function listOrgs(input: OrgListQuery) {
  const raw = await get<unknown>(`${API}/v2/orgs`, {
    level: input.level,
    parent: input.parent,
    ...range(input.dateRange),
  })
  const list = takeArray(raw, ["data", "items"])
  if (!list) return [] as string[]
  return list
    .map((item) => (plain(item) && typeof item.org_name === "string" ? item.org_name : undefined))
    .filter((item): item is string => !!item)
}

export async function loadDimensionKeys(input: DimensionKeysQuery) {
  const raw = await get<unknown>(`${API}/aggregate/keys`, {
    dimension: input.dimension,
    ...range(input.dateRange),
  }, LONG)

  if (plain(raw) && Array.isArray(raw.keys)) {
    return { keys: raw.keys.filter((item): item is string => typeof item === "string") }
  }

  if (plain(raw) && plain(raw.data) && Array.isArray(raw.data.keys)) {
    return { keys: raw.data.keys.filter((item): item is string => typeof item === "string") }
  }

  return { keys: [] as string[] }
}

export async function queryEfficiencyRows(input: EfficiencyQuery): Promise<EfficiencyQueryResult> {
  const txt = input.dimensionId.trim()
  if (!txt) fail("dimensionId is required")
  if (!input.dateRange) fail("dateRange is required")

  const raw = await get<unknown>(`${API}/analysis/efficiency`, {
    dimension: input.dimension,
    id: txt,
    ...range(input.dateRange),
  }, LONG)

  const data = summary(raw)
  const all = data.actual_time.users
  const index = input.page ?? 1
  const size = input.pageSize ?? (all.length || 1)

  return {
    rows: page(all, index, size),
    total: all.length,
    summary: data,
  }
}

export async function queryDashboardSummary(input: DashboardSummaryQuery = {}): Promise<DashboardSummary> {
  const raw = await get<unknown>(`${API}/v2/dashboard/summary`, {
    ...range(input.dateRange),
  }, LONG)

  return dashboard(raw)
}

export async function queryRepoRows(input: RepoListQuery): Promise<RepoListResult> {
  const currentPage = input.page ?? 1
  const currentSize = input.pageSize ?? 250
  const raw = await get<unknown>(`${API}/v2/repos`, {
    ...range(input.dateRange),
    page: currentPage,
    pageSize: currentSize,
  }, LONG)

  const rows = toObjects<RepoAggregateRow>(takeArray(raw, ["data", "items"]) ?? [])
  const meta = plain(raw) ? raw : {}

  return {
    rows,
    total: toNumber(meta.total) || rows.length,
    page: toNumber(meta.page) || currentPage,
    pageSize: toNumber(meta.pageSize) || currentSize,
  }
}

export async function queryUserRows(input: UserListQuery): Promise<UserListResult> {
  const currentPage = input.page ?? 1
  const currentSize = input.pageSize ?? 250
  const raw = await get<unknown>(`${API}/v2/users`, {
    ...range(input.dateRange),
    page: currentPage,
    pageSize: currentSize,
    granularity: toGranularity(input.granularity),
    ...org(input.org),
  }, LONG)

  const data = unwrap(raw)
  const rows = userRows(takeArray(data, ["data", "items"]) ?? [])
  const meta = plain(data) ? data : {}

  return {
    rows,
    total: toNumber(meta.total) || rows.length,
    page: toNumber(meta.page) || currentPage,
    pageSize: toNumber(meta.pageSize) || currentSize,
    periods: userPeriods(plain(data) ? data.periods : undefined),
    series: userSeries(plain(data) ? data.series : undefined),
  }
}

export async function listUsers(input: { pageSize?: number } = {}) {
  const raw = await get<unknown>(`${API}/v2/users`, {
    page: 1,
    pageSize: input.pageSize ?? 1000,
  }, LONG)

  return userRows(takeArray(unwrap(raw), ["data", "items"]) ?? [])
    .map((item) => ({
      user_id: item.user_id?.trim() || "",
      user_name: item.user_name?.trim() || undefined,
    } satisfies UserOption))
    .filter((item) => item.user_id)
}

export async function getUserDetail(input: UserDetailQuery): Promise<UserDetailResult> {
  const txt = input.userId.trim()
  if (!txt) fail("userId is required")

  const raw = await get<unknown>(`${API}/v2/users/${encodeURIComponent(txt)}`, {
    ...range(input.dateRange),
    granularity: toGranularity(input.granularity),
  }, LONG)

  const data = unwrap(raw)
  if (!plain(data)) {
    return {
      summary: {},
      daily: [],
      commits: [],
      tasks: [],
    }
  }

  return {
    summary: userSummary(data.summary),
    daily: toObjects(data.daily),
    commits: toObjects(data.commits),
    tasks: toObjects(data.tasks),
  }
}

export async function getUserGroupDetail(input: { groupId: string; dateRange: DateRangeValue }): Promise<UserGroupDetailResult> {
  const txt = input.groupId.trim()
  if (!txt) fail("groupId is required")

  const raw = await get<unknown>(`${API}/v2/user-groups/${encodeURIComponent(txt)}`, {
    ...range(input.dateRange),
  }, LONG)

  const data = unwrap(raw)
  if (!plain(data)) {
    return {
      group: {},
      summary: {},
      members: [],
    }
  }

  return {
    group: plain(data.group) ? {
      id: toText(data.group.id),
      name: toText(data.group.name),
    } : {},
    summary: groupSummary(data.summary),
    members: groupMembers(data.members),
  }
}

export async function deleteUserGroup(groupId: string) {
  const txt = groupId.trim()
  if (!txt) fail("groupId is required")
  return del<unknown>(`${API}/v2/user-groups/${encodeURIComponent(txt)}`, undefined, undefined, LONG)
}

export async function queryTaskRows(input: TaskListQuery): Promise<TaskListResult> {
  const currentPage = input.page ?? 1
  const currentSize = input.pageSize ?? 250
  const raw = await get<unknown>(`${API}/v2/tasks`, {
    ...range(input.dateRange),
    page: currentPage,
    pageSize: currentSize,
    userName: input.userName?.trim() || undefined,
    ...org(input.org),
  }, LONG)

  const result = pageResult(raw)
  const rows = toObjects<TaskRow>(result.rows)

  return {
    rows,
    total: result.total || rows.length,
    page: result.page || currentPage,
    pageSize: result.pageSize || currentSize,
  }
}

export async function getTaskDetail(taskId: string): Promise<TaskDetailResult> {
  const txt = taskId.trim()
  if (!txt) fail("taskId is required")

  const raw = await get<unknown>(`${API}/v2/tasks/${encodeURIComponent(txt)}`, undefined, LONG)
  const data = unwrap(raw)
  if (!plain(data)) {
    return {
      task: {},
      conversations: [],
      time_segments: [],
      efficiency_ratio: null,
    }
  }

  const task = plain(data.task) ? { ...(data.task as TaskRow) } : ({} as TaskRow)
  if (data.efficiency_ratio != null) task.efficiency_ratio = toNumber(data.efficiency_ratio)

  return {
    task,
    conversations: toObjects<TaskConversation>(data.conversations),
    time_segments: toObjects<TimeSegment>(data.time_segments),
    efficiency_ratio: data.efficiency_ratio == null ? null : toNumber(data.efficiency_ratio),
  }
}

export async function updateTaskManual(taskId: string, input: TaskManualPayload) {
  const txt = taskId.trim()
  if (!txt) fail("taskId is required")

  return put<unknown>(`${API}/v2/tasks/${encodeURIComponent(txt)}/manual`, {
    task_real_minutes_manual: input.task_real_minutes_manual ?? null,
    task_real_minutes_reason_manual: input.task_real_minutes_reason_manual?.trim() || "",
    task_ancient_minutes_manual: input.task_ancient_minutes_manual ?? null,
    task_ancient_minutes_reason_manual: input.task_ancient_minutes_reason_manual?.trim() || "",
  }, undefined, LONG)
}

export async function estimateTaskAncient() {
  return post<unknown>(`${API}/v2/tasks/estimate-ancient`, undefined, undefined, LONG)
}

export async function addTasksToProject(projectId: string, payload: TaskProjectBindingPayload) {
  const id = projectId.trim()
  if (!id) fail("projectId is required")

  return post<unknown>(`${API}/v2/projects/${encodeURIComponent(id)}/tasks`, {
    task_ids: payload.task_ids.map((item) => item.trim()).filter(Boolean),
    task_ids_silica: payload.task_ids_silica.map((item) => Number(item) || 0),
  }, undefined, LONG)
}

export async function queryCommitRows(input: CommitListQuery): Promise<CommitListResult> {
  const currentPage = input.page ?? 1
  const currentSize = input.pageSize ?? 250
  const raw = await get<unknown>(`${API}/v2/commits`, {
    ...range(input.dateRange),
    page: currentPage,
    pageSize: currentSize,
    userName: input.userName?.trim() || undefined,
    ...org(input.org),
  }, LONG)

  const result = pageResult(raw)
  const rows = toObjects<CommitRow>(result.rows)

  return {
    rows,
    total: result.total || rows.length,
    page: result.page || currentPage,
    pageSize: result.pageSize || currentSize,
  }
}

export async function getCommitDetail(commitId: string): Promise<CommitDetailResult> {
  const txt = commitId.trim()
  if (!txt) fail("commitId is required")

  const raw = await get<unknown>(`${API}/v2/commits/${encodeURIComponent(txt)}`, undefined, LONG)
  const data = unwrap(raw)
  if (!plain(data)) {
    return {
      commit: {},
      related_tasks: [],
      efficiency_ratio: null,
      silica: null,
      total_cost: null,
      upstream_tokens: 0,
      downstream_tokens: 0,
    }
  }

  const commit = plain(data.commit) ? { ...(data.commit as CommitRow) } : ({} as CommitRow)
  if (data.efficiency_ratio != null) commit.efficiency_ratio = toNumber(data.efficiency_ratio)
  if (data.silica != null) commit.silica = toNumber(data.silica)

  return {
    commit,
    related_tasks: toObjects(data.related_tasks),
    efficiency_ratio: data.efficiency_ratio == null ? null : toNumber(data.efficiency_ratio),
    silica: data.silica == null ? null : toNumber(data.silica),
    total_cost: data.total_cost == null ? null : toNumber(data.total_cost),
    upstream_tokens: toNumber(data.upstream_tokens),
    downstream_tokens: toNumber(data.downstream_tokens),
  }
}

export async function updateCommitManual(commitId: string, input: CommitManualPayload) {
  const txt = commitId.trim()
  if (!txt) fail("commitId is required")

  return put<unknown>(`${API}/v2/commits/${encodeURIComponent(txt)}/manual`, {
    commit_ancient_minutes_manual: input.commit_ancient_minutes_manual ?? null,
    commit_ancient_minutes_reason_manual: input.commit_ancient_minutes_reason_manual?.trim() || "",
    commit_real_minutes_manual: input.commit_real_minutes_manual ?? null,
    commit_real_minutes_reason_manual: input.commit_real_minutes_reason_manual?.trim() || "",
  }, undefined, LONG)
}

export async function queryOrgRows(input: OrgAggregateQuery): Promise<OrgAggregateResult> {
  const scope = orgScope(input.org)
  const raw = await get<unknown>(`${API}/v2/orgs`, {
    level: scope.level,
    parent: scope.parent,
    ...range(input.dateRange),
    granularity: toGranularity(input.granularity),
  }, LONG)

  const data = unwrap(raw)
  if (!plain(data)) {
    return {
      rows: [],
      periods: [],
      series: [],
    }
  }

  return {
    rows: toObjects(takeArray(data, ["data", "items"]) ?? []),
    periods: userPeriods(data.periods),
    series: Array.isArray(data.series)
      ? data.series.filter(plain).map((item) => ({
          org_name: toText(item.org_name),
          points: toObjects<OrgAggregatePoint>(item.points),
        }))
      : [],
  }
}

export async function getOrgDetail(input: OrgDetailQuery): Promise<OrgDetailResult> {
  const path = orgPath(input.org)
  if (!path) {
    return {
      summary: {},
      members: [],
      commits: [],
      tasks: [],
    }
  }

  const raw = await get<unknown>(`${API}/v2/orgs/detail`, {
    ...range(input.dateRange),
    granularity: toGranularity(input.granularity),
    org_path: path,
  }, LONG)

  const data = unwrap(raw)
  if (!plain(data)) {
    return {
      summary: {},
      members: [],
      commits: [],
      tasks: [],
    }
  }

  return {
    summary: {
      user_count: toNumber(plain(data.summary) ? data.summary.user_count : undefined),
      task_diff_lines: toNumber(plain(data.summary) ? data.summary.task_diff_lines : undefined),
      commit_diff_lines: toNumber(plain(data.summary) ? data.summary.commit_diff_lines : undefined),
      task_efficiency_ratio: plain(data.summary) && data.summary.task_efficiency_ratio != null ? toNumber(data.summary.task_efficiency_ratio) : null,
      commit_efficiency_ratio: plain(data.summary) && data.summary.commit_efficiency_ratio != null ? toNumber(data.summary.commit_efficiency_ratio) : null,
      cost: plain(data.summary) && data.summary.cost != null ? toNumber(data.summary.cost) : null,
    },
    members: groupMembers(data.members),
    commits: toObjects(data.commits),
    tasks: toObjects(data.tasks),
  }
}

export async function getRepoDetail(input: RepoDetailQuery): Promise<RepoDetailResult> {
  const repoAddr = input.repoAddr.trim()
  if (!repoAddr) fail("repoAddr is required")

  const raw = await get<unknown>(`${API}/v2/repos/detail`, {
    repoAddr,
    repoBranch: input.repoBranch?.trim(),
    ...range(input.dateRange),
  }, LONG)

  if (!plain(raw)) fail("Invalid repo detail response", raw)

  return {
    repo_addr: toText(raw.repo_addr) ?? repoAddr,
    repo_branch: toText(raw.repo_branch),
    branches: Array.isArray(raw.branches) ? raw.branches.filter((item): item is string => typeof item === "string") : [],
    commits: toObjects<RepoCommitRow>(raw.commits),
    tasks: toObjects<RepoTaskRow>(raw.tasks),
    efficiency: plain(raw.efficiency) ? {
      repo_ancient_minutes: toNumber(raw.efficiency.repo_ancient_minutes),
      repo_real_minutes: toNumber(raw.efficiency.repo_real_minutes),
      efficiency_ratio: raw.efficiency.efficiency_ratio == null ? null : toNumber(raw.efficiency.efficiency_ratio),
      repo_ancient_minutes_reason: toText(raw.efficiency.repo_ancient_minutes_reason),
      repo_real_minutes_reason: toText(raw.efficiency.repo_real_minutes_reason),
    } : {},
    summary: plain(raw.summary) ? {
      commit_count: toNumber(raw.summary.commit_count),
      task_count: toNumber(raw.summary.task_count),
    } : {},
  }
}

export async function listRepoBranches(repoAddr: string) {
  const txt = repoAddr.trim()
  if (!txt) return [] as string[]

  const raw = await get<unknown>(`${API}/v2/repos/branches`, { repoAddr: txt }, LONG)
  if (plain(raw) && Array.isArray(raw.branches)) {
    return raw.branches.filter((item): item is string => typeof item === "string")
  }
  return [] as string[]
}

export async function loadProjectOptions() {
  const raw = await get<unknown>(`${API}/v2/projects`, undefined, LONG)
  const list = takeArray(raw, ["data", "items"])
  if (!list) return [] as ProjectOption[]
  return list
    .filter(plain)
    .map((item) => ({
      project_id: toText(item.project_id) ?? toText(item.id) ?? "",
      name: toText(item.name) ?? "",
      description: toText(item.description),
    }))
    .filter((item) => item.project_id && item.name)
}

export async function createProjectOption(input: { name: string; description?: string }) {
  const raw = await post<unknown>(`${API}/v2/projects`, {
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
  }, undefined, LONG)

  if (!plain(raw)) fail("Invalid project create response", raw)

  return {
    project_id: toText(raw.project_id) ?? toText(raw.id) ?? "",
    name: toText(raw.name) ?? input.name.trim(),
    description: toText(raw.description),
  } satisfies ProjectOption
}

export async function checkProjectConflicts(commitIds: string[]) {
  const ids = commitIds.map((item) => item.trim()).filter(Boolean)
  if (!ids.length) return [] as ProjectConflict[]

  const raw = await post<unknown>(`${API}/v2/projects/check-conflicts`, { commit_ids: ids }, undefined, LONG)
  const list = takeArray(raw, ["conflicts", "data"])
  if (!list) return [] as ProjectConflict[]

  return list
    .filter(plain)
    .map((item) => ({
      commit_id: toText(item.commit_id) ?? "",
      project_id: toText(item.project_id) ?? "",
      project_name: toText(item.project_name) ?? "",
    }))
    .filter((item) => item.commit_id && item.project_id)
}

export async function addRepoToProject(projectId: string, payload: RepoBindingPayload) {
  const id = projectId.trim()
  if (!id) fail("projectId is required")

  return post<unknown>(`${API}/v2/projects/${encodeURIComponent(id)}/repos`, {
    repo_addr: payload.repo_addr.trim(),
    repo_branch: payload.repo_branch?.trim() || "",
    start_time: payload.start_time?.trim() || null,
    end_time: payload.end_time?.trim() || null,
    exclude_commits: (payload.exclude_commits ?? []).map((item) => item.trim()).filter(Boolean),
    include_only_commits: (payload.include_only_commits ?? []).map((item) => item.trim()).filter(Boolean),
  }, undefined, LONG)
}

export async function submitCorrection(input: CorrectionPayload) {
  const payload = {
    dimension: input.dimension,
    id: input.dimensionId.trim(),
    startDate: toDay(input.startDate),
    endDate: toDay(input.endDate),
    field: input.field ?? "ai_estimated_days",
    value: input.value,
    reason: input.reason.trim(),
    by: input.operator.trim(),
  }

  if (!payload.id) fail("dimensionId is required")
  if (!payload.startDate || !payload.endDate) fail("startDate and endDate are required")
  if (!payload.reason) fail("reason is required")
  if (!payload.by) fail("operator is required")

  const raw = await put<unknown>(`${API}/analysis/efficiency/correct`, payload, undefined, LONG)
  return summary(raw)
}

export async function loadCorrectionHistory(input: {
  dimension: CorrectionPayload["dimension"]
  dimensionId: string
  dateRange?: DateRangeValue
}) {
  const raw = await get<unknown>(`${API}/analysis/efficiency/history`, {
    dimension: input.dimension,
    id: input.dimensionId.trim(),
    ...range(input.dateRange),
  })

  const list = takeArray(raw, ["items", "data"])
  if (!list) return [] as CorrectionHistoryItem[]
  return list.filter(plain).map((item) => ({
    field_name: toText(item.field_name),
    old_value: toText(item.old_value),
    new_value: toText(item.new_value),
    reason: toText(item.reason),
    corrected_by: toText(item.corrected_by),
    corrected_at: toText(item.corrected_at),
  }))
}

export async function getWorkDirDetail(workDirId: string): Promise<WorkDirDetailResult> {
  const id = workDirId.trim()
  if (!id) fail("workDirId is required")

  const raw = await get<unknown>(`${API}/v2/repos/detail`, {
    repoAddr: id,
    repoBranch: "",
  }, LONG)

  const data = unwrap(raw)
  if (!plain(data)) {
    return {
      summary: {},
      commits: [],
      tasks: [],
      silica_entries: [],
    }
  }

  const commits = toObjects<WorkDirCommitRow>(data.commits)
  const tasks = toObjects<RepoTaskRow>(data.tasks)

  const silicaEntries: WorkDirSilicaEntry[] = []
  if (Array.isArray(data.silica_entries)) {
    for (const entry of data.silica_entries) {
      if (!plain(entry)) continue
      silicaEntries.push({
        task_id: toText(entry.task_id),
        silica: entry.silica == null ? null : toNumber(entry.silica),
      })
    }
  }

  const summaryRaw = plain(data.summary) ? data.summary : {}
  const summary: WorkDirSummary = {
    commit_count: toNumber(summaryRaw.commit_count),
    task_count: toNumber(summaryRaw.task_count),
    user_count: toNumber(summaryRaw.user_count),
    total_cost: summaryRaw.total_cost == null ? null : toNumber(summaryRaw.total_cost),
    task_ancient_minutes: summaryRaw.task_ancient_minutes == null ? null : toNumber(summaryRaw.task_ancient_minutes),
  }

  return {
    repo_addr: toText(data.repo_addr) ?? toText(data.repo_id) ?? id,
    repo_id: toText(data.repo_id),
    repo_branch: toText(data.repo_branch),
    summary,
    commits,
    tasks,
    silica_entries: silicaEntries,
  }
}

export async function getProjects(): Promise<ProjectRow[]> {
  const raw = await get<unknown>(`${API}/v2/projects`, undefined, LONG)
  const list = takeArray(raw, ["data", "items"])
  if (!list) return [] as ProjectRow[]
  return list.filter(plain).map((item) => ({
    project_id: toText(item.project_id) ?? toText(item.id) ?? "",
    name: toText(item.name) ?? "",
    description: toText(item.description),
    start_time: toText(item.start_time),
    start_time_manual: toText(item.start_time_manual),
    end_time: toText(item.end_time),
    end_time_manual: toText(item.end_time_manual),
    user_count: toNumber(item.user_count),
    repo_count: toNumber(item.repo_count),
    task_count: toNumber(item.task_count),
    total_code_lines: toNumber(item.total_code_lines),
    actual_lines_per_day: item.actual_lines_per_day == null ? undefined : toNumber(item.actual_lines_per_day),
    cost: item.cost == null ? undefined : toNumber(item.cost),
    project_real_lead_minutes: item.project_real_lead_minutes == null ? undefined : toNumber(item.project_real_lead_minutes),
    project_real_lead_minutes_manual: item.project_real_lead_minutes_manual == null ? undefined : toNumber(item.project_real_lead_minutes_manual),
    project_ancient_minutes: item.project_ancient_minutes == null ? undefined : toNumber(item.project_ancient_minutes),
    project_ancient_minutes_manual: item.project_ancient_minutes_manual == null ? undefined : toNumber(item.project_ancient_minutes_manual),
    project_real_process_minutes: item.project_real_process_minutes == null ? undefined : toNumber(item.project_real_process_minutes),
    project_real_process_minutes_manual: item.project_real_process_minutes_manual == null ? undefined : toNumber(item.project_real_process_minutes_manual),
    efficiency_ratio: item.efficiency_ratio == null ? null : toNumber(item.efficiency_ratio),
  })).filter((item) => item.project_id) as ProjectRow[]
}

export async function createProjectOptionV2(input: ProjectCreatePayload) {
  const raw = await post<unknown>(`${API}/v2/projects`, {
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
  }, undefined, LONG)

  if (!plain(raw)) fail("Invalid project create response", raw)

  return {
    project_id: toText(raw.project_id) ?? toText(raw.id) ?? "",
    name: toText(raw.name) ?? input.name.trim(),
    description: toText(raw.description),
  } satisfies ProjectOption
}

export async function deleteProject(projectId: string) {
  const id = projectId.trim()
  if (!id) fail("projectId is required")
  return del<unknown>(`${API}/v2/projects/${encodeURIComponent(id)}`, undefined, undefined, LONG)
}

export async function getProjectDetail(projectId: string): Promise<ProjectDetailResult> {
  const id = projectId.trim()
  if (!id) fail("projectId is required")

  const raw = await get<unknown>(`${API}/v2/projects/${encodeURIComponent(id)}`, undefined, LONG)
  const data = unwrap(raw)
  if (!plain(data)) {
    return { repos: [], tasks: [], commits: [], user_count: 0 }
  }

  return {
    project_id: toText(data.project_id) ?? toText(data.id) ?? id,
    name: toText(data.name),
    description: toText(data.description),
    start_time: toText(data.start_time),
    start_time_manual: toText(data.start_time_manual),
    end_time: toText(data.end_time),
    end_time_manual: toText(data.end_time_manual),
    upstream_tokens: toNumber(data.upstream_tokens),
    downstream_tokens: toNumber(data.downstream_tokens),
    cost: data.cost == null ? null : toNumber(data.cost),
    project_ancient_minutes: data.project_ancient_minutes == null ? null : toNumber(data.project_ancient_minutes),
    project_ancient_minutes_manual: data.project_ancient_minutes_manual == null ? null : toNumber(data.project_ancient_minutes_manual),
    project_ancient_minutes_reason: toText(data.project_ancient_minutes_reason),
    project_ancient_minutes_reason_manual: toText(data.project_ancient_minutes_reason_manual),
    project_real_process_minutes: data.project_real_process_minutes == null ? null : toNumber(data.project_real_process_minutes),
    project_real_process_minutes_manual: data.project_real_process_minutes_manual == null ? null : toNumber(data.project_real_process_minutes_manual),
    project_real_process_minutes_reason: toText(data.project_real_process_minutes_reason),
    project_real_process_minutes_reason_manual: toText(data.project_real_process_minutes_reason_manual),
    project_real_lead_minutes: data.project_real_lead_minutes == null ? null : toNumber(data.project_real_lead_minutes),
    project_real_lead_minutes_manual: data.project_real_lead_minutes_manual == null ? null : toNumber(data.project_real_lead_minutes_manual),
    project_real_lead_minutes_reason: toText(data.project_real_lead_minutes_reason),
    project_real_lead_minutes_reason_manual: toText(data.project_real_lead_minutes_reason_manual),
    repos: toObjects<ProjectRepoRow>(data.repos),
    tasks: toObjects<ProjectTaskRow>(data.tasks),
    commits: toObjects<ProjectCommitRow>(data.commits),
    user_count: toNumber(data.user_count),
  }
}

export async function updateProjectManual(projectId: string, input: ProjectManualPayload) {
  const id = projectId.trim()
  if (!id) fail("projectId is required")
  return put<unknown>(`${API}/v2/projects/${encodeURIComponent(id)}/manual`, {
    project_ancient_minutes_manual: input.project_ancient_minutes_manual ?? null,
    project_ancient_minutes_reason_manual: input.project_ancient_minutes_reason_manual?.trim() || "",
    project_real_process_minutes_manual: input.project_real_process_minutes_manual ?? null,
    project_real_process_minutes_reason_manual: input.project_real_process_minutes_reason_manual?.trim() || "",
    project_real_lead_minutes_manual: input.project_real_lead_minutes_manual ?? null,
    project_real_lead_minutes_reason_manual: input.project_real_lead_minutes_reason_manual?.trim() || "",
    start_time_manual: input.start_time_manual || null,
    end_time_manual: input.end_time_manual || null,
  }, undefined, LONG)
}

export async function updateProjectV2(projectId: string, input: ProjectUpdatePayload) {
  const id = projectId.trim()
  if (!id) fail("projectId is required")
  return put<unknown>(`${API}/v2/projects/${encodeURIComponent(id)}`, {
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    repos: input.repos,
    task_ids: input.task_ids,
    task_ids_silica: input.task_ids_silica,
  }, undefined, LONG)
}

export async function removeRepoFromProject(projectId: string, repoIndex: number) {
  const id = projectId.trim()
  if (!id) fail("projectId is required")
  return del<unknown>(`${API}/v2/projects/${encodeURIComponent(id)}/repos/${repoIndex}`, undefined, undefined, LONG)
}

export async function removeTasksFromProject(projectId: string, taskIds: string[]) {
  const id = projectId.trim()
  if (!id) fail("projectId is required")
  return del<unknown>(`${API}/v2/projects/${encodeURIComponent(id)}/tasks`, {
    task_ids: taskIds.map((t) => t.trim()).filter(Boolean),
  }, undefined, LONG)
}

export async function updateTaskSilicaInProject(projectId: string, data: { task_id: string; silica: number }) {
  const id = projectId.trim()
  if (!id) fail("projectId is required")
  return put<unknown>(`${API}/v2/projects/${encodeURIComponent(id)}/tasks/silica`, {
    task_id: data.task_id.trim(),
    silica: data.silica,
  }, undefined, LONG)
}

export async function getGlobalConfig(): Promise<GlobalConfig> {
  const raw = await get<unknown>(`${API}/v2/config`, undefined, LONG)
  if (!plain(raw)) return {}
  return {
    traditional_dev_lines_per_day: toNumber(raw.traditional_dev_lines_per_day) || undefined,
  }
}

