import type { JSX } from "solid-js"

export type Atom = string | number | boolean | null

export type Data = Atom | Date | Data[] | { [key: string]: Data | undefined }

export type Shape = Record<string, Data | undefined>

export type DateValue = string | Date

export type DateRangeValue = [string, string] | null

export type OrgLevel = "org1" | "org2" | "org3" | "org4"

export type OrgCascadeValue = Partial<Record<OrgLevel, string>>

export type EfficiencyDimension = "work_dir" | "repo"

export type FilterType = "text" | "number" | "enum" | "date" | "search-select" | "multi-select" | "cascade-org"

export type NumberRangeValue = {
  min?: number
  max?: number
}

export type FilterValue = string | string[] | DateRangeValue | OrgCascadeValue | NumberRangeValue | null

export type FilterValueMap = Record<string, FilterValue | undefined>

export type FilterOption = {
  label: string
  value: string
}

export type FilterTag = {
  prop: string
  label: string
  display: string
}

export type FilterShortcut = {
  label: string
  value: string | number | DateRangeValue | NumberRangeValue
}

export type EfficiencyRow = {
  user_id?: string
  user_name?: string
  start_time?: string
  end_time?: string
  lead_time_ms?: number
  process_time_ms?: number
} & Record<string, unknown>

export type KanbanColumn<Row extends EfficiencyRow = EfficiencyRow> = {
  prop: string
  label: string
  width?: number | string
  minWidth?: number | string
  align?: "left" | "center" | "right"
  slotName?: string
  display?: (row: Row) => string
  render?: (row: Row) => JSX.Element
  sortable?: boolean
  showOverflowTooltip?: boolean
  filter?: {
    type: FilterType
    options?: FilterOption[]
    shortcuts?: FilterShortcut[]
    serverSide?: boolean
    placeholder?: string
    valueGetter?: (row: Row) => unknown
  }
}

export type EfficiencySummary = {
  dimension: EfficiencyDimension
  dimension_id: string
  analysis_date?: string
  ai_estimated: {
    raw_days: number
    corrected_days?: number | null
    is_corrected: boolean
    reasons: string[]
  }
  actual_time: {
    total_lead_time_ms: number
    total_process_time_ms: number
    total_code_lines: number
    user_count: number
    start_time?: string
    end_time?: string
    users: EfficiencyRow[]
  }
  efficiency: {
    ratio_lead: number
    ratio_process: number
    reason?: string
  }
  cost: {
    api_cost: number
    daily_rate: number
    cost_saving: number
    roi: number
  }
  analysis_file?: string
}

export type DashboardSummary = {
  total_tasks: number
  total_users: number
  total_repos: number
  total_commits: number
  total_work_dirs: number
  total_cost: number
  total_tokens: number
  total_diff_lines: number
  total_task_ancient_minutes: number
  total_real_minutes: number
  avg_efficiency_ratio: number | null
}

export type EfficiencyQuery = {
  dimension: EfficiencyDimension
  dimensionId: string
  dateRange: DateRangeValue
  page?: number
  pageSize?: number
  filters?: FilterValueMap
}

export type EfficiencyQueryResult = {
  rows: EfficiencyRow[]
  total: number
  summary?: EfficiencySummary
}

export type DashboardSummaryQuery = {
  dateRange?: DateRangeValue
}

export type RepoAggregateRow = EfficiencyRow & {
  repo_addr?: string
  repo_branch?: string
  commit_count?: number
  task_count?: number
  sum_ancient_minutes?: number
  sum_real_minutes?: number
  efficiency_ratio?: number
  start_time?: string
  end_time?: string
}

export type RepoListQuery = {
  dateRange: DateRangeValue
  page?: number
  pageSize?: number
}

export type RepoListResult = {
  rows: RepoAggregateRow[]
  total: number
  page: number
  pageSize: number
}

export type Granularity = "day" | "week" | "month" | "year"

