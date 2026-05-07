import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { createMemo, createResource, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { Modal } from "@/components/modal"
import { Button } from "@/components/ui/button"
import Back from "../components/back"
import { MetricCard } from "../components/metric-card"
import { RatioPill } from "../components/ratio-pill"
import { searchQuery } from "../lib/date-range"
import { getTaskDetail, updateTaskManual } from "../lib/api"
import { formatDuration, formatLocalTime } from "../lib/formatters"
import type { TaskConversation, TaskManualPayload, TaskRow, TimeSegment } from "../lib/types"

function fmtCost(value?: number | null) {
  if (value == null || value === 0) return "-"
  return `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function dateOf(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function num(value?: number | null) {
  return value == null ? "-" : value.toLocaleString("zh-CN")
}

function text(value?: string | null) {
  const txt = value?.trim()
  return txt || "-"
}

function toNumberOrNull(value: string) {
  const txt = value.trim()
  if (!txt) return null
  const next = Number(txt)
  return Number.isNaN(next) ? null : next
}

type TimelineItem =
  | { type: "gap"; gapMinutes: number }
  | { type: "conv"; conv: TaskConversation; index: number; isSegmentStart: boolean }

function TaskManualDialog(props: { task: TaskRow; onSaved?: () => void | Promise<void> }) {
  const dialog = useDialog()
  const language = useLanguage()
  const [form, setForm] = createStore({
    task_real_minutes_manual: props.task.task_real_minutes_manual?.toString() || props.task.task_real_minutes?.toString() || "",
    task_real_minutes_reason_manual: props.task.task_real_minutes_reason_manual || "",
    task_ancient_minutes_manual: props.task.task_ancient_minutes_manual?.toString() || props.task.task_ancient_minutes?.toString() || "",
    task_ancient_minutes_reason_manual: props.task.task_ancient_minutes_reason_manual || "",
    saving: false,
  })

  const submit = async (e: SubmitEvent) => {
    e.preventDefault()
    const taskId = props.task.task_id?.trim()
    if (!taskId) {
      showToast({ variant: "error", title: language.t("kanban.toast.taskIdMissing") })
      return
    }

    const payload: TaskManualPayload = {
      task_real_minutes_manual: toNumberOrNull(form.task_real_minutes_manual),
      task_real_minutes_reason_manual: form.task_real_minutes_reason_manual.trim(),
      task_ancient_minutes_manual: toNumberOrNull(form.task_ancient_minutes_manual),
      task_ancient_minutes_reason_manual: form.task_ancient_minutes_reason_manual.trim(),
    }

    setForm("saving", true)
    try {
      await updateTaskManual(taskId, payload)
      showToast({ variant: "success", title: language.t("kanban.toast.correctionSaved") })
      await props.onSaved?.()
      dialog.close()
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("kanban.toast.saveFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setForm("saving", false)
    }
  }

  return (
    <form onSubmit={submit}>
      <Modal
        title={language.t("kanban.dialog.manualAdjustment")}
        maxWidth="680px"
        footer={
          <>
            <Button variant="outline" size="sm" type="button" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button size="sm" type="submit" disabled={form.saving}>
              {form.saving ? language.t("common.saving") : language.t("common.save")}
            </Button>
          </>
        }
      >
        <div class="modal-section">
          <div class="grid gap-4 md:grid-cols-2">
            <div class="modal-field">
              <label class="modal-label">{language.t("kanban.form.actualTime")}</label>
              <input class="modal-input" type="number" step="0.1" min="0" value={form.task_real_minutes_manual} onInput={(e) => setForm("task_real_minutes_manual", e.currentTarget.value)} />
            </div>
            <div class="modal-field">
              <label class="modal-label">{language.t("kanban.form.traditionalEst")}</label>
              <input class="modal-input" type="number" step="0.1" min="0" value={form.task_ancient_minutes_manual} onInput={(e) => setForm("task_ancient_minutes_manual", e.currentTarget.value)} />
            </div>
          </div>
        </div>

        <div class="modal-section">
          <div class="grid gap-4 md:grid-cols-2">
            <div class="modal-field">
              <label class="modal-label">{language.t("kanban.form.actualTimeReason")}</label>
              <textarea class="modal-input" value={form.task_real_minutes_reason_manual} onInput={(e) => setForm("task_real_minutes_reason_manual", e.currentTarget.value)} />
            </div>
            <div class="modal-field">
              <label class="modal-label">{language.t("kanban.form.traditionalEstReason")}</label>
              <textarea class="modal-input" value={form.task_ancient_minutes_reason_manual} onInput={(e) => setForm("task_ancient_minutes_reason_manual", e.currentTarget.value)} />
            </div>
          </div>
        </div>
      </Modal>
    </form>
  )
}

export default function KanbanTaskDetail() {
  const language = useLanguage()
  const params = useParams()
  const navigate = useNavigate()
  const dialog = useDialog()
  const [search] = useSearchParams<{ startDate?: string; endDate?: string; userName?: string; org1?: string; org2?: string; org3?: string; org4?: string }>()
  const [expand, setExpand] = createStore<Record<string, boolean>>({})

  const taskId = createMemo(() => decodeURIComponent(params.taskId ?? "").trim())
  const listHref = createMemo(() => {
    const txt = searchQuery([
      ["startDate", search.startDate],
      ["endDate", search.endDate],
      ["userName", search.userName],
      ["org1", search.org1],
      ["org2", search.org2],
      ["org3", search.org3],
      ["org4", search.org4],
    ]).toString()
    return txt ? `/kanban/task?${txt}` : "/kanban/task"
  })

  const [data, { refetch }] = createResource(taskId, async (id) => {
    if (!id) return null
    try {
      return await getTaskDetail(id)
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("kanban.toast.loadFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  })

  const task = createMemo(() => data()?.task ?? {})
  const convs = createMemo(() => data()?.conversations ?? [])
  const segments = createMemo(() => data()?.time_segments ?? [])
  const efficiency = createMemo(() => data()?.efficiency_ratio ?? task().efficiency_ratio ?? null)

  const totalUp = createMemo(() => convs().reduce((sum, item) => sum + (item.upstream_tokens ?? 0), 0))
  const totalDown = createMemo(() => convs().reduce((sum, item) => sum + (item.downstream_tokens ?? 0), 0))
  const totalTokens = createMemo(() => totalUp() + totalDown())
  const totalCost = createMemo(() => convs().reduce((sum, item) => sum + (item.cost ?? 0), 0))
  const costLabel = createMemo(() => {
    const value = task().cost
    return typeof value === "number" && value > 0 ? fmtCost(value) : fmtCost(totalCost())
  })
  const repoLabel = createMemo(() => task().repo_addr ? `${task().repo_addr}${task().repo_branch ? `#${task().repo_branch}` : ""}` : "-")

  const items = createMemo<TimelineItem[]>(() => {
    const values = convs()
    const spans = segments()
    if (!values.length) return []

    const segmentOf = (value?: string) => {
      if (!value || !spans.length) return 0
      const time = new Date(value).getTime()
      for (let i = 0; i < spans.length; i += 1) {
        const start = new Date(spans[i].start ?? "").getTime()
        const end = new Date(spans[i].end ?? "").getTime()
        if (time >= start && time <= end) return i
      }
      return 0
    }

    const list: TimelineItem[] = []
    let prev = -1
    for (let i = 0; i < values.length; i += 1) {
      const current = segmentOf(values[i].start_time)
      if (prev >= 0 && current !== prev && spans[prev]?.end && spans[current]?.start) {
        const gap = Math.round((new Date(spans[current].start ?? "").getTime() - new Date(spans[prev].end ?? "").getTime()) / 60000)
        if (gap > 0) list.push({ type: "gap", gapMinutes: gap })
      }
      list.push({ type: "conv", conv: values[i], index: i, isSegmentStart: current !== prev })
      prev = current
    }
    return list
  })

  const toggle = (index: number, field: "user_input" | "output") => {
    const key = `${index}:${field}`
    setExpand(key, !expand[key])
  }

  const preview = (value: string | undefined, index: number, field: "user_input" | "output") => {
    const txt = value?.trim() || ""
    if (!txt) return ""
    if (txt.length <= 320 || expand[`${index}:${field}`]) return txt
    return `${txt.slice(0, 320)}...`
  }

  const openManual = () => {
    if (!task().task_id) return
    dialog.show(() => <TaskManualDialog task={task()} onSaved={() => void refetch()} />)
  }

  return (
    <div class="flex min-h-full min-w-0 flex-col gap-5 overflow-y-auto overflow-x-clip p-[clamp(1rem,2vw,2rem)]">
      <div class="flex w-full flex-col gap-5">
        <header class="flex flex-col gap-3">
          <Back href={listHref()} />
          <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 class="font-[var(--native-font-display)] text-[1.875rem] leading-[1.02] font-semibold tracking-[-0.05em] text-[var(--native-foreground)]">{language.t("kanban.home.nav.task")}</h1>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              {/* <Show when={summaryHref()}>
                <a href={summaryHref()} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm">{language.t("kanban.action.viewSummary")}</Button>
                </a>
              </Show>
              <Show when={conversationHref()}>
                <a href={conversationHref()} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm">{language.t("kanban.action.viewRawConversation")}</Button>
                </a>
              </Show> */}
              <Button size="sm" onClick={openManual} disabled={!task().task_id}>{language.t("kanban.dialog.manualAdjustment")}</Button>
            </div>
          </div>
        </header>

        <Show when={!data.loading} fallback={<div class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] px-4 py-10 text-sm text-[var(--native-muted)] shadow-[var(--native-shadow-sm)]">{language.t("kanban.loading.taskDetail")}</div>}>
          <Show when={data()} fallback={<div class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] px-4 py-10 text-sm text-[var(--native-muted)] shadow-[var(--native-shadow-sm)]">{language.t("kanban.empty.noTaskDetail")}</div>}>
            <section class="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
              <article class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] p-4 shadow-[var(--native-shadow-sm)]">
                <div class="text-[1rem] font-semibold text-[var(--native-foreground)]">{language.t("kanban.section.basicInfo")}</div>
                <div class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div><div class="text-[11px] uppercase tracking-[0.12em] text-[var(--native-dim)]">Task ID</div><div class="mt-1 break-all text-sm text-[var(--native-foreground)]">{text(task().task_id)}</div></div>
                  <div class="md:col-span-2"><div class="text-[11px] uppercase tracking-[0.12em] text-[var(--native-dim)]">{language.t("kanban.label.taskDescription")}</div><div class="mt-1 text-sm text-[var(--native-foreground)]">{text(task().title)}</div></div>
                  <div>
                    <div class="text-[11px] uppercase tracking-[0.12em] text-[var(--native-dim)]">{language.t("kanban.label.user")}</div>
                    <div class="mt-1 text-sm text-[var(--native-foreground)]">
                      <Show when={task().user_id?.trim()} fallback={text(task().user_name)}>
                        <button type="button" class="text-left text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)] cursor-pointer" onClick={() => navigate(`/kanban/user/${encodeURIComponent(task().user_id!.trim())}`)}>
                          {task().user_name || task().user_id}
                        </button>
                      </Show>
                    </div>
                  </div>
                  <div>
                    <div class="text-[11px] uppercase tracking-[0.12em] text-[var(--native-dim)]">{language.t("kanban.label.repository")}</div>
                    <div class="mt-1 text-sm text-[var(--native-foreground)]">
                      <Show when={task().repo_addr?.trim()} fallback={repoLabel()}>
                        <button
                          type="button"
                          class="text-left break-all text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)] cursor-pointer"
                          onClick={() => navigate(task().repo_branch?.trim() ? `/kanban/repo/${encodeURIComponent(task().repo_addr!.trim())}/${encodeURIComponent(task().repo_branch!.trim())}` : `/kanban/repo/${encodeURIComponent(task().repo_addr!.trim())}`)}
                        >
                          {repoLabel()}
                        </button>
                      </Show>
                    </div>
                  </div>
                  <div><div class="text-[11px] uppercase tracking-[0.12em] text-[var(--native-dim)]">{language.t("kanban.label.workDir")}</div><div class="mt-1 break-all text-sm text-[var(--native-foreground)]"><Show when={task().work_dir_id?.trim()} fallback={text(task().work_dir)}><button type="button" class="text-left text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)] cursor-pointer" onClick={() => navigate("/kanban/workdir/" + encodeURIComponent(task().work_dir_id!.trim()) + "?fromTaskId=" + encodeURIComponent(task().task_id!.trim()))}>{task().work_dir || task().work_dir_id}</button></Show></div></div>
                  <div><div class="text-[11px] uppercase tracking-[0.12em] text-[var(--native-dim)]">{language.t("kanban.label.startTime")}</div><div class="mt-1 text-sm text-[var(--native-foreground)]">{formatLocalTime(task().start_time)}</div></div>
                  <div><div class="text-[11px] uppercase tracking-[0.12em] text-[var(--native-dim)]">{language.t("kanban.label.endTime")}</div><div class="mt-1 text-sm text-[var(--native-foreground)]">{formatLocalTime(task().end_time)}</div></div>
                  <div><div class="text-[11px] uppercase tracking-[0.12em] text-[var(--native-dim)]">{language.t("kanban.label.system")}</div><div class="mt-1 text-sm text-[var(--native-foreground)]">{text([task().client_os, task().client_os_version].filter(Boolean).join(" "))}</div></div>
                  <div><div class="text-[11px] uppercase tracking-[0.12em] text-[var(--native-dim)]">{language.t("kanban.label.client")}</div><div class="mt-1 text-sm text-[var(--native-foreground)]">{text([task().client_ide, task().client_version].filter(Boolean).join(" "))}</div></div>
                  <div><div class="text-[11px] uppercase tracking-[0.12em] text-[var(--native-dim)]">{language.t("kanban.label.mode")}</div><div class="mt-1 text-sm text-[var(--native-foreground)]">{text(task().caller)}</div></div>
                </div>
              </article>

              <article class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] p-4 shadow-[var(--native-shadow-sm)]">
                <div class="text-[1rem] font-semibold text-[var(--native-foreground)]">{language.t("kanban.section.estimationNotes")}</div>
                <div class="mt-4 grid gap-3">
                  <div class="rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_20%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_88%,var(--native-bg-subtle))] p-3">
                    <div class="text-[11px] uppercase tracking-[0.12em] text-[var(--native-dim)]">{language.t("kanban.label.actualTimeNote")}</div>
                    <div class="mt-2 text-sm leading-[1.7] text-[var(--native-foreground)]">{text(task().task_real_minutes_reason_manual || task().task_real_minutes_reason)}</div>
                  </div>
                  <div class="rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_20%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_88%,var(--native-bg-subtle))] p-3">
                    <div class="text-[11px] uppercase tracking-[0.12em] text-[var(--native-dim)]">{language.t("kanban.label.traditionalEstNote")}</div>
                    <div class="mt-2 text-sm leading-[1.7] text-[var(--native-foreground)]">{text(task().task_ancient_minutes_reason_manual || task().task_ancient_minutes_reason)}</div>
                  </div>
                </div>
              </article>
            </section>

            <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <MetricCard label={language.t("kanban.metric.generatedCode")} value={task().diff_lines == null ? "-" : `${task().diff_lines} ${language.t("kanban.repo.lines")}`} accent="var(--native-warning)" />
              <MetricCard label={language.t("kanban.metric.actualTime")} value={formatDuration(task().task_real_minutes_manual ?? task().task_real_minutes, language.t)} accent="var(--native-primary)" />
              <MetricCard label={language.t("kanban.metric.traditionalEst")} value={formatDuration(task().task_ancient_minutes_manual ?? task().task_ancient_minutes, language.t)} accent="var(--native-success)" />
              <MetricCard label={language.t("kanban.metric.apiRequests")} value={String(convs().length)} accent="var(--native-primary)" />
              <MetricCard label={language.t("kanban.metric.totalTokens")} value={totalTokens() > 0 ? totalTokens().toLocaleString() : "-"} hint={language.t("kanban.hint.upstreamDownstream", { upstream: totalUp().toLocaleString(), downstream: totalDown().toLocaleString() })} accent="var(--native-warning)" />
              <MetricCard label={language.t("kanban.metric.cost")} value={costLabel()} accent="var(--native-warning)" />
            </section>

            <section class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] p-4 shadow-[var(--native-shadow-sm)]">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-[1rem] font-semibold text-[var(--native-foreground)]">{language.t("kanban.section.efficiencyView")}</div>
                  <div class="mt-1 truncate text-sm text-[var(--native-muted)]" title={language.t("kanban.hint.efficiencyCalculation")}>{language.t("kanban.hint.efficiencyCalculation")}</div>
                </div>
                <RatioPill value={efficiency()} digits={0} />
              </div>
            </section>

            <Show when={segments().length > 0}>
              <section class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] p-4 shadow-[var(--native-shadow-sm)]">
                <div class="text-[1rem] font-semibold text-[var(--native-foreground)]">{language.t("kanban.section.timeSegments")}</div>
                <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <For each={segments()}>
                    {(item: TimeSegment, index) => (
                      <article class="min-w-0 rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_20%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_88%,var(--native-bg-subtle))] p-3">
                        <div class="text-[11px] uppercase tracking-[0.12em] text-[var(--native-dim)]">{language.t("kanban.timeline.segment", { index: index() + 1 })}</div>
                        <div class="mt-2 text-sm text-[var(--native-foreground)]">{formatLocalTime(item.start)} ~ {formatLocalTime(item.end)}</div>
                        <div class="mt-1 truncate text-sm text-[var(--native-muted)]" title={language.t("kanban.timeline.conversations", { count: item.conv_count ?? 0 })}>{language.t("kanban.timeline.conversations", { count: item.conv_count ?? 0 })}</div>
                      </article>
                    )}
                  </For>
                </div>
              </section>
            </Show>

            <section class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] p-4 shadow-[var(--native-shadow-sm)]">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-[1rem] font-semibold text-[var(--native-foreground)]">{language.t("kanban.section.conversationHistory")}</div>
                  <div class="mt-1 truncate text-sm text-[var(--native-muted)]" title={language.t("kanban.hint.timeSegments")}>{language.t("kanban.hint.timeSegments")}</div>
                </div>
                <Show when={!convs().length}>
                  <div class="text-sm text-[var(--native-muted)]">{language.t("kanban.empty.noConversation")}</div>
                </Show>
              </div>

              <div class="mt-4 grid gap-3">
                <For each={items()}>
                  {(item) => item.type === "gap" ? (
                    <div class="rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-warning)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--native-warning)_10%,var(--native-panel))] px-4 py-3 text-sm text-[var(--native-foreground)]">
                      {language.t("kanban.timeline.gap", { minutes: item.gapMinutes })}
                    </div>
                  ) : (
                    <article class="rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_22%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_90%,var(--native-bg-subtle))] p-4 shadow-[var(--native-shadow-xs)]">
                      <div class="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div class="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--native-foreground)]">
                            <span>{formatLocalTime(item.conv.start_time)}</span>
                            <Show when={item.isSegmentStart}><span class="rounded-full bg-[color:color-mix(in_oklab,var(--native-warning)_14%,transparent)] px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-[var(--native-warning)]">{language.t("kanban.timeline.newSegment")}</span></Show>
                          </div>
                          <div class="mt-1 text-sm text-[var(--native-muted)]">{text(item.conv.prompt_mode)} / {text(item.conv.mode)} / {text(item.conv.model)}</div>
                        </div>
                        <div class="grid gap-x-4 gap-y-1 text-sm text-[var(--native-muted)] md:grid-cols-2 xl:grid-cols-4">
                          <div>{language.t("kanban.timeline.processTime")} {num(item.conv.process_time)} ms</div>
                          <div>TTFT {num(item.conv.process_ttft)} ms</div>
                          <div>{language.t("kanban.timeline.upstream")} {num(item.conv.upstream_tokens)}</div>
                          <div>{language.t("kanban.timeline.downstream")} {num(item.conv.downstream_tokens)}</div>
                          <div>{language.t("kanban.timeline.cost")} {fmtCost(item.conv.cost)}</div>
                          <div>{language.t("kanban.timeline.codeLines")} {num(item.conv.diff_lines)} {language.t("kanban.timeline.codeLinesCount", { count: item.conv.diff_lines ?? 0 })}</div>
                          <div>{language.t("kanban.timeline.start")} {formatLocalTime(item.conv.start_time)}</div>
                          <div>{language.t("kanban.timeline.end")} {formatLocalTime(item.conv.end_time)}</div>
                        </div>
                      </div>

                      <Show when={item.conv.error_code?.trim()}>
                        <div class="mt-3 rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-warning)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--native-warning)_10%,var(--native-panel))] px-3 py-2 text-sm text-[var(--native-foreground)]">
                          {item.conv.error_code}: {item.conv.error_reason || "-"}
                        </div>
                      </Show>

                      <Show when={item.conv.user_input?.trim()}>
                        <div class="mt-3">
                          <div class="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--native-dim)]">{language.t("kanban.timeline.userInput")}</div>
                          <pre class="overflow-x-auto whitespace-pre-wrap break-all rounded-[var(--native-radius-md)] bg-[color:color-mix(in_oklab,var(--native-bg-subtle)_88%,var(--native-panel))] p-3 text-[12px] leading-[1.7] text-[var(--native-foreground)]">{preview(item.conv.user_input, item.index, "user_input")}</pre>
                          <Show when={(item.conv.user_input?.length ?? 0) > 320}>
                            <button type="button" class="mt-2 text-sm text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)]" onClick={() => toggle(item.index, "user_input")}>
                              {expand[`${item.index}:user_input`] ? language.t("kanban.timeline.collapse") : language.t("kanban.timeline.expand")}
                            </button>
                          </Show>
                        </div>
                      </Show>

                      <Show when={item.conv.output?.trim()}>
                        <div class="mt-3">
                          <div class="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--native-dim)]">{language.t("kanban.timeline.modelOutput")}</div>
                          <pre class="overflow-x-auto whitespace-pre-wrap break-all rounded-[var(--native-radius-md)] bg-[color:color-mix(in_oklab,var(--native-bg-subtle)_88%,var(--native-panel))] p-3 text-[12px] leading-[1.7] text-[var(--native-foreground)]">{preview(item.conv.output, item.index, "output")}</pre>
                          <Show when={(item.conv.output?.length ?? 0) > 320}>
                            <button type="button" class="mt-2 text-sm text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)]" onClick={() => toggle(item.index, "output")}>
                              {expand[`${item.index}:output`] ? language.t("kanban.timeline.collapse") : language.t("kanban.timeline.expand")}
                            </button>
                          </Show>
                        </div>
                      </Show>
                    </article>
                  )}
                </For>
              </div>
            </section>
          </Show>
        </Show>
      </div>
    </div>
  )
}
