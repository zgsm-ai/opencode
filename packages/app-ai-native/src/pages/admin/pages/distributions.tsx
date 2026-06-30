import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { createMemo, createResource, For, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useLanguage } from "@/context/language"
import { ConfirmDialog } from "@/pages/store/components/confirm-dialog"
import {
  adminDistributionApi,
  distributionApi,
  userApi,
  type DistributionReceipt,
  type DistributionResult,
} from "@/pages/store/lib/api"
import { DistributionWizardDialog } from "../components/distribution-wizard-dialog"
import { sx, st } from "../lib/styles"

type Distribution = DistributionResult["distribution"] & { status: string }

const STATUS_FILTERS = ["", "active", "paused", "revoked"] as const
const SCOPE_FILTERS = ["", "user", "organization", "department"] as const
const PAGE_SIZE = 20

export default function AdminDistributions() {
  const language = useLanguage()
  const dialog = useDialog()

  const [state, setState] = createStore<{
    items: Distribution[]
    total: number
    loading: boolean
    status: string
    scope: string
    search: string
    debouncedSearch: string
    page: number
  }>({
    items: [],
    total: 0,
    loading: true,
    status: "",
    scope: "",
    search: "",
    debouncedSearch: "",
    page: 1,
  })

  // Per-row action loading
  const [actionLoading, setActionLoading] = createStore<Record<string, boolean>>({})

  // Detail drawer
  const [detail, setDetail] = createStore<{
    open: boolean
    dist: Distribution | null
    receipts: DistributionReceipt[]
    loading: boolean
  }>({ open: false, dist: null, receipts: [], loading: false })

  let searchTimer: ReturnType<typeof setTimeout>

  const totalPages = createMemo(() => Math.max(1, Math.ceil(state.total / PAGE_SIZE)))

  async function load() {
    setState("loading", true)
    try {
      const res = await adminDistributionApi.listAll({
        status: state.status || undefined,
        scope: state.scope || undefined,
        search: state.debouncedSearch || undefined,
        page: state.page,
        pageSize: PAGE_SIZE,
      })
      setState("items", (res.distributions ?? []) as Distribution[])
      setState("total", res.total ?? 0)
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("admin.distributions.toast.loadFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setState("loading", false)
    }
  }

  onMount(() => void load())

  // Resolve distributor names for the current page.
  const [distributorNames] = createResource(
    () => state.items.map((d) => d.distributorId).filter(Boolean),
    (ids) => (ids.length ? userApi.getNames(ids) : Promise.resolve({} as Record<string, string>)),
  )

  // Resolve receipt recipient names for the open detail drawer. Receipt userIds
  // are not part of the current page's distributor set, so they need their own
  // lookup keyed on the loaded receipts.
  const [receiptNames] = createResource(
    () => detail.receipts.map((r) => r.userId).filter(Boolean),
    (ids) => (ids.length ? userApi.getNames(ids) : Promise.resolve({} as Record<string, string>)),
  )

  // Resolve target usernames for user-scoped distributions on the current page,
  // so the table/drawer show a human name instead of the raw subject id (the
  // wizard picks targets by username). Org-scoped targets keep their raw id.
  const [targetNames] = createResource(
    () => state.items.filter((d) => d.scopeType === "user").map((d) => d.targetId).filter(Boolean),
    (ids) => (ids.length ? userApi.getNames(ids) : Promise.resolve({} as Record<string, string>)),
  )

  const targetDisplay = (scopeType: string, targetId: string) =>
    scopeType === "user" ? (targetNames()?.[targetId] ?? targetId) : targetId

  // Stats from the current page result. Active count comes from the unfiltered total
  // when no status filter is applied; otherwise reflects the filtered view.
  const stats = createMemo(() => {
    const activeOnPage = state.items.filter((d) => d.status === "active").length
    const pausedOnPage = state.items.filter((d) => d.status === "paused").length
    return { total: state.total, activeOnPage, pausedOnPage }
  })

  function setFilter(key: "status" | "scope", value: string) {
    setState(key, value)
    setState("page", 1)
    void load()
  }

  function onSearchInput(value: string) {
    setState("search", value)
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      setState("debouncedSearch", value.trim())
      setState("page", 1)
      void load()
    }, 300)
  }

  function gotoPage(p: number) {
    if (p < 1 || p > totalPages()) return
    setState("page", p)
    void load()
  }

  async function runAction(id: string, fn: () => Promise<unknown>, successKey: string, patch: Partial<Distribution>) {
    setActionLoading(id, true)
    try {
      await fn()
      setState("items", (d) => d.id === id, patch)
      if (detail.dist?.id === id) setDetail("dist", (d) => (d ? { ...d, ...patch } : d))
      showToast({ variant: "success", title: language.t(successKey) })
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("admin.distributions.toast.actionFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setActionLoading(id, false)
    }
  }

  const pause = (d: Distribution) =>
    runAction(
      d.id,
      () => distributionApi.update(d.id, { status: "paused" }),
      "admin.distributions.toast.paused",
      { status: "paused" },
    )

  const resume = (d: Distribution) =>
    runAction(
      d.id,
      () => distributionApi.update(d.id, { status: "active" }),
      "admin.distributions.toast.resumed",
      { status: "active" },
    )

  const revoke = (d: Distribution) =>
    dialog.show(() => (
      <ConfirmDialog
        title={language.t("admin.distributions.revoke.title")}
        description={language.t("admin.distributions.revoke.description")}
        confirm={language.t("admin.distributions.actions.revoke")}
        onConfirm={() =>
          runAction(
            d.id,
            () => distributionApi.revoke(d.id),
            "admin.distributions.toast.revoked",
            { status: "revoked" },
          )
        }
      />
    ))

  async function openDetail(d: Distribution) {
    setDetail({ open: true, dist: d, receipts: [], loading: true })
    try {
      const res = await adminDistributionApi.listReceipts(d.id)
      setDetail("receipts", res.receipts ?? [])
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("admin.distributions.toast.receiptsFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setDetail("loading", false)
    }
  }

  const receiptCounts = createMemo(() => {
    const counts: Record<string, number> = { unread: 0, read: 0, accepted: 0, dismissed: 0 }
    for (const r of detail.receipts) {
      if (counts[r.receiptStatus] === undefined) counts[r.receiptStatus] = 0
      counts[r.receiptStatus] += 1
    }
    return counts
  })

  const openWizard = () => dialog.show(() => <DistributionWizardDialog onCreated={() => void load()} />)

  const statusLabel = (s: string) => language.t(`admin.distributions.status.${s}` as `admin.distributions.status.active`)
  const scopeLabel = (s: string) => language.t(`admin.distributions.scope.${s}` as `admin.distributions.scope.user`)

  const statusDot = (s: string) =>
    s === "active"
      ? "bg-[var(--native-success,#16a34a)]"
      : s === "paused"
        ? "bg-[var(--native-warning,#d97706)]"
        : "bg-[var(--native-muted)]"

  const fmtDate = (iso?: string) => {
    if (!iso) return "—"
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(language.locale() === "zh" ? "zh-CN" : "en-US")
  }

  const STAT_CARDS = createMemo(() => [
    { key: "total", labelKey: "admin.distributions.stats.total", value: stats().total, icon: "square-arrow-top-right" as const, accent: "var(--native-primary)" },
    { key: "active", labelKey: "admin.distributions.stats.active", value: stats().activeOnPage, icon: "circle-check" as const, accent: "#16a34a" },
    { key: "paused", labelKey: "admin.distributions.stats.paused", value: stats().pausedOnPage, icon: "circle-ban-sign" as const, accent: "#d97706" },
  ])

  return (
    <section class={sx.section}>
      <div class={sx.head}>
        <div>
          <h1 class={sx.title}>{language.t("admin.distributions.title")}</h1>
          <p class={sx.sub}>{language.t("admin.distributions.subtitle")}</p>
        </div>
        <Button onClick={openWizard} class="cursor-pointer">
          {language.t("admin.distributions.create")}
        </Button>
      </div>

      {/* Stats */}
      <div class={`${sx.statGrid} mb-3.5 !grid-cols-1 sm:!grid-cols-3 xl:!grid-cols-3`}>
        <For each={STAT_CARDS()}>
          {(card) => (
            <div class={sx.statCard} style={{ "--stat-accent": card.accent, "--stat-bg": `color-mix(in oklab, ${card.accent} 12%, transparent)` }}>
              <span class={sx.statIcon}>
                <Icon name={card.icon} size="small" />
              </span>
              <div class="min-w-0">
                <p class={sx.statLabel}>{language.t(card.labelKey)}</p>
                <p class={sx.statValue}>{card.value}</p>
              </div>
            </div>
          )}
        </For>
      </div>

      {/* Filters */}
      <div class="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex flex-wrap gap-1" aria-label={language.t("admin.distributions.filter.statusGroup")}>
            <For each={STATUS_FILTERS}>
              {(s) => (
                <button
                  type="button"
                  class={st.filter(state.status === s)}
                  aria-pressed={state.status === s}
                  onClick={() => setFilter("status", s)}
                >
                  {s === "" ? language.t("admin.distributions.filter.allStatus") : statusLabel(s)}
                </button>
              )}
            </For>
          </div>
          <div class="flex flex-wrap gap-1" aria-label={language.t("admin.distributions.filter.scopeGroup")}>
            <For each={SCOPE_FILTERS}>
              {(s) => (
                <button
                  type="button"
                  class={st.filter(state.scope === s)}
                  aria-pressed={state.scope === s}
                  onClick={() => setFilter("scope", s)}
                >
                  {s === "" ? language.t("admin.distributions.filter.allScope") : scopeLabel(s)}
                </button>
              )}
            </For>
          </div>
        </div>
        <div class={sx.searchWrap}>
          <svg class={sx.searchIcon} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <g transform="scale(0.833333)">
              <path d="m21 21-4.34-4.34" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" />
              <circle cx="11" cy="11" r="8" stroke="currentColor" />
            </g>
          </svg>
          <input
            class={sx.search}
            placeholder={language.t("admin.distributions.searchPlaceholder")}
            value={state.search}
            onInput={(e) => onSearchInput(e.currentTarget.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div class={sx.tableShell}>
        <Show when={state.loading}>
          <div class={sx.overlay}>
            <div class={sx.spinner} />
          </div>
        </Show>

        <table class={sx.dtStatic}>
          <thead>
            <tr>
              <th>{language.t("admin.distributions.columns.item")}</th>
              <th class="w-36">{language.t("admin.distributions.columns.distributor")}</th>
              <th class="w-32">{language.t("admin.distributions.columns.target")}</th>
              <th class="w-28">{language.t("admin.distributions.columns.permission")}</th>
              <th class="w-24">{language.t("admin.distributions.columns.status")}</th>
              <th class="w-40">{language.t("admin.distributions.columns.created")}</th>
              <th class="w-44 text-right">{language.t("admin.distributions.columns.actions")}</th>
            </tr>
          </thead>
          <tbody>
            <For each={state.items}>
              {(d) => (
                <tr>
                  <td class="font-semibold text-[var(--native-foreground)]">
                    <span class="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        class="cursor-pointer text-left hover:underline"
                        onClick={() => void openDetail(d)}
                      >
                        {d.item?.name ?? d.itemId}
                      </button>
                      <Show when={d.message}>
                        <span
                          class="inline-flex shrink-0 text-[var(--native-muted)]"
                          title={language.t("admin.distributions.detail.message")}
                          aria-label={language.t("admin.distributions.detail.message")}
                        >
                          <Icon name="speech-bubble" size="small" />
                        </span>
                      </Show>
                    </span>
                  </td>
                  <td class="text-[var(--native-muted)]">{distributorNames()?.[d.distributorId] ?? d.distributorId}</td>
                  <td class="text-[var(--native-muted)]">
                    <span class="text-[12px] uppercase tracking-[0.04em]">{scopeLabel(d.scopeType)}</span>
                    <div class="truncate text-[var(--native-foreground)]">{targetDisplay(d.scopeType, d.targetId)}</div>
                  </td>
                  <td class="text-[var(--native-muted)]">
                    {language.t(`admin.distributions.permission.${d.permissionMode}` as `admin.distributions.permission.readonly`)}
                  </td>
                  <td>
                    <span class="inline-flex items-center gap-1.5 text-[var(--native-foreground)]">
                      <span class={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(d.status)}`} />
                      <span class="text-[12px]">{statusLabel(d.status)}</span>
                    </span>
                  </td>
                  <td class="text-[var(--native-muted)] [font-variant-numeric:tabular-nums]">{fmtDate(d.createdAt)}</td>
                  <td class="text-right">
                    <div class="flex items-center justify-end gap-3">
                      <Show when={d.status === "paused"}>
                        <button
                          type="button"
                          class="cursor-pointer text-[var(--native-primary)] transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={actionLoading[d.id]}
                          onClick={() => void resume(d)}
                        >
                          {language.t("admin.distributions.actions.resume")}
                        </button>
                      </Show>
                      <Show when={d.status === "active"}>
                        <button
                          type="button"
                          class="cursor-pointer text-[var(--native-muted)] transition-colors hover:text-[var(--native-foreground)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={actionLoading[d.id]}
                          onClick={() => void pause(d)}
                        >
                          {language.t("admin.distributions.actions.pause")}
                        </button>
                      </Show>
                      <Show when={d.status !== "revoked"}>
                        <button
                          type="button"
                          class="cursor-pointer text-[var(--native-error)] transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={actionLoading[d.id]}
                          onClick={() => revoke(d)}
                        >
                          {language.t("admin.distributions.actions.revoke")}
                        </button>
                      </Show>
                      <button
                        type="button"
                        class="cursor-pointer text-[var(--native-muted)] transition-colors hover:text-[var(--native-foreground)] hover:underline"
                        onClick={() => void openDetail(d)}
                      >
                        {language.t("admin.distributions.actions.detail")}
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>

        <Show when={!state.loading && state.items.length === 0}>
          <div class={sx.state}>{language.t("admin.distributions.empty")}</div>
        </Show>
      </div>

      {/* Pagination */}
      <Show when={state.total > PAGE_SIZE}>
        <div class={sx.pager}>
          <span class={sx.pagerSum}>
            {language.t("admin.distributions.pagination.summary", {
              page: String(state.page),
              total: String(totalPages()),
              count: String(state.total),
            })}
          </span>
          <div class={sx.pagerActs}>
            <button
              type="button"
              class={sx.page}
              disabled={state.page <= 1}
              aria-label={language.t("admin.distributions.pagination.prev")}
              onClick={() => gotoPage(state.page - 1)}
            >
              <Icon name="chevron-left" size="small" />
            </button>
            <button
              type="button"
              class={sx.page}
              disabled={state.page >= totalPages()}
              aria-label={language.t("admin.distributions.pagination.next")}
              onClick={() => gotoPage(state.page + 1)}
            >
              <Icon name="chevron-right" size="small" />
            </button>
          </div>
        </div>
      </Show>

      {/* Detail drawer */}
      <Sheet open={detail.open} onOpenChange={(o) => setDetail("open", o)}>
        <SheetContent position="right" class="w-full max-w-[480px]">
          <SheetHeader>
            <SheetTitle>{detail.dist?.item?.name ?? detail.dist?.itemId ?? ""}</SheetTitle>
            <SheetDescription>{language.t("admin.distributions.detail.subtitle")}</SheetDescription>
          </SheetHeader>

          <Show when={detail.dist}>
            {(d) => (
              <div class="flex flex-col gap-5 px-1 pt-2">
                {/* Meta */}
                <div class="grid grid-cols-2 gap-3 text-[0.8125rem]">
                  <div>
                    <div class="text-[12px] uppercase tracking-[0.06em] text-[var(--native-muted)]">
                      {language.t("admin.distributions.columns.status")}
                    </div>
                    <div class="mt-0.5 inline-flex items-center gap-1.5 text-[var(--native-foreground)]">
                      <span class={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(d().status)}`} />
                      {statusLabel(d().status)}
                    </div>
                  </div>
                  <div>
                    <div class="text-[12px] uppercase tracking-[0.06em] text-[var(--native-muted)]">
                      {language.t("admin.distributions.columns.permission")}
                    </div>
                    <div class="mt-0.5 text-[var(--native-foreground)]">
                      {language.t(`admin.distributions.permission.${d().permissionMode}` as `admin.distributions.permission.readonly`)}
                    </div>
                  </div>
                  <div>
                    <div class="text-[12px] uppercase tracking-[0.06em] text-[var(--native-muted)]">
                      {language.t("admin.distributions.columns.target")}
                    </div>
                    <div class="mt-0.5 truncate text-[var(--native-foreground)]">
                      {scopeLabel(d().scopeType)} · {targetDisplay(d().scopeType, d().targetId)}
                    </div>
                  </div>
                  <div>
                    <div class="text-[12px] uppercase tracking-[0.06em] text-[var(--native-muted)]">
                      {language.t("admin.distributions.columns.distributor")}
                    </div>
                    <div class="mt-0.5 truncate text-[var(--native-foreground)]">
                      {distributorNames()?.[d().distributorId] ?? d().distributorId}
                    </div>
                  </div>
                </div>

                <Show when={d().message}>
                  <div class="flex flex-col gap-1">
                    <div class="text-[12px] uppercase tracking-[0.06em] text-[var(--native-muted)]">
                      {language.t("admin.distributions.detail.message")}
                    </div>
                    <div class="whitespace-pre-wrap rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_40%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_80%,transparent)] px-3 py-2 text-[0.8125rem] text-[var(--native-foreground)]">
                      {d().message}
                    </div>
                  </div>
                </Show>

                {/* Receipt summary */}
                <div class="grid grid-cols-4 gap-2">
                  <For each={["unread", "read", "accepted", "dismissed"] as const}>
                    {(key) => (
                      <div class="rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_40%,transparent)] px-2 py-2 text-center">
                        <div class="text-[1.1rem] font-extrabold text-[var(--native-foreground)] [font-variant-numeric:tabular-nums]">
                          {receiptCounts()[key] ?? 0}
                        </div>
                        <div class="text-[11px] text-[var(--native-muted)]">
                          {language.t(`admin.distributions.receipt.${key}` as `admin.distributions.receipt.unread`)}
                        </div>
                      </div>
                    )}
                  </For>
                </div>

                {/* Receipt list */}
                <div class="flex flex-col gap-2">
                  <div class="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--native-muted)]">
                    {language.t("admin.distributions.detail.receipts")}
                  </div>
                  <Show when={detail.loading}>
                    <div class="py-6 text-center text-[0.8125rem] text-[var(--native-muted)]">
                      {language.t("admin.distributions.wizard.searching")}
                    </div>
                  </Show>
                  <Show when={!detail.loading && detail.receipts.length === 0}>
                    <div class={sx.empty}>{language.t("admin.distributions.detail.noReceipts")}</div>
                  </Show>
                  <Show when={!detail.loading && detail.receipts.length > 0}>
                    <div class="flex flex-col divide-y divide-[color:color-mix(in_oklab,var(--native-border)_20%,transparent)]">
                      <For each={detail.receipts}>
                        {(r) => (
                          <div class="flex items-center justify-between gap-2 py-2 text-[0.8125rem]">
                            <span class="truncate text-[var(--native-foreground)]">
                              {receiptNames()?.[r.userId] ?? r.userId}
                            </span>
                            <span class="shrink-0 text-[12px] text-[var(--native-muted)]">
                              {language.t(`admin.distributions.receipt.${r.receiptStatus}` as `admin.distributions.receipt.unread`)}
                            </span>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </div>
            )}
          </Show>
        </SheetContent>
      </Sheet>
    </section>
  )
}