export type UserAggregateRow = EfficiencyRow & {
  org1?: string
  org2?: string
  org3?: string
  org4?: string
  org_display?: string
  task_count?: number
  commit_count?: number
  task_diff_lines?: number
  commit_diff_lines?: number
  task_real_minutes?: number | null
  commit_real_minutes?: number | null
  task_ancient_minutes?: number | null
  commit_ancient_minutes?: number | null
  task_efficiency_ratio?: number | null
  commit_efficiency_ratio?: number | null
  upstream_tokens?: number
  downstream_tokens?: number
  cost?: number | null
}

export type UserSeriesPoint = {
  period_key?: string
  period_label?: string
  task_count?: number
  commit_count?: number
  task_diff_lines?: number
  commit_diff_lines?: number
  task_real_minutes?: number | null
  commit_real_minutes?: number | null
  task_ancient_minutes?: number | null
  commit_ancient_minutes?: number | null
  task_efficiency_ratio?: number | null
  commit_efficiency_ratio?: number | null
  total_tokens?: number
  total_cost?: number | null
}

export type UserSeries = {
  user_id?: string
  user_name?: string
  points: UserSeriesPoint[]
}

export type UserListQuery = {
  dateRange: DateRangeValue
  page?: number
  pageSize?: number
  granularity?: Granularity
  org?: OrgCascadeValue
}

export type UserListResult = {
  rows: UserAggregateRow[]
  total: number
  page: number
  pageSize: number
  periods: string[]
  series: UserSeries[]
}

export type UserDetailSummary = {
  user_id?: string
  user_name?: string
  day_count?: number
  task_count?: number
  commit_count?: number
  task_efficiency_ratio?: number | null
  commit_efficiency_ratio?: number | null
  cost?: number | null
}

export type UserDetailPeriodRow = {
  period_key?: string
  period_label?: string
  task_count?: number
  commit_count?: number
  task_diff_lines?: number
  commit_diff_lines?: number
  task_real_minutes?: number | null
  commit_real_minutes?: number | null
  task_ancient_minutes?: number | null
  commit_ancient_minutes?: number | null
  task_efficiency_ratio?: number | null
  commit_efficiency_ratio?: number | null
  upstream_tokens?: number
  downstream_tokens?: number
  cost?: number | null
}

export type UserDetailQuery = {
  userId: string
  dateRange: DateRangeValue
  granularity?: Granularity
}

export type UserDetailResult = {
  summary: UserDetailSummary
  daily: UserDetailPeriodRow[]
  commits: UserDetailPeriodRow[]
  tasks: UserDetailPeriodRow[]
}

export type UserOption = {
  user_id: string
  user_name?: string
}

export type UserGroupInfo = {
  id?: string
  name?: string
}

export type UserGroupMemberRow = UserAggregateRow & {
  day_count?: number
}

export type UserGroupSummary = {
  task_count?: number
  commit_count?: number
  task_efficiency_ratio?: number | null
  commit_efficiency_ratio?: number | null
  cost?: number | null
}

export type UserGroupDetailResult = {
  group: UserGroupInfo
  summary: UserGroupSummary
  members: UserGroupMemberRow[]
}

export type TaskRow = EfficiencyRow & {
  task_id?: string
  client_id?: string
  client_ide?: string
  client_version?: string
  client_os?: string
  client_os_version?: string
  caller?: string
  org1?: string
  org2?: string
  org3?: string
  org4?: string
  org_display?: string
  repo_addr?: string
  repo_branch?: string
  work_dir?: string
  work_dir_id?: string
  title?: string
  diff_lines?: number
  task_real_minutes?: number | null
  task_real_minutes_manual?: number | null
  task_real_minutes_reason?: string | null
  task_real_minutes_reason_manual?: string | null
  task_ancient_minutes?: number | null
  task_ancient_minutes_manual?: number | null
  task_ancient_minutes_reason?: string | null
  task_ancient_minutes_reason_manual?: string | null
  efficiency_ratio?: number | null
  upstream_tokens?: number
  downstream_tokens?: number
  cost?: number | null
}

