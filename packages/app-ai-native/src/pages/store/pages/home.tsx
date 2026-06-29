import { createEffect, createMemo, createResource, createSignal, For, onCleanup, onMount, Show, Suspense } from "solid-js"
import { createStore, produce } from "solid-js/store"
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
import ItemDetailContent from "../components/item-detail-content"
import { ItemDetailLoadingSkeleton } from "../components/item-detail-loading-skeleton"
import {
  formatCompact,
  formatSourceMetric,
  formatStoreDate,
  formatStoreTablePaginationSummary,
  HighlightText,
  mcpListSubscribeBlocked,
  StoreTableFooter,
} from "../components/store-capability-table"
import { Icon, type IconProps } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { LocalIcon } from "@/components/local-icon"
import { useAuth } from "../hooks/use-auth"
import { cn } from "@/lib/utils"
import { typeKey } from "../lib/constants"
import { sx } from "../lib/styles"
import { StoreIcon } from "../lib/store-icons"
import { StoreCardGrid, type StoreItemViewProps } from "../components/store-card-grid"
import { StoreListView } from "../components/store-list-view"
import { StoreFilterBar } from "../components/store-filter-bar"
import { withViewTransition, applyStagger } from "../lib/view-transition"
import { ensureEnterpriseLoaded } from "../lib/enterprise"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const STORE_TYPES = [
  {
    value: "all",
    labelKey: "store.home.typeTab.all",
    descKey: "store.home.type.all.description",
    icon: "dot-grid" as IconProps["name"],
    color: "#64748b",
    bg: "#E2E8F0",
  },
  {
    value: "skill",
    labelKey: "store.home.typeTab.skill",
    descKey: "store.home.type.skill.description",
    icon: "sparkles" as IconProps["name"],
    color: "#ffa000",
    bg: "#FEF3C7",
  },
  {
    value: "subagent",
    labelKey: "store.home.typeTab.subagent",
    descKey: "store.home.type.subagent.description",
    icon: "brain" as IconProps["name"],
    color: "#1670ff",
    bg: "#DBEAFE",
  },
  {
    value: "command",
    labelKey: "store.home.typeTab.command",
    descKey: "store.home.type.command.description",
    icon: "console" as IconProps["name"],
    color: "#09b179",
    bg: "#D1FAE5",
  },
  {
    value: "mcp",
    labelKey: "store.home.typeTab.mcp",
    descKey: "store.home.type.mcp.description",
    icon: "mcp" as IconProps["name"],
    color: "#7338f9",
    bg: "#EDE9FE",
  },
  {
    value: "plugin",
    labelKey: "store.home.typeTab.plugin",
    descKey: "store.home.type.plugin.description",
    icon: "configuration" as IconProps["name"],
    color: "#EC4899",
    bg: "#FCE7F3",
  },
] as const

type StoreType = (typeof STORE_TYPES)[number]["value"]
type ListData = Awaited<ReturnType<typeof itemApi.list>>
type SecurityFilterValue = SecurityRiskGroup
// 每页条数：可选项 + 默认值。页大小现由用户在分页器里选择并持久化（store.pageSize）。
const PAGE_SIZE_OPTIONS = [15, 30, 50] as const
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0]
const MAX_PAGE_SIZE = Math.max(...PAGE_SIZE_OPTIONS)

// Entrance animation for the card/list items when an applied filter/sort/search query yields a
// fresh result set. The keyed wrapper (`[data-store-list-enter]`) remounts on each new query, so
// its item children freshly mount and play `store-row-enter` once. Stagger by document order via
// nth-child (covers up to MAX_PAGE_SIZE rows so any selected page size is fully staggered).
// reduced-motion disables it. The card⇄list view switch does NOT use this path (it animates as
// shared elements via View Transitions).
const STORE_LIST_ENTER_CSS = `
@keyframes store-row-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
[data-store-list-enter] > div > * {
  animation: store-row-enter 0.34s cubic-bezier(0.22, 1, 0.36, 1) both;
}
${Array.from({ length: MAX_PAGE_SIZE }, (_, i) =>
  `[data-store-list-enter] > div > *:nth-child(${i + 1}){animation-delay:${i * 22}ms}`,
).join("")}
@media (prefers-reduced-motion: reduce) {
  [data-store-list-enter] > div > * { animation: none !important; }
}
`

