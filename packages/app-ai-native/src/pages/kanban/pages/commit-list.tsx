import { useLanguage } from "@/context/language"
import { useNavigate, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, on, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { showToast } from "@opencode-ai/ui/toast"
import { Button } from "@/components/ui/button"
import Back from "../components/back"
import { FilterBar } from "../components/filters/filter-bar"
import { FilterTable } from "../components/table/filter-table"
import { useTableFilters } from "../hooks/use-table-filters"
import { queryCommitRows } from "../lib/api"
import { defaultWideRange, parseQueryRange, rangeQuery, readQueryRange, searchQuery, sameRange } from "../lib/date-range"
import { applyClientFilters } from "../lib/filter-utils"
import { formatDuration, formatLocalTime, formatPercent, shortId } from "../lib/formatters"
import type { CommitRow, KanbanColumn, OrgCascadeValue } from "../lib/types"

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

export default function KanbanCommitList() {
  const language = useLanguage()
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams<{ startDate?: string; endDate?: string; userName?: string; org1?: string; org2?: string; org3?: string; org4?: string }>()
  const [state, setState] = createStore({
    page: 1,
    pageSize: 250,
    dateRange: parseQueryRange(search.startDate, search.endDate),
    org: parseOrg(search),
  })

  const routeQuery = createMemo(() => searchQuery([
    ["startDate", search.startDate],
    ["endDate", search.endDate],
    ["userName", search.userName],
    ["org1", search.org1],
    ["org2", search.org2],
    ["org3", search.org3],
    ["org4", search.org4],
  ]).toString())

  createEffect(on(
    () => [search.startDate, search.endDate, search.org1, search.org2, search.org3, search.org4],
    () => {
      const next = readQueryRange(search.startDate, search.endDate)
      if (next && !sameRange(untrack(() => state.dateRange), next)) setState("dateRange", next)
      const org = parseOrg(search)
      if (!sameOrg(untrack(() => state.org), org)) setState("org", org)
    },
  ))

  createEffect(() => {
    const next = rangeQuery(state.dateRange)
    const query = searchQuery([
      ["startDate", next.startDate],
      ["endDate", next.endDate],
      ["userName", search.userName],
      ["org1", state.org.org1],
      ["org2", state.org.org2],
      ["org3", state.org.org3],
      ["org4", state.org.org4],
    ])
    const current = searchQuery([
      ["startDate", search.startDate],
      ["endDate", search.endDate],
      ["userName", search.userName],
      ["org1", search.org1],
      ["org2", search.org2],
      ["org3", search.org3],
      ["org4", search.org4],
    ])
    if (query.toString() !== current.toString()) setSearch(Object.fromEntries(query.entries()))
  })

  const columns = createMemo<KanbanColumn<CommitRow>[]>(() => [
    {
      prop: "commit_id",
      label: language.t("kanban.table.commitId"),
      minWidth: 110,
      render: (row) => {
        const id = row.commit_id?.trim()
        return id ? <button type="button" class="text-left text-sm text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)]" onClick={() => navigate(`/kanban/commit/${encodeURIComponent(id)}?${routeQuery()}`)}>{shortId(id, 8)}</button> : <span>-</span>
      },
    },
    { prop: "commit_time", label: language.t("kanban.table.time"), minWidth: 170, display: (row) => formatLocalTime(row.commit_time), filter: { type: "date" } },
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
      label: language.t("kanban.table.user"),
      minWidth: 110,
      render: (row) => <button type="button" class="text-left text-sm text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)]" onClick={() => {
        const txt = row.user_id?.trim()
        if (!txt) return
        navigate(`/kanban/user/${encodeURIComponent(txt)}?${routeQuery()}`)
      }}>{row.user_name || row.user_id || "-"}</button>,
      filter: { type: "multi-select" },
    },
  ])

  const table = useTableFilters<CommitRow>({
    columns,
    onChange: () => setState("page", 1),
  })

  createEffect(() => {
    table.setFilter("user_name", search.userName?.trim() || undefined)
  })

  const [data, { refetch }] = createResource(
    () => ({ dateRange: state.dateRange, org: state.org, page: state.page, pageSize: state.pageSize }),
    async (input) => {
      try {
        return await queryCommitRows(input)
      } catch (err) {
        showToast({ variant: "error", title: language.t("kanban.toast.loadFailed"), description: err instanceof Error ? err.message : String(err) })
        return { rows: [], total: 0, page: input.page, pageSize: input.pageSize }
      }
    },
  )

  const rows = createMemo(() => applyClientFilters(data.latest?.rows ?? [], columns(), table.filters))

  return (
    <div class="flex min-h-full min-w-0 flex-col gap-4 overflow-y-auto overflow-x-clip p-[clamp(1rem,2vw,2rem)]">
      <header class="flex w-full flex-col gap-3">
        <Back />
        <h1 class="m-0 font-[var(--native-font-display)] text-[1.875rem] leading-[1.02] font-semibold tracking-[-0.05em] text-[var(--native-foreground)]">{language.t("kanban.view.commit")}</h1>
      </header>

      <div class="flex w-full flex-col gap-5">
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
            setState("org", value)
            setState("page", 1)
          }}
          actions={<Button variant="outline" size="sm" onClick={() => void refetch()} disabled={data.loading}>{data.loading ? language.t("kanban.action.refreshing") : language.t("kanban.action.refresh")}</Button>}
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
          pageSizeOptions={[100, 250, 500]}
          emptyText={data.loading ? language.t("kanban.loading.commitList") : language.t("kanban.empty.noCommitData")}
          onPageChange={(page) => setState("page", page)}
          onPageSizeChange={(pageSize) => {
            setState("pageSize", pageSize)
            setState("page", 1)
          }}
        />
      </div>
    </div>
  )
}