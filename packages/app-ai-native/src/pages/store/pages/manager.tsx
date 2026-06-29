import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { useNavigate, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, For, onCleanup, Show, Suspense, untrack } from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import { useItemFilterOptions } from "@/context/item-filter-options"
import { useLanguage } from "@/context/language"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { ConfirmDialog } from "@/pages/store/components/confirm-dialog"
import { CreateCapabilityDialog } from "@/pages/store/components/create-capability-dialog"
import ItemDetailContent from "@/pages/store/components/item-detail-content"
import { ItemDetailLoadingSkeleton } from "@/pages/store/components/item-detail-loading-skeleton"
import { MoveCapabilityDialog } from "@/pages/store/components/move-capability-dialog"
import { formatCompact, formatStoreDate, formatStoreTablePaginationSummary, StoreTableFooter } from "@/pages/store/components/store-capability-table"
import { ManagerListView } from "@/pages/store/components/manager-list-view"
import { StoreFilterBar } from "@/pages/store/components/store-filter-bar"
import { useAuth } from "@/pages/store/hooks/use-auth"
import { behaviorApi, distributionApi, itemApi, repoApi, userApi, type CapabilityItem, type DistributionResult, type ItemOrder, type ItemSort, type Repository, type SecurityRiskGroup } from "@/pages/store/lib/api"
import { getLoginUrl } from "@/pages/store/lib/auth"
import { sx } from "@/pages/store/lib/styles"
import { typeKey } from "@/pages/store/lib/constants"
// import { UploadPluginDialog } from "@/pages/store/components/upload-plugin-dialog"
// import { CreateRepoDialog } from "@/pages/store/components/create-repo-dialog"

const PAGE_SIZE = 10
// Mirrors the backend per-request batch cap. "Select all matching" pulls at most
// this many ids; a larger result set is trimmed with an explicit warning.
const MAX_BATCH_DELETE = 200
const STORE_TYPES = [
  { value: "skill", labelKey: "store.sidebar.nav.skills", icon: "sparkles" as const, color: "#ffa000", bg: "#FEF3C7" },
  { value: "subagent", labelKey: "store.sidebar.nav.subagents", icon: "brain" as const, color: "#1670ff", bg: "#DBEAFE" },
  { value: "command", labelKey: "store.sidebar.nav.commands", icon: "console" as const, color: "#09b179", bg: "#D1FAE5" },
  { value: "mcp", labelKey: "store.sidebar.nav.mcpServers", icon: "mcp" as const, color: "#7338f9", bg: "#EDE9FE" },
  { value: "plugin", labelKey: "store.sidebar.nav.plugins", icon: "configuration" as const, color: "#EC4899", bg: "#FCE7F3" },
] as const

const SIDEBAR_ITEMS = [
  { key: "created" as TabKey, labelKey: "store.console.capabilities.myCreated", icon: "archive" as const },
  { key: "favorited" as TabKey, labelKey: "store.console.capabilities.myFavorited", icon: "check" as const },
  { key: "received" as TabKey, labelKey: "store.received.title", icon: "inbox" as const },
  { key: "sent" as TabKey, labelKey: "store.sent.title", icon: "share" as const },
] as const

type TabKey = "created" | "favorited" | "received" | "sent"

type ReceiptItem = {
  id: string
  distributionId: string
  userId: string
  receiptStatus: string
  distribution: {
    id: string
    itemId: string
    distributorId: string
    permissionMode: string
    status: string
    scopeType: string
    targetId: string
    message?: string
    createdAt: string
    item?: CapabilityItem
  }
}
type StoreType = (typeof STORE_TYPES)[number]["value"]
type SecurityFilterValue = SecurityRiskGroup

