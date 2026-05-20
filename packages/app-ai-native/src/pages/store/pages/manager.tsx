import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useNavigate } from "@solidjs/router"
import { createEffect, createMemo, createResource, For, onCleanup, Show, Suspense } from "solid-js"
import { createStore } from "solid-js/store"
import { useItemFilterOptions } from "@/context/item-filter-options"
import { useLanguage } from "@/context/language"
import { LocalIcon } from "@/components/local-icon"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { Persist, persisted } from "@/utils/persist"
import { ConfirmDialog } from "@/pages/store/components/confirm-dialog"
import ItemDetailContent from "@/pages/store/components/item-detail-content"
import { ItemDetailLoadingSkeleton } from "@/pages/store/components/item-detail-loading-skeleton"
import { MoveCapabilityDialog } from "@/pages/store/components/move-capability-dialog"
import { buildStoreTableColumnOptions, DEFAULT_VISIBLE_COLUMNS, formatCompact, formatSourceMetric, formatStoreDate, formatStoreTablePaginationSummary, StoreCapabilityTable, StoreTableFooter, type TableColumnKey } from "@/pages/store/components/store-capability-table"
import { useAuth } from "@/pages/store/hooks/use-auth"
import { behaviorApi, itemApi, repoApi, userApi, type CapabilityItem, type ItemOrder, type ItemSort, type Repository, type SecurityRiskGroup } from "@/pages/store/lib/api"
import { getLoginUrl } from "@/pages/store/lib/auth"
import { sx } from "@/pages/store/lib/styles"
import { typeKey } from "@/pages/store/lib/constants"

const PAGE_SIZE = 10
const STORE_TYPES = [
  { value: "skill", labelKey: "store.sidebar.nav.skills", icon: "sparkles" as const, color: "#ffa000", bg: "#FEF3C7" },
  { value: "subagent", labelKey: "store.sidebar.nav.subagents", icon: "brain" as const, color: "#1670ff", bg: "#DBEAFE" },
  { value: "command", labelKey: "store.sidebar.nav.commands", icon: "console" as const, color: "#09b179", bg: "#D1FAE5" },
  { value: "mcp", labelKey: "store.sidebar.nav.mcpServers", icon: "mcp" as const, color: "#7338f9", bg: "#EDE9FE" },
  { value: "plugin", labelKey: "store.sidebar.nav.plugins", icon: "plugin" as const, color: "#e11d48", bg: "#FFE4E6" },
] as const

type TabKey = "created" | "favorited"
type StoreType = (typeof STORE_TYPES)[number]["value"]
type SecurityFilterValue = SecurityRiskGroup

