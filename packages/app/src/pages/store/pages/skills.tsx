import { createStore } from "solid-js/store"
import { createEffect, createMemo, on, onMount, onCleanup, For, Show } from "solid-js"
import { itemApi, type CapabilityItem } from "../lib/api"
import { useOrgFilter } from "../context/org-filter"
import { useOrgItems } from "../hooks/use-org-items"
import ItemCard from "../components/item-card"
import SearchBar from "../components/search-bar"

const PER_PAGE = 24

export default function Skills() {
  const { selectedOrg } = useOrgFilter()
  const { items: orgItems, loading: orgLoading } = useOrgItems(selectedOrg, "skill")

  // Global mode: server-side pagination with search
  const [state, setState] = createStore({
    items: [] as CapabilityItem[],
    total: 0,
    hasMore: false,
    loading: true,
    search: "",
    offset: 0,
  })

  let sentinel: HTMLDivElement | undefined
  let debounce: ReturnType<typeof setTimeout>

  async function load(reset: boolean) {
    setState("loading", true)
    try {
      const offset = reset ? 0 : state.offset
      const res = await itemApi.list({ type: "skill", search: state.search || undefined, limit: PER_PAGE, offset })
      setState({
        items: reset ? res.items : [...state.items, ...res.items],
        total: res.total,
        hasMore: res.hasMore,
        offset: reset ? res.items.length : state.offset + res.items.length,
        loading: false,
      })
    } catch {
      setState("loading", false)
    }
  }

  // Reset and reload global when not in org mode or search changes
  createEffect(
    on(
      () => [selectedOrg(), state.search] as const,
      ([org]) => {
        if (org) return // org mode handled by useOrgItems
        setState("offset", 0)
        clearTimeout(debounce)
        debounce = setTimeout(() => load(true), 300)
      },
    ),
  )

  onMount(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !selectedOrg() && state.hasMore && !state.loading) load(false)
      },
      { threshold: 0.1, rootMargin: "100px" },
    )
    if (sentinel) observer.observe(sentinel)
    onCleanup(() => observer.disconnect())
  })

  // Org mode: client-side search filter over orgItems
  const orgFiltered = createMemo(() => {
    if (!state.search) return orgItems()
    const q = state.search.toLowerCase()
    return orgItems().filter((i) => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q))
  })

  const isOrg = () => !!selectedOrg()
  const items = () => (isOrg() ? orgFiltered() : state.items)
  const loading = () => (isOrg() ? orgLoading() : state.loading && state.items.length === 0)
  const total = () => (isOrg() ? orgItems().length : state.total)

  return (
    <div class="px-8 py-8">
      <div class="mb-8">
        <h1 class="text-2xl font-semibold mb-1 flex items-center gap-2.5 text-text-strong">
          <span class="text-yellow-500">✦</span> Skills
          <Show when={selectedOrg()}>
            <span class="text-base font-normal text-text-weak">
              — {selectedOrg()?.displayName || selectedOrg()?.name}
            </span>
          </Show>
        </h1>
        <p class="text-sm text-text-weak">{total()} skills</p>
      </div>
      <div class="mb-6 max-w-sm">
        <SearchBar value={state.search} onChange={(v) => setState("search", v)} placeholder="Search skills..." />
      </div>
      <Show when={!loading()} fallback={<div class="flex justify-center py-16 text-text-weak">Loading...</div>}>
        <Show when={items().length > 0} fallback={<div class="text-center py-16 text-text-weak">No results found</div>}>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <For each={items()}>{(item) => <ItemCard item={item} />}</For>
          </div>
        </Show>
      </Show>
      <Show when={!isOrg()}>
        <div ref={sentinel} class="py-8 flex justify-center">
          <Show when={state.loading && state.items.length > 0}>
            <span class="text-text-weak text-sm">Loading more...</span>
          </Show>
          <Show when={!state.hasMore && state.items.length > 0 && !state.loading}>
            <p class="text-sm text-text-weak">Showing all {state.items.length} skills</p>
          </Show>
        </div>
      </Show>
    </div>
  )
}