export type TaskConversation = {
  start_time?: string
  end_time?: string
  process_time?: number | null
  process_ttft?: number | null
  prompt_mode?: string
  mode?: string
  model?: string
  error_code?: string
  error_reason?: string
  upstream_tokens?: number
  downstream_tokens?: number
  cost?: number | null
  diff_lines?: number
  user_input?: string
  output?: string
}

export type TimeSegment = {
  start?: string
  end?: string
  conv_count?: number
}

export type TaskDetailResult = {
  task: TaskRow
  conversations: TaskConversation[]
  time_segments: TimeSegment[]
  efficiency_ratio?: number | null
}

export type TaskManualPayload = {
  task_real_minutes_manual?: number | null
  task_real_minutes_reason_manual?: string
  task_ancient_minutes_manual?: number | null
  task_ancient_minutes_reason_manual?: string
}

export type TaskListQuery = {
  dateRange: DateRangeValue
  page?: number
  pageSize?: number
  userName?: string
  org?: OrgCascadeValue
}

export type TaskListResult = {
  rows: TaskRow[]
  total: number
  page: number
  pageSize: number
}

export type CommitRow = EfficiencyRow & {
  commit_id?: string
  commit_time?: string
  git_user_name?: string
  git_user_email?: string
  org1?: string
  org2?: string
  org3?: string
  org4?: string
  org_display?: string
  comment?: string
  repo_addr?: string
  repo_branch?: string
  diff_lines?: number
  commit_real_minutes?: number | null
  commit_real_minutes_manual?: number | null
  commit_real_minutes_reason?: string | null
  commit_real_minutes_reason_manual?: string | null
  commit_real_ai_minutes?: number | null
  commit_real_ancient_minutes?: number | null
  commit_ancient_minutes?: number | null
  commit_ancient_minutes_manual?: number | null
  commit_ancient_minutes_reason?: string | null
  commit_ancient_minutes_reason_manual?: string | null
  efficiency_ratio?: number | null
  upstream_tokens?: number
  downstream_tokens?: number
  cost?: number | null
  silica?: number | null
}

export type CommitRelatedTask = {
  task_id?: string
  user_name?: string
  start_time?: string
  task_real_minutes?: number | null
  silica?: number | null
  cost?: number | null
  diff_lines?: number
}

export type CommitDetailResult = {
  commit: CommitRow
  related_tasks: CommitRelatedTask[]
  efficiency_ratio?: number | null
  silica?: number | null
  total_cost?: number | null
  upstream_tokens?: number
  downstream_tokens?: number
}

export type CommitManualPayload = {
  commit_ancient_minutes_manual?: number | null
  commit_ancient_minutes_reason_manual?: string
  commit_real_minutes_manual?: number | null
  commit_real_minutes_reason_manual?: string
}

export type CommitListQuery = {
  dateRange: DateRangeValue
  page?: number
  pageSize?: number
  userName?: string
  org?: OrgCascadeValue
}

export type CommitListResult = {
  rows: CommitRow[]
  total: number
  page: number
  pageSize: number
}

export type OrgDetailQuery = {
  dateRange: DateRangeValue
  granularity?: Granularity
  org: OrgCascadeValue
}

export type OrgAggregateRow = {
  org_name?: string
  user_count?: number
  task_count?: number
  commit_count?: number
  task_diff_lines?: number
  commit_diff_lines?: number
  task_efficiency_ratio?: number | null
  commit_efficiency_ratio?: number | null
  total_tokens?: number
  total_cost?: number | null
}

export type OrgAggregatePoint = {
  period_key?: string
  period_label?: string
  user_count?: number
  task_count?: number
  commit_count?: number
  task_diff_lines?: number
  commit_diff_lines?: number
  task_efficiency_ratio?: number | null
  commit_efficiency_ratio?: number | null
  total_tokens?: number
  total_cost?: number | null
}

