import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { createMemo, For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/context/language"
import {
  adminImportApi,
  downloadViaFetch,
  type CapabilityImportJob,
  type ImportConfirmError,
  type ImportResult,
  type ImportStatsRow,
} from "@/pages/store/lib/api"
import { sx, st } from "../lib/styles"

const HISTORY_PAGE_SIZE = 10
const POLL_INTERVAL_MS = 1500
// Mirror of the backend deleteWarnRatio (adminimport/service.go): a dry-run that
// would take offline more than this fraction of the current active inventory
// needs an explicit second acknowledgement before it can be confirmed. Detected
// client-side too, so the warning shows before the round-trip; the 409 fallback
// (largeDeleteBlocked) covers the case our ratio estimate misses.
const LARGE_DELETE_RATIO = 0.2
// Item types with a localized label; anything else falls back to its raw type.
const KNOWN_TYPES = new Set(["skill", "plugin", "subagent", "command", "mcp"])
// Statuses that end the poll loop for the current phase (dry-run or real import).
const TERMINAL: ReadonlySet<string> = new Set(["previewed", "success", "failed", "expired", "cancelled"])
// Statuses worth restoring into the preview panel after a page revisit: still
// in flight (pending/running → keep polling) or awaiting the admin's confirm
// (previewed). The import runs server-side, so navigating away and back should
// not lose the preview/confirm interaction.
const RESUMABLE: ReadonlySet<string> = new Set(["pending", "running", "previewed"])
const COUNT_KEYS = ["added", "updated", "metadataUpdated", "skipped", "deleted", "failed", "incomplete"] as const

export default function AdminImport() {
  const language = useLanguage()

  const [state, setState] = createStore<{
    statsLoading: boolean
    stats: ImportStatsRow[]
    statsTotal: number
    tab: "url" | "upload"
    sourceUrl: string
    file: File | null
    dragOver: boolean
    reparse: boolean
    submitting: boolean
    job: CapabilityImportJob | null
    activeId: string | null
    polling: boolean
    confirming: boolean
    confirmLargeDelete: boolean
    largeDeleteBlocked: boolean
    historyLoading: boolean
    history: CapabilityImportJob[]
    historyTotal: number
    historyPage: number
  }>({
    statsLoading: true,
    stats: [],
    statsTotal: 0,
    tab: "url",
    sourceUrl: "",
    file: null,
    dragOver: false,
    reparse: false,
    submitting: false,
    job: null,
    activeId: null,
    polling: false,
    confirming: false,
    confirmLargeDelete: false,
    largeDeleteBlocked: false,
    historyLoading: true,
    history: [],
    historyTotal: 0,
    historyPage: 1,
  })

  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let fileInput: HTMLInputElement | undefined

  const msg = (err: unknown) => (err instanceof Error ? err.message : String(err))

  // ── Data loads ──────────────────────────────────────────────────────────────
  async function loadStats() {
    setState("statsLoading", true)
    try {
      const res = await adminImportApi.stats()
      setState("stats", res.byType ?? [])
      setState("statsTotal", res.total ?? 0)
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("admin.import.stats.loadFailed"),
        description: msg(err),
      })
    } finally {
      setState("statsLoading", false)
    }
  }

  const totalHistoryPages = createMemo(() => Math.max(1, Math.ceil(state.historyTotal / HISTORY_PAGE_SIZE)))

  async function loadHistory() {
    setState("historyLoading", true)
    try {
      const res = await adminImportApi.list(state.historyPage, HISTORY_PAGE_SIZE)
      setState("history", res.items ?? [])
      setState("historyTotal", res.total ?? 0)
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("admin.import.history.loadFailed"),
        description: msg(err),
      })
    } finally {
      setState("historyLoading", false)
    }
  }

  // After navigating away and back, resume the most recent in-flight or
  // awaiting-confirm job into the preview panel — the import runs server-side,
  // only the local preview state was lost on unmount. Runs after history loads.
  function restoreActiveJob() {
    if (state.activeId || state.job) return
    const latest = state.history[0]
    if (latest && RESUMABLE.has(latest.status)) {
      setState("job", latest)
      startPoll(latest.id)
    }
  }

  onMount(() => {
    void loadStats()
    void loadHistory().then(restoreActiveJob)
  })

  onCleanup(() => {
    if (pollTimer) clearTimeout(pollTimer)
  })

  // ── Poll ─────────────────────────────────────────────────────────────────────
  function stopPoll() {
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = undefined
    }
    setState("polling", false)
  }

  function startPoll(id: string) {
    setState({ activeId: id, polling: true })
    void pollOnce(id)
  }

  async function pollOnce(id: string) {
    if (state.activeId !== id) return
    try {
      const job = await adminImportApi.get(id)
      if (state.activeId !== id) return
      setState("job", job)
      if (TERMINAL.has(job.status)) {
        setState("polling", false)
        void loadHistory()
        if (job.status === "success") void loadStats()
      } else {
        pollTimer = setTimeout(() => void pollOnce(id), POLL_INTERVAL_MS)
      }
    } catch (err) {
      if (state.activeId !== id) return
      setState("polling", false)
      showToast({ variant: "error", title: language.t("admin.import.toast.pollFailed"), description: msg(err) })
    }
  }

  // ── Submit / confirm ──────────────────────────────────────────────────────────
  async function submit() {
    if (state.submitting || state.polling) return
    if (state.tab === "url" && !state.sourceUrl.trim()) {
      showToast({ variant: "error", title: language.t("admin.import.toast.urlRequired") })
      return
    }
    if (state.tab === "upload" && !state.file) {
      showToast({ variant: "error", title: language.t("admin.import.toast.fileRequired") })
      return
    }
    stopPoll()
    setState({ submitting: true, job: null, activeId: null, confirmLargeDelete: false, largeDeleteBlocked: false })
    try {
      const res =
        state.tab === "url"
          ? await adminImportApi.createFromUrl(state.sourceUrl.trim(), state.reparse)
          : await adminImportApi.createFromFile(state.file as File, state.reparse)
      startPoll(res.jobId)
    } catch (err) {
      showToast({ variant: "error", title: language.t("admin.import.toast.submitFailed"), description: msg(err) })
    } finally {
      setState("submitting", false)
    }
  }

  async function confirmImport() {
    const job = state.job
    if (!job || state.confirming || state.polling) return
    setState("confirming", true)
    try {
      await adminImportApi.confirm(job.id, state.confirmLargeDelete)
      setState("largeDeleteBlocked", false)
      startPoll(job.id)
    } catch (err) {
      const code = (err as ImportConfirmError).code
      if (code === "large_delete_unconfirmed") {
        setState("largeDeleteBlocked", true)
        showToast({ variant: "error", title: language.t("admin.import.largeDelete.title") })
      } else {
        showToast({ variant: "error", title: language.t("admin.import.toast.confirmFailed"), description: msg(err) })
      }
    } finally {
      setState("confirming", false)
    }
  }

  function clearJob() {
    stopPoll()
    setState({ job: null, activeId: null, confirmLargeDelete: false, largeDeleteBlocked: false })
  }

  // ── File selection ─────────────────────────────────────────────────────────────
  function pickFile(files: FileList | null) {
    const f = files?.[0]
    if (f) setState("file", f)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setState("dragOver", false)
    pickFile(e.dataTransfer?.files ?? null)
  }

  function gotoHistoryPage(p: number) {
    if (p < 1 || p > totalHistoryPages()) return
    setState("historyPage", p)
    void loadHistory()
  }

  // ── Derived ────────────────────────────────────────────────────────────────────
  const result = createMemo<ImportResult>(() => state.job?.result ?? {})
  const deletedCount = createMemo(() => result().deleted ?? 0)
  const failedCount = createMemo(() => result().failed ?? 0)
  const incompleteCount = createMemo(() => result().incomplete ?? 0)
  const deletePercent = createMemo(() =>
    state.statsTotal > 0 ? Math.round((deletedCount() / state.statsTotal) * 100) : 0,
  )
  const largeDeleteWarn = createMemo(
    () =>
      state.largeDeleteBlocked ||
      (state.statsTotal > 0 && deletedCount() / state.statsTotal > LARGE_DELETE_RATIO),
  )
  const canConfirm = createMemo(
    () => state.job?.status === "previewed" && failedCount() === 0 && (!largeDeleteWarn() || state.confirmLargeDelete),
  )
  const hasErrorsLog = createMemo(() => failedCount() > 0 || incompleteCount() > 0)

  // ── Formatting ─────────────────────────────────────────────────────────────────
  const fmtDate = (iso?: string) => {
    if (!iso) return "—"
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(language.locale() === "zh" ? "zh-CN" : "en-US")
  }

  const fmtBytes = (n?: number) => {
    if (!n || n <= 0) return "—"
    const units = ["B", "KB", "MB", "GB"]
    const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
    return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
  }

  const typeLabel = (t: string) =>
    KNOWN_TYPES.has(t) ? language.t(`admin.content.type.${t}` as "admin.content.type.skill") : t

  const statusLabel = (s: string) => language.t(`admin.import.job.status.${s}` as "admin.import.job.status.pending")

  const sourceKindLabel = (k: string) =>
    language.t(k === "upload" ? "admin.import.sourceKind.upload" : "admin.import.sourceKind.url")

  const shortSha = (s?: string) => (s && s.length > 20 ? `${s.slice(0, 12)}…${s.slice(-6)}` : (s ?? "—"))

  const statusBadge = (s: string) => {
    switch (s) {
      case "success":
        return "bg-[color:color-mix(in_oklab,var(--native-success,#16a34a)_14%,transparent)] text-[var(--native-success,#16a34a)]"
      case "failed":
      case "cancelled":
        return "bg-[color:color-mix(in_oklab,var(--native-error)_14%,transparent)] text-[var(--native-error)]"
      case "previewed":
        return "bg-[color:color-mix(in_oklab,var(--native-primary)_12%,transparent)] text-[var(--native-primary)]"
      case "pending":
      case "running":
        return "bg-[color:color-mix(in_oklab,var(--native-warning,#d97706)_16%,transparent)] text-[var(--native-warning,#d97706)]"
      default:
        return "bg-[color:color-mix(in_oklab,var(--native-muted)_18%,transparent)] text-[var(--native-muted)]"
    }
  }

  const countAccent = (key: string) => {
    if (key === "failed") return "text-[var(--native-error)]"
    if (key === "deleted") return "text-[var(--native-warning,#d97706)]"
    if (key === "added") return "text-[var(--native-success,#16a34a)]"
    return "text-[var(--native-foreground)]"
  }

  async function copySha(sha?: string) {
    if (!sha) return
    try {
      await navigator.clipboard.writeText(sha)
      showToast({ variant: "success", title: language.t("admin.import.job.copied") })
    } catch {
      /* clipboard unavailable — non-fatal */
    }
  }

  async function triggerDownload(url: string) {
    try {
      await downloadViaFetch(url, "import-errors.log")
    } catch (err) {
      showToast({ variant: "error", title: language.t("admin.import.job.downloadErrors"), description: msg(err) })
    }
  }

  const inputCls =
    "h-[2.125rem] w-full min-w-0 rounded-[var(--native-radius-sm)] border border-[color:color-mix(in_oklab,var(--native-border)_48%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_88%,var(--native-bg-subtle))] px-2.5 text-[0.8125rem] text-[var(--native-foreground)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--native-dim)] focus:border-[var(--native-primary)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--native-primary)_10%,transparent)]"
  const cardCls =
    "rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_42%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_84%,var(--native-bg-subtle))] p-4"
  const secondaryBtn =
    "cursor-pointer inline-flex items-center gap-1.5 rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_60%,transparent)] px-3 py-1.5 text-[0.8125rem] text-[var(--native-muted)] transition-colors hover:text-[var(--native-foreground)] disabled:cursor-not-allowed disabled:opacity-50"

  return (
    <section class={sx.section}>
      <div class={sx.head}>
        <div>
          <h1 class={sx.title}>{language.t("admin.import.title")}</h1>
          <p class={sx.sub}>{language.t("admin.import.subtitle")}</p>
        </div>
      </div>

      {/* Current inventory by type */}
      <div class="mb-4">
        <p class="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--native-muted)]">
          {language.t("admin.import.stats.title")}
        </p>
        <div class={`${sx.statGrid} relative`} aria-busy={state.statsLoading}>
          <div
            class={sx.statCard}
            style={{ "--stat-accent": "var(--native-primary)", "--stat-bg": "color-mix(in oklab, var(--native-primary) 12%, transparent)" }}
          >
            <span class={sx.statIcon}>
              <Icon name="inbox" size="small" />
            </span>
            <div class="min-w-0">
              <p class={sx.statLabel}>{language.t("admin.import.stats.total")}</p>
              <p class={sx.statValue}>{state.statsTotal}</p>
            </div>
          </div>
          <For each={state.stats}>
            {(row) => (
              <div
                class={sx.statCard}
                style={{ "--stat-accent": "var(--native-muted)", "--stat-bg": "color-mix(in oklab, var(--native-muted) 12%, transparent)" }}
              >
                <span class={sx.statIcon}>
                  <Icon name="file-text" size="small" />
                </span>
                <div class="min-w-0">
                  <p class={sx.statLabel}>{typeLabel(row.itemType)}</p>
                  <p class={sx.statValue}>{row.count}</p>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* Import source */}
      <div class={`${cardCls} mb-4`}>
        <p class="mb-3 text-[0.9375rem] font-semibold text-[var(--native-foreground)]">
          {language.t("admin.import.source.title")}
        </p>

        {/* Tabs */}
        <div class="mb-3 inline-flex gap-1 rounded-[var(--native-radius-full)] bg-[color:color-mix(in_oklab,var(--native-panel)_70%,transparent)] p-0.5">
          <button type="button" class={st.tab(state.tab === "url")} aria-pressed={state.tab === "url"} onClick={() => setState("tab", "url")}>
            {language.t("admin.import.source.url")}
          </button>
          <button type="button" class={st.tab(state.tab === "upload")} aria-pressed={state.tab === "upload"} onClick={() => setState("tab", "upload")}>
            {language.t("admin.import.source.upload")}
          </button>
        </div>

        <Show when={state.tab === "url"}>
          <label class="mb-1 block text-[0.8125rem] font-medium text-[var(--native-foreground)]">
            {language.t("admin.import.source.urlLabel")}
          </label>
          <input
            class={inputCls}
            type="url"
            placeholder={language.t("admin.import.source.urlPlaceholder")}
            value={state.sourceUrl}
            onInput={(e) => setState("sourceUrl", e.currentTarget.value)}
          />
        </Show>

        <Show when={state.tab === "upload"}>
          <div
            role="button"
            tabindex="0"
            class={[
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--native-radius-md)] border border-dashed px-4 py-8 text-center transition-colors",
              state.dragOver
                ? "border-[var(--native-primary)] bg-[color:color-mix(in_oklab,var(--native-primary)_8%,transparent)]"
                : "border-[color:color-mix(in_oklab,var(--native-border)_60%,transparent)] hover:border-[var(--native-primary)]",
            ].join(" ")}
            onClick={() => fileInput?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInput?.click()
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setState("dragOver", true)
            }}
            onDragLeave={() => setState("dragOver", false)}
            onDrop={onDrop}
          >
            <Icon name="cloud-upload" size="large" />
            <Show
              when={state.file}
              fallback={<span class="text-[0.8125rem] text-[var(--native-muted)]">{language.t("admin.import.source.fileDrop")}</span>}
            >
              <span class="text-[0.8125rem] text-[var(--native-foreground)]">
                {language.t("admin.import.source.fileSelected", {
                  name: state.file?.name ?? "",
                  size: fmtBytes(state.file?.size),
                })}
              </span>
              <button
                type="button"
                class="cursor-pointer text-[12px] text-[var(--native-muted)] hover:text-[var(--native-foreground)] hover:underline"
                onClick={(e) => {
                  e.stopPropagation()
                  setState("file", null)
                  if (fileInput) fileInput.value = ""
                }}
              >
                {language.t("admin.import.source.fileClear")}
              </button>
            </Show>
          </div>
          {/* Input kept OUTSIDE the clickable dropzone: nesting it inside makes
              the programmatic fileInput.click() bubble back to the div's onClick,
              re-triggering the file chooser in a loop. */}
          <input
            ref={fileInput}
            type="file"
            class="hidden"
            accept=".gz,.tgz,application/gzip,application/x-gzip"
            onChange={(e) => pickFile(e.currentTarget.files)}
          />
          <p class="mt-1 text-[12px] leading-[1.5] text-[var(--native-muted)]">{language.t("admin.import.source.fileHint")}</p>
        </Show>

        {/* Reparse + submit */}
        <div class="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label class="flex cursor-pointer items-start gap-2 text-[0.8125rem] text-[var(--native-foreground)]">
            <input
              type="checkbox"
              class="mt-0.5 cursor-pointer"
              checked={state.reparse}
              onChange={(e) => setState("reparse", e.currentTarget.checked)}
            />
            <span>
              {language.t("admin.import.source.reparse")}
              <span class="mt-0.5 block text-[12px] text-[var(--native-muted)]">{language.t("admin.import.source.reparseHint")}</span>
            </span>
          </label>
          <Button class="cursor-pointer shrink-0" disabled={state.submitting || state.polling} onClick={() => void submit()}>
            {state.submitting ? language.t("admin.import.source.submitting") : language.t("admin.import.source.submit")}
          </Button>
        </div>
      </div>

      {/* Job preview */}
      <Show when={state.job}>
        {(job) => (
          <div class={`${cardCls} mb-4`}>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <p class="text-[0.9375rem] font-semibold text-[var(--native-foreground)]">
                  {language.t("admin.import.job.title")}
                </p>
                <span class={`inline-flex items-center rounded-[var(--native-radius-sm)] px-1.5 py-0.5 text-[11px] font-medium ${statusBadge(job().status)}`}>
                  {statusLabel(job().status)}
                </span>
                <span class="inline-flex items-center rounded-[var(--native-radius-sm)] bg-[color:color-mix(in_oklab,var(--native-muted)_16%,transparent)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--native-muted)]">
                  {job().dryRun ? language.t("admin.import.job.phase.dryRun") : language.t("admin.import.job.phase.import")}
                </span>
              </div>
              <button type="button" class="cursor-pointer text-[0.8125rem] text-[var(--native-muted)] hover:text-[var(--native-foreground)] hover:underline" onClick={clearJob}>
                {language.t("admin.import.job.clear")}
              </button>
            </div>

            {/* Meta: manifest sha + generated at + source */}
            <div class="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <div class="text-[11px] uppercase tracking-[0.06em] text-[var(--native-muted)]">{language.t("admin.import.job.manifest")}</div>
                <div class="mt-0.5 flex items-center gap-1.5">
                  <code class="font-mono text-[0.8125rem] text-[var(--native-foreground)]" title={result().manifestSha256 ?? ""}>
                    {shortSha(result().manifestSha256)}
                  </code>
                  <Show when={result().manifestSha256}>
                    <button
                      type="button"
                      class="cursor-pointer text-[var(--native-muted)] hover:text-[var(--native-foreground)]"
                      aria-label={language.t("admin.import.job.copy")}
                      title={language.t("admin.import.job.copy")}
                      onClick={() => void copySha(result().manifestSha256)}
                    >
                      <Icon name="copy" size="small" />
                    </button>
                  </Show>
                </div>
              </div>
              <div>
                <div class="text-[11px] uppercase tracking-[0.06em] text-[var(--native-muted)]">{language.t("admin.import.job.generatedAt")}</div>
                <div class="mt-0.5 text-[0.8125rem] text-[var(--native-foreground)]">{fmtDate(result().generatedAt)}</div>
              </div>
              <div>
                <div class="text-[11px] uppercase tracking-[0.06em] text-[var(--native-muted)]">{language.t("admin.import.job.bundleEntries")}</div>
                <div class="mt-0.5 text-[0.8125rem] text-[var(--native-foreground)] [font-variant-numeric:tabular-nums]">{result().bundleEntries ?? "—"}</div>
              </div>
            </div>

            {/* Running indicator */}
            <Show when={job().status === "pending" || job().status === "running"}>
              <div class="flex items-center gap-2 rounded-[var(--native-radius-md)] bg-[color:color-mix(in_oklab,var(--native-panel)_70%,transparent)] px-3 py-2 text-[0.8125rem] text-[var(--native-muted)]">
                <div class="h-4 w-4 shrink-0 animate-spin rounded-full border-[2px] border-[color:color-mix(in_srgb,var(--native-border)_30%,transparent)] border-t-[var(--native-primary)]" />
                {language.t("admin.import.job.running")}
              </div>
            </Show>

            {/* Counts */}
            <Show when={job().status !== "pending" && job().status !== "running"}>
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
                <For each={COUNT_KEYS}>
                  {(key) => (
                    <div class="rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_40%,transparent)] px-2 py-2 text-center">
                      <div class={`text-[1.1rem] font-extrabold [font-variant-numeric:tabular-nums] ${countAccent(key)}`}>
                        {result()[key] ?? 0}
                      </div>
                      <div class="text-[11px] text-[var(--native-muted)]">
                        {language.t(`admin.import.counts.${key}` as "admin.import.counts.added")}
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            {/* Error log download */}
            <Show when={hasErrorsLog()}>
              <div class="mt-3">
                <button type="button" class={secondaryBtn} onClick={() => triggerDownload(adminImportApi.errorsLogUrl(job().id))}>
                  <Icon name="download" size="small" />
                  {language.t("admin.import.job.downloadErrors")}
                </button>
              </div>
            </Show>

            {/* Large-delete warning */}
            <Show when={job().status === "previewed" && largeDeleteWarn()}>
              <div class="mt-3 rounded-[var(--native-radius-md)] border border-[var(--native-error)] bg-[color:color-mix(in_oklab,var(--native-error)_8%,transparent)] px-3 py-2.5">
                <div class="flex items-start gap-2 text-[0.8125rem] text-[var(--native-error)]">
                  <Icon name="warning" size="small" />
                  <span>{language.t("admin.import.largeDelete.warning", { count: String(deletedCount()), percent: String(deletePercent()) })}</span>
                </div>
                <label class="mt-2 flex cursor-pointer items-center gap-2 text-[0.8125rem] text-[var(--native-foreground)]">
                  <input
                    type="checkbox"
                    class="cursor-pointer"
                    checked={state.confirmLargeDelete}
                    onChange={(e) => setState("confirmLargeDelete", e.currentTarget.checked)}
                  />
                  {language.t("admin.import.largeDelete.confirm")}
                </label>
              </div>
            </Show>

            {/* Confirm / status messages */}
            <Show when={job().status === "previewed"}>
              <div class="mt-3 flex flex-wrap items-center gap-3">
                <Button class="cursor-pointer" disabled={!canConfirm() || state.confirming} onClick={() => void confirmImport()}>
                  {state.confirming ? language.t("admin.import.job.confirming") : language.t("admin.import.job.confirm")}
                </Button>
                <Show when={failedCount() > 0}>
                  <span class="text-[0.8125rem] text-[var(--native-error)]">{language.t("admin.import.job.confirmHintFailed")}</span>
                </Show>
              </div>
            </Show>

            <Show when={job().status === "success"}>
              <div class="mt-3 flex items-center gap-2 text-[0.8125rem] text-[var(--native-success,#16a34a)]">
                <Icon name="circle-check" size="small" />
                {language.t("admin.import.job.successMsg")}
              </div>
            </Show>

            <Show when={job().status === "failed"}>
              <div class="mt-3 rounded-[var(--native-radius-md)] border border-[var(--native-error)] bg-[color:color-mix(in_oklab,var(--native-error)_8%,transparent)] px-3 py-2 text-[0.8125rem] text-[var(--native-error)]">
                {job().errorMessage || language.t("admin.import.job.failedMsg")}
              </div>
            </Show>

            <Show when={job().status === "expired"}>
              <div class="mt-3 text-[0.8125rem] text-[var(--native-muted)]">{language.t("admin.import.job.expiredMsg")}</div>
            </Show>
          </div>
        )}
      </Show>

      {/* Recent imports */}
      <div>
        <p class="mb-2 text-[0.9375rem] font-semibold text-[var(--native-foreground)]">{language.t("admin.import.history.title")}</p>
        <div class={sx.tableShell} aria-busy={state.historyLoading}>
          <Show when={state.historyLoading}>
            <div class={sx.overlay} role="status">
              <div class={sx.spinner} />
              <span class="sr-only">{language.t("common.loading")}</span>
            </div>
          </Show>
          <table class={sx.dtStatic}>
            <thead>
              <tr>
                <th>{language.t("admin.import.history.columns.source")}</th>
                <th class="w-28">{language.t("admin.import.history.columns.status")}</th>
                <th class="w-56">{language.t("admin.import.history.columns.summary")}</th>
                <th class="w-40">{language.t("admin.import.history.columns.operator")}</th>
                <th class="w-40">{language.t("admin.import.history.columns.time")}</th>
              </tr>
            </thead>
            <tbody>
              <For each={state.history}>
                {(job) => (
                  <tr>
                    <td class="text-[var(--native-foreground)]">
                      <span class="inline-flex items-center gap-1.5">
                        <span class="inline-flex items-center rounded-[var(--native-radius-sm)] bg-[color:color-mix(in_oklab,var(--native-muted)_16%,transparent)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-[var(--native-muted)]">
                          {sourceKindLabel(job.sourceKind)}
                        </span>
                        <span class="max-w-[280px] truncate" title={job.sourceUrl || job.filename}>{job.filename || job.sourceUrl || job.id}</span>
                        <Show when={job.dryRun && (job.status === "previewed" || job.status === "expired")}>
                          <span class="shrink-0 text-[10px] text-[var(--native-muted)]">({language.t("admin.import.history.dryRunTag")})</span>
                        </Show>
                      </span>
                    </td>
                    <td>
                      <span class={`inline-flex items-center rounded-[var(--native-radius-sm)] px-1.5 py-0.5 text-[11px] font-medium ${statusBadge(job.status)}`}>
                        {statusLabel(job.status)}
                      </span>
                    </td>
                    <td class="text-[var(--native-muted)] [font-variant-numeric:tabular-nums]">
                      {language.t("admin.import.history.summary", {
                        added: String(job.result?.added ?? 0),
                        updated: String(job.result?.updated ?? 0),
                        deleted: String(job.result?.deleted ?? 0),
                        failed: String(job.result?.failed ?? 0),
                      })}
                    </td>
                    <td class="truncate text-[var(--native-muted)]">{job.triggerUser || "—"}</td>
                    <td class="text-[var(--native-muted)] [font-variant-numeric:tabular-nums]">{fmtDate(job.createdAt)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
          <Show when={!state.historyLoading && state.history.length === 0}>
            <div class={sx.state}>{language.t("admin.import.history.empty")}</div>
          </Show>
        </div>

        <Show when={state.historyTotal > HISTORY_PAGE_SIZE}>
          <div class={sx.pager}>
            <span class={sx.pagerSum}>
              {language.t("admin.import.pagination.summary", {
                page: String(state.historyPage),
                total: String(totalHistoryPages()),
                count: String(state.historyTotal),
              })}
            </span>
            <div class={sx.pagerActs}>
              <button
                type="button"
                class={sx.page}
                disabled={state.historyPage <= 1}
                aria-label={language.t("admin.import.pagination.prev")}
                onClick={() => gotoHistoryPage(state.historyPage - 1)}
              >
                <Icon name="chevron-left" size="small" />
              </button>
              <button
                type="button"
                class={sx.page}
                disabled={state.historyPage >= totalHistoryPages()}
                aria-label={language.t("admin.import.pagination.next")}
                onClick={() => gotoHistoryPage(state.historyPage + 1)}
              >
                <Icon name="chevron-right" size="small" />
              </button>
            </div>
          </div>
        </Show>
      </div>
    </section>
  )
}