export default function StoreManagerPage() {
  const dialog = useDialog()
  const language = useLanguage()
  const itemFilterOptions = useItemFilterOptions()
  const navigate = useNavigate()
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
  const activePage = createMemo(() => state.tab === "created" ? state.itemPage : state.favoritedPage)
  const activeTotal = createMemo(() => state.tab === "created" ? state.totalItems : state.favoritedTotal)
  const activeItems = createMemo(() => state.tab === "created" ? state.items : state.favoritedItems)
  const activeLoading = createMemo(() => state.tab === "created" ? state.loadingItems : state.favoritedLoading)
  const totalPages = createMemo(() => Math.max(1, Math.ceil(activeTotal() / PAGE_SIZE)))
  const statCards = createMemo(() => STORE_TYPES)
  const rows = createMemo(() => activeItems())
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
  const [creatorInfoMap] = createResource(
    () => rows().map((item) => item.createdBy).filter(Boolean),
    (ids) => userApi.getInfo(ids),
  )

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
  const creatorInfo = (value: string) => creatorInfoMap()?.[value]
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
      const res = await itemApi.list({ ...buildListParams(), favorited: true })
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

  const refreshActiveTab = () => {
    if (state.tab === "created") return void loadCreated()
    return void loadFavorited()
  }

  const refreshBothTabs = () => {
    void loadCreated()
    if (state.favoritedLoaded || state.tab === "favorited") void loadFavorited()
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
    }
    finally {
      setDetailState("favoritePending", false)
    }
  }

  const toggleRowFavorite = async (item: CapabilityItem) => {
    if (!auth.user() || auth.loading() || state.favoriteActionItemId === item.id) return

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
    if (tab === "created") {
      if (!state.createdLoaded) void loadCreated()
      return
    }
    if (!state.favoritedLoaded) void loadFavorited()
  }

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
    setState("favoritedPage", nextPage)
    void loadFavorited()
  }

  const handleSortChange = (by: ItemSort) => {
    setSelectedItemId("value", null)
    if (state.tab === "created") setState("itemPage", 1)
    else setState("favoritedPage", 1)

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
          creatorInfo={creatorInfo}
          typeLabel={typeLabel}
          categoryLabel={(slug, category) => itemFilterOptions.categoryLabel(slug, category)}
          sourceLabel={(value, source) => itemFilterOptions.sourceLabel(value, source as Parameters<typeof itemFilterOptions.sourceLabel>[1])}
          sourceUrl={(value) => itemFilterOptions.sourceUrl(value)}
          securityLabel={(value, option) => itemFilterOptions.securityRiskGroupLabel(value, option as Parameters<typeof itemFilterOptions.securityRiskGroupLabel>[1])}
          favoriteIconColor={favoriteIconColor}
          onToggleFavorite={(item) => void toggleRowFavorite(item)}
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
            action: language.t("store.home.table.action"),
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
          renderActions={(item) => (
            <div class="flex items-center justify-end gap-1">
              <button
                type="button"
                disabled={!auth.user() || auth.loading() || state.favoriteActionItemId === item.id}
                class="inline-flex size-8 min-w-8 items-center justify-center rounded-full bg-transparent text-[var(--native-foreground)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-foreground)_10%,transparent)] disabled:cursor-not-allowed disabled:opacity-60"
                title={auth.user() ? (item.favorited ? language.t("store.detail.unfavoriteTooltip") : language.t("store.detail.favoriteTooltip")) : language.t("store.detail.favoriteSignInTooltip")}
                onClick={() => void toggleRowFavorite(item)}
              >
                <LocalIcon name={item.favorited ? "star-filled" : "star"} size="small" style={{ color: favoriteIconColor(item.favorited, item.itemType) }} />
              </button>
              <Show when={state.tab === "created"}>
                <>
                  <button type="button" class="inline-flex size-8 min-w-8 items-center justify-center rounded-full bg-transparent text-[var(--native-foreground)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-foreground)_10%,transparent)]" title={language.t("common.edit")} onClick={() => openEditCapability(item)}>
                    <Icon name="edit" size="small" />
                  </button>
                  <button type="button" class="inline-flex size-8 min-w-8 items-center justify-center rounded-full bg-transparent text-destructive transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-foreground)_10%,transparent)] hover:text-destructive" title={language.t("store.console.capabilities.delete")} onClick={() => handleDeleteItem(item.id)}>
                    <Icon name="trash" size="small" />
                  </button>
                </>
              </Show>
            </div>
          )}
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
        <div class="flex h-full min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto">
          <header class="relative overflow-hidden bg-[linear-gradient(135deg,color-mix(in_srgb,var(--native-primary)_2%,var(--native-bg)),color-mix(in_srgb,var(--native-primary)_10%,var(--native-panel))_62%,color-mix(in_srgb,var(--native-primary)_14%,var(--native-panel)))] before:pointer-events-none before:absolute before:right-[-10%] before:top-[-60%] before:h-[340px] before:w-[340px] before:rounded-full before:bg-[radial-gradient(circle,color-mix(in_srgb,var(--native-primary)_8%,transparent),transparent_70%)] before:content-['']">
            <div class="relative flex flex-row items-center justify-between gap-4 px-5 py-3 lg:gap-6">
              <div class="min-w-0 flex flex-1 items-center gap-4">
                <h1 class="relative m-0 shrink-0 text-[1.625rem] leading-[1.15] font-extrabold tracking-[-0.035em] text-[var(--native-foreground)]">{language.t("store.console.capabilities.title")}</h1>
                <p class="relative m-0 min-w-0 max-w-[38rem] text-[0.8125rem] leading-6 text-[var(--native-muted)]">{language.t("store.console.capabilities.description")}</p>
              </div>
              <div class="flex shrink-0 items-center justify-end gap-3">
                <Button type="button" variant="outline" size="sm" class="h-8 px-3" onClick={() => navigate("/store")}>
                  <Icon name="chevron-left" size="small" />
                  {language.t("store.console.capabilities.backToHome")}
                </Button>
                <Tooltip value={language.t("store.console.capabilities.create")} placement="bottom">
                  <button
                    type="button"
                    class="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[0.375rem] bg-[color:color-mix(in_oklab,var(--native-primary)_85%,white)] text-white shadow-[var(--native-shadow-sm)] transition-[background-color,filter,transform] hover:cursor-pointer hover:bg-[var(--native-primary)]"
                    aria-label={language.t("store.console.capabilities.create")}
                    onClick={() => navigate("/capabilities/new")}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-5" style={{ color: "#ffffff" }}>
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                  </button>
                </Tooltip>
              </div>
            </div>
          </header>

          <div class="flex min-h-[5rem] w-full flex-1 items-center justify-center overflow-hidden">
            <section class={sx.section}>
              <div class="mx-auto flex w-full max-w-[64rem] items-center gap-3 px-4 max-[768px]:flex-col max-[768px]:items-stretch max-[640px]:gap-2">
              <div class="relative min-w-0 flex-1 rounded-full transition-shadow hover:shadow-[0_2px_6px_-3px_color-mix(in_srgb,var(--native-primary)_22%,rgba(15,23,42,0.3))] focus-within:shadow-[0_2px_6px_-3px_color-mix(in_srgb,var(--native-primary)_22%,rgba(15,23,42,0.3))]">
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
              <div class="inline-flex h-12 shrink-0 items-center gap-1 rounded-full border border-[color:color-mix(in_srgb,var(--native-border)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--native-panel)_92%,white)] px-1 shadow-[var(--native-shadow-sm)]">
                <Tooltip value={language.t("store.console.capabilities.myCreated")} placement="bottom">
                  <button
                    type="button"
                    class={cn(
                      "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                      state.tab === "created"
                        ? "bg-[var(--native-primary)] !text-white shadow-[var(--native-shadow-sm)]"
                        : "text-[var(--native-muted)] hover:bg-[color:color-mix(in_srgb,var(--native-foreground)_8%,transparent)] hover:text-[var(--native-foreground)]",
                    )}
                    aria-label={language.t("store.console.capabilities.myCreated")}
                    aria-pressed={state.tab === "created"}
                    onClick={() => switchTab("created")}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4" style={state.tab === "created" ? { color: "#ffffff" } : undefined}>
                      <path d="M20 21a8 8 0 0 0-16 0" />
                      <circle cx="12" cy="8" r="5" />
                    </svg>
                  </button>
                </Tooltip>
                <Tooltip value={language.t("store.console.capabilities.myFavorited")} placement="bottom">
                  <button
                    type="button"
                    class={cn(
                      "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                      state.tab === "favorited"
                        ? "bg-[var(--native-primary)] !text-white shadow-[var(--native-shadow-sm)]"
                        : "text-[var(--native-muted)] hover:bg-[color:color-mix(in_srgb,var(--native-foreground)_8%,transparent)] hover:text-[var(--native-foreground)]",
                    )}
                    aria-label={language.t("store.console.capabilities.myFavorited")}
                    aria-pressed={state.tab === "favorited"}
                    onClick={() => switchTab("favorited")}
                  >
                    <LocalIcon name={state.tab === "favorited" ? "star-filled" : "star"} size="small" style={state.tab === "favorited" ? { color: "#ffffff" } : undefined} />
                  </button>
                </Tooltip>
              </div>
            </div>
          </section>
          </div>

          <section class={cn(sx.section, "flex min-h-0 shrink-0 flex-col px-2 sm:px-3")}>
            <div class={cn(sx.tableShell, "flex min-h-0 flex-1 flex-col")}>
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
            </div>

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
      </Show>
    </Show>
  )
}
