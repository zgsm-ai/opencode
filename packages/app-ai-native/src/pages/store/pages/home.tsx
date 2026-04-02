import { createEffect, createMemo, createResource, createSignal, For, Show, Suspense } from "solid-js"
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
import { itemApi, type CapabilityItem } from "../lib/api"
import { categoryKey, typeKey } from "../lib/constants"
import ItemDetailContent, { getInstallCommand } from "../components/item-detail-content"
import SecurityTag from "../components/security-tag"
import { Icon, type IconProps } from "@opencode-ai/ui/icon"

const STORE_TYPES = [
  { value: "skill", labelKey: "store.sidebar.nav.skills", icon: "sparkles" as IconProps["name"] },
  { value: "subagent", labelKey: "store.sidebar.nav.subagents", icon: "brain" as IconProps["name"] },
  { value: "command", labelKey: "store.sidebar.nav.commands", icon: "console" as IconProps["name"] },
  { value: "mcp", labelKey: "store.sidebar.nav.mcpServers", icon: "mcp" as IconProps["name"] },
] as const

type StoreType = (typeof STORE_TYPES)[number]["value"]

const BEST_PRACTICE_CARDS = [
  {
    titleKey: "store.home.bestPractices.card1.title",
    descriptionKey: "store.home.bestPractices.card1.description",
    icon: "sparkles" as IconProps["name"],
  },
  {
    titleKey: "store.home.bestPractices.card2.title",
    descriptionKey: "store.home.bestPractices.card2.description",
    icon: "server" as IconProps["name"],
  },
  {
    titleKey: "store.home.bestPractices.card3.title",
    descriptionKey: "store.home.bestPractices.card3.description",
    icon: "shield" as IconProps["name"],
  },
  {
    titleKey: "store.home.bestPractices.card4.title",
    descriptionKey: "store.home.bestPractices.card4.description",
    icon: "store" as IconProps["name"],
  },
] as const

const PAGE_SIZE = 10
const CATEGORY_SEED_SIZE = 100

function formatDate(iso?: string) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

function rangePages(page: number, totalPages: number) {
  const size = 5
  if (totalPages <= size) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const start = Math.max(1, Math.min(page - 2, totalPages - size + 1))
  return Array.from({ length: size }, (_, i) => start + i)
}

