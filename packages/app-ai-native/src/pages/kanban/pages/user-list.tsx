import { useNavigate, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, on, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { showToast } from "@opencode-ai/ui/toast"
import { Button } from "@/components/ui/button"
import Back from "../components/back"
import { FilterBar } from "../components/filters/filter-bar"
import { ChartCard } from "../components/charts/chart-card"
import { RatioPill } from "../components/ratio-pill"
import { FilterTable } from "../components/table/filter-table"
import { useTableFilters } from "../hooks/use-table-filters"
import { queryUserRows } from "../lib/api"
import { chart } from "../lib/chart-options"
import { defaultWideRange, normalizeDateRange, parseQueryRange, rangeQuery, readQueryRange, searchQuery, sameRange } from "../lib/date-range"
import { applyClientFilters } from "../lib/filter-utils"
import { formatDuration, formatPercent } from "../lib/formatters"
import type { DateRangeValue, Granularity, KanbanColumn, OrgCascadeValue, UserAggregateRow, UserSeries } from "../lib/types"
import type { EChartsOption } from "echarts"

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

function points(series: UserSeries, field: keyof UserSeries["points"][number]) {
  return series.points.map((item) => Number(item[field] ?? 0))
}

export default function KanbanUserList() {
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams<{
    startDate?: string
    endDate?: string
    org1?: string
    org2?: string
    org3?: string
    org4?: string
    granularity?: string
  }>()
  const [state, setState] = createStore({
    page: 1,
    pageSize: 50,
    dateRange: parseQueryRange(search.startDate, search.endDate),
    org: parseOrg(search),
    granularity: parseGranularity(search.granularity),
  })

  const routeQuery = createMemo(() => {
    const next = rangeQuery(state.dateRange)
    return searchQuery([
      ["startDate", next.startDate],
      ["endDate", next.endDate],
      ["granularity", state.granularity],
      ["org1", state.org.org1],
      ["org2", state.org.org2],
      ["org3", state.org.org3],
      ["org4", state.org.org4],
    ]).toString()
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

    const query = rangeQuery(next)
    const mirror = searchQuery([
      ["startDate", query.startDate],
      ["endDate", query.endDate],
      ["granularity", state.granularity],
      ["org1", state.org.org1],
      ["org2", state.org.org2],
      ["org3", state.org.org3],
      ["org4", state.org.org4],
    ])
    const current = searchQuery([
      ["startDate", search.startDate],
      ["endDate", search.endDate],
      ["granularity", search.granularity],
      ["org1", search.org1],
      ["org2", search.org2],
      ["org3", search.org3],
      ["org4", search.org4],
    ])
    if (mirror.toString() !== current.toString()) setSearch(Object.fromEntries(mirror.entries()))
  })

  const columns = createMemo<KanbanColumn<UserAggregateRow>[]>(() => [
    {
      prop: "org_display",
      label: "组织",
      minWidth: 180,
      render: (row) => row.org_display?.trim()
        ? <button type="button" class="text-left text-sm text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)]" onClick={() => {
            const path = [row.org1, row.org2, row.org3, row.org4].filter(Boolean).join("/")
            if (!path) return
            navigate(`/kanban/org/${encodeURIComponent(path)}?${routeQuery()}`)
          }}>{row.org_display}</button>
        : <span>-</span>,
    },
    {
      prop: "user_name",
      label: "用户名",
      minWidth: 140,
      render: (row) => <button type="button" class="text-left text-sm text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)]" onClick={() => {
        const txt = row.user_id?.trim()
        if (!txt) return
        navigate(`/kanban/user/${encodeURIComponent(txt)}?${routeQuery()}`)
      }}>{row.user_name || row.user_id || "-"}</button>,
      filter: { type: "multi-select" },
    },
    { prop: "task_count", label: "Task数", minWidth: 90, align: "right", filter: { type: "number" } },
    { prop: "commit_count", label: "Commit数", minWidth: 100, align: "right", filter: { type: "number" } },
    { prop: "task_diff_lines", label: "Task代码量", minWidth: 110, align: "right", filter: { type: "number" } },
    { prop: "commit_diff_lines", label: "Commit代码量", minWidth: 120, align: "right", filter: { type: "number" } },
    {
      prop: "task_real_minutes",
      label: "Task实际耗时",
      minWidth: 120,
      align: "right",
      display: (row) => formatDuration(row.task_real_minutes),
      filter: { type: "number" },
    },
    {
      prop: "commit_real_minutes",
      label: "Commit实际耗时",
      minWidth: 130,
      align: "right",
      display: (row) => formatDuration(row.commit_real_minutes),
      filter: { type: "number" },
    },
    {
      prop: "task_efficiency_ratio",
      label: "Task提效比",
      minWidth: 110,
      align: "center",
      render: (row) => <RatioPill value={row.task_efficiency_ratio} />,
      filter: { type: "number" },
    },
    {
      prop: "commit_efficiency_ratio",
      label: "Commit提效比",
      minWidth: 120,
      align: "center",
      render: (row) => <RatioPill value={row.commit_efficiency_ratio} />,
      filter: { type: "number" },
    },
    {
      prop: "_tokens",
      label: "Tokens消耗",
      minWidth: 110,
      align: "right",
      display: (row) => {
        const total = (row.upstream_tokens ?? 0) + (row.downstream_tokens ?? 0)
        return total > 0 ? total.toLocaleString() : "-"
      },
      filter: { type: "number", valueGetter: (row) => (row.upstream_tokens ?? 0) + (row.downstream_tokens ?? 0) },
    },
    {
      prop: "cost",
      label: "费用",
      minWidth: 90,
      align: "right",
      display: (row) => row.cost == null || row.cost === 0 ? "-" : `¥${row.cost.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
      filter: { type: "number" },
    },
  ])

  const table = useTableFilters<UserAggregateRow>({
    columns,
    onChange: () => setState("page", 1),
  })

  const [data, { refetch }] = createResource(
    () => ({
      dateRange: state.dateRange,
      org: state.org,
      granularity: state.granularity,
      page: state.page,
      pageSize: state.pageSize,
    }),
    async (input) => {
      try {
        return await queryUserRows(input)
      } catch (err) {
        showToast({
          variant: "error",
          title: "用户列表加载失败",
          description: err instanceof Error ? err.message : String(err),
        })
        return {
          rows: [],
          total: 0,
          page: input.page,
          pageSize: input.pageSize,
          periods: [],
          series: [],
        }
      }
    },
  )

  const rows = createMemo(() => applyClientFilters(data.latest?.rows ?? [], columns(), table.filters))
  const series = createMemo(() => {
    const names = new Set(rows().map((row) => (row.user_name?.trim() || row.user_id?.trim() || "")).filter(Boolean))
    const all = data.latest?.series ?? []
    if (!names.size || names.size === all.length) return all
    return all.filter((item) => names.has(item.user_name?.trim() || item.user_id?.trim() || ""))
  })
  const periods = createMemo(() => data.latest?.periods ?? [])

  const countOption = createMemo<EChartsOption | undefined>(() => {
    if (!periods().length || !series().length) return undefined
    const list = series().flatMap((item) => [
      { name: `${item.user_name || item.user_id || "-"} Task数`, data: points(item, "task_count") },
      { name: `${item.user_name || item.user_id || "-"} Commit数`, data: points(item, "commit_count") },
    ])
    return chart("Task数 & Commit数", periods(), list)
  })

  const codeOption = createMemo<EChartsOption | undefined>(() => {
    if (!periods().length || !series().length) return undefined
    const list = series().flatMap((item) => [
      { name: `${item.user_name || item.user_id || "-"} Task代码量`, data: points(item, "task_diff_lines") },
      { name: `${item.user_name || item.user_id || "-"} Commit代码量`, data: points(item, "commit_diff_lines") },
    ])
    return chart("Task代码量 & Commit代码量", periods(), list)
  })

  const timeOption = createMemo<EChartsOption | undefined>(() => {
    if (!periods().length || !series().length) return undefined
    const list = series().flatMap((item) => [
      { name: `${item.user_name || item.user_id || "-"} Task传统耗时`, data: points(item, "task_ancient_minutes") },
      { name: `${item.user_name || item.user_id || "-"} Commit传统耗时`, data: points(item, "commit_ancient_minutes") },
      { name: `${item.user_name || item.user_id || "-"} Task实际耗时`, data: points(item, "task_real_minutes") },
      { name: `${item.user_name || item.user_id || "-"} Commit实际耗时`, data: points(item, "commit_real_minutes") },
    ])
    return chart("传统耗时 & 实际耗时（分钟）", periods(), list, { format: (value) => formatDuration(value) })
  })

  const ratioOption = createMemo<EChartsOption | undefined>(() => {
    if (!periods().length || !series().length) return undefined
    const list = series().flatMap((item) => [
      { name: `${item.user_name || item.user_id || "-"} Task提效比`, data: points(item, "task_efficiency_ratio") },
      { name: `${item.user_name || item.user_id || "-"} Commit提效比`, data: points(item, "commit_efficiency_ratio") },
    ])
    return chart("Task提效比 & Commit提效比", periods(), list, { format: (value) => formatPercent(value) })
  })

  const tokenOption = createMemo<EChartsOption | undefined>(() => {
    if (!periods().length || !series().length) return undefined
    const list = series().map((item) => ({ name: item.user_name || item.user_id || "-", data: points(item, "total_tokens") }))
    return chart("Tokens消耗", periods(), list)
  })

  const costOption = createMemo<EChartsOption | undefined>(() => {
    if (!periods().length || !series().length) return undefined
    const list = series().map((item) => ({ name: item.user_name || item.user_id || "-", data: points(item, "total_cost") }))
    return chart("总费用", periods(), list, { format: (value) => `${value.toFixed(2)} 元` })
  })

  return (
    <div class="flex min-h-full min-w-0 flex-col gap-4 overflow-y-auto overflow-x-clip p-[clamp(1rem,2vw,2rem)]">
      <div class="flex w-full flex-col gap-5">
        <header class="flex w-full flex-col gap-3">
          <Back />
          <h1 class="m-0 font-[var(--native-font-display)] text-[1.875rem] leading-[1.02] font-semibold tracking-[-0.05em] text-[var(--native-foreground)]">用户视图</h1>
        </header>

        <FilterBar
          dateRange={state.dateRange}
          orgValue={state.org}
          showOrg
          onDateRangeChange={(value) => {
            const next = value ?? defaultWideRange()
            setState("dateRange", next)
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
                <select
                  class="flex h-10 min-w-[8rem] rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={state.granularity}
                  onChange={(e) => {
                    setState("granularity", e.currentTarget.value as Granularity)
                    setState("page", 1)
                  }}
                >
                  <option value="day">天</option>
                  <option value="week">周</option>
                  <option value="month">月</option>
                  <option value="year">年</option>
                </select>
              </label>
              <div class="flex items-end">
                <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={data.loading}>
                  {data.loading ? "刷新中..." : "刷新"}
                </Button>
              </div>
            </>
          }
        />

        <FilterTable
          class="rounded-none"
          columns={columns()}
          rows={rows()}
          rawRows={data.latest?.rows ?? []}
          controller={table}
          loading={data.loading}
          total={data.latest?.total ?? 0}
          page={state.page}
          pageSize={state.pageSize}
          pageSizeOptions={[50, 100, 250]}
          emptyText={data.loading ? "用户聚合加载中..." : "当前时间范围内没有用户数据"}
          onPageChange={(page) => setState("page", page)}
          onPageSizeChange={(pageSize) => {
            setState("pageSize", pageSize)
            setState("page", 1)
          }}
        />

        <section class="grid gap-4 lg:grid-cols-2">
          <ChartCard option={countOption()} empty="暂无数量图表数据" />
          <ChartCard option={codeOption()} empty="暂无代码量图表数据" />
          <ChartCard option={timeOption()} empty="暂无耗时图表数据" />
          <ChartCard option={ratioOption()} empty="暂无提效比图表数据" />
          <ChartCard option={tokenOption()} empty="暂无 Token 图表数据" />
          <ChartCard option={costOption()} empty="暂无费用图表数据" />
        </section>
      </div>
    </div>
  )
}