export type OrgAggregateSeries = {
  org_name?: string
  points: OrgAggregatePoint[]
}

export type OrgAggregateQuery = {
  dateRange: DateRangeValue
  granularity?: Granularity
  org?: OrgCascadeValue
}

export type OrgAggregateResult = {
  rows: OrgAggregateRow[]
  periods: string[]
  series: OrgAggregateSeries[]
}

export type OrgSummary = {
  user_count?: number
  task_diff_lines?: number
  commit_diff_lines?: number
  task_efficiency_ratio?: number | null
  commit_efficiency_ratio?: number | null
  cost?: number | null
}

export type OrgDetailResult = {
  summary: OrgSummary
  members: UserGroupMemberRow[]
  commits: UserDetailPeriodRow[]
  tasks: UserDetailPeriodRow[]
}

export type RepoCommitRow = EfficiencyRow & {
  commit_id?: string
  commit_time?: string
  git_user_name?: string
  comment?: string
  diff_lines?: number
  commit_real_minutes?: number | null
  commit_real_minutes_manual?: number | null
  commit_ancient_minutes?: number | null
  commit_ancient_minutes_manual?: number | null
  silica?: number | null
  cost?: number | null
  upstream_tokens?: number
  downstream_tokens?: number
  efficiency_ratio: number | null
}

export type RepoTaskRow = EfficiencyRow & {
  task_id?: string
  start_time?: string
  user_name?: string
  title?: string
  diff_lines?: number
  task_real_minutes?: number | null
  task_real_minutes_manual?: number | null
  task_ancient_minutes?: number | null
  task_ancient_minutes_manual?: number | null
  cost?: number | null
  upstream_tokens?: number
  downstream_tokens?: number
}

export type RepoEfficiency = {
  repo_ancient_minutes?: number
  repo_real_minutes?: number
  efficiency_ratio?: number | null
  repo_ancient_minutes_reason?: string
  repo_real_minutes_reason?: string
}

export type RepoSummary = {
  commit_count?: number
  task_count?: number
}

export type RepoDetailResult = {
  repo_addr: string
  repo_branch?: string
  branches: string[]
  commits: RepoCommitRow[]
  tasks: RepoTaskRow[]
  efficiency: RepoEfficiency
  summary: RepoSummary
}

export type RepoDetailQuery = {
  repoAddr: string
  repoBranch?: string
  dateRange?: DateRangeValue
}

export type ProjectOption = {
  project_id: string
  name: string
  description?: string
}

export type ProjectConflict = {
  commit_id: string
  project_id: string
  project_name: string
}

export type RepoBindingPayload = {
  repo_addr: string
  repo_branch?: string
  start_time?: string | null
  end_time?: string | null
  exclude_commits?: string[]
  include_only_commits?: string[]
}

export type TaskProjectBindingPayload = {
  task_ids: string[]
  task_ids_silica: number[]
}

export type CorrectionPayload = {
  dimension: EfficiencyDimension
  dimensionId: string
  startDate: DateValue
  endDate: DateValue
  value: number
  reason: string
  operator: string
  field?: "ai_estimated_days"
}

export type CorrectionHistoryItem = {
  field_name?: string
  old_value?: string
  new_value?: string
  reason?: string
  corrected_by?: string
  corrected_at?: string
}

export type KanbanError = {
  code?: number
  message: string
  raw?: unknown
}

export type OrgListQuery = {
  level: OrgLevel
  parent?: string
  dateRange?: DateRangeValue
}

export type DimensionKeysQuery = {
  dimension: string
  dateRange?: DateRangeValue
}

export type WorkDirMatchedTask = {
  task_id?: string
  user_name?: string
  silica?: number | null
}

export type WorkDirCommitRow = RepoCommitRow & {
  silica_reason?: string
  matched_tasks?: WorkDirMatchedTask[]
}

export type WorkDirSummary = RepoSummary & {
  user_count?: number
  total_cost?: number | null
  task_ancient_minutes?: number | null
}