export default function Home() {
  const language = useLanguage()
  const [activeType, setActiveType] = createSignal<StoreType>("skill")
  const [activeCategory, setActiveCategory] = createSignal("all")
  const [page, setPage] = createSignal(1)
  const [selectedItemId, setSelectedItemId] = createSignal<string | null>(null)
  const [copiedItemId, setCopiedItemId] = createSignal<string | null>(null)
  const [searchText, setSearchText] = createSignal("")
  const [debouncedSearch, setDebouncedSearch] = createSignal("")
  const [listCache, setListCache] = createSignal<Awaited<ReturnType<typeof itemApi.list>> | null>(null)
  const [seedCache, setSeedCache] = createSignal<Awaited<ReturnType<typeof itemApi.list>> | null>(null)

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
    category: activeCategory() === "all" ? undefined : activeCategory(),
    search: debouncedSearch() || undefined,
    page: page(),
    pageSize: PAGE_SIZE,
  }))

  const categoryParams = createMemo(() => ({
    type: activeType(),
    page: 1,
    pageSize: CATEGORY_SEED_SIZE,
  }))

  const [list] = createResource(listParams, (params) => itemApi.list(params))
  const [categorySeed] = createResource(categoryParams, (params) => itemApi.list(params))
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
  const listData = createMemo(() => list.latest ?? listCache())
  const seedData = createMemo(() => categorySeed.latest ?? seedCache())

  createEffect(() => {
    const data = list.latest
    if (data) setListCache(data)
  })

  createEffect(() => {
    const data = categorySeed.latest
    if (data) setSeedCache(data)
  })

  const categories = createMemo(() => {
    const items = seedData()?.items ?? []
    const unique = Array.from(new Set(items.map((item) => item.category).filter(Boolean)))
    return ["all", ...unique]
  })

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
    if (activeCategory() !== "all" && !categories().includes(activeCategory())) {
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

  const handleTypeChange = (type: StoreType) => {
    if (type === activeType()) return
    setActiveType(type)
    setActiveCategory("all")
    setSearchText("")
    setDebouncedSearch("")
    setPage(1)
    setSelectedItemId(null)
  }

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

  const copyInstall = async (item: CapabilityItem) => {
    await navigator.clipboard.writeText(getInstallCommand(item))
    setCopiedItemId(item.id)
    setTimeout(() => {
      setCopiedItemId((cur) => (cur === item.id ? null : cur))
    }, 2000)
  }

  return (
    <div class="store-page min-h-full px-8 py-8">
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
                  <div class="store-stat-card-head">
                    <span>{language.t(entry.labelKey)}</span>
                    <Icon name={entry.icon} />
                  </div>
                  <p class="store-stat-card-value">
                    <Show when={entry.total !== null} fallback="—">
                      {entry.total?.toLocaleString()}
                    </Show>
                  </p>
                </article>
              )}
            </For>
          </div>
        </section>

        <section class="store-section">
          <div class="store-section-heading">
            <div>
              <h2 class="store-section-title">{language.t("store.home.bestPractices.title")}</h2>
              <p class="store-section-subtitle">{language.t("store.home.bestPractices.description")}</p>
            </div>
          </div>
          <div class="store-best-practice-grid">
            <For each={BEST_PRACTICE_CARDS}>
              {(card) => (
                <article class="store-best-practice-card">
                  <div class="store-best-practice-icon">
                    <Icon name={card.icon} />
                  </div>
                  <h3>{language.t(card.titleKey)}</h3>
                  <p>{language.t(card.descriptionKey)}</p>
                </article>
              )}
            </For>
          </div>
        </section>

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

        <section class="store-section store-content-shell">
          <div class="store-section-heading">
            <div>
              <h2 class="store-section-title">{language.t(typeMeta().labelKey)}</h2>
              <p class="store-section-subtitle">{language.t("store.home.categoryTabs.description")}</p>
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
                    : language.t(categoryKey(activeCategory()))}
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
                <DropdownMenuContent>
                  <For each={categories()}>
                    {(category) => (
                      <DropdownMenuCheckboxItem
                        checked={category === activeCategory()}
                        onChange={() => handleCategoryChange(category)}
                      >
                        {category === "all"
                          ? language.t("store.console.filters.all")
                          : language.t(categoryKey(category))}
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
                  <div class="store-table-loading-overlay">{language.t("store.loading")}</div>
                </Show>
                <Table class="store-data-table">
                  <TableHeader>
                    <TableRow class="store-data-table-head-row">
                      <TableHead>{language.t("store.console.capabilities.name")}</TableHead>
                      <TableHead>{language.t("store.home.table.favoriteCount")}</TableHead>
                      <TableHead>{language.t("store.home.table.installCount")}</TableHead>
                      <TableHead>{language.t("store.home.table.previewCount")}</TableHead>
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
                              {item.category ? language.t(categoryKey(item.category)) : "—"}
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
                                  <DropdownMenuItem onClick={() => copyInstall(item)}>
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
      </div>

      <Sheet open={detailOpen()} onOpenChange={(open) => !open && setSelectedItemId(null)} modal={false}>
        <SheetContent position="right" class="store-detail-sheet w-[min(48rem,92vw)] sm:max-w-none">
          <SheetHeader class="sr-only">
            <SheetTitle>{language.t("store.home.detail.title")}</SheetTitle>
            <SheetDescription>{language.t("store.home.detail.description")}</SheetDescription>
          </SheetHeader>
          <Show when={selectedItemId()}>
            {(itemId) => (
              <Suspense fallback={<div class="flex justify-center py-16 text-muted-foreground">{language.t("store.loading")}</div>}>
                <ItemDetailContent itemId={itemId()} class="store-detail-content custom-scrollbar" />
              </Suspense>
            )}
          </Show>
        </SheetContent>
      </Sheet>
    </div>
  )
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
