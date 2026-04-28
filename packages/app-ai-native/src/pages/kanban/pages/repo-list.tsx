import { A, useNavigate, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, on } from "solid-js"
import { createStore } from "solid-js/store"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { Button } from "@/components/ui/button"
import Back from "../components/back"
import { DateRangePicker } from "../components/filters/date-range-picker"
import { RatioPill } from "../components/ratio-pill"
import { FilterTable } from "../components/table/filter-table"
import { useTableFilters } from "../hooks/use-table-filters"
import { queryRepoRows } from "../lib/api"
import { defaultWideRange, normalizeDateRange, parseQueryRange, rangeQuery, searchQuery, sameRange } from "../lib/date-range"
import { applyClientFilters } from "../lib/filter-utils"
import { formatDuration } from "../lib/formatters"
import type { DateRangeValue, KanbanColumn, RepoAggregateRow } from "../lib/types"

export default function KanbanRepoList() {
  const language = useLanguage()
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams<{ startDate?: string; endDate?: string }>()
  const [state, setState] = createStore({
    page: 1,
    pageSize: 250,
    serverRange: parseQueryRange(search.startDate, search.endDate),
  })

  const routeQuery = createMemo(() => {
    const next = rangeQuery(state.serverRange)
    return searchQuery([
      ["startDate", next.startDate],
      ["endDate", next.endDate],
    ]).toString()
  })

  const detailHref = (row: RepoAggregateRow) => {
    const addr = row.repo_addr?.trim()
    if (!addr) return ""
    const branch = row.repo_branch?.trim()
    const tail = routeQuery()
    return branch
      ? `/kanban/repo/${encodeURIComponent(addr)}/${encodeURIComponent(branch)}?${tail}`
      : `/kanban/repo/${encodeURIComponent(addr)}?${tail}`
  }

  const columns = createMemo<KanbanColumn<RepoAggregateRow>[]>(() => [
    {
      prop: "repo_addr",
      label: language.t("kanban.metric.repoUrl"),
      minWidth: 300,
      render: (row) => {
        const addr = row.repo_addr?.trim()
        const href = detailHref(row)
        if (!addr || !href) return <span>-</span>
        return (
          <A
            href={href}
            class="block max-w-[24rem] truncate text-left text-sm text-[var(--native-primary)] underline-offset-2 transition-colors hover:text-[var(--native-foreground)] hover:underline"
            title={addr}
            onClick={(event) => event.stopPropagation()}
          >
            {addr}
          </A>
        )
      },
      filter: { type: "text" },
    },
    {
      prop: "repo_branch",
      label: language.t("kanban.metric.branch"),
      minWidth: 120,
      filter: { type: "multi-select" },
    },
    {
      prop: "commit_count",
      label: language.t("kanban.table.commitCount"),
      minWidth: 110,
      align: "left",
      filter: { type: "number" },
    },
    {
      prop: "task_count",
      label: language.t("kanban.table.taskCount"),
      minWidth: 110,
      align: "left",
      filter: { type: "number" },
    },
    {
      prop: "sum_ancient_minutes",
      label: language.t("kanban.metric.traditionalEst"),
      minWidth: 150,
      align: "left",
      display: (row) => formatDuration(row.sum_ancient_minutes, language.t),
      filter: { type: "number" },
    },
    {
      prop: "sum_real_minutes",
      label: language.t("kanban.metric.actualTime"),
      minWidth: 130,
      align: "left",
      display: (row) => formatDuration(row.sum_real_minutes, language.t),
      filter: { type: "number" },
    },
    {
      prop: "efficiency_ratio",
      label: language.t("kanban.metric.efficiencyRatio"),
      minWidth: 110,
      align: "left",
      render: (row) => <RatioPill value={row.efficiency_ratio} />,
      filter: {
        type: "number",
        shortcuts: [
          { label: "> 100%", value: { min: 100 } },
          { label: "> 200%", value: { min: 200 } },
          { label: "> 300%", value: { min: 300 } },
        ],
      },
    },
    {
      prop: "start_time",
      label: language.t("kanban.metric.startTime"),
      minWidth: 150,
    },
  ])

  const controller = useTableFilters<RepoAggregateRow>({
    columns,
    onChange: () => setState("page", 1),
  })

  createEffect(on(
    () => [search.startDate, search.endDate],
    () => {
      const next = parseQueryRange(search.startDate, search.endDate)
      if (!sameRange(state.serverRange, next)) setState("serverRange", next)
    },
  ))

  createEffect(() => {
    const query = rangeQuery(state.serverRange)
    const mirror = searchQuery([
      ["startDate", query.startDate],
      ["endDate", query.endDate],
    ])
    const current = searchQuery([
      ["startDate", search.startDate],
      ["endDate", search.endDate],
    ])
    if (mirror.toString() !== current.toString()) setSearch(Object.fromEntries(mirror.entries()))
  })

  const [repoRows, { refetch }] = createResource(
    () => ({
      start: state.serverRange[0],
      end: state.serverRange[1],
      page: state.page,
      pageSize: state.pageSize,
    }),
    async (input) => {
      try {
        return await queryRepoRows({
          dateRange: [input.start, input.end],
          page: input.page,
          pageSize: input.pageSize,
        })
      } catch (err) {
        showToast({
          variant: "error",
          title: language.t("kanban.repo.loadFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
        return {
          rows: [],
          total: 0,
          page: input.page,
          pageSize: input.pageSize,
        }
      }
    },
  )

  const filteredRows = createMemo(() => applyClientFilters(repoRows.latest?.rows ?? [], columns(), controller.filters))

  return (
    <div class="flex min-h-full min-w-0 flex-col gap-4 overflow-y-auto overflow-x-clip p-[clamp(1rem,2vw,2rem)]">
      <header class="flex w-full flex-col gap-3">
        <Back />
        <h1 class="m-0 font-[var(--native-font-display)] text-[1.875rem] leading-[1.02] font-semibold tracking-[-0.05em] text-[var(--native-foreground)]">{language.t("kanban.repo.listTitle")}</h1>
      </header>

      <div class="flex w-full flex-col gap-5">
        <FilterTable
          class="rounded-none"
          columns={columns()}
          rows={filteredRows()}
          rawRows={repoRows.latest?.rows ?? []}
          controller={controller}
          loading={repoRows.loading}
          total={repoRows.latest?.total ?? 0}
          page={state.page}
          pageSize={state.pageSize}
          pageSizeOptions={[250, 500, 1000]}
          dateRange={state.serverRange}
          emptyText={repoRows.loading ? language.t("kanban.repo.loading") : language.t("kanban.repo.empty")}
          actions={
            <div class="flex flex-wrap items-center gap-2">
              <DateRangePicker
                value={state.serverRange}
                placeholder={language.t("kanban.form.dateRange")}
                size="sm"
                fullWidth={false}
                onChange={(value) => {
                  setState("serverRange", normalizeDateRange(value) ?? defaultWideRange())
                  setState("page", 1)
                }}
              />
              <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={repoRows.loading}>
                {repoRows.loading ? language.t("kanban.repo.refreshing") : language.t("kanban.repo.refresh")}
              </Button>
            </div>
          }
          onPageChange={(page) => setState("page", page)}
          onPageSizeChange={(size) => {
            setState("pageSize", size)
            setState("page", 1)
          }}
          onRowClick={(row) => {
            const href = detailHref(row)
            if (!href) return
            navigate(href)
          }}
        />
      </div>
    </div>
  )
}