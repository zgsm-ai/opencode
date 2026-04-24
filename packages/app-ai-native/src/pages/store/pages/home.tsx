import { createEffect, createMemo, createResource, createSignal, For, onCleanup, onMount, Show, Suspense } from "solid-js"
import { createStore } from "solid-js/store"
import { useNavigate, useSearchParams } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import AvatarDisplay from "@/components/avatar-display"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TextField, TextFieldInput } from "@/components/ui/text-field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuGroupLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Persist, persisted } from "@/utils/persist"
import { behaviorApi, itemApi, itemFilterApi, tagApi, userApi, type Category, type CapabilityItem, type FilterOption, type ItemOrder, type ItemSort, type ItemTag } from "../lib/api"
import { typeKey } from "../lib/constants"
import ItemDetailContent, { getInstallCommand } from "../components/item-detail-content"
import SecurityTag from "../components/security-tag"
import { Icon, type IconProps } from "@opencode-ai/ui/icon"
import { LocalIcon } from "@/components/local-icon"
import { useAuth } from "../hooks/use-auth"
import { cn } from "@/lib/utils"
import { st, sx } from "../lib/styles"

const STORE_TYPES = [
  { value: "skill", labelKey: "store.sidebar.nav.skills", descKey: "store.home.type.skill.description", icon: "sparkles" as IconProps["name"], color: "#ffa000", bg: "#FEF3C7" },
  { value: "subagent", labelKey: "store.sidebar.nav.subagents", descKey: "store.home.type.subagent.description", icon: "brain" as IconProps["name"], color: "#1670ff", bg: "#DBEAFE" },
  { value: "command", labelKey: "store.sidebar.nav.commands", descKey: "store.home.type.command.description", icon: "console" as IconProps["name"], color: "#09b179", bg: "#D1FAE5" },
  { value: "mcp", labelKey: "store.sidebar.nav.mcpServers", descKey: "store.home.type.mcp.description", icon: "mcp" as IconProps["name"], color: "#7338f9", bg: "#EDE9FE" },
] as const

type StoreType = (typeof STORE_TYPES)[number]["value"]
type ListData = Awaited<ReturnType<typeof itemApi.list>>
type SecurityFilterValue = NonNullable<CapabilityItem["securityStatus"]>
type TableColumnKey = "title" | "description" | "category" | "security" | "tag" | "favorite" | "updated" | "action"

const PAGE_SIZE = 10
const TAG_FILTER_PAGE_SIZE = 20
const TAG_COLOR_BY_CLASS = {
  system: {
    color: "#e17a0c",
    background: "#f9a02c1a",
    activeColor: "#fff3d6",
    activeBackground: "#f58b19",
  },
  custom: {
    color: "#478be6",
    background: "#4184e41a",
    activeColor: "#dcecff",
    activeBackground: "#478be6",
  },
} as const
const TAG_BADGE_WIDTH_CACHE_LIMIT = 200
const TAG_LAYOUT_CACHE_LIMIT = 300
const TAG_BADGE_WIDTH_CACHE = new Map<string, number>()
const TAG_LAYOUT_CACHE = new Map<string, { visibleCount: number; hiddenCount: number }>()
let sharedTagMeasureRoot: HTMLDivElement | undefined

type TagFilterState = {
  open: boolean
  query: string
  debouncedQuery: string
  applied: string[]
  pending: string[]
}

const DEFAULT_VISIBLE_COLUMNS: Record<TableColumnKey, boolean> = {
  title: true,
  description: true,
  category: true,
  security: true,
  tag: true,
  favorite: true,
  updated: true,
  action: true,
}

function compareTags(a: Pick<ItemTag, "tagClass" | "slug">, b: Pick<ItemTag, "tagClass" | "slug">) {
  const aPriority = a.tagClass === "system" ? 0 : 1
  const bPriority = b.tagClass === "system" ? 0 : 1
  if (aPriority !== bPriority) return aPriority - bPriority
  return a.slug.localeCompare(b.slug, undefined, { sensitivity: "base" })
}

function getTagLayoutCacheKey(tags: Pick<ItemTag, "slug" | "tagClass">[], containerWidth: number) {
  return `${containerWidth}::${tags.map((tag) => `${tag.tagClass}:${tag.slug}`).join("|")}`
}

function setBoundedCache<K, V>(cache: Map<K, V>, key: K, value: V, limit: number) {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, value)
  if (cache.size <= limit) return
  const oldestKey = cache.keys().next().value
  if (oldestKey !== undefined) cache.delete(oldestKey)
}

function ensureSharedTagMeasureRoot() {
  if (typeof document === "undefined") return undefined
  if (sharedTagMeasureRoot?.isConnected) return sharedTagMeasureRoot

  const root = document.createElement("div")
  root.setAttribute("aria-hidden", "true")
  root.className = "pointer-events-none fixed left-0 top-0 -z-10 flex opacity-0"
  document.body.appendChild(root)
  sharedTagMeasureRoot = root
  return sharedTagMeasureRoot
}

function formatCompact(n: number) {
  if (n >= 1000000) {
    const value = (n / 1000000).toFixed(n >= 10000000 ? 0 : 1)
    return `${value.replace(/\.0$/, "")}M`
  }
  if (n >= 1000) {
    const value = (n / 1000).toFixed(n >= 10000 ? 0 : 1)
    return `${value.replace(/\.0$/, "")}k`
  }
  return String(n)
}

function rangePages(page: number, totalPages: number) {
  const size = 5
  if (totalPages <= size) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const start = Math.max(1, Math.min(page - 2, totalPages - size + 1))
  return Array.from({ length: size }, (_, i) => start + i)
}