export default function Home() {
  const language = useLanguage()
  const itemFilterOptions = useItemFilterOptions()
  const auth = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const initialType = () => {
    const t = searchParams.type as StoreType | undefined
    return STORE_TYPES.some((e) => e.value === t) ? t! : "all"
  }

  const [activeType, setActiveType] = createSignal<StoreType>(initialType())
  const [page, setPage] = createSignal(1)
  const [selectedItemId, setSelectedItemId] = createSignal<string | null>(null)
  const [searchText, setSearchText] = createSignal("")
  const [debouncedSearch, setDebouncedSearch] = createSignal("")
  let searchInputRef: HTMLInputElement | undefined
  let searchSelectionStart: number | null = null
  let searchSelectionEnd: number | null = null
  let allowSearchRefocusUntil = 0
  let pendingBlurRefocusTimer: ReturnType<typeof setTimeout> | undefined
  const [listCache, setListCache] = createSignal<{ key: string; data: ListData } | null>(null)
  const [sort, setSort] = createStore<{ by?: ItemSort; order?: ItemOrder }>({ by: "favoriteCount", order: "desc" })
  const [appliedTagFilters] = createSignal<string[]>([])
  const [appliedCategoryFilters, setAppliedCategoryFilters] = createSignal<string[]>([])
  const [appliedSourceFilters, setAppliedSourceFilters] = createSignal<string[]>([])
  const [appliedSecurityFilters, setAppliedSecurityFilters] = createSignal<SecurityFilterValue[]>([])
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

  // ─── Per-item favorite state store (订阅态解耦) ─────────────────────────────────────────────
  // BUG FIX: 之前 toggleRowFavorite 走 patchListItem，用 `items.map(i => i.id===id ? {...i,...} : i)`
  // 替换了整个 item 对象 → 列表视图的 `<For each={rows}>`（Solid 按「引用」key）认定该行变了 →
  // 重建该行 DOM → SubscribeButton 实例被销毁重建，组件内的宽度 FLIP / 颜色过渡永远拿不到「同实例
  // 内 favorited 的变化」（实例直接被换掉）。
  //
  // 解法（零依赖）：把 favorited/favoriteCount 从「item 对象字段」解耦到这个 per-item 响应式 store，
  // 按 itemId 索引。订阅切换只 setFavStore(id, …)，**不再替换 item 对象** → item 引用稳定 → `<For>`
  // 不重建行 → SubscribeButton 保持同一实例，favorited 作为响应式 prop 变化，组件内动画得以触发。
  // 视图 / 详情 Sheet 的 favorited / favoriteCount 都从这个 store 按 id 读，作为单一可信来源。
  type FavState = { favorited: boolean; favoriteCount: number }
  const [favStore, setFavStore] = createStore<Record<string, FavState>>({})
  const favStateOf = (item: CapabilityItem): FavState =>
    favStore[item.id] ?? { favorited: Boolean(item.favorited), favoriteCount: item.favoriteCount ?? 0 }

  // Card ⇄ list view mode (persisted). Defaults to "list" (列式). The card/list switch and any
  // filter/sort change that reorders the list run through withViewTransition for shared-element
  // animation; applyStagger sequences the items in document order.
  type ViewMode = "card" | "list"
  const [viewPrefs, setViewPrefs] = persisted(
    Persist.global("store.viewMode", ["store.viewMode.v1"]),
    createStore({ mode: "list" as ViewMode }),
  )
  const viewMode = createMemo<ViewMode>(() => viewPrefs.mode)
  const setViewMode = (mode: ViewMode) => {
    if (mode === viewMode()) return
    applyStagger(rows().map((row) => row.id))
    withViewTransition(() => setViewPrefs("mode", mode))
  }

  // 每页条数（persisted）。默认 15，用户可在分页器里切换 15/30/50。切换时回到第一页并关闭详情，
  // listParams.pageSize 变化会触发 createResource 重取（正常）。
  const [pageSizePrefs, setPageSizePrefs] = persisted(
    Persist.global("store.pageSize"),
    createStore({ size: DEFAULT_PAGE_SIZE as number }),
  )
  const pageSize = createMemo(() => pageSizePrefs.size)
  const setPageSize = (size: number) => {
    if (size === pageSize()) return
    setPageSizePrefs("size", size)
    setPage(1)
    setSelectedItemId(null)
  }

  // ─── 筛选 / 排序 / 搜索导致列表内容变化时的丝滑入场 ───
  // createResource 是异步重取，View Transitions 的同步回调抓不到稍后到达的新数据，所以这里
  // 不走 startViewTransition，而是用「已生效查询(listKey) 变化 → 数据 settle 后 bump epoch →
  // 列表子树按 epoch 重挂 → 子项各自播放一次 store-row-enter（CSS stagger，按文档序 i*22ms）」。
  // reduced-motion 由内联 @media 降级（见 ContentShell 的 <style>）。effect 注册在 listKey/list
  // 定义之后（见下方），此处只声明信号。
  const [listAnimEpoch, setListAnimEpoch] = createSignal(0)
  // 入场动画激活窗口：仅在 epoch 自增后的一小段时间内开启，避免「卡片⇄列式」切换(不改 epoch)
  // 时新挂的子项被这套入场 CSS 重复触发（视图切换有自己的 View Transitions 共享元素动画）。
  const [listEnterActive, setListEnterActive] = createSignal(false)
  let lastSettledListKey: string | null = null
  let listEnterTimer: ReturnType<typeof setTimeout> | undefined

  onCleanup(() => {
    clearTimeout(searchTimer)
    clearTimeout(pendingBlurRefocusTimer)
    clearTimeout(detailContentTimer)
    clearTimeout(listEnterTimer)
  })

  const formatDate = (iso?: string) => formatStoreDate(language.locale(), iso)

  let searchTimer: ReturnType<typeof setTimeout> | undefined
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
    pageSize: pageSize(),
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
  const [list, { refetch: refetchList }] = createResource(listSrc, async (src) => ({
    key: src.key,
    data: await itemApi.list(src.params),
  }))

  // Bump the list entrance epoch when a NEW applied query (listKey) finishes loading. This drives
  // the staggered fade-in for filter/sort/search/page changes (see listAnimEpoch declaration).
  createEffect(() => {
    const key = listKey()
    const data = list.latest
    if (!data || data.key !== key) return
    if (lastSettledListKey === key) return
    const isFirst = lastSettledListKey === null
    lastSettledListKey = key
    if (isFirst) return // 首屏不播入场（避免初次加载整列闪一下）
    setListAnimEpoch((n) => n + 1)
    setListEnterActive(true)
    clearTimeout(listEnterTimer)
    listEnterTimer = setTimeout(() => setListEnterActive(false), pageSize() * 22 + 340 + 80)
  })

  const typeMeta = createMemo(() => STORE_TYPES.find((entry) => entry.value === activeType()) ?? STORE_TYPES[0])
  const isTypeListMode = createMemo(() => !!searchParams.type && searchParams.type !== "all" && STORE_TYPES.some((e) => e.value === searchParams.type))

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

  const toggleFavorite = async (invokeMode?: "auto" | "manual") => {
    const data = detailItem()
    if (!data || !auth.user() || auth.loading() || favoritePending()) return

    // Snapshot prior state so a failed request can be rolled back (otherwise the toggle fails
    // silently — no global error surface exists at the API layer).
    const prevFavorited = favorited()
    const prevCount = favoriteCount()
    const prevStore = favStore[data.id]

    setFavoritePending(true)
    try {
      // invokeMode present = subscribe-or-switch (upsert mode, never unfavorite);
      // absent = plain toggle.
      const result = invokeMode
        ? await behaviorApi.favorite(data.id, invokeMode)
        : favorited()
          ? await behaviorApi.unfavorite(data.id)
          : await behaviorApi.favorite(data.id)
      setFavorited(result.favorited)
      setFavoriteCount(result.favoriteCount)
      // Keep the list view's per-item store in sync with a detail-page toggle (no item-object
      // replacement → list rows stay mounted).
      setFavStore(data.id, { favorited: result.favorited, favoriteCount: result.favoriteCount })
    } catch (err) {
      // Roll back the optimistic UI to the snapshot and surface the failure.
      setFavorited(prevFavorited)
      setFavoriteCount(prevCount)
      if (prevStore) setFavStore(data.id, prevStore)
      showToast({
        variant: "error",
        icon: "circle-x",
        title: language.t("store.toast.favoriteFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setFavoritePending(false)
    }
  }

  const toggleRowFavorite = async (item: CapabilityItem) => {
    if (!auth.user() || auth.loading() || favoriteActionItemId() === item.id) return
    // Defense-in-depth: never subscribe an unconfigured MCP from the list (the disabled button
    // already blocks this; this guards a bypass). Unsubscribing is always allowed.
    if (mcpListSubscribeBlocked(item)) return

    // Read the current favorited state from the store (single source of truth), not off the (possibly
    // stale) item object reference captured by the row.
    const current = favStateOf(item)
    // Snapshot for rollback on failure (the API layer has no global error surface, so without this
    // a failed subscribe/unsubscribe is silent).
    const prevDetailFavorited = favorited()
    const prevDetailCount = favoriteCount()
    setFavoriteActionItemId(item.id)
    try {
      const result = current.favorited ? await behaviorApi.unfavorite(item.id) : await behaviorApi.favorite(item.id)

      // Update ONLY the per-item favorite store — never replace the item object. This keeps the
      // list `<For>` row (and its SubscribeButton instance) intact, so favorited flips as a
      // reactive prop on the same instance and the in-component width FLIP / color transitions fire.
      setFavStore(item.id, { favorited: result.favorited, favoriteCount: result.favoriteCount })

      if (detailItem()?.id === item.id) {
        setFavorited(result.favorited)
        setFavoriteCount(result.favoriteCount)
      }
    } catch (err) {
      // Roll the per-item store (and any mirrored detail state) back to the snapshot.
      setFavStore(item.id, current)
      if (detailItem()?.id === item.id) {
        setFavorited(prevDetailFavorited)
        setFavoriteCount(prevDetailCount)
      }
      showToast({
        variant: "error",
        icon: "circle-x",
        title: language.t("store.toast.favoriteFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setFavoriteActionItemId((current) => (current === item.id ? null : current))
    }
  }

  createEffect(() => {
    const data = detailItem()
    if (!data) return
    setPreviewCount(data.previewCount ?? 0)
    setInstallCount(data.installCount ?? 0)
    // Prefer the per-item favorite store (latest truth after any prior list/detail toggle) over the
    // possibly-stale detailItem snapshot, so reopening a row whose favorite was toggled is correct.
    const fav = favStore[data.id]
    setFavorited(fav ? fav.favorited : Boolean(data.favorited))
    setFavoriteCount(fav ? fav.favoriteCount : (data.favoriteCount ?? 0))
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
  const rows = createMemo(() => listData()?.items ?? [])
  const totalItems = createMemo(() => listData()?.total ?? 0)
  const totalPages = createMemo(() => Math.max(1, Math.ceil(totalItems() / pageSize())))
  const listError = createMemo(() => (list.error instanceof Error ? list.error.message : ""))
  // 致命错误：本次请求失败且没有任何缓存行可显示 → 整块错误态。
  const showError = createMemo(() => !!listError() && rows().length === 0)
  // 刷新错误：本次请求失败但仍有缓存行 → 保留旧数据，仅在表格顶部挂一条非阻断提示条。
  const refreshError = createMemo(() => !!listError() && rows().length > 0)
  const detailOpen = createMemo(() => !!selectedItemId())

  // ─── 生效查询/筛选汇总（T2-3 空态区分 / T2-4 生效筛选 chips）───
  // 是否存在任一「会改变结果集」的查询条件（搜索词 OR 四组 applied 过滤器）。
  const hasActiveQuery = createMemo(
    () =>
      debouncedSearch().length > 0 ||
      appliedCategoryFilters().length > 0 ||
      appliedSourceFilters().length > 0 ||
      appliedSecurityFilters().length > 0 ||
      appliedTagFilters().length > 0,
  )
  // 一键重置搜索词 + 四组 applied 过滤器（空态/生效筛选行的「清除全部」复用）。
  const clearSearchAndFilters = () => {
    clearTimeout(searchTimer)
    setSearchText("")
    setDebouncedSearch("")
    setAppliedCategoryFilters([])
    setAppliedSourceFilters([])
    setAppliedSecurityFilters([])
    afterFilterChange()
  }

  // Seed (only) the per-item favorite store from the current list data. Runs whenever `rows`
  // changes (筛选/排序/翻页/新数据到达), seeding *new* ids the store hasn't recorded yet.
  //
  // BUG FIX (订阅点击后弹回): this effect must NEVER overwrite an existing favStore entry. The
  // item object's `favorited`/`favoriteCount` are FROZEN at their stale original values (方案 C
  // decoupled favorited off the item and we deliberately never mutate the item), so overwriting an
  // already-seeded/toggled entry with `item.favorited` would clobber the optimistic/API truth and
  // bounce the UI back. Once an id is in the store, that store entry is the single source of truth
  // (toggleRowFavorite updates it from the API result), so we leave it untouched.
  //
  // We also DROP the `favoriteActionItemId` dependency: the old in-flight skip is no longer needed
  // (existing entries are never overwritten regardless), and removing the dependency means the
  // toggle's `setFavoriteActionItemId(null)` no longer re-runs this effect.
  //
  // Why toggling doesn't revert: a toggle never changes `rows()` (we never replace the item object,
  // so listData/rows memos don't notify), so this effect simply doesn't fire on toggle. Why
  // filter/sort/page still works: those swap in fresh list data → `rows()` changes → new ids get
  // seeded here, while ids already in the store keep their current (optimistic/operated) value.
  // produce() patches per-key in place — it never replaces item objects, so the list `<For>` keys
  // (which key by item reference, not by this store) are unaffected and rows are not rebuilt.
  createEffect(() => {
    const items = rows()
    setFavStore(
      produce((store) => {
        for (const item of items) {
          if (!(item.id in store)) {
            store[item.id] = { favorited: Boolean(item.favorited), favoriteCount: item.favoriteCount ?? 0 }
          }
        }
      }),
    )
  })

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

  // ─── 顶栏类型 pill 滑块：测量选中按钮位置，驱动 absolute thumb ───
  const tabEls: Partial<Record<StoreType, HTMLButtonElement>> = {}
  const [tabThumb, setTabThumb] = createSignal({ x: 0, w: 0 })
  const measureTabThumb = () => {
    const el = tabEls[activeType()]
    if (!el) return
    setTabThumb({ x: el.offsetLeft, w: el.offsetWidth })
  }
  createEffect(() => {
    // 选中项变化 / 语言切换（label 宽度变）都需重测
    activeType()
    language.locale()
    requestAnimationFrame(measureTabThumb)
  })
  // ─── 卡片/列式 seg 滑块：复用 P1 的测量模式（仅 2 项） ───
  const segEls: Partial<Record<ViewMode, HTMLButtonElement>> = {}
  const [segThumb, setSegThumb] = createSignal({ x: 0, w: 0 })
  const measureSegThumb = () => {
    const el = segEls[viewMode()]
    if (!el) return
    setSegThumb({ x: el.offsetLeft, w: el.offsetWidth })
  }
  createEffect(() => {
    viewMode()
    language.locale()
    requestAnimationFrame(measureSegThumb)
  })

  onMount(() => {
    // Pull the 大客户 roster from the backend once; falls back to the built-in demo list on
    // failure/empty (e.g. demo mode where the endpoint is absent). Idempotent across mounts.
    ensureEnterpriseLoaded()
    const onResize = () => {
      measureTabThumb()
      measureSegThumb()
    }
    window.addEventListener("resize", onResize)
    onCleanup(() => window.removeEventListener("resize", onResize))
  })

  const resetToType = (type: StoreType) => {
    setListCache(null)
    setActiveType(type)
    setSearchText("")
    setDebouncedSearch("")
    // 切类型时一并清空四组 applied 过滤器，避免「从技能切到 MCP 仍套用技能的筛选」的静默约束。
    setAppliedCategoryFilters([])
    setAppliedSourceFilters([])
    setAppliedSecurityFilters([])
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

  // Toolbar sort dropdown (single-select, always desc) — the design-mock
  // "订阅最多 / 评分最高 / 最近更新" selector.
  const SORT_OPTIONS: { value: ItemSort; labelKey: Parameters<typeof language.t>[0] }[] = [
    { value: "favoriteCount", labelKey: "store.home.sort.mostSubscribed" },
    { value: "experienceScore", labelKey: "store.home.sort.topRated" },
    { value: "updatedAt", labelKey: "store.home.sort.recentlyUpdated" },
  ]
  const selectSort = (by: ItemSort) => {
    setSort({ by, order: "desc" })
    setPage(1)
    setSelectedItemId(null)
  }
  const currentSortLabel = createMemo(() => {
    const option = SORT_OPTIONS.find((entry) => entry.value === sort.by)
    return language.t(option?.labelKey ?? "store.home.sort.mostSubscribed")
  })

  // ─── 独立筛选条（StoreFilterBar）: point-to-apply（直写 applied，无 pending→apply 两段式）───
  const afterFilterChange = () => {
    setPage(1)
    setSelectedItemId(null)
  }
  const toggleCategoryFilter = (value: string) => {
    setAppliedCategoryFilters((xs) => (xs.includes(value) ? xs.filter((v) => v !== value) : [...xs, value]))
    afterFilterChange()
  }
  const toggleSecurityFilter = (value: SecurityFilterValue) => {
    setAppliedSecurityFilters((xs) => (xs.includes(value) ? xs.filter((v) => v !== value) : [...xs, value]))
    afterFilterChange()
  }
  const toggleSourceFilter = (value: string) => {
    setAppliedSourceFilters((xs) => (xs.includes(value) ? xs.filter((v) => v !== value) : [...xs, value]))
    afterFilterChange()
  }
  const clearAllFilters = () => {
    setAppliedCategoryFilters([])
    setAppliedSecurityFilters([])
    setAppliedSourceFilters([])
    afterFilterChange()
  }

  // ─── 生效筛选 chips（T2-4）───
  // 把四组 applied 过滤器摊平成可单独删除的 chip 列表（值已解析为可读 label），主视图据此渲染。
  type ActiveFilterChip = { id: string; label: string; remove: () => void }
  const activeFilterChips = createMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = []
    for (const value of appliedCategoryFilters()) {
      chips.push({
        id: `category:${value}`,
        label: itemFilterOptions.categoryLabel(value) || value,
        remove: () => toggleCategoryFilter(value),
      })
    }
    for (const value of appliedSourceFilters()) {
      chips.push({
        id: `source:${value}`,
        label: itemFilterOptions.sourceLabel(value) || value,
        remove: () => toggleSourceFilter(value),
      })
    }
    for (const value of appliedSecurityFilters()) {
      chips.push({
        id: `security:${value}`,
        label: itemFilterOptions.securityRiskGroupLabel(value) || value,
        remove: () => toggleSecurityFilter(value),
      })
    }
    return chips
  })

  const typeLabel = (value: string) => language.t(typeKey(value))

  // Aggregate stats for type-list hero
  const typeAggregate = createMemo(() => {
    const items = popularRaw()?.items ?? []
    return {
      total: popularRaw()?.total ?? 0,
      installs: items.reduce((s, i) => s + (i.installCount ?? 0), 0),
    }
  })

  // Shared view contract for the card grid / list view (StoreItemViewProps).
  const viewProps = createMemo<StoreItemViewProps>(() => ({
    rows: rows(),
    onRowClick: openItemDetail,
    typeLabel,
    typeColor: (value) => STORE_TYPES.find((entry) => entry.value === value)?.color,
    typeIcon: (value) => STORE_TYPES.find((entry) => entry.value === value)?.icon ?? "dot-grid",
    categoryLabel: (slug) => itemFilterOptions.categoryLabel(slug),
    formatSourceMetric,
    formatDate,
    searchQuery: debouncedSearch(),
    onToggleFavorite: (item) => void toggleRowFavorite(item),
    // Reactive favorite state per item id, decoupled from the item object so toggling does NOT
    // replace the item (which would rebuild the `<For>` row and the SubscribeButton instance).
    favoriteState: favStateOf,
    favoriteActionItemId: favoriteActionItemId(),
    isAuthenticated: !!auth.user() && !auth.loading(),
    favoriteLabels: {
      subscribe: language.t("store.detail.favorite"),
      subscribed: language.t("store.detail.unfavorite"),
      tooltip: language.t("store.detail.subscribeTooltip"),
    },
    emptyMessage: language.t("store.noResults"),
  }))

  // 筛选条 labels 以设计稿为准：分类 / 风险 / 来源（与表格列头/详情页共享的 key 解耦，
  // 用 home 专属 store.home.filters.* 避免改动别处文案）。
  const filterBarLabels = createMemo(() => ({
    category: language.t("store.home.filters.category"),
    security: language.t("store.home.filters.risk"),
    source: language.t("store.home.filters.source"),
    clear: language.t("store.home.filters.clear"),
    noOptions: language.t("store.noResults"),
    totalCount: (count: number) => language.t("store.home.filters.totalCount", { count }),
  }))

  return (
    <div class="flex min-h-full w-full flex-col">
      <Show
        when={isTypeListMode()}
        fallback={
          <>
            {/* ═══ HOME MODE ═══ */}
            {/* 顶栏底色对齐设计稿 .topbar：中性浅色半透明 + 毛玻璃 + 底部细边线（无 primary 蓝调），
                深浅主题均用 --native-* token 自适应。 */}
            <header class="relative overflow-hidden border-b border-[color:color-mix(in_srgb,var(--native-border)_50%,transparent)] bg-[color:color-mix(in_srgb,var(--native-panel)_85%,var(--native-bg))] backdrop-blur-[14px]">
              <div class="relative flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4 px-4 md:px-5 py-3 lg:gap-6">
                <div class="min-w-0 flex flex-col md:flex-row md:flex-1 md:items-center gap-0.5 md:gap-4">
                  <h1 class="relative m-0 shrink-0 text-[1.625rem] leading-[1.15] font-extrabold tracking-[-0.035em] text-[var(--native-foreground)]">
                    {language.t("store.home.hero.title")}
                  </h1>
                  <p class="relative m-0 hidden min-w-0 max-w-none lg:block lg:max-w-[38rem] text-[0.8125rem] font-semibold leading-6 text-[var(--native-muted)]">
                    {language.t("store.home.hero.description")}
                  </p>
                </div>

                <div class="flex flex-wrap sm:flex-nowrap shrink-0 items-center justify-start md:justify-end gap-2 md:gap-3 w-full md:w-auto pb-1 md:pb-0">
                  <div class="relative flex flex-nowrap items-center gap-0.5" role="tablist">
                    {/* sliding thumb：白底滑块（iOS segmented 风），1px 边框 + 轻阴影，跟随选中项滑动。
                        选中文字/图标用「管理」按钮同款主色蓝。 */}
                    <div
                      class="pointer-events-none absolute inset-y-0 z-0 rounded-[9px] border border-[color:color-mix(in_srgb,var(--native-border)_60%,transparent)] bg-[var(--native-panel)] shadow-[var(--native-shadow-sm)] transition-[transform,width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
                      style={{
                        transform: `translateX(${tabThumb().x}px)`,
                        width: `${tabThumb().w}px`,
                        opacity: tabThumb().w ? "1" : "0",
                      }}
                    />
                    <For each={statCards()}>
                      {(entry) => (
                        <button
                          ref={(el) => (tabEls[entry.value] = el)}
                          type="button"
                          role="tab"
                          class={cn(
                            "relative z-[1] flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[9px] px-3 py-[7px] text-[13px] font-bold transition-[color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                            entry.value === activeType()
                              ? "text-[var(--native-primary)]"
                              : "text-[color:color-mix(in_srgb,var(--native-muted)_88%,white)] hover:text-[var(--native-foreground)]",
                          )}
                          onClick={() => handleTypeChange(entry.value)}
                          aria-pressed={entry.value === activeType()}
                        >
                          <StoreIcon
                            name={entry.value}
                            size={15}
                            class="shrink-0 transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
                            style={{ color: entry.value === activeType() ? "var(--native-primary)" : entry.color }}
                          />
                          <span class="whitespace-nowrap">{language.t(entry.labelKey)}</span>
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
                          class="text-sm font-semibold leading-none !text-white hidden sm:inline"
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

            {/* 内容区随卡片/列式自然增高，整页滚动交给 StoreLayout；不再 flex-1/min-h-0 压高 */}
            <div class="flex min-w-0 flex-col">
              <div class="flex w-full py-4">
                <SearchControls />
              </div>

              <ContentShell />
            </div>
          </>
        }
      >
        {/* ═══ TYPE LIST MODE ═══ */}
        <div class="flex min-w-0 flex-col gap-4 max-[1280px]:gap-3">
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
              <p class="mt-1 text-[0.8125rem] font-semibold leading-[1.5] text-[var(--native-muted)]">
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
        {/* 居中列容器：第一行=搜索 + 控件，第二行（T2-4）=生效筛选 chips（仅有生效筛选时才渲染） */}
        <div class="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-[26px] max-[640px]:gap-2 max-[640px]:px-4">
        <div class="flex w-full items-center gap-3 max-[640px]:gap-2">
            {/* 搜索框：对齐设计稿 .search input（h 42 / rounded 13 / native-border / native-panel） */}
            <div class="relative min-w-0 flex-1 max-w-[560px] rounded-[13px] transition-shadow hover:shadow-[0_2px_6px_-3px_color-mix(in_srgb,var(--native-primary)_22%,rgba(15,23,42,0.3))] focus-within:shadow-[0_2px_6px_-3px_color-mix(in_srgb,var(--native-primary)_22%,rgba(15,23,42,0.3))]">
            <div class="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-[13px] text-[color:color-mix(in_srgb,var(--native-muted)_82%,white)]">
              <StoreIcon name="search" size={16} />
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
              class="h-[42px] w-full rounded-[13px] border border-[var(--native-border)] bg-[var(--native-panel)] pr-10 pl-10 text-sm font-medium !text-[var(--native-foreground)] caret-[var(--native-primary)] placeholder:font-normal placeholder:text-[color:color-mix(in_srgb,var(--native-muted)_72%,white)] transition-[border-color,box-shadow] focus-visible:border-[color:color-mix(in_srgb,var(--native-primary)_55%,transparent)] focus-visible:!text-[var(--native-foreground)] focus-visible:placeholder:text-[color:color-mix(in_srgb,var(--native-muted)_36%,white)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:color-mix(in_srgb,var(--native-primary)_15%,transparent)] focus-visible:ring-offset-0"
            />
            <Show when={searchText().length > 0}>
              <button
                type="button"
                aria-label={language.t("common.clear")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={clearSearchInput}
                class="absolute inset-y-0 right-0 flex h-full w-10 cursor-pointer items-center justify-center rounded-r-[13px] text-[color:color-mix(in_srgb,var(--native-muted)_78%,white)] transition-colors hover:text-[var(--native-foreground)]"
              >
                <StoreIcon name="x" size={16} />
              </button>
            </Show>
            </div>

          {/* 右侧控件组：显示Fork / 隐藏插件子集 / 排序 / 卡片|列式 seg 整体靠最右（对齐设计稿
              .right：margin-left:auto; display:flex; gap:10px）。搜索框 flex-1 占左、本组 ml-auto 居右。 */}
          <div class="ml-auto flex flex-wrap items-center justify-end gap-2">
          {/* 显示 Fork / 隐藏插件子集：对齐设计稿 .ftgl（h 34 / rounded 10 / border / bg-panel；on=主色） */}
          <button
            type="button"
            onClick={() => {
              setShowForks((v) => !v)
              setPage(1)
            }}
            aria-pressed={showForks()}
            title={language.t("store.home.showForks")}
            class="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-[10px] border px-3 text-[12.5px] font-bold transition-[color,border-color,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
            classList={{
              "border-[color:color-mix(in_srgb,var(--native-primary)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--native-primary)_10%,var(--native-panel))] text-[var(--native-primary)]":
                showForks(),
              "border-[var(--native-border)] bg-[var(--native-panel)] text-[var(--native-foreground)] hover:border-[var(--native-dim)] hover:text-[var(--native-foreground)]":
                !showForks(),
            }}
          >
            <StoreIcon name="layers" size={14} />
            <span class="max-[640px]:hidden">{language.t("store.home.showForks")}</span>
          </button>
          <button
            type="button"
            role="switch"
            aria-pressed={hideSubSkills()}
            onClick={toggleHideSubSkills}
            class="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-[10px] border px-3 text-[12.5px] font-bold transition-[color,border-color,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
            classList={{
              "border-[color:color-mix(in_srgb,var(--native-primary)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--native-primary)_10%,var(--native-panel))] text-[var(--native-primary)]":
                hideSubSkills(),
              "border-[var(--native-border)] bg-[var(--native-panel)] text-[var(--native-foreground)] hover:border-[var(--native-dim)] hover:text-[var(--native-foreground)]":
                !hideSubSkills(),
            }}
            title={hidePluginItemsLabel()}
          >
            <StoreIcon name={hideSubSkills() ? "check" : "layers"} size={14} />
            <span class="whitespace-nowrap max-[640px]:hidden">{hidePluginItemsLabel()}</span>
          </button>

          {/* 排序下拉：订阅最多 / 评分最高 / 最近更新（始终 desc）；触发器对齐设计稿 .fbtn。
              modal={false}：预防同类 scroll-lock（选排序也会 setPage(1) → 列表重挂），且与 page-size/
              列显隐下拉保持一致——不锁 body 滚动，点外部 / Esc 仍正常关闭。 */}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger
              as="button"
              class="inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] border border-[var(--native-border)] bg-[var(--native-panel)] px-3 text-[12.5px] font-bold text-[var(--native-foreground)] transition-[color,border-color,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[var(--native-dim)] hover:text-[var(--native-foreground)]"
            >
              <span class="whitespace-nowrap max-[640px]:hidden">{currentSortLabel()}</span>
              <StoreIcon name="caret" size={13} class="opacity-70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent class="w-44">
              <DropdownMenuRadioGroup value={sort.by} onChange={(value) => selectSort(value as ItemSort)}>
                <For each={SORT_OPTIONS}>
                  {(option) => (
                    <DropdownMenuRadioItem value={option.value}>
                      {language.t(option.labelKey)}
                    </DropdownMenuRadioItem>
                  )}
                </For>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 卡片/列式 seg：严格 1:1 复刻设计稿 .seg。
              外框 .seg = p-1 / rounded-12 / 1px native-border / bg-native-panel。
              thumb .seg-thumb = inset-y-1(top/bottom 4px) + 1px native-border + box-shadow:0 2px 8px -4px #0007
                + 背景 --panel-2（比 panel 明显更亮的一层）→ 用 native-surface，滑块才能"浮起来"；
                过渡 transform/width .42s ease（与设计稿一致，非 cubic-bezier）。left-0 为定位基准，由 measureSegThumb 驱动。
              button .seg button = rounded-9 / px-13 py-7 / 13px font-bold / gap-7 / transition-color .25s；
                选中 .on = text native-foreground（深色，非蓝；蓝是顶栏 tab）。 */}
          <div class="relative inline-flex shrink-0 items-center rounded-[12px] border border-[var(--native-border)] bg-[var(--native-panel)] p-1">
            <div
              class="pointer-events-none absolute inset-y-1 left-0 z-0 rounded-[9px] border border-[var(--native-border)] bg-[var(--native-surface)] shadow-[0_2px_8px_-4px_rgba(0,0,0,0.45)] transition-[transform,width] duration-[420ms] ease-out"
              style={{
                transform: `translateX(${segThumb().x}px)`,
                width: `${segThumb().w}px`,
                opacity: segThumb().w ? "1" : "0",
              }}
            />
            <button
              ref={(el) => (segEls.card = el)}
              type="button"
              aria-pressed={viewMode() === "card"}
              title={language.t("store.home.view.card")}
              onClick={() => setViewMode("card")}
              class={cn(
                "relative z-[1] inline-flex cursor-pointer items-center gap-[7px] rounded-[9px] px-[13px] py-[7px] text-[13px] font-bold transition-[color] duration-[250ms] ease-out",
                viewMode() === "card"
                  ? "text-[var(--native-foreground)]"
                  : "text-[var(--native-muted)] hover:text-[var(--native-foreground)]",
              )}
            >
              <StoreIcon name="grid" size={15} />
              <span class="whitespace-nowrap max-[640px]:hidden">{language.t("store.home.view.card")}</span>
            </button>
            <button
              ref={(el) => (segEls.list = el)}
              type="button"
              aria-pressed={viewMode() === "list"}
              title={language.t("store.home.view.list")}
              onClick={() => setViewMode("list")}
              class={cn(
                "relative z-[1] inline-flex cursor-pointer items-center gap-[7px] rounded-[9px] px-[13px] py-[7px] text-[13px] font-bold transition-[color] duration-[250ms] ease-out",
                viewMode() === "list"
                  ? "text-[var(--native-foreground)]"
                  : "text-[var(--native-muted)] hover:text-[var(--native-foreground)]",
              )}
            >
              <StoreIcon name="rows" size={15} />
              <span class="whitespace-nowrap max-[640px]:hidden">{language.t("store.home.view.list")}</span>
            </button>
          </div>
          </div>
          </div>

          {/* T2-4：生效筛选 chips 行。每个 chip = 值 + x（单独删除）；末尾「清除全部」。仅有生效筛选时渲染。 */}
          <Show when={activeFilterChips().length > 0}>
            <div class="flex w-full flex-wrap items-center gap-1.5">
              <span class="text-[12px] font-semibold text-[var(--native-muted)]">
                {language.t("store.home.activeFilters")}
              </span>
              <For each={activeFilterChips()}>
                {(chip) => (
                  <span class="inline-flex items-center gap-1 rounded-[var(--native-radius-full)] border border-[color:color-mix(in_srgb,var(--native-primary)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--native-primary)_8%,var(--native-panel))] py-0.5 pl-2.5 pr-1 text-[12px] font-semibold text-[var(--native-primary)]">
                    <span class="whitespace-nowrap">{chip.label}</span>
                    <button
                      type="button"
                      aria-label={language.t("common.clear")}
                      onClick={chip.remove}
                      class="inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--native-primary)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--native-primary)_18%,transparent)]"
                    >
                      <StoreIcon name="x" size={11} />
                    </button>
                  </span>
                )}
              </For>
              <button
                type="button"
                onClick={clearSearchAndFilters}
                class="inline-flex h-6 cursor-pointer items-center rounded-[var(--native-radius-full)] px-2 text-[12px] font-semibold text-[var(--native-muted)] transition-colors hover:text-[var(--native-foreground)]"
              >
                {language.t("store.home.clearFilters")}
              </button>
            </div>
          </Show>
        </div>
      </section>
    )
  }

  function ContentShell() {
    return (
      <section class={sx.section}>
        {/* 居中容器，对齐设计稿 .wrap（max-width:1200px; padding:0 26px），修掉列表过宽。
            注意：列表区随内容自然增高，整页滚动交给 StoreLayout 的 overflow-y-auto；
            这里不再用 flex-1 / min-h-0 压列表高度（那会把卡片裁掉、把分页器顶到中间被遮挡）。 */}
        <div class="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-[26px] pb-6 max-[640px]:px-4">
        {/* 独立筛选条：分类/风险/来源 下拉 + chips + 清除 + 共 N 个 */}
        <StoreFilterBar
          category={{
            options: categories().map((category) => ({
              value: category.slug,
              label: itemFilterOptions.categoryLabel(category.slug, category),
            })),
            appliedValues: appliedCategoryFilters(),
            toggle: toggleCategoryFilter,
            reset: () => {
              setAppliedCategoryFilters([])
              afterFilterChange()
            },
          }}
          security={{
            options: securityOptions().map((option) => ({
              value: option.value,
              label: itemFilterOptions.securityRiskGroupLabel(option.value as SecurityFilterValue, option),
            })),
            appliedValues: appliedSecurityFilters(),
            toggle: (value) => toggleSecurityFilter(value as SecurityFilterValue),
            reset: () => {
              setAppliedSecurityFilters([])
              afterFilterChange()
            },
          }}
          source={{
            options: sourceOptions().map((source) => ({
              value: source.value,
              label: itemFilterOptions.sourceLabel(source.value, source) || source.value,
            })),
            appliedValues: appliedSourceFilters(),
            toggle: toggleSourceFilter,
            reset: () => {
              setAppliedSourceFilters([])
              afterFilterChange()
            },
          }}
          totalItems={totalItems()}
          onClearAll={clearAllFilters}
          labels={filterBarLabels()}
        />

        {/* T2-1：刷新错误（有缓存但本次请求失败）→ 非阻断提示条，保留旧数据继续显示，提供「重试」。 */}
        <Show when={refreshError()}>
          <div class={sx.refreshBar}>
            <span class="inline-flex items-center gap-1.5">
              <Icon name="warning" class="size-4" style={{ color: "#dc2626" }} />
              {language.t("store.home.refreshFailed")}
            </span>
            <button type="button" onClick={() => void refetchList()} class={sx.stateRetry}>
              <Icon name="reset" class="size-3.5" style={{ color: "#dc2626" }} />
              {language.t("common.retry")}
            </button>
          </div>
        </Show>

        {/* 列表区：relative 定位仅用于承载 loading 半透明遮罩（absolute inset-0），
            最小高度保证空态/加载态不塌陷；不抢占整页滚动。 */}
        <div class="relative min-h-[18rem]">
          <Show
            when={!showError()}
            fallback={
              /* T2-7 fatal error：警示色 + 图标 + 可见「重试」按钮。 */
              <div class={sx.stateBox}>
                <Icon name="warning" class="size-7" style={{ color: "#dc2626" }} />
                <div class={sx.stateError}>
                  {listError() || language.t("store.console.capabilities.toast.loadFailed")}
                </div>
                <button type="button" onClick={() => void refetchList()} class={sx.stateRetry}>
                  <Icon name="reset" class="size-3.5" style={{ color: "#dc2626" }} />
                  {language.t("common.retry")}
                </button>
              </div>
            }
          >
            <Show
              when={listCache() !== null || !list.loading}
              fallback={
                /* T2-7 loading：骨架行（与 error/empty 的居中图标态明显不同）。 */
                <div class="flex flex-col gap-2 py-2" aria-busy="true">
                  <For each={Array.from({ length: 6 })}>{() => <div class={sx.skeletonRow} />}</For>
                </div>
              }
            >
              <Show when={list.loading && listCache() !== null}>
                <div class={sx.overlay}>
                  <div class={sx.spinner} />
                </div>
              </Show>
              {/* T2-3 + T2-7 empty：区分「搜索/筛选无匹配」与「分类本身为空」，并给可区分的中性视觉。 */}
              <Show
                when={rows().length > 0}
                fallback={
                  <div class={sx.stateBox}>
                    <Show
                      when={hasActiveQuery()}
                      fallback={
                        <>
                          <Icon name="inbox" class={cn("size-7", sx.stateEmptyIcon)} />
                          <div class={sx.stateEmpty}>{language.t("store.home.emptyCategory")}</div>
                        </>
                      }
                    >
                      <Icon name="magnifying-glass" class={cn("size-7", sx.stateEmptyIcon)} />
                      <div class={sx.stateEmpty}>
                        {debouncedSearch()
                          ? language.t("store.home.noMatch", { query: debouncedSearch() })
                          : language.t("store.home.noMatchFilters")}
                      </div>
                      <button type="button" onClick={clearSearchAndFilters} class={sx.stateClear}>
                        {language.t("store.home.clearFilters")}
                      </button>
                    </Show>
                  </div>
                }
              >
                {/* 入场动画：筛选/排序/搜索使「已生效查询」变化并取回新数据后，listAnimEpoch 自增，
                    下面的 keyed <Show> 把列表子树重挂一次，子项各自播放 store-row-enter（stagger）。
                    卡片⇄列式切换不经过这里（走 withViewTransition 共享元素），两套动画互不干扰。 */}
                <style>{STORE_LIST_ENTER_CSS}</style>
                {/* keyed 用 epoch+1 保证始终为真值（首屏也渲染）；epoch 变化时整子树重挂以触发入场。 */}
                <Show keyed when={listAnimEpoch() + 1}>
                  <div data-store-list-enter={listEnterActive() ? "" : undefined}>
                    {/* 卡片 / 列式 视图（共用 StoreItemViewProps 契约，由 viewMode 切换） */}
                    <Show when={viewMode() === "card"} fallback={<StoreListView {...viewProps()} />}>
                      <StoreCardGrid {...viewProps()} />
                    </Show>
                  </div>
                </Show>
              </Show>
            </Show>
          </Show>
        </div>

        <StoreTableFooter
          page={page()}
          pageSize={pageSize()}
          totalPages={totalPages()}
          totalItems={totalItems()}
          summary={formatStoreTablePaginationSummary({
            page: page(),
            pageSize: pageSize(),
            totalItems: totalItems(),
            showingLabel: (args) => language.t("store.console.capabilities.showing", args),
            emptyLabel: language.t("store.home.pagination.empty"),
          })}
          onPageChange={handlePageChange}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
        />
        </div>
      </section>
    )
  }
}
