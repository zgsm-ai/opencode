import { createResource, createMemo, createEffect, on, onMount, onCleanup, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { itemApi } from "../lib/api"
import { useOrgFilter } from "../context/org-filter"
import { useOrgItems } from "../hooks/use-org-items"
import ItemCard from "../components/item-card"
import SearchBar from "../components/search-bar"

const PER_PAGE = 24

export default function McpServers() {
  const { selectedOrg } = useOrgFilter()
  const { items: orgItems, loading: orgLoading } = useOrgItems(selectedOrg, "mcp")

  // Global mode: fetch all at once (limit 500), same as original
  const [global] = createResource(
    () => !selectedOrg(),
    (active) => (active ? itemApi.list({ type: "mcp", limit: 500 }) : Promise.resolve(null)),
  )

  const [state, setState] = createStore({ category: "all", search: "", count: PER_PAGE })

  // Source switches between org mode and global mode
  const source = () => (selectedOrg() ? orgItems() : (global()?.items ?? []))
  const loading = () => (selectedOrg() ? orgLoading() : global.loading)

  // Reset pagination when org changes
  createEffect(on(selectedOrg, () => setState({ category: "all", search: "", count: PER_PAGE }), { defer: true }))

  const categories = createMemo(() => {
    const counts = new Map<string, number>()
    for (const item of source()) {
      if (item.category) counts.set(item.category, (counts.get(item.category) || 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count)
  })

  const filtered = createMemo(() => {
    let f = source()
    if (state.category !== "all") f = f.filter((i) => i.category === state.category)
    if (state.search) {
      const q = state.search.toLowerCase()
      f = f.filter((i) => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q))
    }
    return f
  })

  const displayed = () => filtered().slice(0, state.count)
  const hasMore = () => state.count < filtered().length

  let sentinel: HTMLDivElement | undefined
  onMount(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore()) setState("count", (c) => c + PER_PAGE)
      },
      { threshold: 0.1, rootMargin: "100px" },
    )
    if (sentinel) observer.observe(sentinel)
    onCleanup(() => observer.disconnect())
  })

  const total = () => (selectedOrg() ? orgItems().length : (global()?.total ?? 0))

  return (
    <div class="px-8 py-8">
      <div class="mb-8">
        <h1 class="text-2xl font-semibold mb-1 flex items-center gap-2.5 text-text-strong">
          <span class="text-purple-500">⬢</span> MCP Servers
          <Show when={selectedOrg()}>
            <span class="text-base font-normal text-text-weak">
              — {selectedOrg()?.displayName || selectedOrg()?.name}
            </span>
          </Show>
        </h1>
        <p class="text-sm text-text-weak">{total()} MCP servers</p>
      </div>
      <div class="mb-6 max-w-sm">
        <SearchBar
          value={state.search}
          onChange={(v) => {
            setState("search", v)
            setState("count", PER_PAGE)
          }}
          placeholder="Search MCP servers..."
        />
      </div>
      <div class="flex gap-2 flex-wrap mb-6">
        <button
          onClick={() => {
            setState("category", "all")
            setState("count", PER_PAGE)
          }}
          class={`px-3 py-1.5 text-sm rounded-md transition-colors ${state.category === "all" ? "bg-bg-muted text-text-strong" : "text-text-weak hover:text-text-strong hover:bg-bg-muted"}`}
        >
          All
        </button>
        <For each={categories()}>
          {(cat) => (
            <button
              onClick={() => {
                setState("category", cat.id)
                setState("count", PER_PAGE)
              }}
              class={`px-3 py-1.5 text-sm rounded-md transition-colors ${state.category === cat.id ? "bg-bg-muted text-text-strong" : "text-text-weak hover:text-text-strong hover:bg-bg-muted"}`}
            >
              {cat.id} ({cat.count})
            </button>
          )}
        </For>
      </div>
      <Show when={!loading()} fallback={<div class="flex justify-center py-16 text-text-weak">Loading...</div>}>
        <Show
          when={filtered().length > 0}
          fallback={<div class="text-center py-16 text-text-weak">No results found</div>}
        >
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <For each={displayed()}>{(item) => <ItemCard item={item} />}</For>
          </div>
        </Show>
      </Show>
      <div ref={sentinel} class="py-8 flex justify-center">
        <Show when={hasMore()}>
          <span class="text-text-weak text-sm">Loading more...</span>
        </Show>
        <Show when={!hasMore() && displayed().length > 0}>
          <p class="text-sm text-text-weak">Showing all {filtered().length} results</p>
        </Show>
      </div>
    </div>
  )
}