export default function StoreManagerPage() {
  const dialog = useDialog()
  const language = useLanguage()
  const itemFilterOptions = useItemFilterOptions()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const auth = useAuth()

  const [selectedItemId, setSelectedItemId] = createStore<{ value: string | null }>({ value: null })
  const [detailState, setDetailState] = createStore({
    item: null as CapabilityItem | null,
    renderItemId: null as string | null,
    favoritePending: false,
    favorited: false,
    favoriteCount: 0,
    previewCount: 0,
    installCount: 0,
    trackedItemId: null as string | null,
    contentReady: false,
  })
  const [state, setState] = createStore({
    tab: "created" as TabKey,
    search: "",
    debouncedSearch: "",
    itemPage: 1,
    favoritedPage: 1,
    items: [] as CapabilityItem[],
    totalItems: 0,
    // Unfiltered, filter/search-independent grand totals powering the sidebar tab
    // badges. Kept separate from totalItems/favoritedTotal (which stay filtered for
    // pagination + "select all matching"). Refreshed via refreshTabCounts().
    createdCount: 0,
    favoritedCount: 0,
    loadingItems: false,
    createdLoaded: false,
    favoritedItems: [] as CapabilityItem[],
    favoritedTotal: 0,
    favoritedLoading: false,
    favoritedLoaded: false,
    receivedItems: [] as ReceiptItem[],
    receivedLoading: false,
    receivedLoaded: false,
    receivedError: "",
    sentItems: [] as DistributionResult["distribution"][],
    sentLoading: false,
    sentLoaded: false,
    sentError: "",
    repos: [] as Repository[],
    // Point-to-apply filters (no pending→apply two-stage): toggling writes straight
    // to applied* and triggers a refresh, matching the store home filter bar.
    appliedTypeFilters: [] as StoreType[],
    appliedTagFilters: [] as string[],
    appliedCategoryFilters: [] as string[],
    appliedSourceFilters: [] as string[],
    appliedSecurityFilters: [] as SecurityFilterValue[],
    sort: { by: "favoriteCount" as ItemSort | undefined, order: "desc" as ItemOrder | undefined },
    favoriteActionItemId: null as string | null,
  })
  // Multi-select for batch delete (My Created tab only). `selected` holds the
  // explicitly-checked row ids; `batch.allMatching` is the "select all matching
  // the current filter" mode, resolved to ids lazily at delete time.
  const [selected, setSelected] = createStore<Record<string, boolean>>({})
  const [batch, setBatch] = createStore({ allMatching: false, deleting: false, preparing: false })
  let searchInputRef: HTMLInputElement | undefined
  let searchSelectionStart: number | null = null
  let searchSelectionEnd: number | null = null
  let allowSearchRefocusUntil = 0
  let pendingBlurRefocusTimer: ReturnType<typeof setTimeout> | undefined
  let searchFocusRecoveryTimer: ReturnType<typeof setTimeout> | undefined

  const userId = createMemo(() => auth.user()?.id ?? auth.user()?.subjectId ?? auth.user()?.sub ?? "")
  const detailOpen = createMemo(() => !!selectedItemId.value)
  const activePage = createMemo(() => {
    if (state.tab === "created") return state.itemPage
    if (state.tab === "favorited") return state.favoritedPage
    return 1
  })
  const activeTotal = createMemo(() => {
    if (state.tab === "created") return state.totalItems
    if (state.tab === "favorited") return state.favoritedTotal
    if (state.tab === "sent") return filteredSentItems().length
    return filteredReceivedItems().length
  })
  const activeItems = createMemo(() => {
    if (state.tab === "created") return state.items
    if (state.tab === "favorited") return state.favoritedItems
    return []
  })
  const activeLoading = createMemo(() => {
    if (state.tab === "created") return state.loadingItems
    if (state.tab === "favorited") return state.favoritedLoading
    if (state.tab === "sent") return state.sentLoading
    return state.receivedLoading
  })
  const totalPages = createMemo(() => Math.max(1, Math.ceil(activeTotal() / PAGE_SIZE)))
  const tabCount = (key: TabKey) => {
    // Badges show the tab's TRUE grand total, independent of the active filters /
    // search and of which tab is currently open (received/sent are eager-loaded at
    // mount so their unfiltered array length is correct on first paint).
    if (key === "created") return state.createdCount
    if (key === "favorited") return state.favoritedCount
    if (key === "received") return state.receivedItems.length
    return state.sentItems.length
  }
  const rows = createMemo(() => activeItems())
  const filteredReceivedItems = createMemo(() => {
    const query = state.debouncedSearch.trim().toLowerCase()
    if (!query) return state.receivedItems
    return state.receivedItems.filter((r) =>
      r.distribution?.item?.name?.toLowerCase().includes(query) ||
      r.distribution?.item?.description?.toLowerCase().includes(query),
    )
  })
  const filteredSentItems = createMemo(() => {
    const query = state.debouncedSearch.trim().toLowerCase()
    if (!query) return state.sentItems
    return state.sentItems.filter((d) =>
      d.item?.name?.toLowerCase().includes(query) ||
      d.item?.description?.toLowerCase().includes(query),
    )
  })
  let initializedForUser = ""
  let detailContentTimer: ReturnType<typeof setTimeout> | undefined
  let searchTimer: ReturnType<typeof setTimeout> | undefined

  onCleanup(() => {
    clearTimeout(detailContentTimer)
    clearTimeout(searchTimer)
    clearTimeout(pendingBlurRefocusTimer)
    clearTimeout(searchFocusRecoveryTimer)
  })

  const formatDate = (iso?: string) => formatStoreDate(language.locale(), iso)
  const typeLabel = (value: string) => language.t(typeKey(value))
  const captureSearchSelection = () => {
    if (!searchInputRef) return
    searchSelectionStart = searchInputRef.selectionStart
    searchSelectionEnd = searchInputRef.selectionEnd
  }
  const restoreSearchFocus = () => {
    if (!searchInputRef) return
    searchInputRef.focus({ preventScroll: true })
    if (searchSelectionStart === null || searchSelectionEnd === null) return
    try {
      searchInputRef.setSelectionRange(searchSelectionStart, searchSelectionEnd)
    }
    catch {
      // Ignore inputs that do not support selection restoration.
    }
  }
  const bindSearchInputRef = (el: HTMLInputElement) => {
    searchInputRef = el
    if (Date.now() > allowSearchRefocusUntil) return
    queueMicrotask(() => {
      if (searchInputRef !== el) return
      if (document.activeElement && document.activeElement !== document.body && document.activeElement !== el) return
      restoreSearchFocus()
      scheduleSearchFocusRecovery("ref-bind")
    })
  }
  const scheduleSearchFocusRecovery = (reason: string, attempts = 8) => {
    clearTimeout(searchFocusRecoveryTimer)
    const tick = (remaining: number) => {
      if (!searchInputRef || Date.now() > allowSearchRefocusUntil) return
      const active = document.activeElement
      const focused = active === searchInputRef
      if (focused) return
      restoreSearchFocus()
      if (document.activeElement === searchInputRef || remaining <= 1) return
      searchFocusRecoveryTimer = setTimeout(() => tick(remaining - 1), 50)
    }
    searchFocusRecoveryTimer = setTimeout(() => tick(attempts), 0)
  }
  const restoreSearchFocusIfNeeded = () => {
    if (!searchInputRef || Date.now() > allowSearchRefocusUntil) return
    requestAnimationFrame(() => {
      if (!searchInputRef) return
      if (document.activeElement && document.activeElement !== document.body && document.activeElement !== searchInputRef) return
      restoreSearchFocus()
      scheduleSearchFocusRecovery("restoreIfNeeded")
    })
  }

  // ── Filter option sources (mirror store home: type from STORE_TYPES, the rest
  // from useItemFilterOptions; tag has no finite catalog so it is derived from the
  // tags present on the currently-loaded rows, unioned with any applied tags so a
  // selected tag stays toggle-able even after it narrows the result set). ──────────
  const typeOptions = createMemo(() => STORE_TYPES.map((entry) => ({ value: entry.value, label: language.t(entry.labelKey) })))
  const categoryOptions = createMemo(() => itemFilterOptions.categories().map((category) => ({
    value: category.slug,
    label: itemFilterOptions.categoryLabel(category.slug, category),
  })))
  const securityOptions = createMemo(() => itemFilterOptions.securityRiskGroups().map((option) => ({
    value: option.value,
    label: itemFilterOptions.securityRiskGroupLabel(option.value as SecurityFilterValue, option),
  })))
  const sourceOptions = createMemo(() => itemFilterOptions.sources().map((source) => ({
    value: source.value,
    label: itemFilterOptions.sourceLabel(source.value, source) || source.value,
  })))
  const tagOptions = createMemo(() => {
    const slugs = new Set<string>()
    for (const item of activeItems()) {
      for (const tag of item.tags ?? []) slugs.add(tag.slug)
    }
    for (const slug of state.appliedTagFilters) slugs.add(slug)
    return [...slugs].sort().map((slug) => ({ value: slug, label: slug }))
  })

  const buildListParams = () => ({
    type: state.appliedTypeFilters.length === 1 ? state.appliedTypeFilters[0] : undefined,
    page: state.tab === "created" ? state.itemPage : state.favoritedPage,
    pageSize: PAGE_SIZE,
    search: state.debouncedSearch.trim() || undefined,
    categories: state.appliedCategoryFilters.length ? state.appliedCategoryFilters : undefined,
    source: state.appliedSourceFilters.length ? state.appliedSourceFilters : undefined,
    tags: state.appliedTagFilters.length ? state.appliedTagFilters : undefined,
    securityStatuses: state.appliedSecurityFilters.length ? state.appliedSecurityFilters : undefined,
    sortBy: state.sort.by,
    sortOrder: state.sort.order,
  })

  const loadCreated = async () => {
    if (!userId() || state.loadingItems) return
    setState("loadingItems", true)
    try {
      const res = await itemApi.listMy(buildListParams())
      setState({ items: res.items ?? [], totalItems: res.total ?? 0, createdLoaded: true })
    }
    catch (error) {
      showToast({
        title: language.t("store.console.capabilities.toast.loadFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    }
    finally {
      setState("loadingItems", false)
      restoreSearchFocusIfNeeded()
    }
  }

  const loadFavorited = async () => {
    if (state.favoritedLoading) return
    setState("favoritedLoading", true)
    try {
      const res = await itemApi.list({ ...buildListParams(), favorited: true, paginated: true })
      setState({ favoritedItems: res.items ?? [], favoritedTotal: res.total ?? 0, favoritedLoaded: true })
    }
    catch (error) {
      showToast({
        title: language.t("store.console.capabilities.toast.loadFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    }
    finally {
      setState("favoritedLoading", false)
      restoreSearchFocusIfNeeded()
    }
  }

  const [receivedActionLoading, setReceivedActionLoading] = createStore<Record<string, boolean>>({})
  const [sentActionLoading, setSentActionLoading] = createStore<Record<string, boolean>>({})

  // silent=true (eager mount prefetch for the sidebar badge): record the error in
  // state (shown inline when the tab is opened) but skip the toast, so a background
  // count prefetch never pops an error toast while the user is on another tab.
  const loadReceived = async (silent = false) => {
    if (state.receivedLoading) return
    setState({ receivedLoading: true, receivedError: "" })
    try {
      const res = await distributionApi.listMyReceived()
      setState({ receivedItems: res.receipts ?? [], receivedLoaded: true, receivedError: "" })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setState({ receivedLoaded: true, receivedError: message || language.t("store.received.toast.loadFailed") })
      if (!silent) {
        showToast({
          variant: "error",
          title: language.t("store.received.toast.loadFailed"),
          description: message,
        })
      }
    }
    finally {
      setState("receivedLoading", false)
    }
  }

  const loadSent = async (silent = false) => {
    if (state.sentLoading) return
    setState({ sentLoading: true, sentError: "" })
    try {
      const res = await distributionApi.listMySent()
      setState({ sentItems: res.distributions ?? [], sentLoaded: true, sentError: "" })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setState({ sentLoaded: true, sentError: message || language.t("store.sent.toast.loadFailed") })
      if (!silent) {
        showToast({
          variant: "error",
          title: language.t("store.sent.toast.loadFailed"),
          description: message,
        })
      }
    }
    finally {
      setState("sentLoading", false)
    }
  }

  const handleRevokeDistribution = async (distributionId: string) => {
    setSentActionLoading(distributionId, true)
    try {
      await distributionApi.revoke(distributionId)
      showToast({ variant: "success", title: language.t("store.sent.toast.revokeSuccess") })
      setState("sentItems", (prev) => prev.map((d) => d.id === distributionId ? { ...d, status: "revoked" } : d))
    }
    catch (err) {
      showToast({ variant: "error", title: language.t("store.sent.toast.revokeFailed"), description: err instanceof Error ? err.message : String(err) })
    }
    finally {
      setSentActionLoading(distributionId, false)
    }
  }

  const handleDismissReceipt = async (distributionId: string) => {
    setReceivedActionLoading(distributionId, true)
    try {
      await distributionApi.dismiss(distributionId)
      showToast({ variant: "success", title: language.t("store.received.toast.dismissSuccess") })
      setState("receivedItems", (prev) => prev.filter((r) => r.distributionId !== distributionId))
    }
    catch (err) {
      showToast({ variant: "error", title: language.t("store.received.toast.dismissFailed"), description: err instanceof Error ? err.message : String(err) })
    }
    finally {
      setReceivedActionLoading(distributionId, false)
    }
  }

  const handleMarkReadReceipt = async (distributionId: string) => {
    setReceivedActionLoading(distributionId, true)
    try {
      await distributionApi.markRead(distributionId)
      setState("receivedItems", (prev) => prev.map((r) => r.distributionId === distributionId ? { ...r, receiptStatus: "read" } : r))
    }
    catch (err) {
      showToast({ variant: "error", title: language.t("store.received.toast.markReadFailed"), description: err instanceof Error ? err.message : String(err) })
    }
    finally {
      setReceivedActionLoading(distributionId, false)
    }
  }

  const [distributorInfoMap] = createResource(
    () => {
      const list = state.receivedItems
      if (state.tab !== "received" || list.length === 0) return []
      return [...new Set(list.map((r) => r.distribution?.distributorId).filter(Boolean))]
    },
    (ids) => userApi.getInfo(ids),
  )

  const refreshActiveTab = () => {
    if (state.tab === "created") return void loadCreated()
    if (state.tab === "favorited") return void loadFavorited()
    if (state.tab === "sent") return void loadSent()
    return void loadReceived()
  }

  const refreshBothTabs = () => {
    void loadCreated()
    if (state.favoritedLoaded || state.tab === "favorited") void loadFavorited()
    if (state.receivedLoaded || state.tab === "received") void loadReceived()
    if (state.sentLoaded || state.tab === "sent") void loadSent()
  }

  // Sidebar badge totals for created/favorited, fetched WITHOUT any filter/search so
  // the badges reflect the real grand total (received/sent badges use their array
  // length instead). pageSize:1 keeps these count-only requests cheap. Called at
  // mount and after any mutation that changes those totals.
  const refreshTabCounts = async () => {
    if (!userId()) return
    try {
      const [createdRes, favoritedRes] = await Promise.all([
        itemApi.listMy({ page: 1, pageSize: 1 }),
        itemApi.list({ page: 1, pageSize: 1, favorited: true, paginated: true }),
      ])
      setState({ createdCount: createdRes.total ?? 0, favoritedCount: favoritedRes.total ?? 0 })
    }
    catch {
      // Non-fatal: leave badges at their last known value rather than surfacing an error.
    }
  }

  createEffect(() => {
    const currentUserId = userId()
    if (!currentUserId || initializedForUser === currentUserId) return
    initializedForUser = currentUserId
    void loadCreated()
    // Eager-load every tab's totals up front so all four sidebar badges are correct
    // on first paint (received/sent lists are unfiltered, so their length is the
    // real total; created/favorited get a dedicated unfiltered count request).
    void refreshTabCounts()
    void loadReceived(true)
    void loadSent(true)
  })

  createEffect(() => {
    const itemId = selectedItemId.value
    clearTimeout(detailContentTimer)
    if (!itemId) {
      setDetailState("contentReady", false)
      setDetailState("renderItemId", null)
      return
    }
    setDetailState("contentReady", false)
    detailContentTimer = setTimeout(() => {
      setDetailState("renderItemId", itemId)
      setDetailState("contentReady", true)
    }, 180)
  })

  createEffect(() => {
    const data = detailState.item
    if (!data) return
    setDetailState({
      previewCount: data.previewCount ?? 0,
      installCount: data.installCount ?? 0,
      favorited: Boolean(data.favorited),
      favoriteCount: data.favoriteCount ?? 0,
    })
  })

  createEffect(() => {
    const data = detailState.item
    if (!data) return
    if (detailState.trackedItemId === data.id) return
    setDetailState("trackedItemId", data.id)
    void behaviorApi
      .log(data.id, {
        actionType: "view",
        context: "drawer",
        metadata: {
          source: "app-ai-native",
          route: "store-manager",
        },
      })
      .then(() => setDetailState("previewCount", (count) => count + 1))
      .catch(() => undefined)
  })

  const patchRowSet = (key: "items" | "favoritedItems", itemId: string, updater: (item: CapabilityItem) => CapabilityItem) => {
    setState(key, (items) => items.map((item) => item.id === itemId ? updater(item) : item))
  }

  const patchItemEverywhere = (itemId: string, updater: (item: CapabilityItem) => CapabilityItem) => {
    patchRowSet("items", itemId, updater)
    patchRowSet("favoritedItems", itemId, updater)
  }

  const openItemDetail = (item: CapabilityItem) => {
    setSelectedItemId("value", item.id)
    setDetailState("item", item)
  }

  const toggleFavorite = async () => {
    const data = detailState.item
    if (!data || !auth.user() || auth.loading() || detailState.favoritePending) return

    setDetailState("favoritePending", true)
    try {
      const result = detailState.favorited
        ? await behaviorApi.unfavorite(data.id)
        : await behaviorApi.favorite(data.id)
      setDetailState("favorited", result.favorited)
      setDetailState("favoriteCount", result.favoriteCount)
      patchItemEverywhere(data.id, (item) => ({ ...item, favorited: result.favorited, favoriteCount: result.favoriteCount }))
      refreshBothTabs()
      void refreshTabCounts()
    } catch (err) {
      if (detailState.favorited) {
        showToast({
          variant: "error",
          title: language.t("store.toast.unfavoriteReadonlyFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
      }
    }
    finally {
      setDetailState("favoritePending", false)
    }
  }

  const openEditCapability = (item: CapabilityItem) => {
    navigate(`/capabilities/${item.id}/edit`)
  }

  const openMoveCapability = (item: CapabilityItem) => {
    void repoApi.listMy().then((res) => {
      setState("repos", res.repositories ?? [])
      dialog.show(() => <MoveCapabilityDialog item={item} repositories={res.repositories ?? []} onMoved={() => void loadCreated()} />)
    })
  }

  const handleDeleteItem = (id: string) => {
    dialog.show(() => (
      <ConfirmDialog
        title={language.t("store.console.capabilities.delete")}
        description={language.t("store.console.confirmDeleteCapability")}
        confirm={language.t("common.delete")}
        onConfirm={async () => {
          await itemApi.delete(id)
          showToast({ title: language.t("store.console.capabilities.toast.deleteSuccess") })
          void loadCreated()
          void refreshTabCounts()
        }}
      />
    ))
  }

  // ── Multi-select / batch delete (My Created tab only) ──────────────────────
  const selectableTab = createMemo(() => state.tab === "created")
  const selectedIdList = createMemo(() => Object.keys(selected).filter((id) => selected[id]))
  const selectedCount = createMemo(() => (batch.allMatching ? state.totalItems : selectedIdList().length))
  const pageSelectedCount = createMemo(() => state.items.filter((i) => selected[i.id]).length)
  const allOnPageSelected = createMemo(() => state.items.length > 0 && pageSelectedCount() === state.items.length)
  const someOnPageSelected = createMemo(() => pageSelectedCount() > 0 && !allOnPageSelected())
  const canSelectAllMatching = createMemo(
    () => !batch.allMatching && allOnPageSelected() && state.totalItems > state.items.length,
  )

  function clearSelection() {
    setSelected(reconcile({}))
    setBatch("allMatching", false)
  }
  function toggleRow(id: string, checked: boolean) {
    // Unchecking in "all matching" mode: materialize the current page minus this
    // row as the explicit selection, then leave the mode (cross-page implied
    // selection on other pages is intentionally dropped).
    if (batch.allMatching && !checked) {
      setSelected(produce((s) => {
        for (const i of state.items) s[i.id] = true
        s[id] = false
      }))
      setBatch("allMatching", false)
      return
    }
    setSelected(id, checked)
    if (!checked) setBatch("allMatching", false)
  }
  function togglePage(checked: boolean) {
    setSelected(produce((s) => {
      for (const i of state.items) s[i.id] = checked
    }))
    if (!checked) setBatch("allMatching", false)
  }

  // Clear selection whenever the result set changes (filters/search/tab) but NOT
  // on pagination, so a cross-page manual selection survives page changes.
  const filterSignature = createMemo(() => JSON.stringify({
    tab: state.tab,
    search: state.debouncedSearch,
    type: state.appliedTypeFilters,
    category: state.appliedCategoryFilters,
    source: state.appliedSourceFilters,
    security: state.appliedSecurityFilters,
    tags: state.appliedTagFilters,
  }))
  createEffect(() => {
    filterSignature()
    clearSelection()
  })

  async function doBatchRemove(ids: string[]) {
    setBatch("deleting", true)
    try {
      const res = await itemApi.batchDelete(ids)
      setSelectedItemId("value", null)
      clearSelection()
      setState("itemPage", 1)
      await loadCreated()
      void refreshTabCounts()
      const parts = [language.t("store.console.capabilities.toast.batchDeleted", { deleted: String(res.deleted) })]
      if (res.skipped > 0 || res.forbidden > 0) {
        parts.push(language.t("store.console.capabilities.toast.batchDeleteSkipped", { skipped: String(res.skipped + res.forbidden) }))
      }
      showToast({ variant: "success", title: parts.join(" · ") })
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("store.console.capabilities.toast.batchDeleteFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setBatch("deleting", false)
    }
  }

  async function startBatchDelete() {
    if (batch.deleting || batch.preparing) return
    let ids: string[]
    let knownItems: CapabilityItem[]
    if (batch.allMatching) {
      setBatch("preparing", true)
      try {
        const res = await itemApi.listMy({ ...buildListParams(), page: 1, pageSize: MAX_BATCH_DELETE })
        knownItems = res.items ?? []
      } catch (error) {
        showToast({
          variant: "error",
          title: language.t("store.console.capabilities.toast.batchDeleteFailed"),
          description: error instanceof Error ? error.message : String(error),
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
    const capped = batch.allMatching && state.totalItems > MAX_BATCH_DELETE
    let description = language.t("store.console.capabilities.confirmBatchDelete", { count: String(ids.length) })
    if (pluginCount > 0) description += " " + language.t("store.console.capabilities.confirmBatchDeletePlugins", { plugins: String(pluginCount) })
    if (capped) description += " " + language.t("store.console.capabilities.confirmBatchDeleteCapped", { total: String(state.totalItems), max: String(MAX_BATCH_DELETE) })
    dialog.show(() => (
      <ConfirmDialog
        title={language.t("store.console.capabilities.batchDelete")}
        description={description}
        confirm={language.t("common.delete")}
        variant="danger"
        onConfirm={() => doBatchRemove(ids)}
      />
    ))
  }

  const handleSearchInput = (value: string) => {
    allowSearchRefocusUntil = Date.now() + 3000
    setState("search", value)
    captureSearchSelection()
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      setState("debouncedSearch", value.trim())
      if (state.tab === "created") setState("itemPage", 1)
      else setState("favoritedPage", 1)
      refreshActiveTab()
      requestAnimationFrame(() => restoreSearchFocus())
      pendingBlurRefocusTimer = setTimeout(() => restoreSearchFocus(), 0)
      scheduleSearchFocusRecovery("debounce")
    }, 300)
  }

  const clearSearchInput = () => {
    clearTimeout(searchTimer)
    clearTimeout(pendingBlurRefocusTimer)
    allowSearchRefocusUntil = Date.now() + 3000
    searchSelectionStart = 0
    searchSelectionEnd = 0
    setState("search", "")
    setState("debouncedSearch", "")
    if (state.tab === "created") setState("itemPage", 1)
    else setState("favoritedPage", 1)
    refreshActiveTab()
    requestAnimationFrame(() => restoreSearchFocus())
    scheduleSearchFocusRecovery("clear")
  }

  const switchTab = (tab: TabKey) => {
    if (state.tab === tab) return
    setSelectedItemId("value", null)
    setState("tab", tab)
    // Keep the URL in sync with the active tab so it's the single source of truth:
    // without this a manual switch leaves a stale ?tab=, and re-clicking the push
    // toast's「查看」(navigate to the same ?tab=received) would be a no-op.
    setSearchParams({ tab }, { replace: true })
    if (tab === "created") {
      if (!state.createdLoaded) void loadCreated()
      return
    }
    if (tab === "favorited") {
      if (!state.favoritedLoaded) void loadFavorited()
      return
    }
    if (tab === "sent") {
      if (!state.sentLoaded) void loadSent()
      return
    }
    if (!state.receivedLoaded) void loadReceived()
  }

  // Honor a deep-link like /store/manager?tab=received (e.g. the skill-push toast CTA).
  // Reacts to URL changes so it also works when already on the manager page.
  createEffect(() => {
    const requestedTab = searchParams.tab
    if (requestedTab === "created" || requestedTab === "favorited" || requestedTab === "received" || requestedTab === "sent") {
      // untrack so the effect depends ONLY on searchParams.tab — switchTab reads
      // state.tab, and tracking that would re-run this effect (and force the tab
      // back to the URL value) whenever the user manually switches tabs.
      untrack(() => switchTab(requestedTab))
    }
  })

  // ── Point-to-apply filter handlers (StoreFilterBar) ──────────────────────────
  // Toggling writes straight to applied*, resets pagination, drops the open detail
  // selection and refreshes both card-list tabs (filters affect created+favorited).
  const afterFilterChange = () => {
    setSelectedItemId("value", null)
    setState("itemPage", 1)
    setState("favoritedPage", 1)
    refreshBothTabs()
  }
  const toggleTypeFilter = (value: StoreType) => {
    setState("appliedTypeFilters", (current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
    afterFilterChange()
  }
  const toggleCategoryFilter = (value: string) => {
    setState("appliedCategoryFilters", (current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
    afterFilterChange()
  }
  const toggleSecurityFilter = (value: SecurityFilterValue) => {
    setState("appliedSecurityFilters", (current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
    afterFilterChange()
  }
  const toggleSourceFilter = (value: string) => {
    setState("appliedSourceFilters", (current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
    afterFilterChange()
  }
  const toggleTagFilter = (value: string) => {
    setState("appliedTagFilters", (current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
    afterFilterChange()
  }
  const clearAllFilters = () => {
    setState("appliedTypeFilters", [])
    setState("appliedCategoryFilters", [])
    setState("appliedSecurityFilters", [])
    setState("appliedSourceFilters", [])
    setState("appliedTagFilters", [])
    afterFilterChange()
  }

  const filterBarLabels = createMemo(() => ({
    type: language.t("store.console.capabilities.type"),
    category: language.t("store.home.filters.category"),
    security: language.t("store.home.filters.risk"),
    source: language.t("store.home.filters.source"),
    tag: language.t("store.home.table.tag"),
    clear: language.t("store.home.filters.clear"),
    noOptions: language.t("store.noResults"),
    totalCount: (count: number) => language.t("store.home.filters.totalCount", { count }),
  }))

  const handlePageChange = (nextPage: number) => {
    if (nextPage === activePage() || nextPage < 1 || nextPage > totalPages()) return
    setSelectedItemId("value", null)
    if (state.tab === "created") {
      setState("itemPage", nextPage)
      void loadCreated()
      return
    }
    if (state.tab === "favorited") {
      setState("favoritedPage", nextPage)
      void loadFavorited()
      return
    }
  }

  function TableContent() {
    return (
<ManagerListView
          rows={rows()}
          onRowClick={openItemDetail}
          typeLabel={typeLabel}
          typeColor={(value) => STORE_TYPES.find((e) => e.value === value)?.color}
          categoryLabel={(slug) => itemFilterOptions.categoryLabel(slug)}
          formatDate={formatDate}
          searchQuery={state.debouncedSearch}
          emptyMessage={language.t(state.tab === "created" ? "store.console.capabilities.empty" : "store.console.capabilities.favorited.empty")}
          selectable={selectableTab()}
          selectedIds={selected}
          allMatching={batch.allMatching}
          allOnPageSelected={allOnPageSelected()}
          someOnPageSelected={someOnPageSelected()}
          onToggleRow={toggleRow}
          onToggleAll={togglePage}
          selectAllLabel={language.t("store.console.capabilities.selectAll")}
          selectRowLabel={language.t("store.console.capabilities.selectRow")}
          onEdit={selectableTab() ? openEditCapability : undefined}
          onMove={selectableTab() ? openMoveCapability : undefined}
          onDelete={selectableTab() ? (item) => handleDeleteItem(item.id) : undefined}
          editLabel={language.t("store.console.capabilities.edit")}
          moveLabel={language.t("store.console.capabilities.move")}
          deleteLabel={language.t("store.console.capabilities.delete")}
        />
    )
  }

  return (
    <Show when={!auth.loading()} fallback={<div class={sx.empty}>{language.t("store.loading")}</div>}>
      <Show
        when={auth.user()}
        fallback={
          <div class={cn(sx.empty, "flex min-h-[40vh] items-center justify-center")}>
            <div style={{ "text-align": "center" }}>
              <h1 class={sx.toolbarTitle}>{language.t("store.console")}</h1>
              <p class={cn(sx.toolbarSub, "mb-3")}>{language.t("store.console.authDescription")}</p>
              <Button type="button" size="sm" onClick={() => { window.location.href = getLoginUrl("/store/manager") }}>
                {language.t("store.console.login")}
              </Button>
            </div>
          </div>
        }
      >
        <div class="flex h-full min-h-0 w-full flex-1 overflow-hidden">
          {/* Sidebar */}
          <aside class="w-56 shrink-0 border-r border-[var(--native-border)] bg-[var(--native-panel)]">
            <nav class="flex flex-col gap-1 p-3">
              <For each={SIDEBAR_ITEMS}>
                {(item) => (
                  <button
                    type="button"
                    class={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors text-left",
                      state.tab === item.key
                        ? "bg-[var(--native-surface)] text-[var(--native-foreground)]"
                        : "text-[var(--native-muted)] hover:bg-[var(--native-surface)] hover:text-[var(--native-foreground)]",
                    )}
                    onClick={() => switchTab(item.key)}
                  >
                    <Icon name={item.icon as any} class="size-4 shrink-0" />
                    <span class="flex-1 truncate">{language.t(item.labelKey)}</span>
                    <span
                      class={cn(
                        "min-w-5 shrink-0 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold [font-variant-numeric:tabular-nums]",
                        state.tab === item.key
                          ? "bg-[color:color-mix(in_oklab,var(--native-primary)_16%,transparent)] text-[var(--native-primary)]"
                          : "bg-[color:color-mix(in_oklab,var(--native-foreground)_7%,transparent)] text-[var(--native-muted)]",
                      )}
                    >
                      {formatCompact(tabCount(item.key))}
                    </span>
                  </button>
                )}
              </For>
            </nav>
          </aside>

          {/* Main Content */}
          <div class="flex h-full min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
            <header class="relative overflow-hidden bg-[linear-gradient(135deg,color-mix(in_srgb,var(--native-primary)_2%,var(--native-bg)),color-mix(in_srgb,var(--native-primary)_10%,var(--native-panel))_62%,color-mix(in_srgb,var(--native-primary)_14%,var(--native-panel)))] before:pointer-events-none before:absolute before:right-[-10%] before:top-[-60%] before:h-[340px] before:w-[340px] before:rounded-full before:bg-[radial-gradient(circle,color-mix(in_srgb,var(--native-primary)_8%,transparent),transparent_70%)] before:content-['']">
              <div class="relative flex flex-row items-center justify-between gap-4 px-5 py-3 lg:gap-6">
                <div class="min-w-0 flex flex-1 items-center gap-4">
                  <h1 class="relative m-0 shrink-0 text-[1.625rem] leading-[1.15] font-extrabold tracking-[-0.035em] text-[var(--native-foreground)]">{language.t(state.tab === "received" ? "store.received.title" : state.tab === "sent" ? "store.sent.title" : "store.console.capabilities.title")}</h1>
                  <p class="relative m-0 min-w-0 max-w-[38rem] text-[0.8125rem] leading-6 text-[var(--native-muted)]">{language.t(state.tab === "received" ? "store.received.description" : state.tab === "sent" ? "store.sent.description" : "store.console.capabilities.description")}</p>
                </div>
                <div class="flex shrink-0 items-center justify-end gap-3">
                  <Button type="button" variant="outline" size="sm" class="h-8 px-3" onClick={() => navigate("/store")}>
                    <Icon name="chevron-left" size="small" />
                    {language.t("store.console.capabilities.backToHome")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    class="h-8 gap-1.5 bg-[var(--native-primary)] !text-white hover:bg-[var(--native-primary-hover)]"
                    onClick={() => navigate("/capabilities/new")}
                  >
                    <Icon name="plus" class="size-4" style={{ color: "#ffffff" }} />
                    {language.t("store.console.capabilities.create")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    class="h-8 gap-1.5 px-3"
                    onClick={() => {
                      dialog.show(() => (
                        <CreateCapabilityDialog
                          userId={userId()}
                          repositories={state.repos}
                          defaultItemType="plugin"
                          onCreated={(item) => {
                            void loadCreated()
                            void refreshTabCounts()
                            setSelectedItemId("value", item.id)
                          }}
                        />
                      ))
                    }}
                  >
                    <Icon name="cloud-upload" size="small" />
                    {language.t("store.uploadPlugin.title") || "Upload Plugin"}
                  </Button>
                  {/* Plugin upload hidden — see PR #112 */}
                  {/* <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    class="h-8 gap-1.5 px-3"
                    onClick={() => {
                      void repoApi.listMy().then((res) => {
                        const repos = res.repositories ?? []
                        if (repos.length === 0) {
                          dialog.show(() => (
                            <CreateRepoDialog
                              userId={userId()}
                              showSyncOption={false}
                              onCreated={(repo) => {
                                dialog.show(() => (
                                  <UploadPluginDialog
                                    repoId={repo.id}
                                    onUploaded={(item) => {
                                      void loadCreated()
                                      showToast({ title: language.t("store.uploadPlugin.success") || "Plugin 上传成功" })
                                    }}
                                  />
                                ))
                              }}
                            />
                          ))
                          return
                        }
                        dialog.show(() => (
                          <UploadPluginDialog
                            repoId={repos[0].id}
                            onUploaded={(item) => {
                              void loadCreated()
                              showToast({ title: language.t("store.uploadPlugin.success") || "Plugin 上传成功" })
                            }}
                          />
                        ))
                      })
                    }}
                  >
                    <Icon name="cloud-upload" size="small" />
                    {language.t("store.uploadPlugin.title") || "上传 Plugin"}
                  </Button> */}
                </div>
              </div>
            </header>

            <div class="flex min-h-[5rem] w-full items-center overflow-hidden pt-2">
              <section class={sx.section}>
                <div class="mx-auto flex w-full max-w-[64rem] items-center gap-3 px-4 max-[768px]:flex-col max-[768px]:items-stretch max-[640px]:gap-2">
                  <div class="relative min-w-0 flex-1">
                    <div class="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-4 text-[color:color-mix(in_srgb,var(--native-muted)_82%,white)]">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4">
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20 -3.5 -3.5" />
                    </svg>
                  </div>
                  <input
                    ref={bindSearchInputRef}
                    type="text"
                    inputmode="search"
                    placeholder={language.t("store.console.capabilities.searchPlaceholder")}
                    value={state.search}
                    onInput={(e) => handleSearchInput(e.currentTarget.value)}
                    onBlur={(e) => {
                      if (e.relatedTarget || Date.now() > allowSearchRefocusUntil) return
                      clearTimeout(pendingBlurRefocusTimer)
                      pendingBlurRefocusTimer = setTimeout(() => {
                        if (!searchInputRef) return
                        if (document.activeElement && document.activeElement !== document.body && document.activeElement !== searchInputRef) return
                        restoreSearchFocus()
                        scheduleSearchFocusRecovery("blur")
                      }, 0)
                    }}
                    class="h-12 w-full rounded-full border border-[color:color-mix(in_srgb,var(--native-border)_58%,transparent)] bg-[var(--native-panel)] pr-12 pl-11 text-base !text-[var(--native-foreground)] caret-[var(--native-primary)] placeholder:text-[color:color-mix(in_srgb,var(--native-muted)_72%,white)] shadow-[var(--native-shadow-sm)] focus-visible:border-2 focus-visible:border-[color:color-mix(in_srgb,var(--native-primary)_52%,var(--native-border))] focus-visible:!text-[var(--native-foreground)] focus-visible:placeholder:text-[color:color-mix(in_srgb,var(--native-muted)_36%,white)] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  <Show when={state.search.length > 0}>
                    <button type="button" aria-label={language.t("common.clear")} onClick={clearSearchInput} class="absolute inset-y-0 right-0 flex h-full w-12 cursor-pointer items-center justify-center rounded-r-full text-[color:color-mix(in_srgb,var(--native-muted)_78%,white)] transition-colors hover:text-[var(--native-foreground)]">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  </Show>
                  </div>
                </div>
              </section>
            </div>

          <section class={cn(sx.section, "flex min-h-0 flex-1 flex-col px-2 sm:px-3")}>
            {/* Filter bar — only the card-list tabs (created/favorited) hit the
                filtered item list; received/sent are unfiltered distribution tables. */}
            <Show when={state.tab === "created" || state.tab === "favorited"}>
              <div class="mx-auto mb-2.5 w-full max-w-[64rem] px-4">
                <StoreFilterBar
                  type={{
                    options: typeOptions(),
                    appliedValues: state.appliedTypeFilters,
                    toggle: (value) => toggleTypeFilter(value as StoreType),
                    reset: () => {
                      setState("appliedTypeFilters", [])
                      afterFilterChange()
                    },
                  }}
                  category={{
                    options: categoryOptions(),
                    appliedValues: state.appliedCategoryFilters,
                    toggle: toggleCategoryFilter,
                    reset: () => {
                      setState("appliedCategoryFilters", [])
                      afterFilterChange()
                    },
                  }}
                  security={{
                    options: securityOptions(),
                    appliedValues: state.appliedSecurityFilters,
                    toggle: (value) => toggleSecurityFilter(value as SecurityFilterValue),
                    reset: () => {
                      setState("appliedSecurityFilters", [])
                      afterFilterChange()
                    },
                  }}
                  source={{
                    options: sourceOptions(),
                    appliedValues: state.appliedSourceFilters,
                    toggle: toggleSourceFilter,
                    reset: () => {
                      setState("appliedSourceFilters", [])
                      afterFilterChange()
                    },
                  }}
                  tag={{
                    options: tagOptions(),
                    appliedValues: state.appliedTagFilters,
                    toggle: toggleTagFilter,
                    reset: () => {
                      setState("appliedTagFilters", [])
                      afterFilterChange()
                    },
                  }}
                  totalItems={activeTotal()}
                  onClearAll={clearAllFilters}
                  labels={filterBarLabels()}
                />
              </div>
            </Show>
            <Show when={selectableTab() && selectedCount() > 0}>
              <div class="mx-auto mb-2.5 flex w-full max-w-[64rem] flex-wrap items-center gap-x-4 gap-y-2 rounded-[0.875rem] bg-[color:color-mix(in_oklab,var(--native-primary)_8%,var(--native-panel))] px-4 py-2.5 ring-1 ring-inset ring-[color:color-mix(in_oklab,var(--native-primary)_18%,transparent)] shadow-[0_6px_16px_-8px_color-mix(in_oklab,var(--native-primary)_45%,transparent)]">
                <span class="inline-flex items-center gap-2 text-[0.8125rem] font-semibold text-[var(--native-primary)]">
                  <span class="size-1.5 shrink-0 rounded-full bg-[var(--native-primary)]" aria-hidden="true" />
                  {batch.allMatching
                    ? language.t("store.console.capabilities.allMatchingSelected", { count: String(state.totalItems) })
                    : language.t("store.console.capabilities.selectedCount", { count: String(selectedCount()) })}
                </span>
                <Show when={canSelectAllMatching()}>
                  <button
                    type="button"
                    class="cursor-pointer rounded-md px-2 py-0.5 text-[0.8125rem] font-medium text-[var(--native-primary)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-primary)_12%,transparent)]"
                    onClick={() => setBatch("allMatching", true)}
                  >
                    {language.t("store.console.capabilities.selectAllMatching", { count: String(state.totalItems) })}
                  </button>
                </Show>
                <div class="ml-auto flex items-center gap-2">
                  <Button type="button" variant="ghost" size="sm" class="h-8 text-[var(--native-muted)] hover:text-[var(--native-foreground)]" onClick={clearSelection}>
                    {language.t("store.console.capabilities.clearSelection")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    class="h-8 bg-[var(--native-error)] !text-white shadow-sm hover:bg-[color:color-mix(in_oklab,var(--native-error)_88%,black)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={batch.deleting || batch.preparing}
                    onClick={() => void startBatchDelete()}
                  >
                    {language.t("store.console.capabilities.batchDelete")}
                  </Button>
                </div>
              </div>
            </Show>
            <div
              class={cn(
                "relative flex min-h-0 flex-1 flex-col",
                // Card-list tabs (created/favorited) render self-contained rounded
                // cards, so they get NO outer table frame — just a scroll area with
                // breathing room (matches the store home list). The receipt/sent
                // tabs are real tables and keep the framed shell.
                state.tab === "received" || state.tab === "sent"
                  ? sx.tableShell
                  : "overflow-y-auto px-1 pb-3 pt-1",
              )}
            >
              <Show when={state.tab !== "received" && state.tab !== "sent"}>
                <Show when={state.createdLoaded || state.favoritedLoaded}>
                  <Show when={activeLoading()}>
                    <div class={sx.overlay}>
                      <div class={sx.spinner} />
                    </div>
                  </Show>
                  <TableContent />
                </Show>
                <Show when={!state.createdLoaded && !state.favoritedLoaded}>
                  <div class={sx.state}>{language.t(state.tab === "created" ? "store.console.capabilities.loading" : "store.console.capabilities.favorited.loading")}</div>
                </Show>
              </Show>

              <Show when={state.tab === "received"}>
                <Show when={state.receivedLoading}>
                  <div class={sx.overlay}>
                    <div class={sx.spinner} />
                  </div>
                </Show>
                <Show when={!state.receivedLoading && state.receivedLoaded && !state.receivedError}>
                  <Show when={filteredReceivedItems().length > 0} fallback={
                    <div class="flex flex-1 items-center justify-center">
                      <div class={sx.state}>
                        <p class="mb-1 text-[0.9375rem] font-medium">{language.t("store.received.empty")}</p>
                        <p class="text-[0.8125rem] opacity-60">{language.t("store.received.emptyDesc")}</p>
                      </div>
                    </div>
                  }>
                    <table class={sx.dt}>
                      <thead>
                        <tr>
                          <th class={sx.th}>{language.t("store.home.table.title")}</th>
                          <th class={cn(sx.th, "w-[16rem]")}>{language.t("store.home.table.description")}</th>
                          <th class={sx.th}>{language.t("store.console.capabilities.type")}</th>
                          <th class={sx.th}>{language.t("store.received.from")}</th>
                          <th class={sx.th}>{language.t("store.distribute.permission.title")}</th>
                          <th class={sx.th}>{language.t("store.received.status.label")}</th>
                          <th class={cn(sx.th, "text-right")}>{language.t("store.home.table.action")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={filteredReceivedItems()}>
                          {(receipt) => {
                            const dist = receipt.distribution
                            const item = dist?.item
                            const distributorInfo = distributorInfoMap()?.[dist?.distributorId ?? ""]
                            const isUnread = receipt.receiptStatus === "unread"
                            const canDismiss = dist?.permissionMode === "dismissible"
                            const isLoading = receivedActionLoading[receipt.distributionId]
                            return (
                              <tr class={sx.row}>
                                <td class={sx.td}>
                                  <div class="flex items-center gap-2">
                                    <button
                                      class="text-left font-semibold text-[var(--native-foreground)] hover:text-[var(--native-primary)] transition-colors truncate"
                                      onClick={() => item && openItemDetail(item)}
                                    >
                                      {item?.name ?? language.t("store.received.unknownItem")}
                                    </button>
                                    {isUnread && (
                                      <span class="inline-flex h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--native-primary)" }} />
                                    )}
                                  </div>
                                  <Show when={dist?.message}>
                                    <div class="mt-0.5 text-[0.75rem] text-[var(--native-muted)] truncate">{dist?.message}</div>
                                  </Show>
                                </td>
                                <td class={cn(sx.td, "max-w-[16rem]")}>
                                  <span class="text-[var(--native-muted)] line-clamp-2">{item?.description ?? "—"}</span>
                                </td>
                                <td class={sx.td}>
                                  <span class="text-[var(--native-muted)]">{item ? language.t(typeKey(item.itemType)) : "—"}</span>
                                </td>
                                <td class={sx.td}>
                                  <div class="flex flex-col gap-px">
                                    <span class="text-[var(--native-foreground)]">{distributorInfo?.name || dist?.distributorId}</span>
                                    <span class="text-[11px] text-[var(--native-muted)]">{dist?.distributorId}</span>
                                  </div>
                                </td>
                                <td class={sx.td}>
                                  <span class="inline-flex items-center rounded-[var(--native-radius-sm)] border px-2 py-0.5 text-[11px] font-medium" style={{ color: "var(--native-muted)", "border-color": "color-mix(in oklab, var(--native-border) 50%, transparent)" }}>
                                    {language.t(dist?.permissionMode === "readonly" ? "store.distribute.permission.readonly" : "store.distribute.permission.dismissible")}
                                  </span>
                                </td>
                                <td class={sx.td}>
                                  <span class="text-[var(--native-muted)]">{language.t(dist?.status === "active" ? "store.received.status.active" : dist?.status === "paused" ? "store.received.status.paused" : "store.received.status.revoked")}</span>
                                </td>
                                <td class={cn(sx.td, "text-right")}>
                                  <div class="inline-flex items-center gap-1">
                                    <Show when={isUnread}>
                                      <button
                                        class="inline-flex h-7 w-7 items-center justify-center rounded-[var(--native-radius-sm)] text-[var(--native-muted)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-foreground)_6%,transparent)] hover:text-[var(--native-foreground)] disabled:opacity-50"
                                        disabled={isLoading}
                                        onClick={() => handleMarkReadReceipt(receipt.distributionId)}
                                        title={language.t("store.received.markRead")}
                                      >
                                        <Icon name="eye" size="small" />
                                      </button>
                                    </Show>
                                    <Show when={canDismiss}>
                                      <button
                                        class="inline-flex h-7 w-7 items-center justify-center rounded-[var(--native-radius-sm)] text-[var(--native-muted)] transition-colors hover:bg-[color:color-mix(in_oklab,#ef4444_8%,transparent)] hover:text-[#ef4444] disabled:opacity-50"
                                        disabled={isLoading}
                                        onClick={() => handleDismissReceipt(receipt.distributionId)}
                                        title={language.t("store.received.dismiss")}
                                      >
                                        <Icon name="close" size="small" />
                                      </button>
                                    </Show>
                                  </div>
                                </td>
                              </tr>
                            )
                          }}
                        </For>
                      </tbody>
                    </table>
                  </Show>
                </Show>
                <Show when={!state.receivedLoading && state.receivedError}>
                  <div class="flex flex-1 items-center justify-center">
                    <div class={sx.state}>
                      <p class="mb-1 text-[0.9375rem] font-medium">{language.t("store.received.toast.loadFailed")}</p>
                      <p class="mb-3 text-[0.8125rem] opacity-60">{state.receivedError}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setState({ receivedLoaded: false, receivedError: "" })
                          void loadReceived()
                        }}
                      >
                        {language.t("common.retry")}
                      </Button>
                    </div>
                  </div>
                </Show>
                <Show when={!state.receivedLoaded && !state.receivedError}>
                  <div class={sx.state}>{language.t("store.loading")}</div>
                </Show>
              </Show>

              <Show when={state.tab === "sent"}>
                <Show when={state.sentLoading}>
                  <div class={sx.overlay}>
                    <div class={sx.spinner} />
                  </div>
                </Show>
                <Show when={!state.sentLoading && state.sentLoaded && !state.sentError}>
                  <Show when={filteredSentItems().length > 0} fallback={
                    <div class="flex flex-1 items-center justify-center">
                      <div class={sx.state}>
                        <p class="mb-1 text-[0.9375rem] font-medium">{language.t("store.sent.empty")}</p>
                        <p class="text-[0.8125rem] opacity-60">{language.t("store.sent.emptyDesc")}</p>
                      </div>
                    </div>
                  }>
                    <table class={sx.dt}>
                      <thead>
                        <tr>
                          <th class={sx.th}>{language.t("store.home.table.title")}</th>
                          <th class={cn(sx.th, "w-[16rem]")}>{language.t("store.home.table.description")}</th>
                          <th class={sx.th}>{language.t("store.console.capabilities.type")}</th>
                          <th class={sx.th}>{language.t("store.sent.target")}</th>
                          <th class={sx.th}>{language.t("store.distribute.permission.title")}</th>
                          <th class={sx.th}>{language.t("store.received.status.label")}</th>
                          <th class={cn(sx.th, "text-right")}>{language.t("store.home.table.action")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={filteredSentItems()}>
                          {(dist) => {
                            const item = dist.item
                            const isLoading = sentActionLoading[dist.id]
                            return (
                              <tr class={sx.row}>
                                <td class={sx.td}>
                                  <button
                                    class="text-left font-semibold text-[var(--native-foreground)] hover:text-[var(--native-primary)] transition-colors truncate"
                                    onClick={() => item && openItemDetail(item)}
                                  >
                                    {item?.name ?? language.t("store.received.unknownItem")}
                                  </button>
                                  <Show when={dist.message}>
                                    <div class="mt-0.5 text-[0.75rem] text-[var(--native-muted)] truncate">{dist.message}</div>
                                  </Show>
                                </td>
                                <td class={cn(sx.td, "max-w-[16rem]")}>
                                  <span class="text-[var(--native-muted)] line-clamp-2">{item?.description ?? "—"}</span>
                                </td>
                                <td class={sx.td}>
                                  <span class="text-[var(--native-muted)]">{item ? language.t(typeKey(item.itemType)) : "—"}</span>
                                </td>
                                <td class={sx.td}>
                                  <span class="inline-flex items-center rounded-[var(--native-radius-sm)] border px-2 py-0.5 text-[11px] font-medium" style={{ color: "var(--native-muted)", "border-color": "color-mix(in oklab, var(--native-border) 50%, transparent)" }}>
                                    {dist.scopeType === "user" ? language.t("store.distribute.scope.user") : language.t("store.distribute.scope.organization")}: {dist.targetId}
                                  </span>
                                </td>
                                <td class={sx.td}>
                                  <span class="inline-flex items-center rounded-[var(--native-radius-sm)] border px-2 py-0.5 text-[11px] font-medium" style={{ color: "var(--native-muted)", "border-color": "color-mix(in oklab, var(--native-border) 50%, transparent)" }}>
                                    {language.t(dist.permissionMode === "readonly" ? "store.distribute.permission.readonly" : "store.distribute.permission.dismissible")}
                                  </span>
                                </td>
                                <td class={sx.td}>
                                  <span class="text-[var(--native-muted)]">{language.t(dist.status === "active" ? "store.received.status.active" : dist.status === "paused" ? "store.received.status.paused" : "store.received.status.revoked")}</span>
                                </td>
                                <td class={cn(sx.td, "text-right")}>
                                  <Show when={dist.status === "active"}>
                                    <button
                                      class="inline-flex h-7 w-7 items-center justify-center rounded-[var(--native-radius-sm)] text-[var(--native-muted)] transition-colors hover:bg-[color:color-mix(in_oklab,#ef4444_8%,transparent)] hover:text-[#ef4444] disabled:opacity-50"
                                      disabled={isLoading}
                                      onClick={() => {
                                        dialog.show(() => (
                                          <ConfirmDialog
                                            title={language.t("store.sent.revoke")}
                                            description={language.t("store.sent.revokeConfirm")}
                                            confirm={language.t("store.sent.revoke")}
                                            onConfirm={() => handleRevokeDistribution(dist.id)}
                                          />
                                        ))
                                      }}
                                      title={language.t("store.sent.revoke")}
                                    >
                                      <Icon name="circle-x" size="small" />
                                    </button>
                                  </Show>
                                </td>
                              </tr>
                            )
                          }}
                        </For>
                      </tbody>
                    </table>
                  </Show>
                </Show>
                <Show when={!state.sentLoading && state.sentError}>
                  <div class="flex flex-1 items-center justify-center">
                    <div class={sx.state}>
                      <p class="mb-1 text-[0.9375rem] font-medium">{language.t("store.sent.toast.loadFailed")}</p>
                      <p class="mb-3 text-[0.8125rem] opacity-60">{state.sentError}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setState({ sentLoaded: false, sentError: "" })
                          void loadSent()
                        }}
                      >
                        {language.t("common.retry")}
                      </Button>
                    </div>
                  </div>
                </Show>
                <Show when={!state.sentLoaded && !state.sentError}>
                  <div class={sx.state}>{language.t("store.loading")}</div>
                </Show>
              </Show>
            </div>

            <Show when={state.tab !== "received" && state.tab !== "sent"}>
              <StoreTableFooter
                page={activePage()}
                pageSize={PAGE_SIZE}
                totalPages={totalPages()}
                totalItems={activeTotal()}
                summary={formatStoreTablePaginationSummary({
                  page: activePage(),
                  pageSize: PAGE_SIZE,
                  totalItems: activeTotal(),
                  showingLabel: (args) => language.t("store.console.capabilities.showing", args),
                  emptyLabel: language.t("store.home.pagination.empty"),
                })}
                onPageChange={handlePageChange}
              />
            </Show>
          </section>

          <Sheet open={detailOpen()} onOpenChange={(open) => !open && setSelectedItemId("value", null)} modal={false}>
            <SheetContent position="right" class={cn(sx.sheet, "w-[min(68rem,94vw)] sm:max-w-none")}>
              <SheetHeader class="sr-only">
                <SheetTitle>{language.t("store.home.detail.title")}</SheetTitle>
                <SheetDescription>{language.t("store.home.detail.description")}</SheetDescription>
              </SheetHeader>
              <Show when={detailState.renderItemId}>
                {(itemId) => (
                  <Show when={detailState.contentReady} fallback={<ItemDetailLoadingSkeleton class={sx.sheetBody} />}>
                    <Suspense fallback={<div class="flex justify-center py-16 text-muted-foreground">{language.t("store.loading")}</div>}>
                      <ItemDetailContent
                        itemId={itemId()}
                        class={cn(sx.sheetBody, "thin-scrollbar")}
                        onItemLoaded={(item) => setDetailState("item", item)}
                        onDeleted={() => {
                          setSelectedItemId("value", null)
                          refreshBothTabs()
                          void refreshTabCounts()
                        }}
                        onSelectItem={(id) => setSelectedItemId("value", id)}
                        favorited={detailState.favorited}
                        favoriteCount={detailState.favoriteCount}
                        previewCount={detailState.previewCount}
                        installCount={detailState.installCount}
                        onToggleFavorite={toggleFavorite}
                        favoritePending={detailState.favoritePending}
                        isAuthenticated={!!auth.user() && !auth.loading()}
                      />
                    </Suspense>
                  </Show>
                )}
              </Show>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      </Show>
    </Show>
  )
}
