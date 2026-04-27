import { useNavigate, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, on, Show, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { Button } from "@/components/ui/button"
import Back from "../components/back"
import { AddTasksToProjectDialog } from "../components/dialogs/add-tasks-to-project-dialog"
import { FilterBar } from "../components/filters/filter-bar"
import { FilterTable } from "../components/table/filter-table"
import { useTableFilters } from "../hooks/use-table-filters"
import { estimateTaskAncient, queryTaskRows } from "../lib/api"
import { defaultWideRange, parseQueryRange, rangeQuery, readQueryRange, searchQuery, sameRange } from "../lib/date-range"
import { applyClientFilters } from "../lib/filter-utils"
import { formatDuration, formatLocalTime, formatPercent, shortId } from "../lib/formatters"
import type { DateRangeValue, KanbanColumn, OrgCascadeValue, TaskRow } from "../lib/types"

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

export default function KanbanTaskList() {
  const language = useLanguage()
  const navigate = useNavigate()
  const dialog = useDialog()
  const [search, setSearch] = useSearchParams<{ startDate?: string; endDate?: string; userName?: string; org1?: string; org2?: string; org3?: string; org4?: string }>()
  const [state, setState] = createStore({
    page: 1,
    pageSize: 250,
    dateRange: parseQueryRange(search.startDate, search.endDate),
    org: parseOrg(search),
    estimating: false,
    selectedIds: [] as string[],
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

  const backHref = createMemo(() => {
    if (search.userName?.trim()) {
      const txt = searchQuery([
        ["startDate", search.startDate],
        ["endDate", search.endDate],
      ]).toString()
      return txt ? `/kanban/user?${txt}` : "/kanban/user"
    }

    if (state.org.org1 || state.org.org2 || state.org.org3 || state.org.org4) {
      const txt = searchQuery([
        ["startDate", search.startDate],
        ["endDate", search.endDate],
        ["org1", state.org.org1],
        ["org2", state.org.org2],
        ["org3", state.org.org3],
        ["org4", state.org.org4],
      ]).toString()
      return txt ? `/kanban/org?${txt}` : "/kanban/org"
    }

    return "/kanban"
  })

  const backLabel = createMemo(() => {
    if (search.userName?.trim()) return language.t("kanban.backToUserView")
    if (state.org.org1 || state.org.org2 || state.org.org3 || state.org.org4) return language.t("kanban.backToOrgList")
    return language.t("kanban.back")
  })

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

  const columns = createMemo<KanbanColumn<TaskRow>[]>(() => [
    {
      prop: "_select",
      label: language.t("kanban.table.select"),
      minWidth: 72,
      align: "center",
      render: (row) => {
        const id = row.task_id?.trim()
        return <input type="checkbox" class="h-4 w-4 accent-[var(--native-primary)]" checked={!!id && state.selectedIds.includes(id)} disabled={!id} onChange={(e) => {
          if (!id) return
          const next = new Set(state.selectedIds)
          if (e.currentTarget.checked) next.add(id)
          else next.delete(id)
          setState("selectedIds", Array.from(next))
        }} />
      },
    },
    {
      prop: "task_id",
      label: language.t("kanban.table.taskId"),
      minWidth: 100,
      render: (row) => {
        const id = row.task_id?.trim()
        return id ? <button type="button" class="text-left text-sm text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)]" onClick={() => navigate(`/kanban/task/${encodeURIComponent(id)}?${routeQuery()}`)}>{shortId(id, 6)}</button> : <span>-</span>
      },
    },
    { prop: "start_time", label: language.t("kanban.table.time"), minWidth: 170, display: (row) => formatLocalTime(row.start_time) },
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
    { prop: "title", label: language.t("kanban.table.description"), minWidth: 220, filter: { type: "text" } },
    { prop: "diff_lines", label: language.t("kanban.table.codeLines"), minWidth: 90, align: "right", filter: { type: "number" } },
    { prop: "task_real_minutes", label: language.t("kanban.table.actualTime"), minWidth: 110, align: "right", display: (row) => formatDuration(row.task_real_minutes_manual ?? row.task_real_minutes, language.t), filter: { type: "number", valueGetter: (row) => row.task_real_minutes_manual ?? row.task_real_minutes } },
    { prop: "task_ancient_minutes", label: language.t("kanban.table.traditionalEst"), minWidth: 160, align: "right", display: (row) => formatDuration(row.task_ancient_minutes_manual ?? row.task_ancient_minutes, language.t), filter: { type: "number", valueGetter: (row) => row.task_ancient_minutes_manual ?? row.task_ancient_minutes } },
    { prop: "efficiency_ratio", label: language.t("kanban.table.efficiencyRatio"), minWidth: 100, align: "right", display: (row) => formatPercent(row.efficiency_ratio), filter: { type: "number" } },
    { prop: "_tokens", label: language.t("kanban.table.tokensConsumed"), minWidth: 120, align: "right", display: (row) => ((row.upstream_tokens ?? 0) + (row.downstream_tokens ?? 0)) > 0 ? ((row.upstream_tokens ?? 0) + (row.downstream_tokens ?? 0)).toLocaleString() : "-", filter: { type: "number", valueGetter: (row) => (row.upstream_tokens ?? 0) + (row.downstream_tokens ?? 0) } },
    { prop: "cost", label: language.t("kanban.table.cost"), minWidth: 100, align: "right", display: (row) => fmtCost(row.cost), filter: { type: "number" } }
  ])

  const table = useTableFilters<TaskRow>({
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
        return await queryTaskRows(input)
      } catch (err) {
        showToast({ variant: "error", title: language.t("kanban.toast.loadFailed"), description: err instanceof Error ? err.message : String(err) })
        return { rows: [], total: 0, page: input.page, pageSize: input.pageSize }
      }
    },
  )

  const rows = createMemo(() => applyClientFilters(data.latest?.rows ?? [], columns(), table.filters))
  const selectedRows = createMemo(() => {
    const picked = new Set(state.selectedIds)
    return (data.latest?.rows ?? []).filter((item) => item.task_id?.trim() && picked.has(item.task_id.trim()))
  })
  const visibleIds = createMemo(() => rows().map((item) => item.task_id?.trim() ?? "").filter(Boolean))
  const missingEstimateCount = createMemo(() => (data.latest?.rows ?? []).filter((item) => item.task_ancient_minutes == null && item.task_ancient_minutes_manual == null).length)

  createEffect(() => {
    const pool = new Set((data.latest?.rows ?? []).map((item) => item.task_id?.trim() ?? "").filter(Boolean))
    const next = state.selectedIds.filter((id) => pool.has(id))
    if (next.length === state.selectedIds.length) return
    setState("selectedIds", next)
  })

  const toggleVisible = () => {
    const ids = visibleIds()
    const next = new Set(state.selectedIds)
    const all = ids.length > 0 && ids.every((id) => next.has(id))
    if (all) ids.forEach((id) => next.delete(id))
    else ids.forEach((id) => next.add(id))
    setState("selectedIds", Array.from(next))
  }

  const openAddDialog = () => {
    if (!selectedRows().length) return
    dialog.show(() => <AddTasksToProjectDialog tasks={selectedRows()} onAdded={() => void refetch()} />)
  }

  const runEstimate = async () => {
    setState("estimating", true)
    try {
      await estimateTaskAncient()
      showToast({ variant: "success", title: language.t("kanban.toast.aiEstimateSubmitted") })
      await refetch()
    } catch (err) {
      showToast({ variant: "error", title: language.t("kanban.toast.aiEstimateFailed"), description: err instanceof Error ? err.message : String(err) })
    } finally {
      setState("estimating", false)
    }
  }

  return (
    <div class="flex min-h-full min-w-0 flex-col gap-4 overflow-y-auto overflow-x-clip p-[clamp(1rem,2vw,2rem)]">
      <div class="flex w-full flex-col gap-5">
        <header class="flex w-full flex-col gap-3">
          <Back href={backHref()} />
          <h1 class="m-0 font-[var(--native-font-display)] text-[1.875rem] leading-[1.02] font-semibold tracking-[-0.05em] text-[var(--native-foreground)]">{language.t("kanban.home.nav.task")}</h1>
        </header>
        <Show when={missingEstimateCount() > 0}>
          <section class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-warning)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--native-warning)_10%,var(--native-panel))] p-4 shadow-[var(--native-shadow-sm)]">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div class="text-sm font-semibold text-[var(--native-foreground)]">{language.t("kanban.task.missingEstimate", { count: missingEstimateCount() })}</div>
                <div class="mt-1 text-sm text-[var(--native-muted)]">{language.t("kanban.task.missingEstimateDesc")}</div>
              </div>
              <Button size="sm" onClick={() => void runEstimate()} disabled={state.estimating}>{state.estimating ? language.t("kanban.task.estimating") : language.t("kanban.task.aiEstimate")}</Button>
            </div>
          </section>
        </Show>
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
          actions={<div class="flex flex-wrap items-center gap-2"><span class="text-sm text-[var(--native-muted)]">{language.t("kanban.task.selectedCount", { count: state.selectedIds.length })}</span><Button variant="outline" size="sm" onClick={toggleVisible} disabled={visibleIds().length === 0}>{visibleIds().length > 0 && visibleIds().every((id) => state.selectedIds.includes(id)) ? language.t("kanban.task.deselectPage") : language.t("kanban.task.selectPage")}</Button><Button size="sm" onClick={openAddDialog} disabled={selectedRows().length === 0}>{language.t("kanban.repo.addToProject")}</Button><Button variant="outline" size="sm" onClick={() => void refetch()} disabled={data.loading}>{data.loading ? language.t("kanban.action.refreshing") : language.t("kanban.action.refresh")}</Button></div>}
        />

        <FilterTable
          columns={columns()}
          rows={rows()}
          rawRows={data.latest?.rows ?? []}
          controller={table}
          loading={data.loading}
          total={data.latest?.total ?? 0}
          page={state.page}
          pageSize={state.pageSize}
          pageSizeOptions={[100, 250, 500]}
          emptyText={data.loading ? language.t("kanban.loading.taskList") : language.t("kanban.empty.noTaskData")}
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