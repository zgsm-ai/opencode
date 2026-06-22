import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { createEffect, createMemo, For, onMount, Show } from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useLanguage } from "@/context/language"
import { ConfirmDialog } from "@/pages/store/components/confirm-dialog"
import { adminItemApi, type AdminItem, type AdminItemStatus } from "@/pages/store/lib/api"
import { sx, st } from "../lib/styles"

const TYPE_FILTERS = ["", "skill", "plugin", "subagent", "command", "mcp"] as const
const STATUS_FILTERS = ["", "active", "archived"] as const
// Coarse security risk groups understood by the backend (expanded server-side).
const SECURITY_FILTERS = ["", "low", "medium", "high", "unknown"] as const
const PAGE_SIZE = 20
// Mirrors the backend's per-request batch-delete cap (adminitem.maxBatchDelete).
// "Select all matching" pulls at most this many ids; a larger result set is
// trimmed to the first MAX_BATCH_DELETE with an explicit warning in the confirm.
const MAX_BATCH_DELETE = 200

export default function AdminContent() {
  const language = useLanguage()
  const dialog = useDialog()

  const [state, setState] = createStore<{
    items: AdminItem[]
    total: number
    loading: boolean
    type: string
    status: string
    security: string
    search: string
    debouncedSearch: string
    page: number
  }>({
    items: [],
    total: 0,
    loading: true,
    type: "",
    status: "",
    security: "",
    search: "",
    debouncedSearch: "",
    page: 1,
  })

  // Per-row action loading guard.
  const [actionLoading, setActionLoading] = createStore<Record<string, boolean>>({})

  // Multi-select state. `selected` holds explicitly-checked row ids (accumulates
  // across pages so a manual cross-page selection is possible). `allMatching`
  // is the "select all matching the current filter" mode — its effective id set
  // is resolved lazily at delete time (one filtered list call), not stored here.
  const [selected, setSelected] = createStore<Record<string, boolean>>({})
  const [batch, setBatch] = createStore<{ allMatching: boolean; deleting: boolean; preparing: boolean }>({
    allMatching: false,
    deleting: false,
    preparing: false,
  })

  // Detail drawer state.
  const [detail, setDetail] = createStore<{ open: boolean; item: AdminItem | null }>({
    open: false,
    item: null,
  })

  let searchTimer: ReturnType<typeof setTimeout>

  // Request sequence guard: setFilter / onSearchInput / gotoPage all fire
  // overlapping load()s, so a slow earlier response could otherwise clobber the
  // newest data. Each load claims a sequence number and only writes back when it
  // is still the latest in flight.
  let latestReq = 0

  const totalPages = createMemo(() => Math.max(1, Math.ceil(state.total / PAGE_SIZE)))

  async function load() {
    const mine = ++latestReq
    setState("loading", true)
    try {
      const res = await adminItemApi.list({
        type: state.type || undefined,
        status: state.status || undefined,
        securityStatus: state.security || undefined,
        search: state.debouncedSearch || undefined,
        page: state.page,
        pageSize: PAGE_SIZE,
      })
      if (mine !== latestReq) return
      setState("items", res.items ?? [])
      setState("total", res.total ?? 0)
    } catch (err) {
      if (mine !== latestReq) return
      showToast({
        variant: "error",
        title: language.t("admin.content.toast.loadFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      if (mine === latestReq) setState("loading", false)
    }
  }

  onMount(() => void load())

  // ── Selection ──────────────────────────────────────────────────────────────
  const selectedIdList = createMemo(() => Object.keys(selected).filter((id) => selected[id]))
  const selectedCount = createMemo(() => (batch.allMatching ? state.total : selectedIdList().length))
  const pageSelectedCount = createMemo(() => state.items.filter((i) => selected[i.id]).length)
  const allOnPageSelected = createMemo(() => state.items.length > 0 && pageSelectedCount() === state.items.length)
  const someOnPageSelected = createMemo(() => pageSelectedCount() > 0 && !allOnPageSelected())
  // Offer "select all matching" only once the whole visible page is checked and
  // there are more rows beyond this page.
  const canSelectAllMatching = createMemo(
    () => !batch.allMatching && allOnPageSelected() && state.total > state.items.length,
  )

  function clearSelection() {
    setSelected(reconcile({}))
    setBatch("allMatching", false)
  }

  function toggleRow(id: string, checked: boolean) {
    // Unchecking a row while in "all matching" mode: materialize the current
    // page as the explicit selection minus this row, then leave the mode. A
    // precise cross-page exclusion isn't supported, so other pages' implied
    // selection is intentionally dropped (the user can re-select).
    if (batch.allMatching && !checked) {
      setSelected(
        produce((s) => {
          for (const item of state.items) s[item.id] = true
          s[id] = false
        }),
      )
      setBatch("allMatching", false)
      return
    }
    setSelected(id, checked)
    // Narrowing the selection drops out of "all matching" mode.
    if (!checked) setBatch("allMatching", false)
  }

  function togglePage(checked: boolean) {
    setSelected(
      produce((s) => {
        for (const item of state.items) s[item.id] = checked
      }),
    )
    if (!checked) setBatch("allMatching", false)
  }

  function setFilter(key: "type" | "status" | "security", value: string) {
    setState(key, value)
    setState("page", 1)
    clearSelection()
    void load()
  }

  function onSearchInput(value: string) {
    setState("search", value)
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      setState("debouncedSearch", value.trim())
      setState("page", 1)
      clearSelection()
      void load()
    }, 300)
  }

  function gotoPage(p: number) {
    if (p < 1 || p > totalPages()) return
    setState("page", p)
    void load()
  }

  async function applyStatus(item: AdminItem, status: AdminItemStatus) {
    setActionLoading(item.id, true)
    try {
      await adminItemApi.setStatus(item.id, status)
      setState("items", (x) => x.id === item.id, "status", status)
      if (detail.item?.id === item.id) setDetail("item", (d) => (d ? { ...d, status } : d))
      showToast({
        variant: "success",
        title: language.t(
          status === "archived" ? "admin.content.toast.archived" : "admin.content.toast.activated",
        ),
      })
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("admin.content.toast.statusFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setActionLoading(item.id, false)
    }
  }

  // Taking an item offline (archive) hides it from the store, so confirm first.
  const confirmToggle = (item: AdminItem) => {
    const next: AdminItemStatus = item.status === "active" ? "archived" : "active"
    dialog.show(() => (
      <ConfirmDialog
        title={language.t(
          next === "archived" ? "admin.content.confirm.archive.title" : "admin.content.confirm.activate.title",
        )}
        description={language.t(
          next === "archived"
            ? "admin.content.confirm.archive.description"
            : "admin.content.confirm.activate.description",
          { name: item.name },
        )}
        confirm={language.t(next === "archived" ? "admin.content.actions.archive" : "admin.content.actions.activate")}
        variant={next === "archived" ? "danger" : "normal"}
        onConfirm={() => applyStatus(item, next)}
      />
    ))
  }

  async function removeItem(item: AdminItem) {
    setActionLoading(item.id, true)
    try {
      await adminItemApi.remove(item.id)
      setState("items", (items) => items.filter((x) => x.id !== item.id))
      setState("total", (t) => Math.max(0, t - 1))
      if (detail.item?.id === item.id) setDetail({ open: false, item: null })
      showToast({ variant: "success", title: language.t("admin.content.toast.deleted") })
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("admin.content.toast.deleteFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setActionLoading(item.id, false)
    }
  }

  const confirmDelete = (item: AdminItem) =>
    dialog.show(() => (
      <ConfirmDialog
        title={language.t("admin.content.confirm.delete.title")}
        description={language.t("admin.content.confirm.delete.description", { name: item.name })}
        confirm={language.t("admin.content.actions.delete")}
        variant="danger"
        onConfirm={() => removeItem(item)}
      />
    ))

  async function doBatchRemove(ids: string[]) {
    setBatch("deleting", true)
    try {
      const res = await adminItemApi.batchRemove(ids)
      if (detail.item && ids.includes(detail.item.id)) setDetail({ open: false, item: null })
      clearSelection()
      setState("page", 1)
      await load()
      showToast({
        variant: "success",
        title:
          res.skipped > 0
            ? language.t("admin.content.toast.batchDeletedWithSkipped", {
                deleted: String(res.deleted),
                skipped: String(res.skipped),
              })
            : language.t("admin.content.toast.batchDeleted", { deleted: String(res.deleted) }),
      })
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("admin.content.toast.batchDeleteFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setBatch("deleting", false)
    }
  }

  async function startBatchDelete() {
    if (batch.deleting || batch.preparing) return
    let ids: string[]
    let knownItems: AdminItem[]
    if (batch.allMatching) {
      // Resolve the full matching set (capped at MAX_BATCH_DELETE) with one
      // filtered list call, so the delete targets explicit ids rather than a
      // server-side filter re-interpretation. `preparing` guards re-entry while
      // this async fetch is in flight (batch.deleting is only set later).
      setBatch("preparing", true)
      try {
        const res = await adminItemApi.list({
          type: state.type || undefined,
          status: state.status || undefined,
          securityStatus: state.security || undefined,
          search: state.debouncedSearch || undefined,
          page: 1,
          pageSize: MAX_BATCH_DELETE,
        })
        knownItems = res.items ?? []
      } catch (err) {
        showToast({
          variant: "error",
          title: language.t("admin.content.toast.batchDeleteFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
        return
      } finally {
        setBatch("preparing", false)
      }
      ids = knownItems.map((i) => i.id)
    } else {
      ids = selectedIdList()
      knownItems = state.items.filter((i) => selected[i.id])
    }
    if (ids.length === 0) return

    const pluginCount = knownItems.filter((i) => i.itemType === "plugin").length
    const capped = batch.allMatching && state.total > MAX_BATCH_DELETE
    let description = language.t("admin.content.confirm.batchDelete.description", { count: String(ids.length) })
    if (pluginCount > 0) {
      description += " " + language.t("admin.content.confirm.batchDelete.withPlugins", { plugins: String(pluginCount) })
    }
    if (capped) {
      description +=
        " " +
        language.t("admin.content.confirm.batchDelete.capped", {
          total: String(state.total),
          max: String(MAX_BATCH_DELETE),
        })
    }
    dialog.show(() => (
      <ConfirmDialog
        title={language.t("admin.content.confirm.batchDelete.title")}
        description={description}
        confirm={language.t("admin.content.batch.delete")}
        variant="danger"
        onConfirm={() => doBatchRemove(ids)}
      />
    ))
  }

  function openDetail(item: AdminItem) {
    setDetail({ open: true, item })
  }

  const typeLabel = (t: string) =>
    t ? language.t(`admin.content.type.${t}` as "admin.content.type.skill") : language.t("admin.content.filter.allTypes")

  const statusLabel = (s: string) =>
    language.t(`admin.content.status.${s || "active"}` as "admin.content.status.active")

  const securityLabel = (s: string) =>
    language.t(`admin.content.security.${s}` as "admin.content.security.clean")

  // Semantic status colors: active = success, archived = muted.
  const statusStyle = (s: string) =>
    s === "archived"
      ? "bg-[color:color-mix(in_oklab,var(--native-muted)_18%,transparent)] text-[var(--native-muted)]"
      : "bg-[color:color-mix(in_oklab,var(--native-success,#16a34a)_14%,transparent)] text-[var(--native-success,#16a34a)]"

  // Semantic security colors: high/extreme = error, medium = warning, clean/low = success.
  const securityStyle = (s: string) => {
    switch (s) {
      case "high":
      case "extreme":
        return "bg-[color:color-mix(in_oklab,var(--native-error)_14%,transparent)] text-[var(--native-error)]"
      case "medium":
        return "bg-[color:color-mix(in_oklab,var(--native-warning,#d97706)_16%,transparent)] text-[var(--native-warning,#d97706)]"
      case "clean":
      case "low":
        return "bg-[color:color-mix(in_oklab,var(--native-success,#16a34a)_14%,transparent)] text-[var(--native-success,#16a34a)]"
      default:
        return "bg-[color:color-mix(in_oklab,var(--native-muted)_18%,transparent)] text-[var(--native-muted)]"
    }
  }

  const fmtScore = (n?: number) => (typeof n === "number" ? n.toFixed(1) : "—")

  const fmtDate = (iso?: string) => {
    if (!iso) return "—"
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(language.locale() === "zh" ? "zh-CN" : "en-US")
  }

  return (
    <section class={sx.section}>
      <div class={sx.head}>
        <div>
          <h1 class={sx.title}>{language.t("admin.content.title")}</h1>
          <p class={sx.sub}>{language.t("admin.content.subtitle")}</p>
        </div>
      </div>

      {/* Filters */}
      <div class="mb-3 flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex flex-wrap gap-1" aria-label={language.t("admin.content.filter.typeGroup")}>
            <For each={TYPE_FILTERS}>
              {(t) => (
                <button
                  type="button"
                  class={st.filter(state.type === t)}
                  aria-pressed={state.type === t}
                  onClick={() => setFilter("type", t)}
                >
                  {t === "" ? language.t("admin.content.filter.allTypes") : typeLabel(t)}
                </button>
              )}
            </For>
          </div>
          <div class="flex flex-wrap gap-1" aria-label={language.t("admin.content.filter.statusGroup")}>
            <For each={STATUS_FILTERS}>
              {(s) => (
                <button
                  type="button"
                  class={st.filter(state.status === s)}
                  aria-pressed={state.status === s}
                  onClick={() => setFilter("status", s)}
                >
                  {s === "" ? language.t("admin.content.filter.allStatus") : statusLabel(s)}
                </button>
              )}
            </For>
          </div>
          <div class="flex flex-wrap gap-1" aria-label={language.t("admin.content.filter.securityGroup")}>
            <For each={SECURITY_FILTERS}>
              {(s) => (
                <button
                  type="button"
                  class={st.filter(state.security === s)}
                  aria-pressed={state.security === s}
                  onClick={() => setFilter("security", s)}
                >
                  {s === "" ? language.t("admin.content.filter.allSecurity") : securityLabel(s)}
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
            placeholder={language.t("admin.content.searchPlaceholder")}
            value={state.search}
            aria-label={language.t("admin.content.searchPlaceholder")}
            onInput={(e) => onSearchInput(e.currentTarget.value)}
          />
        </div>
      </div>

      {/* Bulk action toolbar */}
      <Show when={selectedCount() > 0}>
        <div class="mb-3 flex flex-wrap items-center gap-3 rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_40%,transparent)] bg-[color:color-mix(in_oklab,var(--native-primary)_6%,transparent)] px-3 py-2">
          <span class="text-[0.8125rem] font-medium text-[var(--native-foreground)]">
            {batch.allMatching
              ? language.t("admin.content.batch.allMatchingSelected", { count: String(state.total) })
              : language.t("admin.content.batch.selected", { count: String(selectedCount()) })}
          </span>
          <Show when={canSelectAllMatching()}>
            <button
              type="button"
              class="cursor-pointer text-[0.8125rem] text-[var(--native-primary)] transition-colors hover:underline"
              onClick={() => setBatch("allMatching", true)}
            >
              {language.t("admin.content.batch.selectAllMatching", { count: String(state.total) })}
            </button>
          </Show>
          <div class="ml-auto flex items-center gap-3">
            <button
              type="button"
              class="cursor-pointer rounded-[var(--native-radius-md)] border border-[var(--native-error)] px-3 py-1.5 text-[0.8125rem] text-[var(--native-error)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-error)_10%,transparent)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={batch.deleting || batch.preparing}
              onClick={() => void startBatchDelete()}
            >
              {language.t("admin.content.batch.delete")}
            </button>
            <button
              type="button"
              class="cursor-pointer text-[0.8125rem] text-[var(--native-muted)] transition-colors hover:text-[var(--native-foreground)] hover:underline"
              onClick={clearSelection}
            >
              {language.t("admin.content.batch.clear")}
            </button>
          </div>
        </div>
      </Show>

      {/* Table */}
      <div class={sx.tableShell} aria-busy={state.loading}>
        <Show when={state.loading}>
          <div class={sx.overlay} role="status">
            <div class={sx.spinner} />
            <span class="sr-only">{language.t("common.loading")}</span>
          </div>
        </Show>

        <table class={sx.dtStatic}>
          <thead>
            <tr>
              <th class="w-10">
                <input
                  type="checkbox"
                  class="cursor-pointer align-middle"
                  aria-label={language.t("admin.content.select.allOnPage")}
                  checked={batch.allMatching ? state.items.length > 0 : allOnPageSelected()}
                  ref={(el) =>
                    createEffect(() => (el.indeterminate = !batch.allMatching && someOnPageSelected()))
                  }
                  onChange={(e) => togglePage(e.currentTarget.checked)}
                />
              </th>
              <th>{language.t("admin.content.columns.name")}</th>
              <th class="w-24">{language.t("admin.content.columns.type")}</th>
              <th class="w-24">{language.t("admin.content.columns.status")}</th>
              <th class="w-28">{language.t("admin.content.columns.security")}</th>
              <th class="w-20 text-right">{language.t("admin.content.columns.score")}</th>
              <th class="w-36">{language.t("admin.content.columns.author")}</th>
              <th class="w-40">{language.t("admin.content.columns.updated")}</th>
              <th class="w-48 text-right">{language.t("admin.content.columns.actions")}</th>
            </tr>
          </thead>
          <tbody>
            <For each={state.items}>
              {(item) => (
                <tr>
                  <td class="w-10">
                    <input
                      type="checkbox"
                      class="cursor-pointer align-middle"
                      aria-label={language.t("admin.content.select.row")}
                      checked={batch.allMatching || !!selected[item.id]}
                      onChange={(e) => toggleRow(item.id, e.currentTarget.checked)}
                    />
                  </td>
                  <td class="font-semibold text-[var(--native-foreground)]">
                    <button
                      type="button"
                      class="cursor-pointer text-left hover:underline"
                      onClick={() => openDetail(item)}
                    >
                      {item.name}
                    </button>
                  </td>
                  <td class="text-[var(--native-muted)]">
                    <span class="text-[12px]">{typeLabel(item.itemType)}</span>
                  </td>
                  <td>
                    <span
                      class={`inline-flex items-center rounded-[var(--native-radius-sm)] px-1.5 py-0.5 text-[11px] font-medium ${statusStyle(item.status)}`}
                    >
                      {statusLabel(item.status)}
                    </span>
                  </td>
                  <td>
                    <span
                      class={`inline-flex items-center rounded-[var(--native-radius-sm)] px-1.5 py-0.5 text-[11px] font-medium ${securityStyle(item.securityStatus)}`}
                    >
                      {securityLabel(item.securityStatus)}
                    </span>
                  </td>
                  <td class="text-right text-[var(--native-foreground)] [font-variant-numeric:tabular-nums]">
                    {fmtScore(item.experienceScore)}
                  </td>
                  <td class="truncate text-[var(--native-muted)]">{item.createdBy || "—"}</td>
                  <td class="text-[var(--native-muted)] [font-variant-numeric:tabular-nums]">
                    {fmtDate(item.updatedAt)}
                  </td>
                  <td class="text-right">
                    <div class="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        class={
                          item.status === "active"
                            ? "cursor-pointer text-[var(--native-muted)] transition-colors hover:text-[var(--native-foreground)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                            : "cursor-pointer text-[var(--native-primary)] transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                        }
                        disabled={actionLoading[item.id]}
                        onClick={() => confirmToggle(item)}
                      >
                        {language.t(
                          item.status === "active" ? "admin.content.actions.archive" : "admin.content.actions.activate",
                        )}
                      </button>
                      <button
                        type="button"
                        class="cursor-pointer text-[var(--native-error)] transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={actionLoading[item.id]}
                        onClick={() => confirmDelete(item)}
                      >
                        {language.t("admin.content.actions.delete")}
                      </button>
                      <button
                        type="button"
                        class="cursor-pointer text-[var(--native-muted)] transition-colors hover:text-[var(--native-foreground)] hover:underline"
                        onClick={() => openDetail(item)}
                      >
                        {language.t("admin.content.actions.detail")}
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>

        <Show when={!state.loading && state.items.length === 0}>
          <div class={sx.state}>{language.t("admin.content.empty")}</div>
        </Show>
      </div>

      {/* Pagination */}
      <Show when={state.total > PAGE_SIZE}>
        <div class={sx.pager}>
          <span class={sx.pagerSum}>
            {language.t("admin.content.pagination.summary", {
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
              aria-label={language.t("admin.content.pagination.prev")}
              onClick={() => gotoPage(state.page - 1)}
            >
              <Icon name="chevron-left" size="small" />
            </button>
            <button
              type="button"
              class={sx.page}
              disabled={state.page >= totalPages()}
              aria-label={language.t("admin.content.pagination.next")}
              onClick={() => gotoPage(state.page + 1)}
            >
              <Icon name="chevron-right" size="small" />
            </button>
          </div>
        </div>
      </Show>

      {/* Detail drawer */}
      <Sheet open={detail.open} onOpenChange={(o) => setDetail("open", o)}>
        <SheetContent position="right" class="w-full max-w-[440px]">
          <SheetHeader>
            <SheetTitle>{detail.item?.name ?? ""}</SheetTitle>
            <SheetDescription>{language.t("admin.content.detail.subtitle")}</SheetDescription>
          </SheetHeader>

          <Show when={detail.item}>
            {(item) => (
              <div class="flex flex-col gap-5 px-1 pt-2">
                <div class="grid grid-cols-2 gap-3 text-[0.8125rem]">
                  <div>
                    <div class="text-[12px] uppercase tracking-[0.06em] text-[var(--native-muted)]">
                      {language.t("admin.content.columns.type")}
                    </div>
                    <div class="mt-0.5 text-[var(--native-foreground)]">{typeLabel(item().itemType)}</div>
                  </div>
                  <div>
                    <div class="text-[12px] uppercase tracking-[0.06em] text-[var(--native-muted)]">
                      {language.t("admin.content.columns.status")}
                    </div>
                    <div class="mt-0.5">
                      <span
                        class={`inline-flex items-center rounded-[var(--native-radius-sm)] px-1.5 py-0.5 text-[11px] font-medium ${statusStyle(item().status)}`}
                      >
                        {statusLabel(item().status)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div class="text-[12px] uppercase tracking-[0.06em] text-[var(--native-muted)]">
                      {language.t("admin.content.columns.security")}
                    </div>
                    <div class="mt-0.5">
                      <span
                        class={`inline-flex items-center rounded-[var(--native-radius-sm)] px-1.5 py-0.5 text-[11px] font-medium ${securityStyle(item().securityStatus)}`}
                      >
                        {securityLabel(item().securityStatus)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div class="text-[12px] uppercase tracking-[0.06em] text-[var(--native-muted)]">
                      {language.t("admin.content.columns.score")}
                    </div>
                    <div class="mt-0.5 text-[var(--native-foreground)] [font-variant-numeric:tabular-nums]">
                      {fmtScore(item().experienceScore)}
                    </div>
                  </div>
                  <div class="col-span-2">
                    <div class="text-[12px] uppercase tracking-[0.06em] text-[var(--native-muted)]">
                      {language.t("admin.content.columns.author")}
                    </div>
                    <div class="mt-0.5 truncate text-[var(--native-foreground)]">{item().createdBy || "—"}</div>
                  </div>
                  <div class="col-span-2">
                    <div class="text-[12px] uppercase tracking-[0.06em] text-[var(--native-muted)]">
                      {language.t("admin.content.detail.registry")}
                    </div>
                    <div class="mt-0.5 truncate text-[var(--native-foreground)]">
                      {item().repoName || item().registryId || "—"}
                    </div>
                  </div>
                  <div>
                    <div class="text-[12px] uppercase tracking-[0.06em] text-[var(--native-muted)]">
                      {language.t("admin.content.columns.updated")}
                    </div>
                    <div class="mt-0.5 text-[var(--native-foreground)]">{fmtDate(item().updatedAt)}</div>
                  </div>
                  <div>
                    <div class="text-[12px] uppercase tracking-[0.06em] text-[var(--native-muted)]">
                      {language.t("admin.content.detail.created")}
                    </div>
                    <div class="mt-0.5 text-[var(--native-foreground)]">{fmtDate(item().createdAt)}</div>
                  </div>
                </div>

                {/* Moderation actions */}
                <div class="flex flex-wrap gap-2 border-t border-[color:color-mix(in_oklab,var(--native-border)_30%,transparent)] pt-4">
                  <button
                    type="button"
                    class="cursor-pointer rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_50%,transparent)] px-3 py-1.5 text-[0.8125rem] text-[var(--native-muted)] transition-colors hover:text-[var(--native-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={actionLoading[item().id]}
                    onClick={() => confirmToggle(item())}
                  >
                    {language.t(
                      item().status === "active"
                        ? "admin.content.actions.archive"
                        : "admin.content.actions.activate",
                    )}
                  </button>
                  <button
                    type="button"
                    class="cursor-pointer rounded-[var(--native-radius-md)] border border-[var(--native-error)] px-3 py-1.5 text-[0.8125rem] text-[var(--native-error)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-error)_10%,transparent)] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={actionLoading[item().id]}
                    onClick={() => confirmDelete(item())}
                  >
                    {language.t("admin.content.actions.delete")}
                  </button>
                </div>
              </div>
            )}
          </Show>
        </SheetContent>
      </Sheet>
    </section>
  )
}
