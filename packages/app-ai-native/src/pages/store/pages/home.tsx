import { createEffect, createMemo, createResource, createSignal, For, Show, Suspense } from "solid-js"
import { createStore } from "solid-js/store"
import { useSearchParams } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { TextField, TextFieldInput } from "@/components/ui/text-field"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { behaviorApi, categoryApi, itemApi, type Category, type CapabilityItem, type ItemOrder, type ItemSort } from "../lib/api"
import { typeKey } from "../lib/constants"
import ItemDetailContent, { getInstallCommand } from "../components/item-detail-content"
import SecurityTag from "../components/security-tag"
import BestPracticeCarousel from "../components/best-practice-carousel"
import { Icon, type IconProps } from "@opencode-ai/ui/icon"
import { LocalIcon } from "@/components/local-icon"
import { useAuth } from "../hooks/use-auth"

const STORE_TYPES = [
  { value: "skill", labelKey: "store.sidebar.nav.skills", descKey: "store.home.type.skill.description", icon: "sparkles" as IconProps["name"], color: "#F59E0B" },
  { value: "subagent", labelKey: "store.sidebar.nav.subagents", descKey: "store.home.type.subagent.description", icon: "brain" as IconProps["name"], color: "#3b82f6" },
  { value: "command", labelKey: "store.sidebar.nav.commands", descKey: "store.home.type.command.description", icon: "console" as IconProps["name"], color: "#10B981" },
  { value: "mcp", labelKey: "store.sidebar.nav.mcpServers", descKey: "store.home.type.mcp.description", icon: "mcp" as IconProps["name"], color: "#8B5CF6" },
] as const

type StoreType = (typeof STORE_TYPES)[number]["value"]
type ListData = Awaited<ReturnType<typeof itemApi.list>>

const PAGE_SIZE = 10
const SORTS = [
  ["favoriteCount", "store.home.table.favoriteCount"],
  ["installCount", "store.home.table.installCount"],
  ["previewCount", "store.home.table.previewCount"],
] as const satisfies readonly [ItemSort, string][]

function formatDate(iso?: string) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

