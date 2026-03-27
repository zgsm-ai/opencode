import { createMemo, createEffect, on, onMount, onCleanup, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useAuth } from "../hooks/use-auth"
import { itemApi, type CapabilityItem } from "../lib/api"
import { useRepoFilter } from "../context/repo-filter"
import { useRepoItems } from "../hooks/use-repo-items"
import ItemCard from "../components/item-card"
import SearchBar from "../components/search-bar"
import { StoreCreateButton } from "../components/store-create"
import { useLanguage } from "@/context/language"
import { CategoryFilter } from "../components/category-filter"

const PER_PAGE = 24

export default function Commands() {
  const language = useLanguage()
  const { selectedRepo } = useRepoFilter()
  const { user } = useAuth()
  const [refreshKey, setRefreshKey] = createStore({ value: 0 })
  const repoSelection = () => {
    refreshKey.value
    const repo = selectedRepo()
    return repo ? { ...repo } : null
  }
  const { items: repoItems, loading: repoLoading } = useRepoItems(repoSelection, "command")

  // Global mode: server-side pagination with search
  const [state, setState] = createStore({
    items: [] as CapabilityItem[],
    total: 0,
    hasMore: false,
    loading: true,
    category: "all",
    search: "",
    page: 1,
  })

  let sentinel: HTMLDivElement | undefined

  async function load(reset: boolean) {
    setState("loading", true)
    try {
      const page = reset ? 1 : state.page
      const res = await itemApi.list({
        type: "command",
        search: state.search || undefined,
        pageSize: PER_PAGE,
        page,
      })
      setState({
        items: reset ? res.items : [...state.items, ...res.items],
        total: res.total,
        hasMore: res.hasMore,
        page: reset ? 2 : state.page + 1,
        loading: false,
      })
    } catch {
      setState("loading", false)
    }
  }

  // Reset and reload when not in repository mode or category changes
  createEffect(
    on(
      () => [selectedRepo(), state.category] as const,
      ([repo]) => {
        if (repo) return
        setState("page", 1)
        void load(true)
      },
    ),
  )

  onMount(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !selectedRepo() && state.hasMore && !state.loading) {
          load(false)
        }
      },
      { threshold: 0.1, rootMargin: "100px" },
    )
    if (sentinel) observer.observe(sentinel)
    onCleanup(() => observer.disconnect())
  })

  const isRepo = () => !!selectedRepo()

  const source = () => (isRepo() ? repoItems() : state.items)

  const categories = createMemo(() => {
    const counts = new Map<string, number>()
    for (const item of source()) {
      if (item.category) counts.set(item.category, (counts.get(item.category) || 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count)
  })

  const repoFiltered = createMemo(() => {
    let items = repoItems()
    if (state.category !== "all") items = items.filter((i) => i.category === state.category)
    if (!state.search) return items
    const q = state.search.toLowerCase()
    return items.filter((i) => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q))
  })

  const globalFiltered = createMemo(() => {
    let items = state.items
    if (state.category !== "all") items = items.filter((i) => i.category === state.category)
    return items
  })

  const items = () => (isRepo() ? repoFiltered() : globalFiltered())
  const loading = () => (isRepo() ? repoLoading() : state.loading && state.items.length === 0)

  return (
    <div class="px-8 py-8">
      <div class="mb-6">
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-2">
            <h1 class="text-lg font-semibold text-text-strong">{language.t("store.sidebar.nav.commands")}</h1>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <div class="w-72">
              <SearchBar
                value={state.search}
                onChange={(v) => {
                  setState("search", v)
                  setState("page", 1)
                  void load(true)
                }}
                placeholder={language.t("store.searchCommands")}
              />
            </div>
            <Show when={user()}>
              <StoreCreateButton
                itemType="command"
                label={language.t("store.page.newCommand")}
                onCreated={() => {
                  setRefreshKey("value", (value) => value + 1)
                  if (!selectedRepo()) void load(true)
                }}
              />
            </Show>
          </div>
        </div>
      </div>
      <CategoryFilter categories={categories()} selected={state.category} onSelect={(id) => setState("category", id)} />
      <Show
        when={!loading()}
        fallback={<div class="flex justify-center py-16 text-text-weak">{language.t("store.loading")}</div>}
      >
        <Show
          when={items().length > 0}
          fallback={<div class="text-center py-16 text-text-weak">{language.t("store.noResults")}</div>}
        >
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <For each={items()}>{(item) => <ItemCard item={item} />}</For>
          </div>
        </Show>
      </Show>
      <Show when={!isRepo()}>
        <div ref={sentinel} class="py-8 flex justify-center">
          <Show when={state.loading && state.items.length > 0}>
            <span class="text-text-weak text-sm">{language.t("store.loadingMore")}</span>
          </Show>
          <Show when={!state.hasMore && state.items.length > 0 && !state.loading}>
            <p class="text-sm text-text-weak">
              {language.t("store.showingAll", {
                count: items().length,
                type: language.t("store.sidebar.nav.commands").toLowerCase(),
              })}
            </p>
          </Show>
        </div>
      </Show>
    </div>
  )
}
