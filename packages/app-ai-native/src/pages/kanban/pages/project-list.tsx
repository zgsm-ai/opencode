import { useNavigate, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, createSignal, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { Modal } from "@/components/modal"
import { Button } from "@/components/ui/button"
import Back from "../components/back"
import { ChartCard } from "../components/charts/chart-card"
import { DateRangePicker } from "../components/filters/date-range-picker"
import { FilterTable } from "../components/table/filter-table"
import { useTableFilters } from "../hooks/use-table-filters"
import { createProjectOptionV2, deleteProject, getProjects } from "../lib/api"
import { applyClientFilters } from "../lib/filter-utils"
import { RatioPill } from "../components/ratio-pill"
import { formatDuration, formatLocalTime, formatPercent } from "../lib/formatters"
import type { KanbanColumn, ProjectRow } from "../lib/types"

function fmtCost(value?: number | null) {
  if (value == null || value === 0) return "-"
  return `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

type EnrichedProjectRow = ProjectRow & {
  _ongoing: boolean
  _end_time_fmt: string
}

function enrichData(list: ProjectRow[]): EnrichedProjectRow[] {
  return list.map((item) => {
    const endTime = item.end_time_manual ?? item.end_time
    const ongoing = !endTime
    return {
      ...item,
      _ongoing: ongoing,
      _end_time_fmt: ongoing ? "" : formatLocalTime(endTime),
    }
  })
}

function makeBarOption(title: string, categories: string[], seriesList: { name: string; data: (number | null)[] }[]) {
  return {
    title: { text: title, left: "center" as const, top: 10, textStyle: { fontSize: 13, fontWeight: "bold" as const } },
    tooltip: { trigger: "axis" as const, axisPointer: { type: "shadow" as const } },
    legend: { data: seriesList.map((s) => s.name), top: 42, type: "scroll" as const },
    grid: { left: "5%", right: "5%", top: 92, bottom: 56, containLabel: true },
    xAxis: {
      type: "category" as const,
      data: categories,
      axisLabel: { rotate: 0, margin: 12, fontSize: 11, overflow: "truncate" as const, width: 96, hideOverlap: true },
    },
    yAxis: { type: "value" as const },
    series: seriesList.map((s) => ({
      name: s.name,
      type: "bar" as const,
      data: s.data,
    })),
  }
}

function makeBarOptionPct(title: string, categories: string[], seriesList: { name: string; data: (number | null)[] }[]) {
  return {
    ...makeBarOption(title, categories, seriesList),
    tooltip: {
      trigger: "axis" as const,
      axisPointer: { type: "shadow" as const },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter(params: any) {
        const items = Array.isArray(params) ? params : [params]
        let str = (items[0]?.axisValue ?? "") + "<br/>"
        for (const p of items) {
          str += (p.marker ?? "") + (p.seriesName ?? "") + ": " + formatPercent(p.value ?? 0) + "<br/>"
        }
        return str
      },
    },
    yAxis: { type: "value" as const, axisLabel: { formatter: "{value}%" } },
  }
}

function toDay(m: number | null | undefined) {
  return m != null ? Math.round((m / 480) * 10) / 10 : null
}

function CreateProjectDialog(props: { onCreated: () => void }) {
  const language = useLanguage()
  const dialog = useDialog()
  const [form, setForm] = createStore({ name: "", description: "" })
  const [busy, setBusy] = createSignal(false)

  const handleCreate = async () => {
    if (!form.name.trim()) {
      showToast({ variant: "error", title: language.t("kanban.validation.projectNameRequired") })
      return
    }
    setBusy(true)
    try {
      await createProjectOptionV2({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
      })
      showToast({ variant: "success", title: language.t("kanban.toast.createSuccess") })
      dialog.close()
      props.onCreated()
    } catch (e) {
      showToast({ variant: "error", title: language.t("kanban.toast.createFailed"), description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={language.t("kanban.dialog.createProjectTitle")}
      maxWidth="560px"
      footer={
        <>
          <Button variant="outline" size="sm" type="button" onClick={() => dialog.close()}>{language.t("common.cancel")}</Button>
          <Button size="sm" type="button" onClick={() => void handleCreate()} disabled={busy()}>{busy() ? language.t("common.creating") : language.t("common.create")}</Button>
        </>
      }
    >
      <div class="modal-section">
        <div class="flex flex-col gap-3">
          <div>
            <label class="mb-1 block text-sm text-[var(--native-muted)]">{language.t("kanban.form.projectName")}</label>
            <input
              type="text"
              class="w-full rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_36%,transparent)] bg-[var(--native-panel)] px-3 py-2 text-sm text-[var(--native-foreground)] outline-none transition-colors focus:border-[var(--native-primary)]"
              placeholder={language.t("kanban.form.projectNamePlaceholder")}
              value={form.name}
              onInput={(e) => setForm("name", e.currentTarget.value)}
              autofocus
            />
          </div>
          <div>
            <label class="mb-1 block text-sm text-[var(--native-muted)]">{language.t("kanban.form.description")}</label>
            <textarea
              class="w-full rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_36%,transparent)] bg-[var(--native-panel)] px-3 py-2 text-sm text-[var(--native-foreground)] outline-none transition-colors focus:border-[var(--native-primary)]"
              rows={3}
              placeholder={language.t("kanban.form.projectDescPlaceholder")}
              value={form.description}
              onInput={(e) => setForm("description", e.currentTarget.value)}
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default function KanbanProjectList() {
  const language = useLanguage()
  const navigate = useNavigate()
  const dialog = useDialog()
  const [search, setSearch] = useSearchParams<{
    name?: string
    ongoing?: string
    dateFrom?: string
    dateTo?: string
    startFrom?: string
    startTo?: string
  }>()

  const [state, setState] = createStore({
    filterName: "",
    filterRange: null as [string, string] | null,
    filterOngoing: false,
  })

  function parseDateStr(s?: string | null) {
    if (!s || s.length < 8) return ""
    return s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8)
  }

  function syncUrlToControls() {
    setState({
      filterName: search.name ? String(search.name).trim() : "",
      filterOngoing: search.ongoing === "1",
      filterRange: search.dateFrom && search.dateTo
        ? [parseDateStr(search.dateFrom), parseDateStr(search.dateTo)] as [string, string]
        : search.startFrom && search.startTo
          ? [parseDateStr(search.startFrom), parseDateStr(search.startTo)] as [string, string]
        : null,
    })
  }

  function updateUrl() {
    const query: Record<string, string> = {}
    if (state.filterName) query.name = state.filterName
    if (state.filterOngoing) query.ongoing = "1"
    if (state.filterRange) {
      query.dateFrom = state.filterRange[0].replace(/-/g, "")
      query.dateTo = state.filterRange[1].replace(/-/g, "")
    }
    setSearch(query, { replace: true })
  }

  const columns = createMemo<KanbanColumn<EnrichedProjectRow>[]>(() => [
    {
      prop: "name",
      label: language.t("kanban.form.projectName"),
      minWidth: 200,
      filter: { type: "text" },
      render: (row) => {
        const txt = row.name?.trim()
        return txt ? <button type="button" class="block max-w-[18rem] truncate text-left font-semibold text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)] cursor-pointer" title={txt} onClick={(e) => { e.stopPropagation(); if (row.project_id) navigate(`/kanban/project/${encodeURIComponent(row.project_id)}`) }}>{txt}</button> : <span>-</span>
      },
    },
    {
      prop: "start_time",
      label: language.t("kanban.table.startTime"),
      minWidth: 150,
      display: (row) => formatLocalTime(row.start_time_manual ?? row.start_time),
    },
    {
      prop: "end_time_display",
      label: language.t("kanban.table.endTimeDisplay"),
      minWidth: 150,
      render: (row) =>
        row._ongoing
          ? <span class="font-medium text-[var(--native-success)]">{language.t("kanban.status.ongoing")}</span>
          : <span>{row._end_time_fmt}</span>,
    },
    { prop: "user_count", label: language.t("kanban.table.peopleCount"), minWidth: 80, align: "left", filter: { type: "number", shortcuts: [{ label: "> 0", value: { min: 1 } }, { label: "> 50", value: { min: 50 } }, { label: "> 100", value: { min: 100 } }] } },
    { prop: "repo_count", label: language.t("kanban.table.repoCount"), minWidth: 90, align: "left", filter: { type: "number", shortcuts: [{ label: "> 0", value: { min: 1 } }, { label: "> 50", value: { min: 50 } }, { label: "> 100", value: { min: 100 } }] } },
    { prop: "task_count", label: language.t("kanban.table.taskCount"), minWidth: 90, align: "left", filter: { type: "number", shortcuts: [{ label: "> 0", value: { min: 1 } }, { label: "> 50", value: { min: 50 } }, { label: "> 100", value: { min: 100 } }] } },
    {
      prop: "total_code_lines",
      label: language.t("kanban.table.generatedCode"),
      minWidth: 110,
      align: "left",
      display: (row) => row.total_code_lines && row.total_code_lines > 0 ? row.total_code_lines.toLocaleString() + " " + language.t("kanban.repo.lines") : "-",
    },
    {
      prop: "actual_lines_per_day",
      label: language.t("kanban.table.actualLinesPerDay"),
      minWidth: 130,
      align: "left",
      display: (row) => row.actual_lines_per_day != null ? Math.round(row.actual_lines_per_day).toLocaleString() + " " + language.t("kanban.unit.linesPerManDay") : "-",
    },
    {
      prop: "cost",
      label: language.t("kanban.table.cost"),
      minWidth: 100,
      align: "left",
      display: (row) => fmtCost(row.cost),
    },
    {
      prop: "project_real_lead_minutes",
      label: language.t("kanban.table.projectCycle"),
      minWidth: 120,
      align: "left",
      display: (row) => formatDuration(row.project_real_lead_minutes_manual ?? row.project_real_lead_minutes, language.t),
      filter: { type: "number", valueGetter: (row) => ((row.project_real_lead_minutes_manual ?? row.project_real_lead_minutes) ?? 0) / 480, shortcuts: [{ label: "> 0", value: { min: 0.1 } }, { label: "> 30d", value: { min: 30 } }, { label: "> 50d", value: { min: 50 } }] },
    },
    {
      prop: "project_ancient_minutes",
      label: language.t("kanban.table.traditionalEst"),
      minWidth: 130,
      align: "left",
      display: (row) => formatDuration(row.project_ancient_minutes_manual ?? row.project_ancient_minutes, language.t),
      filter: { type: "number", valueGetter: (row) => ((row.project_ancient_minutes_manual ?? row.project_ancient_minutes) ?? 0) / 480, shortcuts: [{ label: "> 0", value: { min: 0.1 } }, { label: "> 30d", value: { min: 30 } }, { label: "> 50d", value: { min: 50 } }] },
    },
    {
      prop: "project_real_process_minutes",
      label: language.t("kanban.table.actualTime"),
      minWidth: 120,
      align: "left",
      display: (row) => formatDuration(row.project_real_process_minutes_manual ?? row.project_real_process_minutes, language.t),
      filter: { type: "number", valueGetter: (row) => ((row.project_real_process_minutes_manual ?? row.project_real_process_minutes) ?? 0) / 480, shortcuts: [{ label: "> 0", value: { min: 0.1 } }, { label: "> 30d", value: { min: 30 } }, { label: "> 50d", value: { min: 50 } }] },
    },
    { prop: "efficiency_ratio", label: language.t("kanban.table.efficiencyRatio"), minWidth: 110, align: "left", render: (row) => <RatioPill value={row.efficiency_ratio} /> },
    {
      prop: "_actions",
      label: language.t("kanban.table.action"),
      width: 80,
      align: "left",
      render: (row) => (
        <button
          type="button"
          class="text-sm text-[var(--native-critical,#b24b3b)] transition-colors hover:text-[var(--native-foreground)]"
          onClick={(e) => {
            e.stopPropagation()
            void handleDelete(row)
          }}
        >
          {language.t("common.delete")}
        </button>
      ),
    },
  ])

  const table = useTableFilters<EnrichedProjectRow>({
    columns,
    onChange: () => {},
  })

  const [data, { refetch }] = createResource(async () => {
    try {
      const result = await getProjects()
      return enrichData(result)
    } catch {
      return [] as EnrichedProjectRow[]
    }
  })

  const filteredData = createMemo(() => {
    let rows = data() ?? []

    const name = state.filterName.trim().toLowerCase()
    if (name) rows = rows.filter((r) => (r.name || "").toLowerCase().includes(name))

    if (state.filterOngoing) rows = rows.filter((r) => r._ongoing)

    if (state.filterRange) {
      const [from, to] = state.filterRange
      rows = rows.filter((r) => {
        const st = r.start_time_manual ?? r.start_time
        if (!st) return false
        const et = r.end_time_manual ?? r.end_time
        const start = st.slice(0, 10)
        const end = et ? et.slice(0, 10) : "9999-12-31"
        return start <= to && end >= from
      })
    }

    return applyClientFilters(rows, columns(), table.filters)
  })

  const chartEffOption = createMemo(() => {
    const d = filteredData()
    if (!d.length) return undefined
    return makeBarOptionPct(language.t("kanban.chart.efficiencyByProject"), d.map((r) => r.name || "-"), [
      { name: language.t("kanban.metric.efficiencyRatio"), data: d.map((r) => r.efficiency_ratio ?? null) },
    ])
  })

  const chartCodeOption = createMemo(() => {
    const d = filteredData()
    if (!d.length) return undefined
    return makeBarOption(language.t("kanban.chart.codeByProject"), d.map((r) => r.name || "-"), [
      { name: language.t("kanban.chart.generatedCodeLines"), data: d.map((r) => r.total_code_lines || 0) },
      { name: language.t("kanban.chart.actualLinesPerManDay"), data: d.map((r) => r.actual_lines_per_day != null ? Math.round(r.actual_lines_per_day) : null) },
    ])
  })

  const chartTimeOption = createMemo(() => {
    const d = filteredData()
    if (!d.length) return undefined
    const names = d.map((r) => r.name || "-")
    return {
      ...makeBarOption(language.t("kanban.chart.timeComparisonByProject"), names, [
        { name: language.t("kanban.chart.traditionalEst"), data: d.map((r) => toDay(r.project_ancient_minutes_manual ?? r.project_ancient_minutes)) },
        { name: language.t("kanban.chart.actualTime"), data: d.map((r) => toDay(r.project_real_process_minutes_manual ?? r.project_real_process_minutes)) },
        { name: language.t("kanban.chart.projectCycle"), data: d.map((r) => toDay(r.project_real_lead_minutes_manual ?? r.project_real_lead_minutes)) },
      ]),
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "shadow" as const },
        formatter(params: any) {
          const items = Array.isArray(params) ? params : [params]
          let str = (items[0]?.axisValue ?? "") + "<br/>"
          for (const p of items) {
            str += (p.marker ?? "") + (p.seriesName ?? "") + ": " + (p.value ?? "-") + " " + language.t("kanban.unit.manDays") + "<br/>"
          }
          return str
        },
      },
    }
  })

  const chartPeopleOption = createMemo(() => {
    const d = filteredData()
    if (!d.length) return undefined
    return makeBarOption(language.t("kanban.chart.peopleAndScaleByProject"), d.map((r) => r.name || "-"), [
      { name: language.t("kanban.chart.peopleCount"), data: d.map((r) => r.user_count || 0) },
      { name: language.t("kanban.chart.taskCount"), data: d.map((r) => r.task_count || 0) },
      { name: language.t("kanban.chart.repoCount"), data: d.map((r) => r.repo_count || 0) },
    ])
  })

  const chartCostOption = createMemo(() => {
    const d = filteredData()
    if (!d.length) return undefined
    return {
      ...makeBarOption(language.t("kanban.chart.costByProject"), d.map((r) => r.name || "-"), [
        { name: language.t("kanban.chart.costYuan"), data: d.map((r) => r.cost || 0) },
      ]),
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "shadow" as const },
        formatter(params: any) {
          const items = Array.isArray(params) ? params : [params]
          let str = (items[0]?.axisValue ?? "") + "<br/>"
          for (const p of items) {
            str += (p.marker ?? "") + (p.seriesName ?? "") + ": " + Number(p.value || 0).toFixed(2) + " " + language.t("kanban.repo.yuan") + "<br/>"
          }
          return str
        },
      },
    }
  })

  async function handleDelete(row: EnrichedProjectRow) {
    if (!row.project_id) return
    const msg = language.t("kanban.confirm.deleteProject", { name: row.name ?? "" })
    if (msg && !window.confirm(msg)) return
    try {
      await deleteProject(row.project_id)
      showToast({ variant: "success", title: language.t("kanban.toast.deleteSuccess") })
      await refetch()
    } catch (e) {
      showToast({ variant: "error", title: language.t("kanban.toast.deleteFailed"), description: e instanceof Error ? e.message : String(e) })
    }
  }

  createEffect(() => {
    syncUrlToControls()
  })

  return (
    <div class="flex min-h-full min-w-0 flex-col gap-4 overflow-y-auto overflow-x-clip p-[clamp(1rem,2vw,2rem)]">
      <div class="flex w-full flex-col gap-5">
        <header class="flex w-full flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div class="flex flex-col gap-3">
            <Back href="/kanban" label={language.t("kanban.back")} />
            <div>
              <h1 class="m-0 font-[var(--native-font-display)] text-[1.875rem] leading-[1.02] font-semibold tracking-[-0.05em] text-[var(--native-foreground)]">{language.t("kanban.home.nav.project")}</h1>
            </div>
          </div>

          <div class="flex min-w-0 flex-wrap items-center justify-end gap-3">
            <input
              type="text"
              class="h-10 min-w-[12rem] rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_36%,transparent)] bg-[var(--native-panel)] px-3 py-2 text-sm text-[var(--native-foreground)] outline-none transition-colors focus:border-[var(--native-primary)]"
              placeholder={language.t("kanban.form.projectNamePlaceholder")}
              value={state.filterName}
              onInput={(e) => {
                setState("filterName", e.currentTarget.value)
                updateUrl()
              }}
            />

            <DateRangePicker
              value={state.filterRange}
              placeholder={language.t("kanban.form.dateRange")}
              clearable
              size="sm"
              fullWidth={false}
              onChange={(value) => {
                setState("filterRange", value ?? null)
                updateUrl()
              }}
            />

            <label class="flex h-10 items-center gap-2 text-sm text-[var(--native-muted)]">
              <input
                type="checkbox"
                class="h-4 w-4 accent-[var(--native-primary)]"
                checked={state.filterOngoing}
                onChange={(e) => {
                  setState("filterOngoing", e.currentTarget.checked)
                  updateUrl()
                }}
              />
              {language.t("kanban.filter.onlyOngoing")}
            </label>
          </div>
        </header>

        <section class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] p-4 shadow-[var(--native-shadow-sm)]">
          <div class="mb-3 flex items-center justify-between gap-3">
            <span class="text-sm font-semibold text-[var(--native-foreground)]">{language.t("kanban.section.projectList")}</span>
            <Button size="sm" onClick={() => dialog.show(() => <CreateProjectDialog onCreated={() => void refetch()} />)}>{language.t("kanban.form.createProject")}</Button>
          </div>
          <FilterTable
            class="min-w-0"
            scrollClass="max-h-[calc(100vh-22rem)] min-h-0 min-w-0 overflow-auto"
            columns={columns()}
            rows={filteredData()}
            rawRows={data() ?? []}
            controller={table}
            loading={data.loading}
            total={filteredData().length}
            page={1}
            pageSize={filteredData().length || 1}
            pageSizeOptions={[250, 500, 1000]}
            emptyText={data.loading ? language.t("kanban.loading.projects") : language.t("kanban.empty.noProjectData")}
            onPageChange={() => {}}
            onPageSizeChange={() => {}}
          />
        </section>

        <Show when={filteredData().length > 0}>
          <section class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] p-4 shadow-[var(--native-shadow-sm)]">
            <div class="mb-4 text-sm font-semibold text-[var(--native-foreground)]">{language.t("kanban.section.charts")}</div>
            <div class="grid gap-3 lg:grid-cols-2">
              <ChartCard option={chartEffOption()} />
              <ChartCard option={chartCodeOption()} />
              <ChartCard option={chartTimeOption()} />
              <ChartCard option={chartPeopleOption()} />
              <ChartCard option={chartCostOption()} />
            </div>
          </section>
        </Show>
      </div>
    </div>
  )
}
