// src/pages/store/components/category-grid.tsx
import { createResource, For, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { categoryApi, itemApi } from "../lib/api"

export default function CategoryGrid() {
  const language = useLanguage()
  const navigate = useNavigate()

  const [categories] = createResource(async () => {
    const cats = await categoryApi.list()
    // For each category, fetch top 3 items
    const catsWithItems = await Promise.all(
      cats.map(async (cat) => {
        const result = await itemApi.list({
          category: cat.slug,
          page: 1,
          pageSize: 3,
        })
        return { ...cat, items: result.items, total: result.total }
      })
    )
    return catsWithItems
  })

  return (
    <section class="px-6 py-8">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-xl font-bold text-[var(--native-foreground)]">
          {language.t("store.browse.categories")}
        </h2>
        <button
          type="button"
          onClick={() => navigate("/store/search")}
          class="text-sm text-[var(--native-primary)] hover:underline"
        >
          {language.t("store.browse.seeAll")} →
        </button>
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <For each={categories()}>
          {(cat) => (
            <div class="rounded-xl border border-[var(--native-border)] bg-[var(--native-panel)] p-4">
              <h3 class="mb-3 text-base font-semibold text-[var(--native-foreground)]">
                {cat.names?.[language.locale()] ?? cat.slug}
              </h3>
              <div class="space-y-2">
                <For each={cat.items.slice(0, 2)}>
                  {(item) => (
                    <button
                      type="button"
                      onClick={() => navigate(`/store/${item.slug}`)}
                      class="block w-full truncate text-left text-sm text-[var(--native-muted)] hover:text-[var(--native-primary)]"
                    >
                      {item.name}
                    </button>
                  )}
                </For>
              </div>
              <Show when={cat.total > 2}>
                <button
                  type="button"
                  onClick={() => navigate(`/store/search?category=${cat.slug}`)}
                  class="mt-2 text-xs text-[var(--native-primary)] hover:underline"
                >
                  +{cat.total - 2} more →
                </button>
              </Show>
            </div>
          )}
        </For>
      </div>
    </section>
  )
}
