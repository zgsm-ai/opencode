import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon, type IconProps } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useNavigate, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, For, onCleanup, Show, Suspense, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { useItemFilterOptions } from "@/context/item-filter-options"
import { useLanguage } from "@/context/language"
import { LocalIcon } from "@/components/local-icon"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { Persist, persisted } from "@/utils/persist"
import { ConfirmDialog } from "@/pages/store/components/confirm-dialog"
import { CreateCapabilityDialog } from "@/pages/store/components/create-capability-dialog"
import ItemDetailContent from "@/pages/store/components/item-detail-content"
import { ItemDetailLoadingSkeleton } from "@/pages/store/components/item-detail-loading-skeleton"
import { MoveCapabilityDialog } from "@/pages/store/components/move-capability-dialog"
import { DistributeDialog } from "@/pages/store/components/distribute-dialog"
import { buildStoreTableColumnOptions, DEFAULT_VISIBLE_COLUMNS, formatCompact, formatSourceMetric, formatStoreDate, formatStoreTablePaginationSummary, mcpListSubscribeBlocked, StoreCapabilityTable, StoreTableFooter, type TableColumnKey } from "@/pages/store/components/store-capability-table"
import { useAuth } from "@/pages/store/hooks/use-auth"
import { behaviorApi, distributionApi, itemApi, repoApi, userApi, type CapabilityItem, type DistributionResult, type ItemOrder, type ItemSort, type Repository, type SecurityRiskGroup } from "@/pages/store/lib/api"
import { getLoginUrl } from "@/pages/store/lib/auth"
import { sx } from "@/pages/store/lib/styles"
import { typeKey } from "@/pages/store/lib/constants"
// import { UploadPluginDialog } from "@/pages/store/components/upload-plugin-dialog"
// import { CreateRepoDialog } from "@/pages/store/components/create-repo-dialog"

const PAGE_SIZE = 10
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