function formatCompact(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(1) + "k"
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
  const [searchParams] = useSearchParams()

  const initialType = () => {
    const t = searchParams.type as StoreType | undefined
    return STORE_TYPES.some((e) => e.value === t) ? t! : "skill"
  }

  const [activeType, setActiveType] = createSignal<StoreType>(initialType())
  const [activeCategory, setActiveCategory] = createSignal("all")
  const [page, setPage] = createSignal(1)
  const [selectedItemId, setSelectedItemId] = createSignal<string | null>(null)
  const [copiedItemId, setCopiedItemId] = createSignal<string | null>(null)
  const [searchText, setSearchText] = createSignal("")
  const [debouncedSearch, setDebouncedSearch] = createSignal("")
  const [listCache, setListCache] = createSignal<{ key: string; data: ListData } | null>(null)
  const [sort, setSort] = createStore<{ by?: ItemSort; order?: ItemOrder }>({})
  const [detailItem, setDetailItem] = createSignal<CapabilityItem | null>(null)
  const [favoritePending, setFavoritePending] = createSignal(false)
  const [favorited, setFavorited] = createSignal(false)
  const [favoriteCount, setFavoriteCount] = createSignal(0)
  const [previewCount, setPreviewCount] = createSignal(0)
  const [installCount, setInstallCount] = createSignal(0)
  const [trackedItemId, setTrackedItemId] = createSignal<string | null>(null)

  const [allCategories] = createResource(() => categoryApi.list().catch(() => [] as Category[]))

  const categoryName = (cat: Category) => {
    const locale = language.locale()
    return cat.names[locale] || cat.names.en || cat.slug
  }

  let searchTimer: ReturnType<typeof setTimeout> | undefined
  const handleSearchInput = (value: string) => {
    setSearchText(value)
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      setDebouncedSearch(value.trim())
      setPage(1)
      setSelectedItemId(null)
    }, 300)
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
    category: activeCategory() === "all" ? undefined : activeCategory(),  // slug
    search: debouncedSearch() || undefined,
    page: page(),
    pageSize: PAGE_SIZE,
    sortBy: sort.by,
    sortOrder: sort.order,
  }))

  const listKey = createMemo(() => JSON.stringify(listParams()))
  const listSrc = createMemo(() => ({ key: listKey(), params: listParams() }))
  const [list] = createResource(listSrc, async (src) => ({ key: src.key, data: await itemApi.list(src.params) }))
  const [stats] = createResource(async () =>
    Object.fromEntries(
      await Promise.all(
        STORE_TYPES.map(
          async (entry) =>
            [entry.value, (await itemApi.list({ type: entry.value, page: 1, pageSize: 1 })).total] as const,
        ),
      ),
    ),
  )

  const typeMeta = createMemo(() => STORE_TYPES.find((entry) => entry.value === activeType()) ?? STORE_TYPES[0])
  const isTypeListMode = createMemo(() => !!searchParams.type && STORE_TYPES.some((e) => e.value === searchParams.type))

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

  const categories = createMemo(() => allCategories() ?? [])

  const rows = createMemo(() => listData()?.items ?? [])
  const totalItems = createMemo(() => listData()?.total ?? 0)
  const totalPages = createMemo(() => Math.max(1, Math.ceil(totalItems() / PAGE_SIZE)))
  const visiblePages = createMemo(() => rangePages(page(), totalPages()))
  const listError = createMemo(() => (list.error instanceof Error ? list.error.message : ""))
  const showError = createMemo(() => !!listError() && rows().length === 0)
  const detailOpen = createMemo(() => !!selectedItemId())

  createEffect(() => {
    if (page() > totalPages()) setPage(totalPages())
  })

  createEffect(() => {
    if (activeCategory() !== "all" && !categories().some((c) => c.slug === activeCategory())) {
      setActiveCategory("all")
      setPage(1)
      setSelectedItemId(null)
    }
  })

  const statCards = createMemo(() =>
    STORE_TYPES.map((entry) => ({
      ...entry,
      total: stats()?.[entry.value] ?? null,
    })),
  )

  const resetToType = (type: StoreType) => {
    setListCache(null)
    setActiveType(type)
    setActiveCategory("all")
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

  const handleCategoryChange = (category: string) => {
    if (category === activeCategory()) return
    setActiveCategory(category)
    setPage(1)
    setSelectedItemId(null)
  }

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
    <div class="store-page min-h-full" style={{ "max-width": "1100px", margin: "0 auto", padding: "1.5rem 1.75rem 3rem" }}>
      <Show
        when={isTypeListMode()}
        fallback={
          <>
            {/* ═══ HOME MODE ═══ */}
            <header class="store-page-header">
              <div>
                <h1 class="store-page-title">{language.t("store.home.hero.title")}</h1>
                <p class="store-page-description">{language.t("store.home.hero.description")}</p>
              </div>
            </header>

            <div class="store-page-main">
              <section class="store-section">
                <div class="store-stat-grid">
                  <For each={statCards()}>
                    {(entry) => (
                      <article class="store-stat-card" data-stat={entry.value}>
                        <div class="store-stat-card-icon">
                          <Icon name={entry.icon} />
                        </div>
                        <div>
                          <div class="store-stat-card-label">{language.t(entry.labelKey)}</div>
                          <p class="store-stat-card-value">
                            <Show when={entry.total !== null} fallback="—">
                              {entry.total?.toLocaleString()}
                            </Show>
                          </p>
                        </div>
                      </article>
                    )}
                  </For>
                </div>
              </section>

              <BestPracticeCarousel activeType={activeType} onSelectItem={setSelectedItemId} />

              <section class="store-section">
                <div class="store-type-tabs" role="tablist" aria-label={language.t("store.home.mainTabsLabel")}>
                  <For each={STORE_TYPES}>
                    {(entry) => (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={entry.value === activeType()}
                        class={`store-type-tab ${entry.value === activeType() ? "store-type-tab-active" : ""}`}
                        onClick={() => handleTypeChange(entry.value)}
                      >
                        {language.t(entry.labelKey)}
                      </button>
                    )}
                  </For>
                </div>
              </section>

              {/* Home mode content shell */}
              <ContentShell />
            </div>
          </>
        }
      >
        {/* ═══ TYPE LIST MODE ═══ */}
        <div class="store-page-main">
          {/* Type Hero Header */}
          <header class="tp-hero" style={{ "--tp-accent": typeMeta().color }}>
            <div class="tp-hero-icon">
              <Icon name={typeMeta().icon} />
            </div>
            <div class="tp-hero-text">
              <h1 class="tp-hero-title">{language.t(typeMeta().labelKey)}</h1>
              <p class="tp-hero-desc">{language.t(typeMeta().descKey)}</p>
            </div>
            <div class="tp-hero-stats">
              <div class="tp-hstat">
                <div class="tp-hstat-val">{typeAggregate().total.toLocaleString()}</div>
                <div class="tp-hstat-label">{language.t("store.typeList.stat.total")}</div>
              </div>
              <div class="tp-hstat">
                <div class="tp-hstat-val">{formatCompact(typeAggregate().installs)}</div>
                <div class="tp-hstat-label">{language.t("store.typeList.stat.installs")}</div>
              </div>
            </div>
          </header>

          {/* Popular Cards (Top 3) */}
          <section class="store-section">
            <div class="store-section-heading">
              <div>
                <h2 class="store-section-title">{language.t("store.typeList.popular", { type: language.t(typeMeta().labelKey) })}</h2>
                <p class="store-section-subtitle">{language.t("store.typeList.popularSub")}</p>
              </div>
            </div>
            <div class="tp-featured" style={{ "--tp-accent": typeMeta().color }}>
              <For each={popularItems()}>
                {(item, idx) => (
                  <article class="tp-fcard" onClick={() => setSelectedItemId(item.id)}>
                    <span class="tp-fcard-rank">#{idx() + 1}</span>
                    <div class="tp-fcard-icon">
                      <Icon name={typeMeta().icon} />
                    </div>
                    <div class="tp-fcard-info">
                      <div class="tp-fcard-name">{item.name}</div>
                      <div class="tp-fcard-meta">
                        <span><LocalIcon name="star" size="small" />{(item.favoriteCount ?? 0).toLocaleString()}</span>
                        <span><LocalIcon name="download" size="small" />{(item.installCount ?? 0).toLocaleString()}</span>
                      </div>
                    </div>
                    <Show when={item.category}>
                      <span class="tp-fcard-cat">{categories().find((c) => c.slug === item.category)
                        ? categoryName(categories().find((c) => c.slug === item.category)!)
                        : item.category}</span>
                    </Show>
                  </article>
                )}
              </For>
            </div>
          </section>

          {/* Type list content shell */}
          <ContentShell />
        </div>
      </Show>

      <Sheet open={detailOpen()} onOpenChange={(open) => !open && setSelectedItemId(null)} modal={false}>
        <SheetContent position="right" class="store-detail-sheet w-[min(48rem,92vw)] sm:max-w-none">
          <SheetHeader class="sr-only">
            <SheetTitle>{language.t("store.home.detail.title")}</SheetTitle>
            <SheetDescription>{language.t("store.home.detail.description")}</SheetDescription>
          </SheetHeader>
          <Show when={selectedItemId()}>
            {(itemId) => (
              <Suspense fallback={<div class="flex justify-center py-16 text-muted-foreground">{language.t("store.loading")}</div>}>
                <ItemDetailContent
                  itemId={itemId()}
                  class="store-detail-content custom-scrollbar"
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

  // Shared content shell: table, search, category filter, pagination
  function ContentShell() {
    const tableTitle = () =>
      isTypeListMode()
        ? language.t("store.typeList.allItems", { type: language.t(typeMeta().labelKey) })
        : language.t(typeMeta().labelKey)

    const tableSub = () =>
      isTypeListMode()
        ? language.t("store.typeList.itemsAvailable", { count: totalItems() })
        : language.t(typeMeta().descKey)

    return (
      <section class="store-section store-content-shell">
        <div class="store-section-heading">
          <div>
            <h2 class="store-section-title">{tableTitle()}</h2>
            <p class="store-section-subtitle">{tableSub()}</p>
          </div>
          <div class="flex items-center gap-2">
            <TextField class="w-48">
              <TextFieldInput
                type="search"
                placeholder={language.t(searchPlaceholderKey())}
                value={searchText()}
                onInput={(e: InputEvent) => handleSearchInput((e.currentTarget as HTMLInputElement).value)}
                class="h-8 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </TextField>
            <DropdownMenu placement="bottom-end">
              <DropdownMenuTrigger as={Button<"button">} variant="outline" size="sm">
                {activeCategory() === "all"
                  ? language.t("store.console.capabilities.category")
                  : categories().find((c) => c.slug === activeCategory())
                    ? categoryName(categories().find((c) => c.slug === activeCategory())!)
                    : activeCategory()}
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
                  <path d="M6 9l6 6l6 -6" />
                </svg>
              </DropdownMenuTrigger>
              <DropdownMenuContent class="max-h-72 overflow-y-auto">
                <DropdownMenuCheckboxItem
                  checked={activeCategory() === "all"}
                  onChange={() => handleCategoryChange("all")}
                >
                  {language.t("store.console.filters.all")}
                </DropdownMenuCheckboxItem>
                <For each={categories()}>
                  {(cat) => (
                    <DropdownMenuCheckboxItem
                      checked={cat.slug === activeCategory()}
                      onChange={() => handleCategoryChange(cat.slug)}
                    >
                      {categoryName(cat)}
                    </DropdownMenuCheckboxItem>
                  )}
                </For>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div class="store-table-shell">
          <Show
            when={!showError()}
            fallback={
              <div class="store-table-state">
                {listError() || language.t("store.console.capabilities.toast.loadFailed")}
              </div>
            }
          >
            <Show
              when={rows().length > 0 || !list.loading}
              fallback={<div class="store-table-state">{language.t("store.loading")}</div>}
            >
              <Show when={list.loading && rows().length > 0}>
                <div class="store-table-loading-overlay">
                  <div class="store-table-loading-spinner" />
                </div>
              </Show>
              <Table class="store-data-table">
                <TableHeader>
                  <TableRow class="store-data-table-head-row">
                    <TableHead>{language.t("store.console.capabilities.name")}</TableHead>
                    <For each={SORTS}>
                      {([by, label]) => (
                        <TableHead aria-sort={sortState(by)}>
                          <button
                            type="button"
                            class={`store-sort-btn ${sort.by === by ? "store-sort-btn-active" : ""}`}
                            onClick={() => handleSortChange(by)}
                          >
                            <span>{language.t(label)}</span>
                            <span class="store-sort-icon" aria-hidden="true">
                              <span
                                class={`store-sort-arrow store-sort-arrow-up ${sort.by === by && sort.order === "asc" ? "store-sort-arrow-active" : ""}`}
                              />
                              <span
                                class={`store-sort-arrow store-sort-arrow-down ${sort.by === by && sort.order === "desc" ? "store-sort-arrow-active" : ""}`}
                              />
                            </span>
                          </button>
                        </TableHead>
                      )}
                    </For>
                    <TableHead class="store-col-category">
                      {language.t("store.console.capabilities.category")}
                    </TableHead>
                    <TableHead>{language.t("store.scanResults.securityScan")}</TableHead>
                    <TableHead class="store-col-updated">{language.t("store.detail.updated")}</TableHead>
                    <TableHead class="store-col-action text-right">{language.t("store.home.table.action")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <Show
                    when={rows().length > 0}
                    fallback={<TableEmptyState colSpan={8} message={language.t("store.home.emptyCategory")} />}
                  >
                    <For each={rows()}>
                      {(item) => (
                        <TableRow class="store-data-table-row cursor-pointer" onClick={() => setSelectedItemId(item.id)}>
                          <TableCell>
                            <span class="store-item-name">{item.name}</span>
                          </TableCell>
                          <TableCell class="store-data-table-muted">
                            {item.favoriteCount?.toLocaleString() ?? "0"}
                          </TableCell>
                          <TableCell class="store-data-table-muted">
                            {item.installCount?.toLocaleString() ?? "0"}
                          </TableCell>
                          <TableCell class="store-data-table-muted">
                            {item.previewCount?.toLocaleString() ?? "0"}
                          </TableCell>
                          <TableCell class="store-col-category store-data-table-muted">
                            {item.category
                              ? categories().find((c) => c.slug === item.category)
                                ? categoryName(categories().find((c) => c.slug === item.category)!)
                                : item.category
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <SecurityTag status={item.securityStatus} />
                          </TableCell>
                          <TableCell class="store-col-updated store-data-table-muted">
                            {formatDate(item.updatedAt)}
                          </TableCell>
                          <TableCell class="store-col-action text-right" onClick={(e: MouseEvent) => e.stopPropagation()}>
                            <DropdownMenu placement="bottom-end">
                              <DropdownMenuTrigger
                                as={Button<"button">}
                                variant="ghost"
                                class="size-8 p-0"
                              >
                                <span class="sr-only">{language.t("store.home.table.action")}</span>
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
                                  <circle cx="12" cy="12" r="1" />
                                  <circle cx="12" cy="5" r="1" />
                                  <circle cx="12" cy="19" r="1" />
                                </svg>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <DropdownMenuItem class="justify-center" onClick={() => copyInstall(item)}>
                                  {copiedItemId() === item.id
                                    ? language.t("store.itemCard.copied")
                                    : language.t("store.home.table.copyInstall")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
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

        <div class="store-pagination">
          <div class="store-pagination-summary">
            <Show when={totalItems() > 0} fallback={language.t("store.home.pagination.empty")}>
              {language.t("store.console.capabilities.showing", {
                from: Math.min((page() - 1) * PAGE_SIZE + 1, totalItems()),
                to: Math.min(page() * PAGE_SIZE, totalItems()),
                total: totalItems(),
              })}
            </Show>
          </div>
          <div class="store-pagination-actions">
            <button class="store-page-btn" disabled={page() <= 1} onClick={() => handlePageChange(page() - 1)}>
              <Icon name="chevron-left" />
            </button>
            <For each={visiblePages()}>
              {(pageNumber) => (
                <button
                  class={`store-page-btn ${pageNumber === page() ? "store-page-btn-active" : ""}`}
                  onClick={() => handlePageChange(pageNumber)}
                >
                  {pageNumber}
                </button>
              )}
            </For>
            <button
              class="store-page-btn"
              disabled={page() >= totalPages()}
              onClick={() => handlePageChange(page() + 1)}
            >
              <Icon name="chevron-right" />
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
      <TableCell colSpan={props.colSpan}>
        <div class="store-table-state">{props.message}</div>
      </TableCell>
    </TableRow>
  )
}
