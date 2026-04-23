import { useNavigate, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, on } from "solid-js"
import { createStore } from "solid-js/store"
import { showToast } from "@opencode-ai/ui/toast"
import { Button } from "@/components/ui/button"
import Back from "../components/back"
import { RatioPill } from "../components/ratio-pill"
import { FilterTable } from "../components/table/filter-table"
import { useTableFilters } from "../hooks/use-table-filters"
import { queryRepoRows } from "../lib/api"
import { normalizeDateRange, parseQueryRange, rangeQuery, readQueryRange, searchQuery, sameRange } from "../lib/date-range"
import { applyClientFilters } from "../lib/filter-utils"
import { formatDuration } from "../lib/formatters"
import type { DateRangeValue, KanbanColumn, RepoAggregateRow } from "../lib/types"

export default function KanbanRepoList() {
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams<{ startDate?: string; endDate?: string; mock?: string }>()
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
      ["mock", search.mock],
    ]).toString()
  })

  const columns = createMemo<KanbanColumn<RepoAggregateRow>[]>(() => [
    {
      prop: "repo_addr",
      label: "仓库地址",
      minWidth: 300,
      filter: { type: "text" },
    },
    {
      prop: "repo_branch",
      label: "分支",
      minWidth: 120,
      filter: { type: "multi-select" },
    },
    {
      prop: "commit_count",
      label: "Commit数",
      minWidth: 110,
      align: "right",
      filter: { type: "number" },
    },
    {
      prop: "task_count",
      label: "Task数",
      minWidth: 110,
      align: "right",
      filter: { type: "number" },
    },
    {
      prop: "sum_ancient_minutes",
      label: "传统开发时长预估",
      minWidth: 150,
      align: "right",
      display: (row) => formatDuration(row.sum_ancient_minutes),
      filter: { type: "number" },
    },
    {
      prop: "sum_real_minutes",
      label: "实际耗时",
      minWidth: 130,
      align: "right",
      display: (row) => formatDuration(row.sum_real_minutes),
      filter: { type: "number" },
    },
    {
      prop: "efficiency_ratio",
      label: "提效比",
      minWidth: 110,
      align: "center",
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
      label: "开始时间",
      minWidth: 150,
      filter: { type: "date", serverSide: true },
    },
  ])

  const controller = useTableFilters<RepoAggregateRow>({
    columns,
    onChange: () => setState("page", 1),
  })

  let seeded = false

  createEffect(() => {
    if (seeded) return
    seeded = true
    controller.setFilter("start_time", state.serverRange)
  })

  createEffect(on(
    () => [search.startDate, search.endDate],
    () => {
      const next = readQueryRange(search.startDate, search.endDate)
      if (!next) return
      const current = normalizeDateRange(controller.filters.start_time as DateRangeValue)
      if (!sameRange(current, next)) controller.setFilter("start_time", next)
      if (!sameRange(state.serverRange, next)) setState("serverRange", next)
    },
  ))

  createEffect(() => {
    const next = normalizeDateRange(controller.filters.start_time as DateRangeValue)
    if (!next) {
      if (search.startDate || search.endDate) {
        const mock = search.mock?.trim()
        setSearch(mock ? { mock } : {})
      }
      return
    }

    const query = rangeQuery(next)
    if (!sameRange(state.serverRange, next)) {
      setState("serverRange", next)
      setState("page", 1)
    }
    const mirror = searchQuery([
      ["startDate", query.startDate],
      ["endDate", query.endDate],
      ["mock", search.mock],
    ])
    const current = searchQuery([
      ["startDate", search.startDate],
      ["endDate", search.endDate],
      ["mock", search.mock],
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
          title: "仓库列表加载失败",
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
        <h1 class="m-0 font-[var(--native-font-display)] text-[1.875rem] leading-[1.02] font-semibold tracking-[-0.05em] text-[var(--native-foreground)]">仓库视图</h1>
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
          emptyText={repoRows.loading ? "仓库聚合加载中..." : "当前时间范围内没有仓库数据"}
          actions={
            <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={repoRows.loading}>
              {repoRows.loading ? "刷新中..." : "刷新"}
            </Button>
          }
          onPageChange={(page) => setState("page", page)}
          onPageSizeChange={(size) => {
            setState("pageSize", size)
            setState("page", 1)
          }}
          onRowClick={(row) => {
            const repoAddr = row.repo_addr?.trim()
            if (!repoAddr) return
            const repoBranch = row.repo_branch?.trim()
            const tail = routeQuery()
            navigate(repoBranch
              ? `/kanban/repo/${encodeURIComponent(repoAddr)}/${encodeURIComponent(repoBranch)}?${tail}`
              : `/kanban/repo/${encodeURIComponent(repoAddr)}?${tail}`)
          }}
        />
      </div>
    </div>
  )
}