const STAT_CARDS = [
  { key: "created" as TabKey, labelKey: "store.console.capabilities.myCreated", icon: "archive" as const, color: "#3B82F6" },
  { key: "favorited" as TabKey, labelKey: "store.console.capabilities.myFavorited", icon: "bell" as const, color: "#F59E0B" },
  { key: "received" as TabKey, labelKey: "store.received.title", icon: "inbox" as const, color: "#10B981" },
  { key: "sent" as TabKey, labelKey: "store.sent.title", icon: "share" as const, color: "#8B5CF6" },
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
    typeFilterOpen: false,
    typeFilterQuery: "",
    appliedTypeFilters: [] as StoreType[],
    pendingTypeFilters: [] as StoreType[],
    categoryFilterOpen: false,
    sourceFilterOpen: false,
    securityFilterOpen: false,
    categoryFilterQuery: "",
    sourceFilterQuery: "",
    securityFilterQuery: "",
    appliedTagFilters: [] as string[],
    appliedCategoryFilters: [] as string[],
    pendingCategoryFilters: [] as string[],
    appliedSourceFilters: [] as string[],
    pendingSourceFilters: [] as string[],
    appliedSecurityFilters: [] as SecurityFilterValue[],
    pendingSecurityFilters: [] as SecurityFilterValue[],
    sort: { by: "favoriteCount" as ItemSort | undefined, order: "desc" as ItemOrder | undefined },
    favoriteActionItemId: null as string | null,
  })
  const [columnPrefs, setColumnPrefs] = persisted(
    Persist.global("store.manager.table.columns", ["store.manager.table.columns.v1"]),
    createStore({ visible: DEFAULT_VISIBLE_COLUMNS }),
  )
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
  const statCards = createMemo(() => STORE_TYPES)
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
  const categories = createMemo(() => itemFilterOptions.categories())
  const sourceOptions = createMemo(() => itemFilterOptions.sources())
  const securityOptions = createMemo(() => itemFilterOptions.securityRiskGroups())
  const categoryFilterActive = createMemo(() => state.appliedCategoryFilters.length > 0)
  const sourceFilterActive = createMemo(() => state.appliedSourceFilters.length > 0)
  const securityFilterActive = createMemo(() => state.appliedSecurityFilters.length > 0)
  const tagFilterActive = createMemo(() => state.appliedTagFilters.length > 0)
  const columnOptions = createMemo(() => buildStoreTableColumnOptions(language.t))
  const typeOptions = createMemo(() => STORE_TYPES.map((entry) => ({ value: entry.value, label: language.t(entry.labelKey) })))
  const typeFilterActive = createMemo(() => state.appliedTypeFilters.length > 0)
  const filteredTypeOptions = createMemo(() => {
    const query = state.typeFilterQuery.trim().toLowerCase()
    if (!query) return typeOptions()
    return typeOptions().filter((option) => option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query))
  })
  const filteredCategoryOptions = createMemo(() => {
    const query = state.categoryFilterQuery.trim().toLowerCase()
    if (!query) return categories()
    return categories().filter((cat) => itemFilterOptions.categoryLabel(cat.slug, cat).toLowerCase().includes(query) || cat.slug.toLowerCase().includes(query))
  })
  const filteredSourceOptions = createMemo(() => {
    const query = state.sourceFilterQuery.trim().toLowerCase()
    if (!query) return sourceOptions()
    return sourceOptions().filter((source) => (itemFilterOptions.sourceLabel(source.value, source) || source.value).toLowerCase().includes(query) || source.value.toLowerCase().includes(query))
  })
  const filteredSecurityOptions = createMemo(() => {
    const query = state.securityFilterQuery.trim().toLowerCase()
    if (!query) return securityOptions()
    return securityOptions().filter((option) => itemFilterOptions.securityRiskGroupLabel(option.value as SecurityFilterValue, option).toLowerCase().includes(query) || option.value.toLowerCase().includes(query))
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
  const favoriteIconColor = (favorited?: boolean, itemType?: string) => favorited ? (STORE_TYPES.find((entry) => entry.value === itemType)?.color ?? "var(--native-primary)") : "var(--native-muted)"
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

  const loadReceived = async () => {
    if (state.receivedLoading) return
    setState({ receivedLoading: true, receivedError: "" })
    try {
      const res = await distributionApi.listMyReceived()
      setState({ receivedItems: res.receipts ?? [], receivedLoaded: true, receivedError: "" })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setState({ receivedLoaded: true, receivedError: message || language.t("store.received.toast.loadFailed") })
      showToast({
        variant: "error",
        title: language.t("store.received.toast.loadFailed"),
        description: message,
      })
    }
    finally {
      setState("receivedLoading", false)
    }
  }

  const loadSent = async () => {
    if (state.sentLoading) return
    setState({ sentLoading: true, sentError: "" })
    try {
      const res = await distributionApi.listMySent()
      setState({ sentItems: res.distributions ?? [], sentLoaded: true, sentError: "" })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setState({ sentLoaded: true, sentError: message || language.t("store.sent.toast.loadFailed") })
      showToast({
        variant: "error",
        title: language.t("store.sent.toast.loadFailed"),
        description: message,
      })
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

  createEffect(() => {
    const currentUserId = userId()
    if (!currentUserId || initializedForUser === currentUserId) return
    initializedForUser = currentUserId
    void loadCreated()
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

  const toggleRowFavorite = async (item: CapabilityItem) => {
    if (!auth.user() || auth.loading() || state.favoriteActionItemId === item.id) return
    // Defense-in-depth: never subscribe an unconfigured MCP from the list (the disabled button
    // already blocks this; this guards a bypass). Unsubscribing is always allowed.
    if (mcpListSubscribeBlocked(item)) return

    setState("favoriteActionItemId", item.id)
    try {
      const result = item.favorited
        ? await behaviorApi.unfavorite(item.id)
        : await behaviorApi.favorite(item.id)

      patchItemEverywhere(item.id, (current) => ({
        ...current,
        favorited: result.favorited,
        favoriteCount: result.favoriteCount,
      }))

      if (state.tab === "favorited" && !result.favorited) {
        setState("favoritedItems", (items) => items.filter((current) => current.id !== item.id))
        setState("favoritedTotal", (total) => Math.max(0, total - 1))
      }

      if (detailState.item?.id === item.id) {
        setDetailState("item", (current) => current ? { ...current, favorited: result.favorited, favoriteCount: result.favoriteCount } : current)
        setDetailState("favorited", result.favorited)
        setDetailState("favoriteCount", result.favoriteCount)
      }

      if (state.favoritedLoaded || state.tab === "favorited") void loadFavorited()
    } catch (err) {
      if (item.favorited) {
        showToast({
          variant: "error",
          title: language.t("store.toast.unfavoriteReadonlyFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
      }
    }
    finally {
      setState("favoriteActionItemId", (current) => current === item.id ? null : current)
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
        }}
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

  const togglePendingTypeFilter = (value: string) => {
    const type = value as StoreType
    setState("pendingTypeFilters", (current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type])
  }
  const applyTypeFilters = () => {
    setSelectedItemId("value", null)
    setState("appliedTypeFilters", [...state.pendingTypeFilters])
    setState("itemPage", 1)
    setState("favoritedPage", 1)
    setState("typeFilterQuery", "")
    setState("typeFilterOpen", false)
    setState("createdLoaded", false)
    setState("favoritedLoaded", false)
    refreshBothTabs()
  }
  const resetTypeFilters = () => {
    setSelectedItemId("value", null)
    setState("pendingTypeFilters", [])
    setState("appliedTypeFilters", [])
    setState("itemPage", 1)
    setState("favoritedPage", 1)
    setState("typeFilterQuery", "")
    setState("typeFilterOpen", false)
    setState("createdLoaded", false)
    setState("favoritedLoaded", false)
    refreshBothTabs()
  }

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

  const handleSortChange = (by: ItemSort) => {
    setSelectedItemId("value", null)
    if (state.tab === "created") setState("itemPage", 1)
    else if (state.tab === "favorited") setState("favoritedPage", 1)

    if (state.sort.by !== by) {
      setState("sort", { by, order: "desc" })
      refreshActiveTab()
      return
    }
    if (state.sort.order === "desc") {
      setState("sort", "order", "asc")
      refreshActiveTab()
      return
    }
    setState("sort", { by: undefined, order: undefined })
    refreshActiveTab()
  }

  const toggleColumnVisibility = (key: TableColumnKey) => {
    setColumnPrefs("visible", key, (current) => !current)
  }

  const togglePendingCategoryFilter = (slug: string) => {
    setState("pendingCategoryFilters", (current) => current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug])
  }
  const togglePendingSourceFilter = (source: string) => {
    setState("pendingSourceFilters", (current) => current.includes(source) ? current.filter((item) => item !== source) : [...current, source])
  }
  const togglePendingSecurityFilter = (status: SecurityFilterValue) => {
    setState("pendingSecurityFilters", (current) => current.includes(status) ? current.filter((item) => item !== status) : [...current, status])
  }
  const applyCategoryFilters = () => {
    setSelectedItemId("value", null)
    setState("appliedCategoryFilters", [...state.pendingCategoryFilters])
    if (state.tab === "created") setState("itemPage", 1)
    else setState("favoritedPage", 1)
    setState("categoryFilterQuery", "")
    setState("categoryFilterOpen", false)
    refreshActiveTab()
  }
  const applySourceFilters = () => {
    setSelectedItemId("value", null)
    setState("appliedSourceFilters", [...state.pendingSourceFilters])
    if (state.tab === "created") setState("itemPage", 1)
    else setState("favoritedPage", 1)
    setState("sourceFilterQuery", "")
    setState("sourceFilterOpen", false)
    refreshActiveTab()
  }
  const applySecurityFilters = () => {
    setSelectedItemId("value", null)
    setState("appliedSecurityFilters", [...state.pendingSecurityFilters])
    if (state.tab === "created") setState("itemPage", 1)
    else setState("favoritedPage", 1)
    setState("securityFilterQuery", "")
    setState("securityFilterOpen", false)
    refreshActiveTab()
  }
  const resetCategoryFilters = () => {
    setSelectedItemId("value", null)
    setState("pendingCategoryFilters", [])
    setState("appliedCategoryFilters", [])
    if (state.tab === "created") setState("itemPage", 1)
    else setState("favoritedPage", 1)
    setState("categoryFilterQuery", "")
    setState("categoryFilterOpen", false)
    refreshActiveTab()
  }
  const resetSourceFilters = () => {
    setSelectedItemId("value", null)
    setState("pendingSourceFilters", [])
    setState("appliedSourceFilters", [])
    if (state.tab === "created") setState("itemPage", 1)
    else setState("favoritedPage", 1)
    setState("sourceFilterQuery", "")
    setState("sourceFilterOpen", false)
    refreshActiveTab()
  }
  const resetSecurityFilters = () => {
    setSelectedItemId("value", null)
    setState("pendingSecurityFilters", [])
    setState("appliedSecurityFilters", [])
    if (state.tab === "created") setState("itemPage", 1)
    else setState("favoritedPage", 1)
    setState("securityFilterQuery", "")
    setState("securityFilterOpen", false)
    refreshActiveTab()
  }
  const toggleAppliedTagFilter = (slug: string) => {
    setSelectedItemId("value", null)
    setState("appliedTagFilters", (current) => current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug])
    if (state.tab === "created") setState("itemPage", 1)
    else setState("favoritedPage", 1)
    refreshActiveTab()
  }

  function TableContent() {
    return (
      <StoreCapabilityTable
          rows={rows()}
          visibleColumns={columnPrefs.visible}
          columnOptions={columnOptions()}
          onToggleColumnVisibility={toggleColumnVisibility}
          sort={state.sort}
          onSortChange={handleSortChange}
          onRowClick={openItemDetail}
          typeLabel={typeLabel}
          typeColor={(value) => STORE_TYPES.find((e) => e.value === value)?.color}
          categoryLabel={(slug, category) => itemFilterOptions.categoryLabel(slug, category)}
          sourceLabel={(value, source) => itemFilterOptions.sourceLabel(value, source as Parameters<typeof itemFilterOptions.sourceLabel>[1])}
          sourceUrl={(value) => itemFilterOptions.sourceUrl(value)}
          securityLabel={(value, option) => itemFilterOptions.securityRiskGroupLabel(value, option as Parameters<typeof itemFilterOptions.securityRiskGroupLabel>[1])}
          favoriteIconColor={favoriteIconColor}
          onToggleFavorite={(item) => void toggleRowFavorite(item)}
          currentUserId={userId()}
          currentUserRoles={auth.user()?.systemRoles ?? []}
          onDistribute={(item) =>
            dialog.show(() => (
              <DistributeDialog itemId={item.id} itemName={item.name} />
            ))
          }
          distributeTooltip={language.t("store.distribute.tooltip")}
          formatDate={formatDate}
          formatSourceMetric={formatSourceMetric}
          formatCompact={formatCompact}
          filters={{
            type: {
              open: state.typeFilterOpen,
              onOpenChange: (open) => {
                setState("typeFilterOpen", open)
                if (open) {
                  setState("pendingTypeFilters", [...state.appliedTypeFilters])
                  setState("typeFilterQuery", "")
                }
              },
              active: typeFilterActive(),
              appliedValues: state.appliedTypeFilters,
              pendingValues: state.pendingTypeFilters,
              query: state.typeFilterQuery,
              onQueryChange: (value) => setState("typeFilterQuery", value),
              options: filteredTypeOptions(),
              togglePending: togglePendingTypeFilter,
              apply: applyTypeFilters,
              reset: resetTypeFilters,
            },
            category: {
              open: state.categoryFilterOpen,
              onOpenChange: (open) => {
                setState("categoryFilterOpen", open)
                if (open) {
                  setState("pendingCategoryFilters", [...state.appliedCategoryFilters])
                  setState("categoryFilterQuery", "")
                }
              },
              active: categoryFilterActive(),
              appliedValues: state.appliedCategoryFilters,
              pendingValues: state.pendingCategoryFilters,
              query: state.categoryFilterQuery,
              onQueryChange: (value) => setState("categoryFilterQuery", value),
              options: filteredCategoryOptions(),
              togglePending: togglePendingCategoryFilter,
              apply: applyCategoryFilters,
              reset: resetCategoryFilters,
            },
            security: {
              open: state.securityFilterOpen,
              onOpenChange: (open) => {
                setState("securityFilterOpen", open)
                if (open) {
                  setState("pendingSecurityFilters", [...state.appliedSecurityFilters])
                  setState("securityFilterQuery", "")
                }
              },
              active: securityFilterActive(),
              appliedValues: state.appliedSecurityFilters,
              pendingValues: state.pendingSecurityFilters,
              query: state.securityFilterQuery,
              onQueryChange: (value) => setState("securityFilterQuery", value),
              options: filteredSecurityOptions(),
              togglePending: togglePendingSecurityFilter,
              apply: applySecurityFilters,
              reset: resetSecurityFilters,
            },
            source: {
              open: state.sourceFilterOpen,
              onOpenChange: (open) => {
                setState("sourceFilterOpen", open)
                if (open) {
                  setState("pendingSourceFilters", [...state.appliedSourceFilters])
                  setState("sourceFilterQuery", "")
                }
              },
              active: sourceFilterActive(),
              appliedValues: state.appliedSourceFilters,
              pendingValues: state.pendingSourceFilters,
              query: state.sourceFilterQuery,
              onQueryChange: (value) => setState("sourceFilterQuery", value),
              options: filteredSourceOptions(),
              togglePending: togglePendingSourceFilter,
              apply: applySourceFilters,
              reset: resetSourceFilters,
            },
            tag: {
              active: tagFilterActive(),
              appliedValues: state.appliedTagFilters,
              onApply: (values) => {
                setSelectedItemId("value", null)
                setState("appliedTagFilters", values)
                if (state.tab === "created") setState("itemPage", 1)
                else setState("favoritedPage", 1)
                refreshActiveTab()
              },
              onReset: () => {
                setSelectedItemId("value", null)
                setState("appliedTagFilters", [])
                if (state.tab === "created") setState("itemPage", 1)
                else setState("favoritedPage", 1)
                refreshActiveTab()
              },
              onTagClick: toggleAppliedTagFilter,
            },
          }}
          labels={{
            title: language.t("store.home.table.title"),
            description: language.t("store.home.table.description"),
            type: language.t("store.console.capabilities.type"),
            category: language.t("store.console.capabilities.category"),
            security: language.t("store.security.riskLevel"),
            tag: language.t("store.home.table.tag"),
            source: language.t("store.home.table.source"),
            experienceScore: language.t("store.home.table.experienceScore"),
            favoriteCount: language.t("store.home.table.favoriteCount"),
            favorite: language.t("store.detail.favorite"),
            unfavorite: language.t("store.detail.unfavorite"),
            favoriteTooltip: language.t("store.detail.favoriteTooltip"),
            unfavoriteTooltip: language.t("store.detail.unfavoriteTooltip"),
            favoriteSignInTooltip: language.t("store.detail.favoriteSignInTooltip"),
            updated: language.t("store.detail.updated"),
            toggleColumns: language.t("store.home.table.toggleColumns"),
            noResults: language.t("store.noResults"),
            reset: language.t("common.reset"),
            confirm: language.t("channels.add.confirm"),
            searchCategory: language.t("store.home.filters.searchCategory"),
            searchSecurity: language.t("store.home.filters.searchSecurity"),
            searchSource: language.t("store.home.filters.searchSource"),
            searchTag: language.t("store.home.filters.searchTag"),
            tagLimitHint: language.t("store.home.filters.tagLimitHint"),
          }}
          emptyMessage={language.t(state.tab === "created" ? "store.console.capabilities.empty" : "store.console.capabilities.favorited.empty")}
          maxVisibleRows={PAGE_SIZE}
          fixedRows
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
                    <span>{language.t(item.labelKey)}</span>
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

            {/* Stat Cards */}
            <div class="mx-auto w-full max-w-[64rem] px-4 pt-4">
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <For each={STAT_CARDS}>
                  {(card) => {
                    const count = () => {
                      if (card.key === "created") return state.totalItems
                      if (card.key === "favorited") return state.favoritedTotal
                      if (card.key === "received") return state.receivedItems.length
                      if (card.key === "sent") return state.sentItems.length
                      return 0
                    }
                    return (
                      <button
                        type="button"
                        onClick={() => switchTab(card.key)}
                        class={cn(
                          "group flex items-center gap-4 rounded-xl border border-[var(--native-border)] bg-[var(--native-panel)] p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
                          state.tab === card.key && "ring-1 ring-[var(--native-primary)]",
                        )}
                      >
                        <div
                          class="flex size-12 items-center justify-center rounded-lg"
                          style={{
                            "background-color": `color-mix(in srgb, ${card.color} 12%, var(--native-panel))`,
                            color: card.color,
                          }}
                        >
                          <Show when={card.key === "favorited"} fallback={<Icon name={card.icon as any} class="size-6" />}>
                            <LocalIcon name="subscribe" class="size-6" />
                          </Show>
                        </div>
                        <div>
                          <div class="text-2xl font-bold text-[var(--native-foreground)]">{formatCompact(count())}</div>
                          <div class="text-sm text-[var(--native-muted)]">{language.t(card.labelKey)}</div>
                        </div>
                      </button>
                    )
                  }}
                </For>
              </div>
            </div>

            <div class="flex min-h-[5rem] w-full items-center overflow-hidden">
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
            <div class={cn(sx.tableShell, "flex min-h-0 flex-1 flex-col")}>
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
