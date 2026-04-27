import { useNavigate, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, on, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
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
  const language = useLanguage()
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
      label: language.t("kanban.table.org"),
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
      label: language.t("kanban.table.userName"),
      minWidth: 140,
      render: (row) => <button type="button" class="text-left text-sm text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)]" onClick={() => {
        const txt = row.user_id?.trim()
        if (!txt) return
        navigate(`/kanban/user/${encodeURIComponent(txt)}?${routeQuery()}`)
      }}>{row.user_name || row.user_id || "-"}</button>,
      filter: { type: "multi-select" },
    },
    { prop: "task_count", label: language.t("kanban.table.taskCount"), minWidth: 90, align: "right", filter: { type: "number" } },
    { prop: "commit_count", label: language.t("kanban.table.commitCount"), minWidth: 100, align: "right", filter: { type: "number" } },
    { prop: "task_diff_lines", label: language.t("kanban.table.taskCodeLines"), minWidth: 110, align: "right", filter: { type: "number" } },
    { prop: "commit_diff_lines", label: language.t("kanban.table.commitCodeLines"), minWidth: 120, align: "right", filter: { type: "number" } },
    {
      prop: "task_real_minutes",
      label: language.t("kanban.table.taskActualTime"),
      minWidth: 120,
      align: "right",
      display: (row) => formatDuration(row.task_real_minutes, language.t),
      filter: { type: "number" },
    },
    {
      prop: "commit_real_minutes",
      label: language.t("kanban.table.commitActualTime"),
      minWidth: 130,
      align: "right",
      display: (row) => formatDuration(row.commit_real_minutes, language.t),
      filter: { type: "number" },
    },
    {
      prop: "task_efficiency_ratio",
      label: language.t("kanban.table.taskEfficiency"),
      minWidth: 110,
      align: "center",
      render: (row) => <RatioPill value={row.task_efficiency_ratio} />,
      filter: { type: "number" },
    },
    {
      prop: "commit_efficiency_ratio",
      label: language.t("kanban.table.commitEfficiency"),
      minWidth: 120,
      align: "center",
      render: (row) => <RatioPill value={row.commit_efficiency_ratio} />,
      filter: { type: "number" },
    },
    {
      prop: "_tokens",
      label: language.t("kanban.table.tokensConsumed"),
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
      label: language.t("kanban.table.cost"),
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
          title: language.t("kanban.loading.userList"),
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
      { name: `${item.user_name || item.user_id || "-"} ${language.t("kanban.chart.series.task")}`, data: points(item, "task_count") },
      { name: `${item.user_name || item.user_id || "-"} ${language.t("kanban.chart.series.commit")}`, data: points(item, "commit_count") },
    ])
    return chart(language.t("kanban.chart.tasksAndCommits"), periods(), list)
  })

  const codeOption = createMemo<EChartsOption | undefined>(() => {
    if (!periods().length || !series().length) return undefined
    const list = series().flatMap((item) => [
      { name: `${item.user_name || item.user_id || "-"} ${language.t("kanban.chart.series.taskCode")}`, data: points(item, "task_diff_lines") },
      { name: `${item.user_name || item.user_id || "-"} ${language.t("kanban.chart.series.commitCode")}`, data: points(item, "commit_diff_lines") },
    ])
    return chart(language.t("kanban.chart.taskAndCommitCode"), periods(), list)
  })

  const timeOption = createMemo<EChartsOption | undefined>(() => {
    if (!periods().length || !series().length) return undefined
    const list = series().flatMap((item) => [
      { name: `${item.user_name || item.user_id || "-"} ${language.t("kanban.chart.series.taskTrad")}`, data: points(item, "task_ancient_minutes") },
      { name: `${item.user_name || item.user_id || "-"} ${language.t("kanban.chart.series.commitTrad")}`, data: points(item, "commit_ancient_minutes") },
      { name: `${item.user_name || item.user_id || "-"} ${language.t("kanban.chart.series.taskActual")}`, data: points(item, "task_real_minutes") },
      { name: `${item.user_name || item.user_id || "-"} ${language.t("kanban.chart.series.commitActual")}`, data: points(item, "commit_real_minutes") },
    ])
    return chart(language.t("kanban.chart.traditionalVsActual"), periods(), list, { format: (value) => formatDuration(value, language.t) })
  })

  const ratioOption = createMemo<EChartsOption | undefined>(() => {
    if (!periods().length || !series().length) return undefined
    const list = series().flatMap((item) => [
      { name: `${item.user_name || item.user_id || "-"} ${language.t("kanban.chart.series.taskEff")}`, data: points(item, "task_efficiency_ratio") },
      { name: `${item.user_name || item.user_id || "-"} ${language.t("kanban.chart.series.commitEff")}`, data: points(item, "commit_efficiency_ratio") },
    ])
    return chart(language.t("kanban.chart.efficiencyRatio"), periods(), list, { format: (value) => formatPercent(value) })
  })

  const tokenOption = createMemo<EChartsOption | undefined>(() => {
    if (!periods().length || !series().length) return undefined
    const list = series().map((item) => ({ name: item.user_name || item.user_id || "-", data: points(item, "total_tokens") }))
    return chart(language.t("kanban.chart.tokens"), periods(), list)
  })

  const costOption = createMemo<EChartsOption | undefined>(() => {
    if (!periods().length || !series().length) return undefined
    const list = series().map((item) => ({ name: item.user_name || item.user_id || "-", data: points(item, "total_cost") }))
    return chart(language.t("kanban.chart.cost"), periods(), list, { format: (value) => `¥${value.toFixed(2)}` })
  })

  return (
    <div class="flex min-h-full min-w-0 flex-col gap-4 overflow-y-auto overflow-x-clip p-[clamp(1rem,2vw,2rem)]">
      <div class="flex w-full flex-col gap-5">
        <header class="flex w-full flex-col gap-3">
          <Back />
          <h1 class="m-0 font-[var(--native-font-display)] text-[1.875rem] leading-[1.02] font-semibold tracking-[-0.05em] text-[var(--native-foreground)]">{language.t("kanban.view.user")}</h1>
        </header>

        <FilterBar
          dateRange={state.dateRange}
          orgValue={state.org}
          dateSlot="actions"
          dateLabel={false}
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
                <select
                  class="h-10 w-[6rem] min-w-[6rem] flex-none rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={state.granularity}
                  onChange={(e) => {
                    setState("granularity", e.currentTarget.value as Granularity)
                    setState("page", 1)
                  }}
                >
                  <option value="day">{language.t("kanban.granularity.day")}</option>
                  <option value="week">{language.t("kanban.granularity.week")}</option>
                  <option value="month">{language.t("kanban.granularity.month")}</option>
                  <option value="year">{language.t("kanban.granularity.year")}</option>
                </select>
              </label>
              <div class="flex items-end">
                <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={data.loading}>
                  {data.loading ? language.t("kanban.action.refreshing") : language.t("kanban.action.refresh")}
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
          emptyText={data.loading ? language.t("kanban.loading.userAggregate") : language.t("kanban.empty.noUserData")}
          onPageChange={(page) => setState("page", page)}
          onPageSizeChange={(pageSize) => {
            setState("pageSize", pageSize)
            setState("page", 1)
          }}
        />

        <section class="grid gap-4 lg:grid-cols-2">
          <ChartCard option={countOption()} empty={language.t("kanban.chart.empty.count")} />
          <ChartCard option={codeOption()} empty={language.t("kanban.chart.empty.code")} />
          <ChartCard option={timeOption()} empty={language.t("kanban.chart.empty.time")} />
          <ChartCard option={ratioOption()} empty={language.t("kanban.chart.empty.ratio")} />
          <ChartCard option={tokenOption()} empty={language.t("kanban.chart.empty.token")} />
          <ChartCard option={costOption()} empty={language.t("kanban.chart.empty.cost")} />
        </section>
      </div>
    </div>
  )
}