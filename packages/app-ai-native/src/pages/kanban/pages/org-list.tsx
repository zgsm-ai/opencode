import { useNavigate, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, on, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import type { EChartsOption } from "echarts"
import { Button } from "@/components/ui/button"
import { createListCollection, SelectContent, SelectControl, SelectIndicator, SelectItem, SelectItemText, SelectList, SelectPositioner, SelectRoot, SelectTrigger, SelectValueText } from "@/components/ui/select"
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

function queryOf(range: [string, string], granularity: Granularity, org: OrgCascadeValue) {
  const dates = rangeQuery(range)
  return searchQuery([
    ["startDate", dates.startDate],
    ["endDate", dates.endDate],
    ["granularity", granularity],
    ["org1", org.org1],
    ["org2", org.org2],
    ["org3", org.org3],
    ["org4", org.org4],
  ]).toString()
}

function values(series: OrgAggregateSeries, field: keyof OrgAggregateSeries["points"][number]) {
  return series.points.map((item) => Number(item[field] ?? 0))
}

export default function KanbanOrgList() {
  const language = useLanguage()
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams<{ startDate?: string; endDate?: string; org1?: string; org2?: string; org3?: string; org4?: string; granularity?: string }>()
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

    const mirror = queryOf(next, state.granularity, state.org)
    const current = searchQuery([
      ["startDate", search.startDate],
      ["endDate", search.endDate],
      ["granularity", search.granularity],
      ["org1", search.org1],
      ["org2", search.org2],
      ["org3", search.org3],
      ["org4", search.org4],
    ]).toString()
    if (mirror !== current) setSearch(Object.fromEntries(new URLSearchParams(mirror).entries()))
  })

  const query = createMemo<OrgAggregateQuery>(() => ({
    dateRange: state.dateRange,
    org: { org1: state.org.org1, org2: state.org.org2, org3: state.org.org3, org4: state.org.org4 },
    granularity: state.granularity,
  }))

  const routeQuery = (org: OrgCascadeValue) => queryOf(state.dateRange, state.granularity, org)

  const columns = createMemo<KanbanColumn<OrgAggregateRow>[]>(() => [
    {
      prop: "org_name",
      label: language.t("kanban.table.org"),
      minWidth: 160,
      render: (row) => {
        const txt = row.org_name?.trim()
        const scope = nextOrg(state.org, txt)
        const path = orgPath(scope)
        if (!txt) return <span>-</span>
        return path ? (
          <button type="button" class="block max-w-[18rem] truncate text-left text-sm text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)] cursor-pointer" title={txt} onClick={() => navigate(`/kanban/org/${encodeURIComponent(path)}?${routeQuery(scope)}`)}>
            {txt}
          </button>
        ) : <span class="block max-w-[18rem] truncate" title={txt}>{txt}</span>
      },
      filter: { type: "text" },
    },
    {
      prop: "user_count",
      label: language.t("kanban.metric.memberCount"),
      minWidth: 90,
      align: "left",
      render: (row) => {
        const scope = nextOrg(state.org, row.org_name)
        return (row.user_count ?? 0) > 0 ? (
          <button type="button" class="text-left text-sm text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)] cursor-pointer" onClick={() => navigate(`/kanban/user?${routeQuery(scope)}`)}>
            {row.user_count}
          </button>
        ) : <span>0</span>
      },
      filter: { type: "number", shortcuts: [{ label: "> 0", value: { min: 1 } }, { label: "> 50", value: { min: 50 } }, { label: "> 100", value: { min: 100 } }] },
    },
    {
      prop: "task_count",
      label: language.t("kanban.table.taskCount"),
      minWidth: 90,
      align: "left",
      render: (row) => {
        const scope = nextOrg(state.org, row.org_name)
        return (row.task_count ?? 0) > 0 ? (
          <button type="button" class="text-left text-sm text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)] cursor-pointer" onClick={() => navigate(`/kanban/task?${routeQuery(scope)}`)}>
            {row.task_count}
          </button>
        ) : <span>0</span>
      },
      filter: { type: "number", shortcuts: [{ label: "> 0", value: { min: 1 } }, { label: "> 50", value: { min: 50 } }, { label: "> 100", value: { min: 100 } }] },
    },
    { prop: "task_diff_lines", label: language.t("kanban.metric.taskCodeAmount"), minWidth: 110, align: "left", filter: { type: "number", shortcuts: [{ label: "> 0", value: { min: 1 } }, { label: "> 50", value: { min: 50 } }, { label: "> 200", value: { min: 200 } }] } },
    { prop: "task_efficiency_ratio", label: language.t("kanban.table.taskEfficiencyRatio"), minWidth: 120, align: "left", render: (row) => <RatioPill value={row.task_efficiency_ratio} />, filter: { type: "number", shortcuts: [{ label: "> 100%", value: { min: 100 } }, { label: "> 200%", value: { min: 200 } }, { label: "> 300%", value: { min: 300 } }] } },
    {
      prop: "commit_count",
      label: language.t("kanban.table.commitCount"),
      minWidth: 100,
      align: "left",
      render: (row) => {
        const scope = nextOrg(state.org, row.org_name)
        return (row.commit_count ?? 0) > 0 ? (
          <button type="button" class="text-left text-sm text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)] cursor-pointer" onClick={() => navigate(`/kanban/commit?${routeQuery(scope)}`)}>
            {row.commit_count}
          </button>
        ) : <span>0</span>
      },
      filter: { type: "number", shortcuts: [{ label: "> 0", value: { min: 1 } }, { label: "> 50", value: { min: 50 } }, { label: "> 100", value: { min: 100 } }] },
    },
    { prop: "commit_diff_lines", label: language.t("kanban.metric.commitCodeAmount"), minWidth: 120, align: "left", filter: { type: "number", shortcuts: [{ label: "> 0", value: { min: 1 } }, { label: "> 50", value: { min: 50 } }, { label: "> 200", value: { min: 200 } }] } },
    { prop: "commit_efficiency_ratio", label: language.t("kanban.table.commitEfficiencyRatio"), minWidth: 130, align: "left", render: (row) => <RatioPill value={row.commit_efficiency_ratio} />, filter: { type: "number", shortcuts: [{ label: "> 100%", value: { min: 100 } }, { label: "> 200%", value: { min: 200 } }, { label: "> 300%", value: { min: 300 } }] } },
    { prop: "total_tokens", label: language.t("kanban.table.tokensConsumed"), minWidth: 120, align: "left", display: (row) => (row.total_tokens ?? 0) > 0 ? (row.total_tokens ?? 0).toLocaleString() : "-", filter: { type: "number", shortcuts: [{ label: "> 0", value: { min: 1 } }, { label: "> 10k", value: { min: 10000 } }, { label: "> 100k", value: { min: 100000 } }] } },
    { prop: "total_cost", label: language.t("kanban.metric.totalCost"), minWidth: 100, align: "left", display: (row) => fmtCost(row.total_cost), filter: { type: "number", shortcuts: [{ label: "> 0", value: { min: 0.001 } }, { label: "> 0.01", value: { min: 0.01 } }, { label: "> 0.1", value: { min: 0.1 } }] } },
  ])

  const table = useTableFilters<OrgAggregateRow>({
    columns,
    onChange: () => setState("page", 1),
  })

  const granularityItems = createMemo(() =>
    createListCollection({
      items: [
        { value: "day" as const, label: language.t("kanban.granularity.day") },
        { value: "week" as const, label: language.t("kanban.granularity.week") },
        { value: "month" as const, label: language.t("kanban.granularity.month") },
        { value: "year" as const, label: language.t("kanban.granularity.year") },
      ],
      itemToValue: (item) => item.value,
      itemToString: (item) => item.label,
    }),
  )

  const [data, { refetch }] = createResource(query, async (input) => {
    try {
      return await queryOrgRows(input)
    } catch (err) {
      showToast({ variant: "error", title: language.t("kanban.toast.loadFailed"), description: err instanceof Error ? err.message : String(err) })
      return { rows: [], periods: [], series: [] }
    }
  })

  const filtered = createMemo(() => applyClientFilters(data.latest?.rows ?? [], columns(), table.filters))
  const paged = createMemo(() => filtered().slice((state.page - 1) * state.pageSize, state.page * state.pageSize))
  const periods = createMemo(() => data.latest?.periods ?? [])
  const series = createMemo(() => data.latest?.series ?? [])

  const memberOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart(language.t("kanban.metric.memberCount"), periods(), series().map((item) => ({ name: item.org_name || "-", data: values(item, "user_count") })), { type: "line" }) : undefined)
  const countOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart(`${language.t("kanban.table.taskCount")} / ${language.t("kanban.table.commitCount")}`, periods(), series().flatMap((item) => ([{ name: `${item.org_name || "-"} / ${language.t("kanban.chart.series.task")}`, data: values(item, "task_count") }, { name: `${item.org_name || "-"} / ${language.t("kanban.chart.series.commit")}`, data: values(item, "commit_count") }])), { type: "line" }) : undefined)
  const codeOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart(language.t("kanban.metric.codeLines"), periods(), series().flatMap((item) => ([{ name: `${item.org_name || "-"} / ${language.t("kanban.chart.series.task")}`, data: values(item, "task_diff_lines") }, { name: `${item.org_name || "-"} / ${language.t("kanban.chart.series.commit")}`, data: values(item, "commit_diff_lines") }])), { type: "line" }) : undefined)
  const ratioOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart(language.t("kanban.chart.efficiencyRatio"), periods(), series().flatMap((item) => ([{ name: `${item.org_name || "-"} / ${language.t("kanban.chart.series.task")}`, data: values(item, "task_efficiency_ratio") }, { name: `${item.org_name || "-"} / ${language.t("kanban.chart.series.commit")}`, data: values(item, "commit_efficiency_ratio") }])), { type: "line", format: (value) => formatPercent(value) }) : undefined)
  const tokenOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart(language.t("kanban.table.tokensConsumed"), periods(), series().map((item) => ({ name: item.org_name || "-", data: values(item, "total_tokens") })), { type: "line", format: (value) => value.toLocaleString() }) : undefined)
  const costOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart(language.t("kanban.metric.totalCost"), periods(), series().map((item) => ({ name: item.org_name || "-", data: values(item, "total_cost") })), { type: "line", format: (value) => fmtCost(value) }) : undefined)

  return (
    <div class="flex min-h-full min-w-0 flex-col gap-5 overflow-y-auto overflow-x-clip p-[clamp(1rem,2vw,2rem)]">
      <div class="flex w-full flex-col gap-5">
        <header class="flex w-full flex-col gap-3">
          <Back />
          <h1 class="m-0 font-[var(--native-font-display)] text-[1.875rem] leading-[1.02] font-semibold tracking-[-0.05em] text-[var(--native-foreground)]">{language.t("kanban.view.org")}</h1>
        </header>

        <FilterBar
          dateRange={state.dateRange}
          orgValue={state.org}
          dateSlot="actions"
          dateLabel={false}
          showOrg
          onDateRangeChange={(value) => {
            setState("dateRange", value ?? defaultWideRange())
            setState("page", 1)
          }}
          onOrgChange={(value) => {
            setState("org", { org1: value.org1, org2: value.org2, org3: value.org3, org4: value.org4 })
            setState("page", 1)
          }}
          actions={
            <>
              <label class="flex min-w-0 flex-col gap-2">
                <SelectRoot
                  collection={granularityItems()}
                  value={[state.granularity]}
                  onValueChange={(details) => {
                    const val = details.value[0]
                    if (val) {
                      setState("granularity", val as Granularity)
                      setState("page", 1)
                    }
                  }}
                  positioning={{ fitViewport: true, sameWidth: true }}
                >
                  <SelectControl>
                    <SelectTrigger class="h-10 w-[6rem] min-w-[6rem] flex-none">
                      <SelectValueText />
                      <SelectIndicator />
                    </SelectTrigger>
                  </SelectControl>
                  <SelectPositioner>
                    <SelectContent class="max-h-[min(20rem,calc(var(--available-height)-1rem))] overflow-y-auto">
                      <SelectList>
                        <SelectItem item={granularityItems().items[0]}>
                          <SelectItemText>{language.t("kanban.granularity.day")}</SelectItemText>
                        </SelectItem>
                        <SelectItem item={granularityItems().items[1]}>
                          <SelectItemText>{language.t("kanban.granularity.week")}</SelectItemText>
                        </SelectItem>
                        <SelectItem item={granularityItems().items[2]}>
                          <SelectItemText>{language.t("kanban.granularity.month")}</SelectItemText>
                        </SelectItem>
                        <SelectItem item={granularityItems().items[3]}>
                          <SelectItemText>{language.t("kanban.granularity.year")}</SelectItemText>
                        </SelectItem>
                      </SelectList>
                    </SelectContent>
                  </SelectPositioner>
                </SelectRoot>
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
          class="min-w-0 rounded-none"
          scrollClass="max-h-[calc(100vh-22rem)] min-h-0 min-w-0 overflow-auto"
          columns={columns()}
          rows={paged()}
          rawRows={data.latest?.rows ?? []}
          controller={table}
          loading={data.loading}
          total={filtered().length}
          page={state.page}
          pageSize={state.pageSize}
          pageSizeOptions={[25, 50, 100, 200]}
          emptyText={data.loading ? language.t("kanban.loading.orgList") : language.t("kanban.empty.noOrgData")}
          onPageChange={(page) => setState("page", page)}
          onPageSizeChange={(pageSize) => {
            setState("pageSize", pageSize)
            setState("page", 1)
          }}
        />

        <section class="grid gap-4 xl:grid-cols-2">
          <ChartCard option={memberOption()} empty={language.t("kanban.chart.empty.memberCount")} />
          <ChartCard option={countOption()} empty={language.t("kanban.chart.empty.count")} />
          <ChartCard option={codeOption()} empty={language.t("kanban.chart.empty.code")} />
          <ChartCard option={ratioOption()} empty={language.t("kanban.chart.empty.ratio")} />
          <ChartCard option={tokenOption()} empty={language.t("kanban.chart.empty.token")} />
          <ChartCard option={costOption()} empty={language.t("kanban.chart.empty.cost")} />
        </section>
      </div>
    </div>
  )
}