import { createEffect, createMemo, createResource, createSignal, For, onCleanup, Show, Suspense } from "solid-js"
import { createStore } from "solid-js/store"
import { useNavigate, useSearchParams } from "@solidjs/router"
import { useItemFilterOptions } from "@/context/item-filter-options"
import { useLanguage } from "@/context/language"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Persist, persisted } from "@/utils/persist"
import {
  behaviorApi,
  itemApi,
  type CapabilityItem,
  type ItemOrder,
  type ItemSort,
  type SecurityRiskGroup,
} from "../lib/api"
import ItemDetailContent, { getInstallCommand } from "../components/item-detail-content"
import { ItemDetailLoadingSkeleton } from "../components/item-detail-loading-skeleton"
import {
  buildStoreTableColumnOptions,
  DEFAULT_VISIBLE_COLUMNS,
  formatCompact,
  formatSourceMetric,
  formatStoreDate,
  formatStoreTablePaginationSummary,
  HighlightText,
  mcpListSubscribeBlocked,
  StoreCapabilityTable,
  StoreTableFooter,
  type TableColumnKey,
} from "../components/store-capability-table"
import { Icon, type IconProps } from "@opencode-ai/ui/icon"
import { LocalIcon } from "@/components/local-icon"
import { useAuth } from "../hooks/use-auth"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DistributeDialog } from "../components/distribute-dialog"
import { cn } from "@/lib/utils"
import { typeKey } from "../lib/constants"
import { sx } from "../lib/styles"

const STORE_TYPES = [
  {
    value: "all",
    labelKey: "store.sidebar.nav.all",
    descKey: "store.home.type.all.description",
    icon: "dot-grid" as IconProps["name"],
    color: "#64748b",
    bg: "#E2E8F0",
  },
  {
    value: "skill",
    labelKey: "store.sidebar.nav.skills",
    descKey: "store.home.type.skill.description",
    icon: "sparkles" as IconProps["name"],
    color: "#ffa000",
    bg: "#FEF3C7",
  },
  {
    value: "subagent",
    labelKey: "store.sidebar.nav.subagents",
    descKey: "store.home.type.subagent.description",
    icon: "brain" as IconProps["name"],
    color: "#1670ff",
    bg: "#DBEAFE",
  },
  {
    value: "command",
    labelKey: "store.sidebar.nav.commands",
    descKey: "store.home.type.command.description",
    icon: "console" as IconProps["name"],
    color: "#09b179",
    bg: "#D1FAE5",
  },
  {
    value: "mcp",
    labelKey: "store.sidebar.nav.mcpServers",
    descKey: "store.home.type.mcp.description",
    icon: "mcp" as IconProps["name"],
    color: "#7338f9",
    bg: "#EDE9FE",
  },
  {
    value: "plugin",
    labelKey: "store.sidebar.nav.plugins",
    descKey: "store.home.type.plugin.description",
    icon: "configuration" as IconProps["name"],
    color: "#EC4899",
    bg: "#FCE7F3",
  },
] as const

type StoreType = (typeof STORE_TYPES)[number]["value"]
type ListData = Awaited<ReturnType<typeof itemApi.list>>
type SecurityFilterValue = SecurityRiskGroup
const PAGE_SIZE = 15