export default function Home() {
  const language = useLanguage()
  const auth = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const initialType = () => {
    const t = searchParams.type as StoreType | undefined
    return STORE_TYPES.some((e) => e.value === t) ? t! : "skill"
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
  const [securityFilterOpen, setSecurityFilterOpen] = createSignal(false)
  const [categoryFilterQuery, setCategoryFilterQuery] = createSignal("")
  const [securityFilterQuery, setSecurityFilterQuery] = createSignal("")
  const [appliedTagFilters, setAppliedTagFilters] = createSignal<string[]>([])
  const [appliedCategoryFilters, setAppliedCategoryFilters] = createSignal<string[]>([])
  const [pendingCategoryFilters, setPendingCategoryFilters] = createSignal<string[]>([])
  const [appliedSecurityFilters, setAppliedSecurityFilters] = createSignal<SecurityFilterValue[]>([])
  const [pendingSecurityFilters, setPendingSecurityFilters] = createSignal<SecurityFilterValue[]>([])
  const [detailItem, setDetailItem] = createSignal<CapabilityItem | null>(null)
  const [favoriteActionItemId, setFavoriteActionItemId] = createSignal<string | null>(null)
  const [favoritePending, setFavoritePending] = createSignal(false)
  const [favorited, setFavorited] = createSignal(false)
  const [favoriteCount, setFavoriteCount] = createSignal(0)
  const [previewCount, setPreviewCount] = createSignal(0)
  const [installCount, setInstallCount] = createSignal(0)
  const [trackedItemId, setTrackedItemId] = createSignal<string | null>(null)

  const [filterOptions] = createResource(() => itemFilterApi.list().catch(() => ({ categories: [] as Category[], securityStatuses: [] as FilterOption[] })))
  const [columnPrefs, setColumnPrefs] = persisted(
    Persist.global("store.table.columns", ["store.table.columns.v1"]),
    createStore({ visible: DEFAULT_VISIBLE_COLUMNS }),
  )

  onCleanup(() => {
    clearTimeout(searchTimer)
    clearTimeout(pendingBlurRefocusTimer)
  })

  const categoryName = (cat: Category) => {
    const locale = language.locale()
    return cat.names[locale] || cat.names.en || cat.slug
  }

  const formatDate = (iso?: string) => {
    if (!iso) return "—"
    const locale = language.locale()
    const normalizedLocale = locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : locale
    return new Date(iso).toLocaleDateString(normalizedLocale, {
      year: "numeric",
      month: locale === "zh" ? "numeric" : "short",
      day: "numeric",
    })
  }

  let searchTimer: ReturnType<typeof setTimeout> | undefined
  const isColumnVisible = (key: TableColumnKey) => columnPrefs.visible[key]
  const toggleColumnVisibility = (key: Exclude<TableColumnKey, "action">) => {
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
      skill: "store.searchSkills",
      subagent: "store.searchSubagents",
      command: "store.searchCommands",
      mcp: "store.searchMcpServers",
    }
    return map[activeType()]
  })

  const listParams = createMemo(() => ({
    type: activeType(),
    search: debouncedSearch() || undefined,
    categories: appliedCategoryFilters().length ? appliedCategoryFilters() : undefined,
    tags: appliedTagFilters().length ? appliedTagFilters() : undefined,
    securityStatuses: appliedSecurityFilters().length ? appliedSecurityFilters() : undefined,
    page: page(),
    pageSize: PAGE_SIZE,
    sortBy: sort.by,
    sortOrder: sort.order,
  }))

  const listKey = createMemo(() => JSON.stringify(listParams()))
  const listSrc = createMemo(() => ({ key: listKey(), params: listParams() }))
  const [list, { mutate: mutateList }] = createResource(listSrc, async (src) => ({ key: src.key, data: await itemApi.list(src.params) }))
  const typeMeta = createMemo(() => STORE_TYPES.find((entry) => entry.value === activeType()) ?? STORE_TYPES[0])
  const isTypeListMode = createMemo(() => !!searchParams.type && STORE_TYPES.some((e) => e.value === searchParams.type))
  const currentUserId = createMemo(() => auth.user()?.id ?? auth.user()?.subjectId ?? auth.user()?.sub ?? "")

  // Popular items for type-list mode (top 3 by installCount)
  const popularParams = createMemo(() => isTypeListMode() ? { type: activeType(), page: 1, pageSize: 20 } : null)
  const [popularRaw] = createResource(popularParams, (params) => params ? itemApi.list(params) : null)
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
      if (favorited()) {
        const result = await behaviorApi.unfavorite(data.id)
        setFavorited(result.favorited)
        setFavoriteCount(result.favoriteCount)
        return
      }

      const result = await behaviorApi.favorite(data.id)
      setFavorited(result.favorited)
      setFavoriteCount(result.favoriteCount)
    } finally {
      setFavoritePending(false)
    }
  }

  const toggleRowFavorite = async (item: CapabilityItem) => {
    if (!auth.user() || auth.loading() || favoriteActionItemId() === item.id) return

    setFavoriteActionItemId(item.id)
    try {
      const result = item.favorited
        ? await behaviorApi.unfavorite(item.id)
        : await behaviorApi.favorite(item.id)

      patchListItem(item.id, (current) => ({
        ...current,
        favorited: result.favorited,
        favoriteCount: result.favoriteCount,
      }))

      if (detailItem()?.id === item.id) {
        setDetailItem((current) => current ? { ...current, favorited: result.favorited, favoriteCount: result.favoriteCount } : current)
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

  const categories = createMemo(() => filterOptions()?.categories ?? [])
  const securityOptions = createMemo(() => filterOptions()?.securityStatuses ?? [])
  const categoryFilterActive = createMemo(() => appliedCategoryFilters().length > 0)
  const securityFilterActive = createMemo(() => appliedSecurityFilters().length > 0)
  const tagFilterActive = createMemo(() => appliedTagFilters().length > 0)
  const columnOptions = createMemo(() => [
    { key: "title" as const, label: language.t("store.home.table.title") },
    { key: "description" as const, label: language.t("store.home.table.description") },
    { key: "category" as const, label: language.t("store.console.capabilities.category") },
    { key: "security" as const, label: language.t("store.scanResults.securityScan") },
    { key: "tag" as const, label: language.t("store.home.table.tag") },
    { key: "favorite" as const, label: language.t("store.home.table.favoriteCount") },
    { key: "updated" as const, label: language.t("store.detail.updated") },
    { key: "action" as const, label: language.t("store.home.table.action") },
  ])
  const filteredCategoryOptions = createMemo(() => {
    const query = categoryFilterQuery().trim().toLowerCase()
    if (!query) return categories()
    return categories().filter((cat) => categoryName(cat).toLowerCase().includes(query) || cat.slug.toLowerCase().includes(query))
  })
  const filteredSecurityOptions = createMemo(() => {
    const query = securityFilterQuery().trim().toLowerCase()
    if (!query) return securityOptions()
    return securityOptions().filter((option) => securityLabel(option.value as SecurityFilterValue, option).toLowerCase().includes(query) || option.value.toLowerCase().includes(query))
  })
  const rows = createMemo(() => listData()?.items ?? [])
  const totalItems = createMemo(() => listData()?.total ?? 0)
  const [creatorInfoMap] = createResource(
    () => rows().map((item) => item.createdBy).filter(Boolean),
    (ids) => userApi.getInfo(ids),
  )
  const totalPages = createMemo(() => Math.max(1, Math.ceil(totalItems() / PAGE_SIZE)))
  const visiblePages = createMemo(() => rangePages(page(), totalPages()))
  const listError = createMemo(() => (list.error instanceof Error ? list.error.message : ""))
  const showError = createMemo(() => !!listError() && rows().length === 0)
  const detailOpen = createMemo(() => !!selectedItemId())

  createEffect(() => {
    if (page() > totalPages()) setPage(totalPages())
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
    const validType = STORE_TYPES.some((e) => e.value === urlType) ? urlType! : "skill"
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
    setPendingCategoryFilters((current) => current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug])
  }

  const togglePendingSecurityFilter = (status: SecurityFilterValue) => {
    setPendingSecurityFilters((current) => current.includes(status) ? current.filter((item) => item !== status) : [...current, status])
  }

  const applyCategoryFilters = () => {
    setAppliedCategoryFilters([...pendingCategoryFilters()])
    setPage(1)
    setSelectedItemId(null)
    setCategoryFilterQuery("")
    setCategoryFilterOpen(false)
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

  const resetSecurityFilters = () => {
    setPendingSecurityFilters([])
    setAppliedSecurityFilters([])
    setPage(1)
    setSelectedItemId(null)
    setSecurityFilterQuery("")
    setSecurityFilterOpen(false)
  }

  const securityLabel = (status: SecurityFilterValue, option?: FilterOption) => {
    const locale = language.locale()
    return (option?.names?.[locale] || option?.names?.en || language.t(`store.security.${status}`)).replace(/\.{2,}$/g, "")
  }

  const toggleAppliedTagFilter = (slug: string) => {
    setAppliedTagFilters((current) => current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug])
    setPage(1)
    setSelectedItemId(null)
  }

  const creatorInfo = (userId: string) => creatorInfoMap()?.[userId]
  const favoriteIconColor = (favorited?: boolean) => favorited ? (typeMeta().color ?? "var(--native-primary)") : "var(--native-muted)"

  const tagStyle = (tagClass?: string, active = false) => {
    const accent = tagClass === "system" ? TAG_COLOR_BY_CLASS.system : TAG_COLOR_BY_CLASS.custom
    return {
      color: active ? accent.activeColor : accent.color,
      "background-color": active ? accent.activeBackground : accent.background,
    }
  }

  function TagBadge(props: { slug: string; tagClass?: string; muted?: boolean; active?: boolean; clickable?: boolean; onClick?: () => void }) {
    const [hovered, setHovered] = createSignal(false)

    return (
      <button
        type="button"
        class={cn(
          "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-[11px] leading-4 font-semibold transition-colors",
          props.clickable ? "cursor-pointer" : "cursor-default",
        )}
        style={props.muted
          ? {
              color: "#dcecff",
              "background-color": "#478be6",
            }
          : tagStyle(props.tagClass, props.active || (props.clickable && hovered()))}
        title={props.slug}
        onClick={(e) => {
          e.stopPropagation()
          props.onClick?.()
        }}
        onMouseDown={(e) => {
          if (props.clickable) e.stopPropagation()
        }}
        onMouseEnter={() => {
          if (props.clickable) setHovered(true)
        }}
        onMouseLeave={() => {
          if (props.clickable) setHovered(false)
        }}
        disabled={!props.clickable && !props.onClick}
      >
        <span class="truncate">{props.slug}</span>
      </button>
    )
  }

  function FilterHeaderTrigger(props: { label: string; active: boolean; count: number }) {
    return (
      <>
        <span>{props.label}</span>
        <span
          class="ml-auto inline-flex items-center gap-1.5"
          style={props.active ? { color: "var(--native-primary)" } : undefined}
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
            aria-hidden="true"
          >
            <path d="M4 6h16" />
            <path d="M7 12h10" />
            <path d="M10 18h4" />
          </svg>
          <Show when={props.count > 0}>
            <span class="inline-flex min-w-5 items-center justify-center rounded-full bg-[#478be6] px-1.5 py-0.5 text-[10px] leading-none font-semibold text-[#dcecff]">
              {props.count}
            </span>
          </Show>
        </span>
      </>
    )
  }

  function TagCell(props: { tags?: ItemTag[] }) {
    const allTags = createMemo(() => [...(props.tags ?? [])].sort(compareTags))
    const activeTagSet = createMemo(() => new Set(appliedTagFilters()))
    const [layout, setLayout] = createStore<{ visibleCount: number; hiddenCount: number }>({
      visibleCount: Math.min(6, allTags().length),
      hiddenCount: Math.max(allTags().length - Math.min(6, allTags().length), 0),
    })
    let containerRef: HTMLDivElement | undefined
    let resizeObserver: ResizeObserver | undefined

    const recomputeLayout = () => {
      const tags = allTags()
      const container = containerRef
      const measure = ensureSharedTagMeasureRoot()
      if (!container || !measure || tags.length === 0) {
        setLayout({ visibleCount: 0, hiddenCount: 0 })
        return
      }

      const containerWidth = container.clientWidth
      if (!containerWidth) {
        setLayout({ visibleCount: Math.min(6, tags.length), hiddenCount: Math.max(tags.length - Math.min(6, tags.length), 0) })
        return
      }

      const layoutCacheKey = getTagLayoutCacheKey(tags, containerWidth)
      const cachedLayout = TAG_LAYOUT_CACHE.get(layoutCacheKey)
      if (cachedLayout) {
        setLayout(cachedLayout)
        return
      }

      const rowGap = 4
      const maxRows = 2

      const createMeasureBadge = (slug: string, tagClass?: string, muted = false) => {
        const node = document.createElement("span")
        node.className = "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-[11px] leading-4 font-semibold whitespace-nowrap"
        if (muted) {
          node.style.color = "#dcecff"
          node.style.backgroundColor = "#478be6"
        }
        else {
          const style = tagStyle(tagClass)
          node.style.color = String(style.color)
          node.style.backgroundColor = String(style["background-color"])
        }
        node.textContent = slug
        return node
      }

      const widths = tags.map((tag) => {
        const widthCacheKey = `${tag.tagClass}:${tag.slug}`
        const cachedWidth = TAG_BADGE_WIDTH_CACHE.get(widthCacheKey)
        if (cachedWidth !== undefined) return cachedWidth

        const badge = createMeasureBadge(tag.slug, tag.tagClass)
        measure.appendChild(badge)
        const width = Math.ceil(badge.getBoundingClientRect().width)
        badge.remove()
        setBoundedCache(TAG_BADGE_WIDTH_CACHE, widthCacheKey, width, TAG_BADGE_WIDTH_CACHE_LIMIT)
        return width
      })

      const getOverflowWidth = (hiddenCount: number) => {
        const widthCacheKey = `muted:+${hiddenCount}`
        const cachedWidth = TAG_BADGE_WIDTH_CACHE.get(widthCacheKey)
        if (cachedWidth !== undefined) return cachedWidth

        const badge = createMeasureBadge(`+${hiddenCount}`, undefined, true)
          measure.appendChild(badge)
        const width = Math.ceil(badge.getBoundingClientRect().width)
        badge.remove()
        setBoundedCache(TAG_BADGE_WIDTH_CACHE, widthCacheKey, width, TAG_BADGE_WIDTH_CACHE_LIMIT)
        return width
      }

      let bestVisible = tags.length
      for (let visibleCount = tags.length; visibleCount >= 0; visibleCount -= 1) {
        const hiddenCount = tags.length - visibleCount
        const items = widths.slice(0, visibleCount)
        if (hiddenCount > 0) items.push(getOverflowWidth(hiddenCount))

        let rows = 1
        let rowWidth = 0
        let fits = true
        for (const width of items) {
          const nextWidth = rowWidth === 0 ? width : rowWidth + rowGap + width
          if (nextWidth <= containerWidth) {
            rowWidth = nextWidth
            continue
          }
          rows += 1
          if (rows > maxRows) {
            fits = false
            break
          }
          rowWidth = width
          if (rowWidth > containerWidth) {
            fits = false
            break
          }
        }

        if (fits) {
          bestVisible = visibleCount
          break
        }
      }

      const nextLayout = {
        visibleCount: bestVisible,
        hiddenCount: Math.max(tags.length - bestVisible, 0),
      }
      setBoundedCache(TAG_LAYOUT_CACHE, layoutCacheKey, nextLayout, TAG_LAYOUT_CACHE_LIMIT)
      setLayout(nextLayout)
    }

    onMount(() => {
      recomputeLayout()
      if (typeof ResizeObserver !== "undefined" && containerRef) {
        resizeObserver = new ResizeObserver(() => recomputeLayout())
        resizeObserver.observe(containerRef)
      }
    })

    createEffect(() => {
      allTags()
      queueMicrotask(() => recomputeLayout())
    })

    onCleanup(() => {
      resizeObserver?.disconnect()
    })

    const visibleTags = createMemo(() => allTags().slice(0, layout.visibleCount))
    const hiddenCount = createMemo(() => layout.hiddenCount)

    return (
      <Show when={allTags().length > 0} fallback={<span>—</span>}>
        <div ref={containerRef} class="flex max-h-[3.75rem] flex-wrap gap-1 overflow-hidden">
          <For each={visibleTags()}>
            {(tag) => {
              const isActive = () => activeTagSet().has(tag.slug)
              return (
                <TagBadge
                  slug={tag.slug}
                  tagClass={tag.tagClass}
                  active={isActive()}
                  clickable
                  onClick={() => toggleAppliedTagFilter(tag.slug)}
                />
              )
            }}
          </For>
          <Show when={hiddenCount() > 0}>
            <TagBadge slug={`+${hiddenCount()}`} muted />
          </Show>
        </div>
      </Show>
    )
  }

  function TagFilterDropdown() {
    const [tagFilter, setTagFilter] = createStore<Omit<TagFilterState, "applied">>({
      open: false,
      query: "",
      debouncedQuery: "",
      pending: [],
    })
    let tagSearchTimer: ReturnType<typeof setTimeout> | undefined

    onCleanup(() => {
      clearTimeout(tagSearchTimer)
    })

    const [tagOptions] = createResource(
      () => ({ query: tagFilter.debouncedQuery.trim() || undefined, page: 1, pageSize: TAG_FILTER_PAGE_SIZE }),
      (params) => tagApi.list(params).catch(() => ({ tags: [] as ItemTag[], total: 0, page: 1, pageSize: TAG_FILTER_PAGE_SIZE, hasMore: false })),
    )

    const visibleTagOptions = createMemo(() => {
      const loaded = tagOptions.latest?.tags ?? []
      const selected = tagFilter.pending.filter((slug) => !loaded.some((tag) => tag.slug === slug)).map((slug) => ({
        id: `mock-${slug}`,
        slug,
        tagClass: "custom",
        createdBy: "mock",
        createdAt: "",
      }) satisfies ItemTag)
      return [...selected, ...loaded].sort(compareTags)
    })

    const tagFilterHasMore = createMemo(() => Boolean(tagOptions.latest?.hasMore || (tagOptions.latest?.total ?? 0) > TAG_FILTER_PAGE_SIZE))

    const togglePendingTagFilter = (slug: string) => {
      setTagFilter("pending", (current) => current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug])
    }

    const handleTagFilterInput = (value: string) => {
      setTagFilter("query", value)
      clearTimeout(tagSearchTimer)
      tagSearchTimer = setTimeout(() => {
        setTagFilter("debouncedQuery", value.trim())
      }, 300)
    }

    const applyTagFilters = () => {
      setAppliedTagFilters([...tagFilter.pending])
      setPage(1)
      setSelectedItemId(null)
      setTagFilter("query", "")
      setTagFilter("debouncedQuery", "")
      setTagFilter("open", false)
    }

    const resetTagFilters = () => {
      setAppliedTagFilters([])
      setPage(1)
      setSelectedItemId(null)
      setTagFilter("pending", [])
      setTagFilter("query", "")
      setTagFilter("debouncedQuery", "")
      setTagFilter("open", false)
    }

    return (
      <Popover modal={false} open={tagFilter.open} onOpenChange={(open) => {
        setTagFilter("open", open)
        if (open) {
          setTagFilter("pending", [...appliedTagFilters()])
          setTagFilter("query", "")
          setTagFilter("debouncedQuery", "")
        }
      }}>
        <PopoverTrigger as="button" class={cn(st.sort(false), "items-center gap-2")}>
          <FilterHeaderTrigger
            label={language.t("store.home.table.tag")}
            active={tagFilterActive()}
            count={appliedTagFilters().length}
          />
        </PopoverTrigger>
        <PopoverContent class="w-72 p-2">
          <div class="flex max-h-[28.8rem] flex-col gap-2">
            <TextField class="min-w-0">
              <TextFieldInput
                type="search"
                value={tagFilter.query}
                onInput={(e: InputEvent) => handleTagFilterInput((e.currentTarget as HTMLInputElement).value)}
                placeholder={language.t("store.home.filters.searchTag")}
                class="h-9 rounded-md border-[color:color-mix(in_srgb,var(--native-border)_46%,transparent)] bg-[var(--native-panel)] px-3 text-sm !text-[var(--native-foreground)] [&::-webkit-search-cancel-button]:cursor-pointer focus-visible:border-[color:color-mix(in_srgb,var(--native-primary)_52%,var(--native-border))] focus-visible:ring-0"
              />
            </TextField>
            <div class="thin-scrollbar flex max-h-[19.2rem] flex-col gap-1 overflow-y-auto pr-1">
              <For each={visibleTagOptions().slice(0, TAG_FILTER_PAGE_SIZE)}>
                {(tag) => (
                  <label class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground">
                    <input
                      type="checkbox"
                      checked={tagFilter.pending.includes(tag.slug)}
                      onChange={() => togglePendingTagFilter(tag.slug)}
                    />
                    <TagBadge slug={tag.slug} tagClass={tag.tagClass} active={tagFilter.pending.includes(tag.slug)} />
                  </label>
                )}
              </For>
              <Show when={visibleTagOptions().length === 0}>
                <div class="px-2 py-3 text-sm text-[var(--native-muted)]">{language.t("store.noResults")}</div>
              </Show>
            </div>
            <Show when={tagFilterHasMore()}>
              <div class="px-2 text-[11px] text-[var(--native-muted)]">{language.t("store.home.filters.tagLimitHint")}</div>
            </Show>
            <div class="flex items-center justify-end gap-2 border-t pt-2">
              <button type="button" class="cursor-pointer rounded-md px-2.5 py-1.5 text-sm text-[var(--native-muted)] hover:bg-accent hover:text-accent-foreground" onClick={resetTagFilters}>
                {language.t("common.reset")}
              </button>
              <button type="button" class="cursor-pointer rounded-md bg-[var(--native-primary)] px-2.5 py-1.5 text-sm" style={{ color: "#fff" }} onClick={applyTagFilters}>
                {language.t("channels.add.confirm")}
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    )
  }

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
    <div class="flex h-full min-h-0 w-full flex-1 flex-col gap-6 max-[1280px]:gap-5">
      <Show
        when={isTypeListMode()}
        fallback={
          <>
            {/* ═══ HOME MODE ═══ */}
            <header class="relative overflow-hidden bg-[linear-gradient(135deg,color-mix(in_srgb,var(--native-primary)_2%,white),color-mix(in_srgb,var(--native-primary)_10%,var(--native-panel))_62%,color-mix(in_srgb,var(--native-primary)_14%,var(--native-panel)))] before:pointer-events-none before:absolute before:right-[-10%] before:top-[-60%] before:h-[340px] before:w-[340px] before:rounded-full before:bg-[radial-gradient(circle,color-mix(in_srgb,var(--native-primary)_8%,transparent),transparent_70%)] before:content-['']">
              <div class="relative flex flex-row items-center justify-between gap-4 px-5 py-3 lg:gap-6">
                <div class="min-w-0 flex flex-1 items-center gap-4">
                  <h1 class="relative m-0 shrink-0 text-[1.625rem] leading-[1.15] font-extrabold tracking-[-0.035em] text-[var(--native-foreground)]">{language.t("store.home.hero.title")}</h1>
                  <p class="relative m-0 min-w-0 max-w-[38rem] text-[0.8125rem] leading-6 text-[var(--native-muted)]">{language.t("store.home.hero.description")}</p>
                </div>

                <div class="flex shrink-0 items-center justify-end gap-3">
                  <div class="flex flex-nowrap items-stretch justify-end gap-2 overflow-x-auto">
                  <For each={statCards()}>
                    {(entry) => (
                      <button
                        type="button"
                        class={cn(
                          "group flex shrink-0 items-center gap-1.5 rounded-[0.375rem] border border-transparent bg-transparent px-3 py-0.5 text-left cursor-pointer transition-[background-color,border-color,color,transform,box-shadow]",
                          entry.value === activeType() && "border-transparent bg-[var(--stat-accent)] text-white",
                          hoveredType() === entry.value && entry.value !== activeType() && "bg-[color:color-mix(in_oklab,var(--stat-accent)_70%,white)] text-white",
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
                            class={cn(
                              "type-icon transition-colors",
                              entry.value === activeType() && "!text-white",
                            )}
                            style={{ color: entry.value === activeType() || hoveredType() === entry.value ? "#ffffff" : entry.color }}
                          />
                        </div>
                        <div class="min-w-0">
                          <div class={cn(
                            "type-label text-[12px] uppercase tracking-[0.05em] text-[var(--native-foreground)]",
                            entry.value === activeType() ? "font-bold !text-white" : "font-medium",
                          )}
                          style={entry.value === activeType() || hoveredType() === entry.value ? { color: "#ffffff", "font-weight": entry.value === activeType() ? 700 : 500 } : undefined}
                        >
                            {language.t(entry.labelKey)}
                          </div>
                        </div>
                      </button>
                    )}
                  </For>
                  </div>
                  <Tooltip value={language.t("store.console.capabilities.create")} placement="bottom">
                    <button
                      type="button"
                      class="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[0.375rem] bg-[color:color-mix(in_oklab,var(--native-primary)_85%,white)] text-white shadow-[var(--native-shadow-sm)] transition-[background-color,filter,transform] hover:cursor-pointer hover:bg-[var(--native-primary)]"
                      aria-label={language.t("store.console.capabilities.create")}
                      onClick={() => navigate("/capabilities/new")}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        class="size-5"
                        style={{ color: "#ffffff" }}
                      >
                        <path d="M12 5v14" />
                        <path d="M5 12h14" />
                      </svg>
                    </button>
                  </Tooltip>
                </div>
              </div>
            </header>

            <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-6 max-[1280px]:gap-5">
              <SearchControls />

              {/* Home mode content shell */}
              <ContentShell />
            </div>
          </>
        }
      >
        {/* ═══ TYPE LIST MODE ═══ */}
        <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-6 max-[1280px]:gap-5">
          {/* Type Hero Header */}
          <header class="relative flex flex-col gap-5 overflow-hidden rounded-[1.25rem] border border-[color:color-mix(in_srgb,var(--native-border)_12%,transparent)] bg-[linear-gradient(135deg,var(--native-panel),color-mix(in_srgb,var(--tp-accent)_5%,var(--native-panel)))] px-7 py-6 before:pointer-events-none before:absolute before:right-[-5%] before:top-[-40%] before:h-[280px] before:w-[280px] before:rounded-full before:bg-[radial-gradient(circle,color-mix(in_srgb,var(--tp-accent)_8%,transparent),transparent_70%)] before:content-[''] lg:flex-row lg:items-center lg:justify-between" style={{ "--tp-accent": typeMeta().color }}>
            <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--native-radius-lg)] bg-[color-mix(in_srgb,var(--tp-accent)_10%,transparent)]">
              <Icon name={typeMeta().icon} />
            </div>
            <div class="relative min-w-0 flex-1">
              <h1 class="m-0 text-[1.375rem] leading-[1.2] font-extrabold tracking-[-0.03em] text-[var(--native-foreground)]">{language.t(typeMeta().labelKey)}</h1>
              <p class="mt-1 text-[0.8125rem] leading-[1.5] text-[var(--native-muted)]">{language.t(typeMeta().descKey)}</p>
            </div>
            <div class="relative grid w-full grid-cols-2 gap-2.5 lg:w-auto lg:min-w-[14rem]">
              <div class="rounded-[var(--native-radius-md)] border border-[color:color-mix(in_srgb,var(--native-border)_8%,transparent)] bg-[color-mix(in_srgb,var(--tp-accent)_4%,var(--native-panel))] px-3.5 py-2 text-center">
                <div class="text-[1.125rem] leading-[1.3] font-extrabold text-[var(--native-foreground)] [font-variant-numeric:tabular-nums]">{typeAggregate().total.toLocaleString()}</div>
                <div class="text-[12px] uppercase tracking-[0.04em] text-[var(--native-muted)]">{language.t("store.typeList.stat.total")}</div>
              </div>
              <div class="rounded-[var(--native-radius-md)] border border-[color:color-mix(in_srgb,var(--native-border)_8%,transparent)] bg-[color-mix(in_srgb,var(--tp-accent)_4%,var(--native-panel))] px-3.5 py-2 text-center">
                <div class="text-[1.125rem] leading-[1.3] font-extrabold text-[var(--native-foreground)] [font-variant-numeric:tabular-nums]">{formatCompact(typeAggregate().installs)}</div>
                <div class="text-[12px] uppercase tracking-[0.04em] text-[var(--native-muted)]">{language.t("store.typeList.stat.installs")}</div>
              </div>
            </div>
          </header>

          {/* Popular Cards (Top 3) */}
          <section class={sx.section}>
            <div class={sx.head}>
              <div>
                <h2 class={sx.title}>{language.t("store.typeList.popular", { type: language.t(typeMeta().labelKey) })}</h2>
                <p class={sx.sub}>{language.t("store.typeList.popularSub")}</p>
              </div>
            </div>
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3" style={{ "--tp-accent": typeMeta().color }}>
              <For each={popularItems()}>
                {(item, idx) => (
                  <article class="relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_srgb,var(--native-border)_12%,transparent)] bg-[var(--native-panel)] py-3.5 pr-4 pl-8 shadow-[var(--native-shadow-sm)] transition-all hover:-translate-y-px hover:border-[color:color-mix(in_srgb,var(--tp-accent)_20%,transparent)] hover:shadow-[var(--native-shadow-md)]" onClick={() => setSelectedItemId(item.id)}>
                    <span class="absolute left-0 top-0 flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded-br-[var(--native-radius-sm)] bg-[var(--tp-accent)] text-[12px] font-extrabold text-white">#{idx() + 1}</span>
                    <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--native-radius-md)] bg-[color-mix(in_srgb,var(--tp-accent)_8%,transparent)]">
                      <Icon name={typeMeta().icon} />
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-[0.8125rem] font-bold text-[var(--native-foreground)]">{item.name}</div>
                      <div class="mt-0.5 flex gap-2.5 text-[12px] text-[var(--native-muted)] [font-variant-numeric:tabular-nums]">
                        <span class="inline-flex items-center gap-0.5"><LocalIcon name="star" size="small" />{(item.favoriteCount ?? 0).toLocaleString()}</span>
                        <span class="inline-flex items-center gap-0.5"><LocalIcon name="download" size="small" />{(item.installCount ?? 0).toLocaleString()}</span>
                      </div>
                    </div>
                    <Show when={item.category}>
                      <span class="shrink-0 whitespace-nowrap rounded-[var(--native-radius-full)] bg-[color-mix(in_srgb,var(--tp-accent)_8%,transparent)] px-1.5 py-px text-[12px] text-[var(--tp-accent)]">{categories().find((c) => c.slug === item.category)
                        ? categoryName(categories().find((c) => c.slug === item.category)!)
                        : item.category}</span>
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
        <SheetContent position="right" class={cn(sx.sheet, "w-[min(68rem,94vw)] sm:max-w-none")} style={{ "background-color": "var(--st-surface-lowest, #ffffff)" }}>
          <SheetHeader class="sr-only">
            <SheetTitle>{language.t("store.home.detail.title")}</SheetTitle>
            <SheetDescription>{language.t("store.home.detail.description")}</SheetDescription>
          </SheetHeader>
          <Show when={selectedItemId()}>
            {(itemId) => (
              <Suspense fallback={<div class="flex justify-center py-16 text-muted-foreground">{language.t("store.loading")}</div>}>
                <ItemDetailContent
                  itemId={itemId()}
                  class={cn(sx.sheetBody, "thin-scrollbar")}
                  onItemLoaded={setDetailItem}
                  favorited={favorited()}
                  favoriteCount={favoriteCount()}
                  previewCount={previewCount()}
                  installCount={installCount()}
                  onToggleFavorite={toggleFavorite}
                  favoritePending={favoritePending()}
                  isAuthenticated={!!auth.user() && !auth.loading()}
                />
              </Suspense>
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
        <div class="mx-auto mt-4 flex w-full max-w-[64rem] items-center gap-3 max-[640px]:gap-2">
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
        </div>
      </section>
    )
  }

  function ContentShell() {
    return (
      <section class={cn(sx.section, "flex min-h-0 flex-1 flex-col p-3 sm:p-4")}>
        <div class={cn(sx.tableShell, "flex min-h-0 flex-1 flex-col")}>
          <Show
            when={!showError()}
            fallback={
              <div class={sx.state}>
                {listError() || language.t("store.console.capabilities.toast.loadFailed")}
              </div>
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
              <Table class="table-fixed text-[0.8125rem]">
                <TableHeader class={sx.thead}>
                  <TableRow>
                    <Show when={isColumnVisible("title")}>
                      <TableHead class={cn(sx.th, sx.colTitle)}>{language.t("store.home.table.title")}</TableHead>
                    </Show>
                    <Show when={isColumnVisible("description")}>
                      <TableHead class={cn(sx.th, sx.colDescription)}>{language.t("store.home.table.description")}</TableHead>
                    </Show>
                    <Show when={isColumnVisible("category")}>
                      <TableHead class={cn(sx.th, sx.colCategory)}>
                      <DropdownMenu open={categoryFilterOpen()} onOpenChange={(open) => {
                        setCategoryFilterOpen(open)
                        if (open) {
                          setPendingCategoryFilters([...appliedCategoryFilters()])
                          setCategoryFilterQuery("")
                        }
                      }}>
                        <DropdownMenuTrigger
                          as="button"
                          class={cn(st.sort(false), "items-center gap-2")}
                        >
                          <FilterHeaderTrigger
                            label={language.t("store.console.capabilities.category")}
                            active={categoryFilterActive()}
                            count={appliedCategoryFilters().length}
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent class="w-64 p-2">
                          <div class="flex max-h-[24rem] flex-col gap-2">
                            <TextField class="min-w-0">
                              <TextFieldInput
                                type="search"
                                value={categoryFilterQuery()}
                                onInput={(e: InputEvent) => setCategoryFilterQuery((e.currentTarget as HTMLInputElement).value)}
                                placeholder={language.t("store.home.filters.searchCategory")}
                                class="h-9 rounded-md border-[color:color-mix(in_srgb,var(--native-border)_46%,transparent)] bg-[var(--native-panel)] px-3 text-sm !text-[var(--native-foreground)] [&::-webkit-search-cancel-button]:cursor-pointer focus-visible:border-[color:color-mix(in_srgb,var(--native-primary)_52%,var(--native-border))] focus-visible:ring-0"
                              />
                            </TextField>
                            <div class="thin-scrollbar flex max-h-[19.2rem] flex-col gap-1 overflow-y-auto pr-1">
                              <For each={filteredCategoryOptions()}>
                                {(cat) => (
                                  <label class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground">
                                    <input
                                      type="checkbox"
                                      checked={pendingCategoryFilters().includes(cat.slug)}
                                      onChange={() => togglePendingCategoryFilter(cat.slug)}
                                    />
                                    <span class="min-w-0 truncate">{categoryName(cat)}</span>
                                  </label>
                                )}
                              </For>
                              <Show when={filteredCategoryOptions().length === 0}>
                                <div class="px-2 py-3 text-sm text-[var(--native-muted)]">{language.t("store.noResults")}</div>
                              </Show>
                            </div>
                            <div class="flex items-center justify-end gap-2 border-t pt-2">
                              <button type="button" class="cursor-pointer rounded-md px-2.5 py-1.5 text-sm text-[var(--native-muted)] hover:bg-accent hover:text-accent-foreground" onClick={resetCategoryFilters}>
                                {language.t("common.reset")}
                              </button>
                              <button type="button" class="cursor-pointer rounded-md bg-[var(--native-primary)] px-2.5 py-1.5 text-sm" style={{ color: "#fff" }} onClick={applyCategoryFilters}>
                                {language.t("channels.add.confirm")}
                              </button>
                            </div>
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      </TableHead>
                    </Show>
                    <Show when={isColumnVisible("security")}>
                      <TableHead class={cn(sx.th, sx.colSecurity)}>
                      <DropdownMenu open={securityFilterOpen()} onOpenChange={(open) => {
                        setSecurityFilterOpen(open)
                        if (open) {
                          setPendingSecurityFilters([...appliedSecurityFilters()])
                          setSecurityFilterQuery("")
                        }
                      }}>
                        <DropdownMenuTrigger
                          as="button"
                          class={cn(st.sort(false), "items-center gap-2")}
                        >
                          <FilterHeaderTrigger
                            label={language.t("store.scanResults.securityScan")}
                            active={securityFilterActive()}
                            count={appliedSecurityFilters().length}
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent class="w-64 p-2">
                          <div class="flex max-h-[24rem] flex-col gap-2">
                            <TextField class="min-w-0">
                              <TextFieldInput
                                type="search"
                                value={securityFilterQuery()}
                                onInput={(e: InputEvent) => setSecurityFilterQuery((e.currentTarget as HTMLInputElement).value)}
                                placeholder={language.t("store.home.filters.searchSecurity")}
                                class="h-9 rounded-md border-[color:color-mix(in_srgb,var(--native-border)_46%,transparent)] bg-[var(--native-panel)] px-3 text-sm !text-[var(--native-foreground)] [&::-webkit-search-cancel-button]:cursor-pointer focus-visible:border-[color:color-mix(in_srgb,var(--native-primary)_52%,var(--native-border))] focus-visible:ring-0"
                              />
                            </TextField>
                            <div class="thin-scrollbar flex max-h-[19.2rem] flex-col gap-1 overflow-y-auto pr-1">
                              <For each={filteredSecurityOptions()}>
                                {(option) => (
                                  <label class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground">
                                    <input
                                      type="checkbox"
                                      checked={pendingSecurityFilters().includes(option.value as SecurityFilterValue)}
                                      onChange={() => togglePendingSecurityFilter(option.value as SecurityFilterValue)}
                                    />
                                    <span class="min-w-0 truncate">{securityLabel(option.value as SecurityFilterValue, option)}</span>
                                  </label>
                                )}
                              </For>
                              <Show when={filteredSecurityOptions().length === 0}>
                                <div class="px-2 py-3 text-sm text-[var(--native-muted)]">{language.t("store.noResults")}</div>
                              </Show>
                            </div>
                            <div class="flex items-center justify-end gap-2 border-t pt-2">
                              <button type="button" class="cursor-pointer rounded-md px-2.5 py-1.5 text-sm text-[var(--native-muted)] hover:bg-accent hover:text-accent-foreground" onClick={resetSecurityFilters}>
                                {language.t("common.reset")}
                              </button>
                              <button type="button" class="cursor-pointer rounded-md bg-[var(--native-primary)] px-2.5 py-1.5 text-sm" style={{ color: "#fff" }} onClick={applySecurityFilters}>
                                {language.t("channels.add.confirm")}
                              </button>
                            </div>
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      </TableHead>
                    </Show>
                    <Show when={isColumnVisible("tag")}>
                      <TableHead class={cn(sx.th, sx.colTag)}>
                      <TagFilterDropdown />
                      </TableHead>
                    </Show>
                    <Show when={isColumnVisible("favorite")}>
                      <TableHead class={cn(sx.th, sx.colFavorite)} aria-sort={sortState("favoriteCount")}>
                      <button
                        type="button"
                        class={st.sort(sort.by === "favoriteCount")}
                        onClick={() => handleSortChange("favoriteCount")}
                      >
                        <span>{language.t("store.home.table.favoriteCount")}</span>
                        <span class={sx.sortIcon} aria-hidden="true">
                          <span class={st.arrow("up", sort.by === "favoriteCount" && sort.order === "asc")} />
                          <span class={st.arrow("down", sort.by === "favoriteCount" && sort.order === "desc")} />
                        </span>
                      </button>
                      </TableHead>
                    </Show>
                    <Show when={isColumnVisible("updated")}>
                      <TableHead class={cn(sx.th, sx.colUpdated)} aria-sort={sortState("updatedAt")}>
                      <button
                        type="button"
                        class={st.sort(sort.by === "updatedAt")}
                        onClick={() => handleSortChange("updatedAt")}
                      >
                        <span>{language.t("store.detail.updated")}</span>
                        <span class={sx.sortIcon} aria-hidden="true">
                          <span class={st.arrow("up", sort.by === "updatedAt" && sort.order === "asc")} />
                          <span class={st.arrow("down", sort.by === "updatedAt" && sort.order === "desc")} />
                        </span>
                      </button>
                      </TableHead>
                    </Show>
                    <TableHead class={cn(sx.th, sx.colAction, "text-right")}>
                      <div class="flex items-center justify-end gap-2">
                        <span>{language.t("store.home.table.action")}</span>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            as="button"
                            class="inline-flex size-7 items-center justify-center rounded-[0.375rem] text-[var(--native-muted)] transition-colors hover:bg-accent hover:text-accent-foreground"
                            title="Toggle columns"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4" aria-hidden="true">
                              <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent class="w-56 p-1">
                            <DropdownMenuGroup>
                              <DropdownMenuGroupLabel class="px-2 py-1.5 text-xs font-medium text-[var(--native-muted)]">
                                {language.t("store.home.table.toggleColumns")}
                              </DropdownMenuGroupLabel>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <For each={columnOptions()}>
                              {(column) => (
                                <DropdownMenuCheckboxItem
                                  checked={isColumnVisible(column.key)}
                                  disabled={column.key === "action"}
                                  onChange={() => {
                                    if (column.key !== "action") toggleColumnVisibility(column.key)
                                  }}
                                >
                                  {column.label}
                                </DropdownMenuCheckboxItem>
                              )}
                            </For>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <Show
                    when={rows().length > 0}
                    fallback={<TableEmptyState colSpan={Object.values(columnPrefs.visible).filter(Boolean).length} message={language.t("store.home.emptyCategory")} />}
                  >
                    <For each={rows()}>
                      {(item) => (
                        <TableRow class={sx.row} onClick={() => setSelectedItemId(item.id)}>
                          <Show when={isColumnVisible("title")}>
                            <TableCell class={cn(sx.td, sx.colTitle)}>
                            <div class="flex min-w-0 items-center gap-2">
                              <AvatarDisplay
                                avatarUrl={creatorInfo(item.createdBy)?.avatarUrl}
                                username={creatorInfo(item.createdBy)?.name ?? item.createdBy}
                                class="size-6 shrink-0"
                                title={creatorInfo(item.createdBy)?.name ?? item.createdBy}
                              />
                              <div class="min-w-0">
                                <div
                                  class={cn(sx.item, "truncate text-[14px] font-bold leading-5 text-[color:color-mix(in_oklab,var(--native-foreground)_80%,white_20%)]")}
                                  style={{ "font-weight": 700 }}
                                  title={item.name}
                                >
                                  {item.name}
                                </div>
                                <div
                                  class="block min-w-0 truncate whitespace-nowrap text-[11px] leading-4 text-[color:color-mix(in_oklab,var(--native-muted)_82%,white_18%)]"
                                  title={`${item.repoName || item.repoId || "repo"}/${item.slug}`}
                                >
                                  {item.repoName || item.repoId || "repo"}/{item.slug}
                                </div>
                              </div>
                            </div>
                            </TableCell>
                          </Show>
                          <Show when={isColumnVisible("description")}>
                            <TableCell class={cn(sx.td, sx.colDescription, sx.mut)}>
                            <span
                              class="block max-h-10 overflow-hidden leading-5"
                              style={{
                                display: "-webkit-box",
                                "-webkit-box-orient": "vertical",
                                "-webkit-line-clamp": 2,
                                "text-overflow": "ellipsis",
                                "white-space": "normal",
                                overflow: "hidden",
                              }}
                              title={item.description || "—"}
                            >
                              {item.description || "—"}
                            </span>
                            </TableCell>
                          </Show>
                          <Show when={isColumnVisible("category")}>
                            <TableCell class={cn(sx.td, sx.colCategory, sx.mut)}>
                            {item.category
                              ? categories().find((c) => c.slug === item.category)
                                ? categoryName(categories().find((c) => c.slug === item.category)!)
                                : item.category
                              : "—"}
                            </TableCell>
                          </Show>
                          <Show when={isColumnVisible("security")}>
                            <TableCell class={cn(sx.td, sx.colSecurity)}>
                            <SecurityTag status={item.securityStatus} />
                            </TableCell>
                          </Show>
                          <Show when={isColumnVisible("tag")}>
                            <TableCell class={cn(sx.td, sx.colTag, sx.mut)}>
                              <TagCell tags={item.tags} />
                            </TableCell>
                          </Show>
                          <Show when={isColumnVisible("favorite")}>
                            <TableCell class={cn(sx.td, sx.colFavorite, sx.mut)}>
                            <div class="inline-flex h-4 items-center justify-center gap-1.5 align-middle">
                              <LocalIcon
                                name={item.favorited ? "star-filled" : "star"}
                                size="small"
                                style={{ color: favoriteIconColor(item.favorited) }}
                              />
                              <span class="inline-flex h-4 items-center leading-4" title={(item.favoriteCount ?? 0).toLocaleString()}>
                                {formatCompact(item.favoriteCount ?? 0)}
                              </span>
                            </div>
                            </TableCell>
                          </Show>
                          <Show when={isColumnVisible("updated")}>
                            <TableCell class={cn(sx.td, sx.colUpdated, sx.mut)}>
                            {formatDate(item.updatedAt)}
                            </TableCell>
                          </Show>
                          <TableCell class={cn(sx.td, sx.colAction, "text-right")} onClick={(e: MouseEvent) => e.stopPropagation()}>
                            <div class="flex items-center justify-end gap-2">
                              <Show when={canEditItem(item)}>
                                <button
                                  type="button"
                                  class="inline-flex size-8 items-center justify-center rounded-full bg-transparent text-[var(--native-foreground)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-foreground)_10%,transparent)]"
                                  title={language.t("common.edit")}
                                  onClick={() => navigate(`/capabilities/${item.id}/edit`)}
                                >
                                  <Icon name="edit" size="small" />
                                </button>
                              </Show>
                              <button
                                type="button"
                                disabled={!auth.user() || auth.loading() || favoriteActionItemId() === item.id}
                                class="inline-flex size-8 items-center justify-center rounded-full bg-transparent text-[var(--native-foreground)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-foreground)_10%,transparent)] disabled:cursor-not-allowed disabled:opacity-60"
                                title={auth.user() ? (item.favorited ? language.t("store.detail.unfavorite") : language.t("store.detail.favorite")) : language.t("store.detail.favoriteSignIn")}
                                onClick={() => void toggleRowFavorite(item)}
                              >
                                <LocalIcon name={item.favorited ? "star-filled" : "star"} size="small" style={{ color: favoriteIconColor(item.favorited) }} />
                              </button>
                              <button
                                type="button"
                                class="inline-flex size-8 items-center justify-center rounded-full bg-transparent text-[var(--native-foreground)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-foreground)_10%,transparent)]"
                                title={language.t("store.home.table.copyInstall")}
                                onClick={() => void copyInstall(item)}
                              >
                                <Icon name={copiedItemId() === item.id ? "check-small" : "copy"} size="small" class={copiedItemId() === item.id ? "text-green-500" : ""} />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </For>
                  </Show>
                </TableBody>
              </Table>
            </Show>
          </Show>
        </div>

        <div class={sx.pager}>
          <div class={sx.pagerSum}>
            <Show when={totalItems() > 0} fallback={language.t("store.home.pagination.empty")}>
              {language.t("store.console.capabilities.showing", {
                from: Math.min((page() - 1) * PAGE_SIZE + 1, totalItems()),
                to: Math.min(page() * PAGE_SIZE, totalItems()),
                total: totalItems(),
              })}
            </Show>
          </div>
          <div class={sx.pagerActs}>
            <button class={st.page(false)} disabled={page() <= 1} onClick={() => handlePageChange(1)}>
              <span aria-hidden="true">«</span>
            </button>
            <button class={st.page(false)} disabled={page() <= 1} onClick={() => handlePageChange(page() - 1)}>
              <Icon name="chevron-left" />
            </button>
            <For each={visiblePages()}>
              {(pageNumber) => (
                <button
                  class={st.page(pageNumber === page())}
                  onClick={() => handlePageChange(pageNumber)}
                >
                  {pageNumber}
                </button>
              )}
            </For>
            <button
              class={st.page(false)}
              disabled={page() >= totalPages()}
              onClick={() => handlePageChange(page() + 1)}
            >
              <Icon name="chevron-right" />
            </button>
            <button class={st.page(false)} disabled={page() >= totalPages()} onClick={() => handlePageChange(totalPages())}>
              <span aria-hidden="true">»</span>
            </button>
          </div>
        </div>
      </section>
    )
  }
}

function TableEmptyState(props: { colSpan: number; message: string }) {
  return (
    <TableRow>
      <TableCell class="border-b-0 p-0" colSpan={props.colSpan}>
        <div class={sx.state}>{props.message}</div>
      </TableCell>
    </TableRow>
  )
}
