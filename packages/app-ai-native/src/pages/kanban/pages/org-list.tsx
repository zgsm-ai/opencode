import { useNavigate, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, on, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { showToast } from "@opencode-ai/ui/toast"
import type { EChartsOption } from "echarts"
import { Button } from "@/components/ui/button"
import Back from "../components/back"
import { FilterBar } from "../components/filters/filter-bar"
import { ChartCard } from "../components/charts/chart-card"
import { RatioPill } from "../components/ratio-pill"
import { FilterTable } from "../components/table/filter-table"
import { useTableFilters } from "../hooks/use-table-filters"
import { queryOrgRows } from "../lib/api"
import { chart } from "../lib/chart-options"
import { defaultWideRange, normalizeDateRange, parseQueryRange, rangeQuery, readQueryRange, searchQuery, sameRange } from "../lib/date-range"
import { applyClientFilters } from "../lib/filter-utils"
import { formatPercent } from "../lib/formatters"
import type { Granularity, KanbanColumn, OrgAggregateQuery, OrgAggregateRow, OrgAggregateSeries, OrgCascadeValue } from "../lib/types"

function parseGranularity(value?: string): Granularity {
  if (value === "week" || value === "month" || value === "year") return value
  return "day"
}

function parseOrg(search: { org1?: string; org2?: string; org3?: string; org4?: string }) {
  return {
    org1: search.org1?.trim() || undefined,
    org2: search.org2?.trim() || undefined,
    org3: search.org3?.trim() || undefined,
    org4: search.org4?.trim() || undefined,
  } satisfies OrgCascadeValue
}

function sameOrg(a: OrgCascadeValue, b: OrgCascadeValue) {
  return a.org1 === b.org1 && a.org2 === b.org2 && a.org3 === b.org3 && a.org4 === b.org4
}

function fmtCost(value?: number | null) {
  if (value == null || value === 0) return "-"
  return `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function nextOrg(base: OrgCascadeValue, name?: string) {
  const txt = name?.trim()
  if (!txt) return base
  if (base.org3) return { ...base, org4: txt }
  if (base.org2) return { ...base, org3: txt }
  if (base.org1) return { ...base, org2: txt }
  return { org1: txt }
}

function orgPath(value: OrgCascadeValue) {
  return [value.org1, value.org2, value.org3, value.org4].filter(Boolean).join("/")
}

function queryOf(range: [string, string], granularity: Granularity, org: OrgCascadeValue, mock?: string) {
  const dates = rangeQuery(range)
  return searchQuery([
    ["startDate", dates.startDate],
    ["endDate", dates.endDate],
    ["granularity", granularity],
    ["org1", org.org1],
    ["org2", org.org2],
    ["org3", org.org3],
    ["org4", org.org4],
    ["mock", mock],
  ]).toString()
}

function queryString(search: Record<string, string | undefined>) {
  return searchQuery(Object.entries(search)).toString()
}

function values(series: OrgAggregateSeries, field: keyof OrgAggregateSeries["points"][number]) {
  return series.points.map((item) => Number(item[field] ?? 0))
}

export default function KanbanOrgList() {
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams<{ startDate?: string; endDate?: string; org1?: string; org2?: string; org3?: string; org4?: string; granularity?: string; mock?: string }>()
  const [state, setState] = createStore({
    page: 1,
    pageSize: 50,
    dateRange: parseQueryRange(search.startDate, search.endDate),
    org: parseOrg(search),
    granularity: parseGranularity(search.granularity),
  })

  createEffect(on(
    () => [search.startDate, search.endDate, search.org1, search.org2, search.org3, search.org4, search.granularity],
    () => {
      const next = readQueryRange(search.startDate, search.endDate)
      if (next && !sameRange(untrack(() => state.dateRange), next)) setState("dateRange", next)

      const org = parseOrg(search)
      if (!sameOrg(untrack(() => state.org), org)) setState("org", org)

      const granularity = parseGranularity(search.granularity)
      if (untrack(() => state.granularity) !== granularity) setState("granularity", granularity)
    },
  ))

  createEffect(() => {
    const next = normalizeDateRange(state.dateRange)
    if (!next) return

    const mirror = queryOf(next, state.granularity, state.org, search.mock)
    const current = queryString(search as Record<string, string | undefined>)
    if (mirror !== current) setSearch(Object.fromEntries(new URLSearchParams(mirror).entries()))
  })

  const query = createMemo<OrgAggregateQuery>(() => ({
    dateRange: state.dateRange,
    org: state.org,
    granularity: state.granularity,
  }))

  const routeQuery = (org: OrgCascadeValue) => queryOf(state.dateRange, state.granularity, org, search.mock)

  const columns = createMemo<KanbanColumn<OrgAggregateRow>[]>(() => [
    {
      prop: "org_name",
      label: "组织",
      minWidth: 160,
      render: (row) => {
        const scope = nextOrg(state.org, row.org_name)
        const path = orgPath(scope)
        return path ? (
          <button type="button" class="text-left text-sm text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)]" onClick={() => navigate(`/kanban/org/${encodeURIComponent(path)}?${routeQuery(scope)}`)}>
            {row.org_name || "-"}
          </button>
        ) : <span>{row.org_name || "-"}</span>
      },
      filter: { type: "text" },
    },
    {
      prop: "user_count",
      label: "成员数",
      minWidth: 90,
      align: "right",
      render: (row) => {
        const scope = nextOrg(state.org, row.org_name)
        return (row.user_count ?? 0) > 0 ? (
          <button type="button" class="text-right text-sm text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)]" onClick={() => navigate(`/kanban/user?${routeQuery(scope)}`)}>
            {row.user_count}
          </button>
        ) : <span>0</span>
      },
      filter: { type: "number" },
    },
    {
      prop: "task_count",
      label: "Task 数",
      minWidth: 90,
      align: "right",
      render: (row) => {
        const scope = nextOrg(state.org, row.org_name)
        return (row.task_count ?? 0) > 0 ? (
          <button type="button" class="text-right text-sm text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)]" onClick={() => navigate(`/kanban/task?${routeQuery(scope)}`)}>
            {row.task_count}
          </button>
        ) : <span>0</span>
      },
      filter: { type: "number" },
    },
    { prop: "task_diff_lines", label: "Task 代码量", minWidth: 110, align: "right", filter: { type: "number" } },
    { prop: "task_efficiency_ratio", label: "Task 提效比", minWidth: 120, align: "center", render: (row) => <RatioPill value={row.task_efficiency_ratio} />, filter: { type: "number" } },
    {
      prop: "commit_count",
      label: "Commit 数",
      minWidth: 100,
      align: "right",
      render: (row) => {
        const scope = nextOrg(state.org, row.org_name)
        return (row.commit_count ?? 0) > 0 ? (
          <button type="button" class="text-right text-sm text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)]" onClick={() => navigate(`/kanban/commit?${routeQuery(scope)}`)}>
            {row.commit_count}
          </button>
        ) : <span>0</span>
      },
      filter: { type: "number" },
    },
    { prop: "commit_diff_lines", label: "Commit 代码量", minWidth: 120, align: "right", filter: { type: "number" } },
    { prop: "commit_efficiency_ratio", label: "Commit 提效比", minWidth: 130, align: "center", render: (row) => <RatioPill value={row.commit_efficiency_ratio} />, filter: { type: "number" } },
    { prop: "total_tokens", label: "Tokens 消耗", minWidth: 120, align: "right", display: (row) => (row.total_tokens ?? 0) > 0 ? (row.total_tokens ?? 0).toLocaleString() : "-", filter: { type: "number" } },
    { prop: "total_cost", label: "总费用", minWidth: 100, align: "right", display: (row) => fmtCost(row.total_cost), filter: { type: "number" } },
  ])

  const table = useTableFilters<OrgAggregateRow>({
    columns,
    onChange: () => setState("page", 1),
  })

  const [data, { refetch }] = createResource(query, async (input) => {
    try {
      return await queryOrgRows(input)
    } catch (err) {
      showToast({ variant: "error", title: "组织列表加载失败", description: err instanceof Error ? err.message : String(err) })
      return { rows: [], periods: [], series: [] }
    }
  })

  const filtered = createMemo(() => applyClientFilters(data.latest?.rows ?? [], columns(), table.filters))
  const paged = createMemo(() => filtered().slice((state.page - 1) * state.pageSize, state.page * state.pageSize))
  const periods = createMemo(() => data.latest?.periods ?? [])
  const series = createMemo(() => data.latest?.series ?? [])

  const memberOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart("成员数", periods(), series().map((item) => ({ name: item.org_name || "-", data: values(item, "user_count") })), { type: "line" }) : undefined)
  const countOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart("Task / Commit 数", periods(), series().flatMap((item) => ([{ name: `${item.org_name || "-"} / Task`, data: values(item, "task_count") }, { name: `${item.org_name || "-"} / Commit`, data: values(item, "commit_count") }])), { type: "line" }) : undefined)
  const codeOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart("代码量", periods(), series().flatMap((item) => ([{ name: `${item.org_name || "-"} / Task`, data: values(item, "task_diff_lines") }, { name: `${item.org_name || "-"} / Commit`, data: values(item, "commit_diff_lines") }])), { type: "line" }) : undefined)
  const ratioOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart("提效比", periods(), series().flatMap((item) => ([{ name: `${item.org_name || "-"} / Task`, data: values(item, "task_efficiency_ratio") }, { name: `${item.org_name || "-"} / Commit`, data: values(item, "commit_efficiency_ratio") }])), { type: "line", format: (value) => formatPercent(value) }) : undefined)
  const tokenOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart("Tokens 消耗", periods(), series().map((item) => ({ name: item.org_name || "-", data: values(item, "total_tokens") })), { type: "line", format: (value) => value.toLocaleString() }) : undefined)
  const costOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart("总费用", periods(), series().map((item) => ({ name: item.org_name || "-", data: values(item, "total_cost") })), { type: "line", format: (value) => fmtCost(value) }) : undefined)

  return (
    <div class="flex min-h-full min-w-0 flex-col gap-5 overflow-y-auto overflow-x-clip p-[clamp(1rem,2vw,2rem)]">
      <div class="flex w-full flex-col gap-5">
        <header class="flex w-full flex-col gap-3">
          <Back />
          <h1 class="m-0 font-[var(--native-font-display)] text-[1.875rem] leading-[1.02] font-semibold tracking-[-0.05em] text-[var(--native-foreground)]">组织视图</h1>
        </header>

        <FilterBar
          dateRange={state.dateRange}
          orgValue={state.org}
          showOrg
          onDateRangeChange={(value) => {
            setState("dateRange", value ?? defaultWideRange())
            setState("page", 1)
          }}
          onOrgChange={(value) => {
            setState("org", value)
            setState("page", 1)
          }}
          actions={
            <>
              <label class="flex min-w-0 flex-col gap-2">
                <span class="text-[0.75rem] text-[var(--native-muted)]">聚合粒度</span>
                <select class="flex h-9 min-w-[8rem] rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" value={state.granularity} onChange={(e) => setState("granularity", e.currentTarget.value as Granularity)}>
                  <option value="day">天</option>
                  <option value="week">周</option>
                  <option value="month">月</option>
                  <option value="year">年</option>
                </select>
              </label>
              <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={data.loading}>{data.loading ? "刷新中..." : "刷新"}</Button>
            </>
          }
        />

        <FilterTable
          class="rounded-none"
          columns={columns()}
          rows={paged()}
          rawRows={data.latest?.rows ?? []}
          controller={table}
          loading={data.loading}
          total={filtered().length}
          page={state.page}
          pageSize={state.pageSize}
          pageSizeOptions={[25, 50, 100, 200]}
          emptyText={data.loading ? "组织列表加载中..." : "当前筛选条件下没有组织数据"}
          onPageChange={(page) => setState("page", page)}
          onPageSizeChange={(pageSize) => {
            setState("pageSize", pageSize)
            setState("page", 1)
          }}
        />

        <section class="grid gap-4 xl:grid-cols-2">
          <ChartCard option={memberOption()} empty="暂无成员数图表数据" />
          <ChartCard option={countOption()} empty="暂无 Task / Commit 数图表数据" />
          <ChartCard option={codeOption()} empty="暂无代码量图表数据" />
          <ChartCard option={ratioOption()} empty="暂无提效比图表数据" />
          <ChartCard option={tokenOption()} empty="暂无 Token 图表数据" />
          <ChartCard option={costOption()} empty="暂无费用图表数据" />
        </section>
      </div>
    </div>
  )
}