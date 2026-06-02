import { createResource, createSignal, For, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { Icon } from "@opencode-ai/ui/icon"
import { behaviorApi, itemApi } from "../../store/lib/api"
import CapabilityCard from "../../store/components/capability-card"

export default function Favorites() {
  const language = useLanguage()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = createSignal("")

  const [data, { refetch }] = createResource(
    () => ({ query: searchQuery() }),
    async (params) => {
      const result = await itemApi.list({
        favorited: true,
        search: params.query || undefined,
        page: 1,
        pageSize: 50,
      })
      return result
    }
  )

  const items = () => data()?.items ?? []

  const handleUnfavorite = async (itemId: string) => {
    try {
      await behaviorApi.unfavorite(itemId)
      refetch()
    } catch (e) {
      console.error("Failed to unfavorite:", e)
    }
  }

  return (
    <div class="h-full overflow-y-auto p-6">
      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-bold text-[var(--native-foreground)]">
          {language.t("store.admin.favoritesTitle")}
        </h1>
        <div class="relative max-w-xs">
          <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--native-muted)]">
            <Icon name="magnifying-glass" class="size-4" />
          </div>
          <input
            type="text"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            placeholder={language.t("store.admin.searchFavorites")}
            class="h-10 w-full rounded-lg border border-[var(--native-border)] bg-[var(--native-panel)] pl-10 pr-4 text-sm text-[var(--native-foreground)] placeholder:text-[var(--native-muted)] focus:border-[var(--native-primary)] focus:outline-none"
          />
        </div>
      </div>

      <Show
        when={items().length > 0}
        fallback={
          <div class="flex flex-col items-center justify-center py-16 text-[var(--native-muted)]">
            <Icon name="inbox" class="mb-4 size-12 opacity-30" />
            <p class="text-sm">{language.t("store.admin.noFavorites")}</p>
          </div>
        }
      >
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <For each={items()}>
            {(item) => (
              <div class="group relative">
                <CapabilityCard
                  item={item}
                  onClick={() => navigate(`/store/${item.slug}`)}
                />
                <button
                  type="button"
                  onClick={() => handleUnfavorite(item.id)}
                  class="absolute right-2 top-2 rounded-full bg-[var(--native-panel)] p-1.5 text-[var(--native-muted)] opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:text-red-500"
                  title={language.t("store.admin.unfavorite")}
                >
                  <Icon name="close-small" class="size-4" />
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