export type WorkDirSilicaEntry = {
  task_id?: string
  silica?: number | null
}

export type WorkDirParticipant = {
  user_id: string
  user_name: string
  task_count: number
  commit_count: number
}

export type WorkDirDetailResult = {
  repo_addr?: string
  repo_id?: string
  repo_branch?: string
  summary: WorkDirSummary
  commits: WorkDirCommitRow[]
  tasks: RepoTaskRow[]
  silica_entries: WorkDirSilicaEntry[]
}

export type ProjectRow = {
  project_id?: string
  name?: string
  description?: string
  start_time?: string
  start_time_manual?: string
  end_time?: string
  end_time_manual?: string
  user_count?: number
  repo_count?: number
  task_count?: number
  total_code_lines?: number
  actual_lines_per_day?: number
  cost?: number
  project_real_lead_minutes?: number
  project_real_lead_minutes_manual?: number
  project_ancient_minutes?: number
  project_ancient_minutes_manual?: number
  project_real_process_minutes?: number
  project_real_process_minutes_manual?: number
  efficiency_ratio?: number | null
}

export type ProjectCreatePayload = {
  name: string
  description?: string
}

export type ProjectRepoRow = {
  repo_addr?: string
  repo_branch?: string
  start_time?: string
  end_time?: string
  exclude_commits?: string[]
  include_only_commits?: string[]
}

export type ProjectTaskRow = TaskRow & {
  silica?: number | null
}

export type ProjectCommitRow = {
  commit_id?: string
  user_name?: string
  commit_time?: string
  comment?: string
  diff_lines?: number
  commit_ancient_minutes?: number | null
  commit_ancient_minutes_manual?: number | null
  commit_real_minutes?: number | null
  commit_real_minutes_manual?: number | null
  silica?: number | null
  cost?: number | null
}

export type ProjectUserStat = {
  user_name: string
  task_count: number
  commit_count: number
  commit_diff_lines: number
  task_ancient_minutes: number
  task_real_minutes: number
  commit_ancient_minutes: number
  commit_real_minutes: number
  cost: number
  task_efficiency_ratio: number
  commit_efficiency_ratio: number
}

export type ProjectDetailResult = {
  project_id?: string
  name?: string
  description?: string
  start_time?: string
  start_time_manual?: string
  end_time?: string
  end_time_manual?: string
  upstream_tokens?: number
  downstream_tokens?: number
  cost?: number | null
  project_ancient_minutes?: number | null
  project_ancient_minutes_manual?: number | null
  project_ancient_minutes_reason?: string
  project_ancient_minutes_reason_manual?: string
  project_real_process_minutes?: number | null
  project_real_process_minutes_manual?: number | null
  project_real_process_minutes_reason?: string
  project_real_process_minutes_reason_manual?: string
  project_real_lead_minutes?: number | null
  project_real_lead_minutes_manual?: number | null
  project_real_lead_minutes_reason?: string
  project_real_lead_minutes_reason_manual?: string
  repos: ProjectRepoRow[]
  tasks: ProjectTaskRow[]
  commits: ProjectCommitRow[]
  user_count: number
}

export type ProjectManualPayload = {
  project_ancient_minutes_manual?: number | null
  project_ancient_minutes_reason_manual?: string
  project_real_process_minutes_manual?: number | null
  project_real_process_minutes_reason_manual?: string
  project_real_lead_minutes_manual?: number | null
  project_real_lead_minutes_reason_manual?: string
  start_time_manual?: string | null
  end_time_manual?: string | null
}

export type ProjectUpdatePayload = {
  name: string
  description?: string
  repos?: ProjectRepoRow[]
  task_ids?: string[]
  task_ids_silica?: number[]
}

export type GlobalConfig = {
  traditional_dev_lines_per_day?: number
}

export type Verb = "GET" | "POST" | "PUT" | "DELETE"

export type FetchOpts = {
  method?: Verb
  params?: Shape
  data?: Data
  timeout?: number
}