export default function Home() {
  const language = useLanguage()
  const itemFilterOptions = useItemFilterOptions()
  const auth = useAuth()
  const dialog = useDialog()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const initialType = () => {
    const t = searchParams.type as StoreType | undefined
    return STORE_TYPES.some((e) => e.value === t) ? t! : "all"
  }

  const [activeType, setActiveType] = createSignal<StoreType>(initialType())
  const [hoveredType, setHoveredType] = createSignal<StoreType | null>(null)
  const [page, setPage] = createSignal(1)
  const [selectedItemId, setSelectedItemId] = createSignal<string | null>(null)
  const [copiedItemId, setCopiedItemId] = createSignal<string | null>(null)
  const [searchText, setSearchText] = createSignal("")
  const [debouncedSearch, setDebouncedSearch] = createSignal("")
  let searchInputRef: HTMLInputElement | undefined
  let searchSelectionStart: number | null = null
  let searchSelectionEnd: number | null = null
  let allowSearchRefocusUntil = 0
  let pendingBlurRefocusTimer: ReturnType<typeof setTimeout> | undefined
  const [listCache, setListCache] = createSignal<{ key: string; data: ListData } | null>(null)
  const [sort, setSort] = createStore<{ by?: ItemSort; order?: ItemOrder }>({ by: "favoriteCount", order: "desc" })
  const [categoryFilterOpen, setCategoryFilterOpen] = createSignal(false)
  const [sourceFilterOpen, setSourceFilterOpen] = createSignal(false)
  const [securityFilterOpen, setSecurityFilterOpen] = createSignal(false)
  const [categoryFilterQuery, setCategoryFilterQuery] = createSignal("")
  const [sourceFilterQuery, setSourceFilterQuery] = createSignal("")
  const [securityFilterQuery, setSecurityFilterQuery] = createSignal("")
  const [appliedTagFilters, setAppliedTagFilters] = createSignal<string[]>([])
  const [appliedCategoryFilters, setAppliedCategoryFilters] = createSignal<string[]>([])
  const [pendingCategoryFilters, setPendingCategoryFilters] = createSignal<string[]>([])
  const [appliedSourceFilters, setAppliedSourceFilters] = createSignal<string[]>([])
  const [pendingSourceFilters, setPendingSourceFilters] = createSignal<string[]>([])
  const [appliedSecurityFilters, setAppliedSecurityFilters] = createSignal<SecurityFilterValue[]>([])
  const [pendingSecurityFilters, setPendingSecurityFilters] = createSignal<SecurityFilterValue[]>([])
  const [hideSubSkills, setHideSubSkills] = createSignal(false)
  const [detailItem, setDetailItem] = createSignal<CapabilityItem | null>(null)
  const [favoriteActionItemId, setFavoriteActionItemId] = createSignal<string | null>(null)
  const [favoritePending, setFavoritePending] = createSignal(false)
  const [favorited, setFavorited] = createSignal(false)
  const [favoriteCount, setFavoriteCount] = createSignal(0)
  const [previewCount, setPreviewCount] = createSignal(0)
  const [installCount, setInstallCount] = createSignal(0)
  const [trackedItemId, setTrackedItemId] = createSignal<string | null>(null)
  const [detailContentReady, setDetailContentReady] = createSignal(false)
  const [detailRenderItemId, setDetailRenderItemId] = createSignal<string | null>(null)
  // 公共浏览默认隐藏 fork 出来的副本（GitHub 式）；打开后包含。
  const [showForks, setShowForks] = createSignal(false)
  let detailContentTimer: ReturnType<typeof setTimeout> | undefined

  const [columnPrefs, setColumnPrefs] = persisted(
    Persist.global("store.table.columns", ["store.table.columns.v1"]),
    createStore({ visible: DEFAULT_VISIBLE_COLUMNS }),
  )
  const visibleColumns = createMemo(() => ({ ...columnPrefs.visible, type: false as const }))

  onCleanup(() => {
    clearTimeout(searchTimer)
    clearTimeout(pendingBlurRefocusTimer)
    clearTimeout(detailContentTimer)
  })

  const formatDate = (iso?: string) => formatStoreDate(language.locale(), iso)

  let searchTimer: ReturnType<typeof setTimeout> | undefined
  const toggleColumnVisibility = (key: TableColumnKey) => {
    setColumnPrefs("visible", key, (current) => !current)
  }
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
    } catch {
      // Ignore inputs that do not support selection restoration.
    }
  }
  const handleSearchInput = (value: string) => {
    allowSearchRefocusUntil = Date.now() + 600
    setSearchText(value)
    captureSearchSelection()
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      setDebouncedSearch(value.trim())
      setPage(1)
      requestAnimationFrame(() => restoreSearchFocus())
      pendingBlurRefocusTimer = setTimeout(() => restoreSearchFocus(), 0)
    }, 300)
  }
  const clearSearchInput = () => {
    clearTimeout(searchTimer)
    clearTimeout(pendingBlurRefocusTimer)
    allowSearchRefocusUntil = Date.now() + 600
    searchSelectionStart = 0
    searchSelectionEnd = 0
    setSearchText("")
    setDebouncedSearch("")
    setPage(1)
    requestAnimationFrame(() => restoreSearchFocus())
  }

  const searchPlaceholderKey = createMemo(() => {
    const map: Record<StoreType, string> = {
      all: "store.searchAll",
      skill: "store.searchSkills",
      subagent: "store.searchSubagents",
      command: "store.searchCommands",
      mcp: "store.searchMcpServers",
      plugin: "store.searchPlugins",
    }
    return map[activeType()]
  })
  const hidePluginItemsLabel = createMemo(() => {
    const map: Partial<Record<StoreType, string>> = {
      all: "store.home.hidePluginItems",
      skill: "store.home.hideSubSkills",
      mcp: "store.home.hidePluginMcpServers",
    }
    return language.t(map[activeType()] ?? "store.home.hidePluginItems")
  })

  const listParams = createMemo(() => ({
    type: activeType() === "all" ? undefined : activeType(),
    search: debouncedSearch() || undefined,
    categories: appliedCategoryFilters().length ? appliedCategoryFilters() : undefined,
    source: appliedSourceFilters().length ? appliedSourceFilters() : undefined,
    tags: appliedTagFilters().length ? appliedTagFilters() : undefined,
    securityStatuses: appliedSecurityFilters().length ? appliedSecurityFilters() : undefined,
    page: page(),
    pageSize: PAGE_SIZE,
    sortBy: sort.by,
    sortOrder: sort.order,
    includeForks: showForks() || undefined,
    excludeSubSkills: hideSubSkills() || undefined,
  }))

  const toggleHideSubSkills = () => {
    setHideSubSkills((v) => !v)
    setPage(1)
    setSelectedItemId(null)
  }

  const listKey = createMemo(() => JSON.stringify(listParams()))
  const listSrc = createMemo(() => ({ key: listKey(), params: listParams() }))
  const [list, { mutate: mutateList }] = createResource(listSrc, async (src) => ({
    key: src.key,
    data: await itemApi.list(src.params),
  }))
  const typeMeta = createMemo(() => STORE_TYPES.find((entry) => entry.value === activeType()) ?? STORE_TYPES[0])
  const isTypeListMode = createMemo(() => !!searchParams.type && searchParams.type !== "all" && STORE_TYPES.some((e) => e.value === searchParams.type))
  const currentUserId = createMemo(() => auth.user()?.id ?? auth.user()?.subjectId ?? auth.user()?.sub ?? "")

  // Popular items for type-list mode (top 3 by installCount)
  const popularParams = createMemo(() => (isTypeListMode() ? { type: activeType(), page: 1, pageSize: 20 } : null))
  const [popularRaw] = createResource(popularParams, (params) => (params ? itemApi.list(params) : null))
  const popularItems = createMemo(() => {
    const items = popularRaw()?.items ?? []
    return [...items].sort((a, b) => (b.installCount ?? 0) - (a.installCount ?? 0)).slice(0, 3)
  })

  const listData = createMemo(() => {
    const data = list.latest
    if (data?.key === listKey()) return data.data
    return listCache()?.data ?? null
  })

  createEffect(() => {
    const data = list.latest
    if (!data || data.key !== listKey()) return
    setListCache(data)
  })

  const patchListItem = (itemId: string, updater: (item: CapabilityItem) => CapabilityItem) => {
    mutateList((prev) => {
      if (!prev || prev.key !== listKey()) return prev
      return {
        ...prev,
        data: {
          ...prev.data,
          items: prev.data.items.map((item) => (item.id === itemId ? updater(item) : item)),
        },
      }
    })

    setListCache((prev) => {
      if (!prev || prev.key !== listKey()) return prev
      return {
        ...prev,
        data: {
          ...prev.data,
          items: prev.data.items.map((item) => (item.id === itemId ? updater(item) : item)),
        },
      }
    })
  }

  const toggleFavorite = async () => {
    const data = detailItem()
    if (!data || !auth.user() || auth.loading() || favoritePending()) return

    setFavoritePending(true)
    try {
      const result = favorited() ? await behaviorApi.unfavorite(data.id) : await behaviorApi.favorite(data.id)
      setFavorited(result.favorited)
      setFavoriteCount(result.favoriteCount)
      patchListItem(data.id, (current) => ({
        ...current,
        favorited: result.favorited,
        favoriteCount: result.favoriteCount,
      }))
    } finally {
      setFavoritePending(false)
    }
  }

  const toggleRowFavorite = async (item: CapabilityItem) => {
    if (!auth.user() || auth.loading() || favoriteActionItemId() === item.id) return
    // Defense-in-depth: never subscribe an unconfigured MCP from the list (the disabled button
    // already blocks this; this guards a bypass). Unsubscribing is always allowed.
    if (mcpListSubscribeBlocked(item)) return

    setFavoriteActionItemId(item.id)
    try {
      const result = item.favorited ? await behaviorApi.unfavorite(item.id) : await behaviorApi.favorite(item.id)

      patchListItem(item.id, (current) => ({
        ...current,
        favorited: result.favorited,
        favoriteCount: result.favoriteCount,
      }))

      if (detailItem()?.id === item.id) {
        setDetailItem((current) =>
          current ? { ...current, favorited: result.favorited, favoriteCount: result.favoriteCount } : current,
        )
        setFavorited(result.favorited)
        setFavoriteCount(result.favoriteCount)
      }
    } finally {
      setFavoriteActionItemId((current) => (current === item.id ? null : current))
    }
  }

  const canEditItem = (item: CapabilityItem) => item.createdBy === currentUserId()

  createEffect(() => {
    const data = detailItem()
    if (!data) return
    setPreviewCount(data.previewCount ?? 0)
    setInstallCount(data.installCount ?? 0)
    setFavorited(Boolean(data.favorited))
    setFavoriteCount(data.favoriteCount ?? 0)
  })

  createEffect(() => {
    const data = detailItem()
    if (!data) return
    if (trackedItemId() === data.id) return

    setTrackedItemId(data.id)
    void behaviorApi
      .log(data.id, {
        actionType: "view",
        context: "drawer",
        metadata: {
          source: "app-ai-native",
          route: "home",
        },
      })
      .then(() => setPreviewCount((count) => count + 1))
      .catch(() => undefined)
  })

  const categories = createMemo(() => itemFilterOptions.categories())
  const sourceOptions = createMemo(() => itemFilterOptions.sources())
  const securityOptions = createMemo(() => itemFilterOptions.securityRiskGroups())
  const categoryFilterActive = createMemo(() => appliedCategoryFilters().length > 0)
  const sourceFilterActive = createMemo(() => appliedSourceFilters().length > 0)
  const securityFilterActive = createMemo(() => appliedSecurityFilters().length > 0)
  const tagFilterActive = createMemo(() => appliedTagFilters().length > 0)
  const columnOptions = createMemo(() =>
    buildStoreTableColumnOptions(language.t).filter((column) => column.key !== "type"),
  )
  const filteredCategoryOptions = createMemo(() => {
    const query = categoryFilterQuery().trim().toLowerCase()
    if (!query) return categories()
    return categories().filter(
      (cat) =>
        itemFilterOptions.categoryLabel(cat.slug, cat).toLowerCase().includes(query) ||
        cat.slug.toLowerCase().includes(query),
    )
  })
  const filteredSourceOptions = createMemo(() => {
    const query = sourceFilterQuery().trim().toLowerCase()
    if (!query) return sourceOptions()
    return sourceOptions().filter(
      (source) =>
        (itemFilterOptions.sourceLabel(source.value, source) || source.value).toLowerCase().includes(query) ||
        source.value.toLowerCase().includes(query),
    )
  })
  const filteredSecurityOptions = createMemo(() => {
    const query = securityFilterQuery().trim().toLowerCase()
    if (!query) return securityOptions()
    return securityOptions().filter(
      (option) =>
        itemFilterOptions
          .securityRiskGroupLabel(option.value as SecurityFilterValue, option)
          .toLowerCase()
          .includes(query) || option.value.toLowerCase().includes(query),
    )
  })
  const rows = createMemo(() => listData()?.items ?? [])
  const totalItems = createMemo(() => listData()?.total ?? 0)
  const totalPages = createMemo(() => Math.max(1, Math.ceil(totalItems() / PAGE_SIZE)))
  const listError = createMemo(() => (list.error instanceof Error ? list.error.message : ""))
  const showError = createMemo(() => !!listError() && rows().length === 0)
  const detailOpen = createMemo(() => !!selectedItemId())

  const openItemDetail = (item: CapabilityItem) => {
    setSelectedItemId(item.id)
    setDetailItem(item)
  }

  createEffect(() => {
    if (page() > totalPages()) setPage(totalPages())
  })

  createEffect(() => {
    const itemId = selectedItemId()
    clearTimeout(detailContentTimer)
    if (!itemId) {
      setDetailContentReady(false)
      setDetailRenderItemId(null)
      return
    }
    setDetailContentReady(false)
    detailContentTimer = setTimeout(() => {
      setDetailRenderItemId(itemId)
      setDetailContentReady(true)
    }, 180)
  })

  const statCards = createMemo(() => STORE_TYPES)

  const resetToType = (type: StoreType) => {
    setListCache(null)
    setActiveType(type)
    setSearchText("")
    setDebouncedSearch("")
    setPage(1)
    setSelectedItemId(null)
  }

  const handleTypeChange = (type: StoreType) => {
    if (type === activeType()) return
    resetToType(type)
  }

  // Sync URL search params → activeType (only when sidebar sets ?type=)
  createEffect(() => {
    const urlType = searchParams.type as StoreType | undefined
    if (!urlType) return
    const validType = STORE_TYPES.some((e) => e.value === urlType) ? urlType! : "all"
    if (validType !== activeType()) {
      resetToType(validType)
    }
  })

  const handlePageChange = (nextPage: number) => {
    if (nextPage === page() || nextPage < 1 || nextPage > totalPages()) return
    setPage(nextPage)
    setSelectedItemId(null)
  }

  const handleSortChange = (by: ItemSort) => {
    setSelectedItemId(null)
    setPage(1)
    if (sort.by !== by) {
      setSort({ by, order: "desc" })
      return
    }
    if (sort.order === "desc") {
      setSort("order", "asc")
      return
    }
    setSort({ by: undefined, order: undefined })
  }

  const sortState = (by: ItemSort) => {
    if (sort.by !== by || !sort.order) return "none"
    return sort.order === "asc" ? "ascending" : "descending"
  }

  const togglePendingCategoryFilter = (slug: string) => {
    setPendingCategoryFilters((current) =>
      current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug],
    )
  }

  const togglePendingSourceFilter = (source: string) => {
    setPendingSourceFilters((current) =>
      current.includes(source) ? current.filter((item) => item !== source) : [...current, source],
    )
  }

  const togglePendingSecurityFilter = (status: SecurityFilterValue) => {
    setPendingSecurityFilters((current) =>
      current.includes(status) ? current.filter((item) => item !== status) : [...current, status],
    )
  }

  const applyCategoryFilters = () => {
    setAppliedCategoryFilters([...pendingCategoryFilters()])
    setPage(1)
    setSelectedItemId(null)
    setCategoryFilterQuery("")
    setCategoryFilterOpen(false)
  }

  const applySourceFilters = () => {
    setAppliedSourceFilters([...pendingSourceFilters()])
    setPage(1)
    setSelectedItemId(null)
    setSourceFilterQuery("")
    setSourceFilterOpen(false)
  }

  const applySecurityFilters = () => {
    setAppliedSecurityFilters([...pendingSecurityFilters()])
    setPage(1)
    setSelectedItemId(null)
    setSecurityFilterQuery("")
    setSecurityFilterOpen(false)
  }

  const resetCategoryFilters = () => {
    setPendingCategoryFilters([])
    setAppliedCategoryFilters([])
    setPage(1)
    setSelectedItemId(null)
    setCategoryFilterQuery("")
    setCategoryFilterOpen(false)
  }

  const resetSourceFilters = () => {
    setPendingSourceFilters([])
    setAppliedSourceFilters([])
    setPage(1)
    setSelectedItemId(null)
    setSourceFilterQuery("")
    setSourceFilterOpen(false)
  }

  const resetSecurityFilters = () => {
    setPendingSecurityFilters([])
    setAppliedSecurityFilters([])
    setPage(1)
    setSelectedItemId(null)
    setSecurityFilterQuery("")
    setSecurityFilterOpen(false)
  }

  const toggleAppliedTagFilter = (slug: string) => {
    setAppliedTagFilters((current) =>
      current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug],
    )
    setPage(1)
    setSelectedItemId(null)
  }

  const favoriteIconColor = (favorited?: boolean) =>
    favorited ? (typeMeta().color ?? "var(--native-primary)") : "var(--native-muted)"
  const typeLabel = (value: string) => language.t(typeKey(value))

  const copyInstall = async (item: CapabilityItem) => {
    await navigator.clipboard.writeText(getInstallCommand(item))
    setCopiedItemId(item.id)
    setTimeout(() => {
      setCopiedItemId((cur) => (cur === item.id ? null : cur))
    }, 2000)
  }

  // Aggregate stats for type-list hero
  const typeAggregate = createMemo(() => {
    const items = popularRaw()?.items ?? []
    return {
      total: popularRaw()?.total ?? 0,
      installs: items.reduce((s, i) => s + (i.installCount ?? 0), 0),
    }
  })

  return (
    <div class="flex h-full min-h-0 w-full flex-1 flex-col">
      <Show
        when={isTypeListMode()}
        fallback={
          <>
            {/* ═══ HOME MODE ═══ */}
            <header class="relative overflow-hidden bg-[linear-gradient(135deg,color-mix(in_srgb,var(--native-primary)_2%,var(--native-bg)),color-mix(in_srgb,var(--native-primary)_10%,var(--native-panel))_62%,color-mix(in_srgb,var(--native-primary)_14%,var(--native-panel)))] before:pointer-events-none before:absolute before:right-[-10%] before:top-[-60%] before:h-[340px] before:w-[340px] before:rounded-full before:bg-[radial-gradient(circle,color-mix(in_srgb,var(--native-primary)_8%,transparent),transparent_70%)] before:content-['']">
              <div class="relative flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4 px-4 md:px-5 py-3 lg:gap-6">
                <div class="min-w-0 flex flex-col md:flex-row md:flex-1 md:items-center gap-0.5 md:gap-4">
                  <h1 class="relative m-0 shrink-0 text-[1.625rem] leading-[1.15] font-extrabold tracking-[-0.035em] text-[var(--native-foreground)]">
                    {language.t("store.home.hero.title")}
                  </h1>
                  <p class="relative m-0 hidden min-w-0 max-w-none lg:block lg:max-w-[38rem] text-[0.8125rem] leading-6 text-[var(--native-muted)]">
                    {language.t("store.home.hero.description")}
                  </p>
                </div>

                <div class="flex flex-wrap sm:flex-nowrap shrink-0 items-center justify-start md:justify-end gap-2 md:gap-3 w-full md:w-auto pb-1 md:pb-0">
                  <div class="flex flex-nowrap items-stretch justify-start md:justify-end gap-2">
                    <For each={statCards()}>
                      {(entry) => (
                        <button
                          type="button"
                          class={cn(
                            "group flex shrink-0 items-center gap-1.5 rounded-[0.375rem] border border-transparent bg-transparent px-2 md:px-3 py-0.5 text-left cursor-pointer transition-[background-color,border-color,color,transform,box-shadow]",
                            entry.value === activeType() && "border-transparent bg-[var(--stat-accent)] text-white",
                            hoveredType() === entry.value &&
                              entry.value !== activeType() &&
                              "bg-[color:color-mix(in_oklab,var(--stat-accent)_70%,white)] text-white",
                          )}
                          style={{ "--stat-accent": entry.color, "--stat-bg": entry.bg }}
                          onClick={() => handleTypeChange(entry.value)}
                          onMouseEnter={() => setHoveredType(entry.value)}
                          onMouseLeave={() => setHoveredType((current) => (current === entry.value ? null : current))}
                          aria-pressed={entry.value === activeType()}
                        >
                          <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-none bg-transparent">
                            <Icon
                              name={entry.icon}
                              class={cn("type-icon transition-colors", entry.value === activeType() && "!text-white")}
                              style={{
                                color:
                                  entry.value === activeType() || hoveredType() === entry.value
                                    ? "#ffffff"
                                    : entry.color,
                              }}
                            />
                          </div>
                          <div class="min-w-0">
                            <div
                              class={cn(
                                "type-label text-[12px] uppercase tracking-[0.05em] text-[var(--native-foreground)]",
                                entry.value === activeType() ? "font-bold !text-white" : "font-medium",
                              )}
                              style={
                                entry.value === activeType() || hoveredType() === entry.value
                                  ? { color: "#ffffff", "font-weight": entry.value === activeType() ? 700 : 500 }
                                  : undefined
                              }
                            >
                              {language.t(entry.labelKey)}
                            </div>
                          </div>
                        </button>
                      )}
                    </For>
                  </div>
                  <div class="flex w-full sm:w-auto items-center justify-start sm:justify-end gap-2">
                    <Tooltip value={language.t("store.console.capabilities.title")} placement="bottom">
                      <button
                        type="button"
                        class="flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[0.375rem] bg-[color:color-mix(in_oklab,var(--native-primary)_85%,white)] px-3 !text-white shadow-[var(--native-shadow-sm)] transition-[background-color,filter,transform] hover:cursor-pointer hover:bg-[var(--native-primary)] hover:!text-white"
                        style={{ color: "#ffffff" }}
                        aria-label={language.t("store.console.capabilities.title")}
                        onClick={() => navigate("/store/manager")}
                      >
                        <Icon name="sliders" class="size-4" style={{ color: "#ffffff" }} />
                        <span
                          class="text-sm font-medium leading-none !text-white hidden sm:inline"
                          style={{ color: "#ffffff" }}
                        >
                          {language.t("store.console.capabilities.manage")}
                        </span>
                      </button>
                    </Tooltip>
                  </div>
                </div>
              </div>
            </header>

            <div class="flex min-h-0 min-w-0 flex-1 flex-col">
              <div class="flex w-full py-4">
                <SearchControls />
              </div>

              <ContentShell />
            </div>
          </>
        }
      >
        {/* ═══ TYPE LIST MODE ═══ */}
        <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-4 max-[1280px]:gap-3">
          {/* Type Hero Header */}
          <header
            class="relative flex flex-col gap-4 lg:gap-5 overflow-hidden rounded-[1.25rem] border border-[color:color-mix(in_srgb,var(--native-border)_12%,transparent)] bg-[linear-gradient(135deg,var(--native-panel),color-mix(in_srgb,var(--tp-accent)_5%,var(--native-panel)))] px-4 py-4 lg:px-7 lg:py-6 before:pointer-events-none before:absolute before:right-[-5%] before:top-[-40%] before:h-[280px] before:w-[280px] before:rounded-full before:bg-[radial-gradient(circle,color-mix(in_srgb,var(--tp-accent)_8%,transparent),transparent_70%)] before:content-[''] lg:flex-row lg:items-center lg:justify-between"
            style={{ "--tp-accent": typeMeta().color }}
          >
            <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--native-radius-lg)] bg-[color-mix(in_srgb,var(--tp-accent)_10%,transparent)]">
              <Icon name={typeMeta().icon} />
            </div>
            <div class="relative min-w-0 flex-1">
              <h1 class="m-0 text-[1.375rem] leading-[1.2] font-extrabold tracking-[-0.03em] text-[var(--native-foreground)]">
                {language.t(typeMeta().labelKey)}
              </h1>
              <p class="mt-1 text-[0.8125rem] leading-[1.5] text-[var(--native-muted)]">
                {language.t(typeMeta().descKey)}
              </p>
            </div>
            <div class="relative grid w-full grid-cols-2 gap-2.5 lg:w-auto lg:min-w-[14rem]">
              <div class="rounded-[var(--native-radius-md)] border border-[color:color-mix(in_srgb,var(--native-border)_8%,transparent)] bg-[color-mix(in_srgb,var(--tp-accent)_4%,var(--native-panel))] px-3.5 py-2 text-center">
                <div class="text-[1.125rem] leading-[1.3] font-extrabold text-[var(--native-foreground)] [font-variant-numeric:tabular-nums]">
                  {typeAggregate().total.toLocaleString()}
                </div>
                <div class="text-[12px] uppercase tracking-[0.04em] text-[var(--native-muted)]">
                  {language.t("store.typeList.stat.total")}
                </div>
              </div>
              <div class="rounded-[var(--native-radius-md)] border border-[color:color-mix(in_srgb,var(--native-border)_8%,transparent)] bg-[color-mix(in_srgb,var(--tp-accent)_4%,var(--native-panel))] px-3.5 py-2 text-center">
                <div class="text-[1.125rem] leading-[1.3] font-extrabold text-[var(--native-foreground)] [font-variant-numeric:tabular-nums]">
                  {formatCompact(typeAggregate().installs)}
                </div>
                <div class="text-[12px] uppercase tracking-[0.04em] text-[var(--native-muted)]">
                  {language.t("store.typeList.stat.installs")}
                </div>
              </div>
            </div>
          </header>

          {/* Popular Cards (Top 3) */}
          <section class={sx.section}>
            <div class={sx.head}>
              <div>
                <h2 class={sx.title}>
                  {language.t("store.typeList.popular", { type: language.t(typeMeta().labelKey) })}
                </h2>
                <p class={sx.sub}>{language.t("store.typeList.popularSub")}</p>
              </div>
            </div>
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3" style={{ "--tp-accent": typeMeta().color }}>
              <For each={popularItems()}>
                {(item, idx) => (
                  <article
                    class="relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_srgb,var(--native-border)_12%,transparent)] bg-[var(--native-panel)] py-3.5 pr-4 pl-8 shadow-[var(--native-shadow-sm)] transition-all hover:-translate-y-px hover:border-[color:color-mix(in_srgb,var(--tp-accent)_20%,transparent)] hover:shadow-[var(--native-shadow-md)]"
                    onClick={() => openItemDetail(item)}
                  >
                    <span class="absolute left-0 top-0 flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded-br-[var(--native-radius-sm)] bg-[var(--tp-accent)] text-[12px] font-extrabold text-white">
                      #{idx() + 1}
                    </span>
                    <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--native-radius-md)] bg-[color-mix(in_srgb,var(--tp-accent)_8%,transparent)]">
                      <Icon name={typeMeta().icon} />
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-[0.8125rem] font-bold text-[var(--native-foreground)]"><HighlightText text={item.name} query={debouncedSearch()} /></div>
                      <div class="mt-0.5 flex gap-2.5 text-[12px] text-[var(--native-muted)] [font-variant-numeric:tabular-nums]">
                        <span class="inline-flex items-center gap-0.5">
                          <LocalIcon name="subscribe" size="small" />
                          {(item.favoriteCount ?? 0).toLocaleString()}
                        </span>
                        <span class="inline-flex items-center gap-0.5">
                          <LocalIcon name="download" size="small" />
                          {(item.installCount ?? 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <Show when={item.category}>
                      <span class="shrink-0 whitespace-nowrap rounded-[var(--native-radius-full)] bg-[color-mix(in_srgb,var(--tp-accent)_8%,transparent)] px-1.5 py-px text-[12px] text-[var(--tp-accent)]">
                        {itemFilterOptions.categoryLabel(item.category) || item.category}
                      </span>
                    </Show>
                  </article>
                )}
              </For>
            </div>
          </section>

          <SearchControls />

          {/* Type list content shell */}
          <ContentShell />
        </div>
      </Show>

      <Sheet open={detailOpen()} onOpenChange={(open) => !open && setSelectedItemId(null)} modal={false}>
        <SheetContent
          position="right"
          class={cn(sx.sheet, "w-[min(68rem,94vw)] sm:max-w-none")}
        >
          <SheetHeader class="sr-only">
            <SheetTitle>{language.t("store.home.detail.title")}</SheetTitle>
            <SheetDescription>{language.t("store.home.detail.description")}</SheetDescription>
          </SheetHeader>
          <Show when={detailRenderItemId()}>
            {(itemId) => (
              <Show when={detailContentReady()} fallback={<ItemDetailLoadingSkeleton class={sx.sheetBody} />}>
                <Suspense
                  fallback={
                    <div class="flex justify-center py-16 text-muted-foreground">{language.t("store.loading")}</div>
                  }
                >
                  <ItemDetailContent
                    itemId={itemId()}
                    class={cn(sx.sheetBody, "thin-scrollbar")}
                    onItemLoaded={setDetailItem}
                    onSelectItem={setSelectedItemId}
                    favorited={favorited()}
                    favoriteCount={favoriteCount()}
                    previewCount={previewCount()}
                    installCount={installCount()}
                    onToggleFavorite={toggleFavorite}
                    favoritePending={favoritePending()}
                    isAuthenticated={!!auth.user() && !auth.loading()}
                  />
                </Suspense>
              </Show>
            )}
          </Show>
        </SheetContent>
      </Sheet>
    </div>
  )

  // Shared content shell: table, search, pagination
  function SearchControls() {
    return (
      <section class={sx.section}>
        <div class="mx-auto flex w-full max-w-[64rem] items-center gap-3 px-3 sm:px-4 max-[640px]:gap-2">
            <div class="relative min-w-0 flex-1 rounded-full transition-shadow hover:shadow-[0_2px_6px_-3px_color-mix(in_srgb,var(--native-primary)_22%,rgba(15,23,42,0.3))] focus-within:shadow-[0_2px_6px_-3px_color-mix(in_srgb,var(--native-primary)_22%,rgba(15,23,42,0.3))]">
            <div class="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-4 text-[color:color-mix(in_srgb,var(--native-muted)_82%,white)]">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="size-4"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20 -3.5 -3.5" />
              </svg>
            </div>
            <input
              ref={searchInputRef}
              type="text"
              inputmode="search"
              placeholder={language.t(searchPlaceholderKey())}
              value={searchText()}
              onInput={(e: InputEvent) => handleSearchInput((e.currentTarget as HTMLInputElement).value)}
              onBlur={(e) => {
                if (e.relatedTarget || Date.now() > allowSearchRefocusUntil) return
                clearTimeout(pendingBlurRefocusTimer)
                pendingBlurRefocusTimer = setTimeout(() => {
                  if (!searchInputRef) return
                  if (document.activeElement && document.activeElement !== document.body) return
                  restoreSearchFocus()
                }, 0)
              }}
              class="h-12 w-full rounded-full border border-[color:color-mix(in_srgb,var(--native-border)_58%,transparent)] bg-[var(--native-panel)] pr-12 pl-11 text-base !text-[var(--native-foreground)] caret-[var(--native-primary)] placeholder:text-[color:color-mix(in_srgb,var(--native-muted)_72%,white)] shadow-[var(--native-shadow-sm)] focus-visible:border-2 focus-visible:border-[color:color-mix(in_srgb,var(--native-primary)_52%,var(--native-border))] focus-visible:!text-[var(--native-foreground)] focus-visible:placeholder:text-[color:color-mix(in_srgb,var(--native-muted)_36%,white)] focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <Show when={searchText().length > 0}>
              <button
                type="button"
                aria-label={language.t("common.clear")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={clearSearchInput}
                class="absolute inset-y-0 right-0 flex h-full w-12 cursor-pointer items-center justify-center rounded-r-full text-[color:color-mix(in_srgb,var(--native-muted)_78%,white)] transition-colors hover:text-[var(--native-foreground)]"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="size-4"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </Show>
            </div>
          <button
            type="button"
            onClick={() => {
              setShowForks((v) => !v)
              setPage(1)
            }}
            aria-pressed={showForks()}
            title={language.t("store.home.showForks")}
            class="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors max-[640px]:px-3"
            classList={{
              "border-[color:color-mix(in_srgb,var(--native-primary)_52%,var(--native-border))] bg-[color:color-mix(in_srgb,var(--native-primary)_10%,var(--native-panel))] text-[var(--native-foreground)]":
                showForks(),
              "border-[color:color-mix(in_srgb,var(--native-border)_58%,transparent)] bg-[var(--native-panel)] text-[color:color-mix(in_srgb,var(--native-muted)_82%,white)] hover:text-[var(--native-foreground)]":
                !showForks(),
            }}
          >
            <LocalIcon name="fork" size="small" />
            <span class="max-[640px]:hidden">{language.t("store.home.showForks")}</span>
          </button>
          <button
            type="button"
            role="switch"
            aria-pressed={hideSubSkills()}
            onClick={toggleHideSubSkills}
            class="inline-flex h-12 shrink-0 items-center gap-2 rounded-full border px-4 text-13-regular transition-colors"
            classList={{
              "border-[color:color-mix(in_srgb,var(--native-primary)_52%,var(--native-border))] bg-[color:color-mix(in_srgb,var(--native-primary)_12%,var(--native-panel))] text-[var(--native-primary)]":
                hideSubSkills(),
              "border-[color:color-mix(in_srgb,var(--native-border)_58%,transparent)] bg-[var(--native-panel)] text-text-weak hover:text-text-strong":
                !hideSubSkills(),
            }}
            title={hidePluginItemsLabel()}
          >
            <Icon name={hideSubSkills() ? "check" : "configuration"} size="small" />
            <span class="whitespace-nowrap max-[640px]:hidden">{hidePluginItemsLabel()}</span>
          </button>
        </div>
      </section>
    )
  }

  function ContentShell() {
    return (
      <section class={cn(sx.section, "flex min-h-0 flex-1 flex-col px-2 sm:px-3")}>
        <div class={cn(sx.tableShell, "flex min-h-0 flex-1 flex-col")}>
          <Show
            when={!showError()}
            fallback={
              <div class={sx.state}>{listError() || language.t("store.console.capabilities.toast.loadFailed")}</div>
            }
          >
            <Show
              when={listCache() !== null || !list.loading}
              fallback={<div class={sx.state}>{language.t("store.loading")}</div>}
            >
              <Show when={list.loading && listCache() !== null}>
                <div class={sx.overlay}>
                  <div class={sx.spinner} />
                </div>
              </Show>
              <StoreCapabilityTable
                rows={rows()}
                visibleColumns={visibleColumns()}
                columnOptions={columnOptions()}
                onToggleColumnVisibility={toggleColumnVisibility}
                sort={sort}
                onSortChange={handleSortChange}
                onRowClick={openItemDetail}
                typeLabel={typeLabel}
                typeColor={activeType() === "all" ? undefined : (value) => STORE_TYPES.find((e) => e.value === value)?.color}
                typeBadge={
                  activeType() === "all"
                    ? (value) => {
                        const t = STORE_TYPES.find((e) => e.value === value)
                        return t ? { icon: t.icon, color: t.color } : undefined
                      }
                    : undefined
                }
                categoryLabel={(slug, category) => itemFilterOptions.categoryLabel(slug, category)}
                sourceLabel={(value, source) =>
                  itemFilterOptions.sourceLabel(value, source as Parameters<typeof itemFilterOptions.sourceLabel>[1])
                }
                sourceUrl={(value) => itemFilterOptions.sourceUrl(value)}
                securityLabel={(value, option) =>
                  itemFilterOptions.securityRiskGroupLabel(
                    value,
                    option as Parameters<typeof itemFilterOptions.securityRiskGroupLabel>[1],
                  )
                }
                favoriteIconColor={favoriteIconColor}
                onToggleFavorite={(item) => void toggleRowFavorite(item)}
                currentUserId={currentUserId()}
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
                searchQuery={debouncedSearch()}
                filters={{
                  category: {
                    open: categoryFilterOpen(),
                    onOpenChange: (open) => {
                      setCategoryFilterOpen(open)
                      if (open) {
                        setPendingCategoryFilters([...appliedCategoryFilters()])
                        setCategoryFilterQuery("")
                      }
                    },
                    active: categoryFilterActive(),
                    appliedValues: appliedCategoryFilters(),
                    pendingValues: pendingCategoryFilters(),
                    query: categoryFilterQuery(),
                    onQueryChange: setCategoryFilterQuery,
                    options: filteredCategoryOptions(),
                    togglePending: togglePendingCategoryFilter,
                    apply: applyCategoryFilters,
                    reset: resetCategoryFilters,
                  },
                  security: {
                    open: securityFilterOpen(),
                    onOpenChange: (open) => {
                      setSecurityFilterOpen(open)
                      if (open) {
                        setPendingSecurityFilters([...appliedSecurityFilters()])
                        setSecurityFilterQuery("")
                      }
                    },
                    active: securityFilterActive(),
                    appliedValues: appliedSecurityFilters(),
                    pendingValues: pendingSecurityFilters(),
                    query: securityFilterQuery(),
                    onQueryChange: setSecurityFilterQuery,
                    options: filteredSecurityOptions(),
                    togglePending: togglePendingSecurityFilter,
                    apply: applySecurityFilters,
                    reset: resetSecurityFilters,
                  },
                  source: {
                    open: sourceFilterOpen(),
                    onOpenChange: (open) => {
                      setSourceFilterOpen(open)
                      if (open) {
                        setPendingSourceFilters([...appliedSourceFilters()])
                        setSourceFilterQuery("")
                      }
                    },
                    active: sourceFilterActive(),
                    appliedValues: appliedSourceFilters(),
                    pendingValues: pendingSourceFilters(),
                    query: sourceFilterQuery(),
                    onQueryChange: setSourceFilterQuery,
                    options: filteredSourceOptions(),
                    togglePending: togglePendingSourceFilter,
                    apply: applySourceFilters,
                    reset: resetSourceFilters,
                  },
                  tag: {
                    active: tagFilterActive(),
                    appliedValues: appliedTagFilters(),
                    onApply: (values) => {
                      setAppliedTagFilters(values)
                      setPage(1)
                      setSelectedItemId(null)
                    },
                    onReset: () => {
                      setAppliedTagFilters([])
                      setPage(1)
                      setSelectedItemId(null)
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
                emptyMessage={language.t("store.home.emptyCategory")}
                maxVisibleRows={PAGE_SIZE}
              />
            </Show>
          </Show>
        </div>

        <StoreTableFooter
          page={page()}
          pageSize={PAGE_SIZE}
          totalPages={totalPages()}
          totalItems={totalItems()}
          summary={formatStoreTablePaginationSummary({
            page: page(),
            pageSize: PAGE_SIZE,
            totalItems: totalItems(),
            showingLabel: (args) => language.t("store.console.capabilities.showing", args),
            emptyLabel: language.t("store.home.pagination.empty"),
          })}
          onPageChange={handlePageChange}
        />
      </section>
    )
  }
}
