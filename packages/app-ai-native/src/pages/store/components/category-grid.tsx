// src/pages/store/components/category-grid.tsx
import { createResource, For, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { Icon } from "@opencode-ai/ui/icon"
import { categoryApi, itemApi } from "../lib/api"

const CAT_META: Record<
  string,
  { icon: string; color: string; gradient: string }
> = {
  "code-generation": {
    icon: "code",
    color: "#3B82F6",
    gradient: "from-blue-500/10 to-blue-600/5",
  },
  "code-review": {
    icon: "magnifying-glass",
    color: "#F59E0B",
    gradient: "from-amber-500/10 to-amber-600/5",
  },
  testing: {
    icon: "checklist",
    color: "#10B981",
    gradient: "from-emerald-500/10 to-emerald-600/5",
  },
  documentation: {
    icon: "file-tree",
    color: "#8B5CF6",
    gradient: "from-violet-500/10 to-violet-600/5",
  },
  devops: {
    icon: "server",
    color: "#EC4899",
    gradient: "from-pink-500/10 to-pink-600/5",
  },
  "data-analysis": {
    icon: "status",
    color: "#06B6D4",
    gradient: "from-cyan-500/10 to-cyan-600/5",
  },
  security: {
    icon: "shield",
    color: "#EF4444",
    gradient: "from-red-500/10 to-red-600/5",
  },
  productivity: {
    icon: "sparkles",
    color: "#F97316",
    gradient: "from-orange-500/10 to-orange-600/5",
  },
}

const TYPE_META: Record<string, { icon: string; color: string }> = {
  skill: { icon: "sparkles", color: "#F59E0B" },
  subagent: { icon: "brain", color: "#3B82F6" },
  command: { icon: "console", color: "#10B981" },
  mcp: { icon: "mcp", color: "#8B5CF6" },
  plugin: { icon: "configuration", color: "#EC4899" },
}

export default function CategoryGrid() {
  const language = useLanguage()
  const navigate = useNavigate()

  const [categories] = createResource(async () => {
    const cats = await categoryApi.list()
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
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold" style={{ color: '#000000' }}>
            {language.t("store.browse.categories")}
          </h2>
          <p class="mt-1 text-sm text-gray-500">
            {language.t("store.browse.categoriesDesc")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/store/search")}
          class="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          {language.t("store.browse.seeAll")} →
        </button>
      </div>

      <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <For each={categories()}>
          {(cat) => {
            const meta = CAT_META[cat.slug] ?? CAT_META["code-generation"]
            return (
              <div
                class="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-gray-300 hover:shadow-xl"
              >
                {/* Top color bar */}
                <div
                  class="h-1.5 w-full"
                  style={{ "background-color": meta.color }}
                />

                {/* Header */}
                <div class={`bg-gradient-to-br ${meta.gradient} px-5 pb-4 pt-5`}>
                  <div class="flex items-start justify-between">
                    <div
                      class="flex size-10 items-center justify-center rounded-xl border border-white/60 shadow-sm"
                      style={{
                        "background-color": `${meta.color}15`,
                        color: meta.color,
                      }}
                    >
                      <Icon name={meta.icon as any} class="size-5" />
                    </div>
                    <span
                      class="rounded-full px-2.5 py-1 text-xs font-semibold"
                      style={{
                        "background-color": `${meta.color}12`,
                        color: meta.color,
                      }}
                    >
                      {cat.total}
                    </span>
                  </div>

                  <h3
                    class="mt-3 text-base font-bold"
                    style={{ color: '#000000' }}
                  >
                    {cat.names?.[language.locale()] ?? cat.slug}
                  </h3>
                  <p class="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500">
                    {cat.descriptions?.[language.locale()] ?? ""}
                  </p>
                </div>

                {/* Item list */}
                <div class="px-5 pb-2 pt-2">
                  <div class="space-y-1">
                    <For each={cat.items.slice(0, 3)}>
                      {(item) => {
                        const t = TYPE_META[item.itemType] ?? TYPE_META.skill
                        return (
                          <button
                            type="button"
                            onClick={() => navigate(`/store/${item.slug}`)}
                            class="flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-gray-50"
                          >
                            <div
                              class="flex size-7 shrink-0 items-center justify-center rounded-md"
                              style={{
                                "background-color": `${t.color}12`,
                                color: t.color,
                              }}
                            >
                              <Icon
                                name={t.icon as any}
                                class="size-3.5"
                              />
                            </div>
                            <div class="min-w-0 flex-1">
                              <p
                                class="truncate text-sm font-medium"
                                style={{ color: '#000000' }}
                              >
                                {item.name}
                              </p>
                              <p class="truncate text-xs text-gray-400">
                                {item.itemType}
                              </p>
                            </div>
                          </button>
                        )
                      }}
                    </For>
                  </div>
                </div>

                {/* Footer */}
                <div class="px-5 pb-4 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/store/search?category=${cat.slug}`)
                    }
                    class="flex w-full items-center justify-center gap-1 rounded-xl py-2.5 text-xs font-semibold transition-colors"
                    style={{
                      color: meta.color,
                      "background-color": `${meta.color}08`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = `${meta.color}15`
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = `${meta.color}08`
                    }}
                  >
                    {language.t("store.browse.viewCategory")}
                    <Icon name="chevron-right" class="size-3" />
                  </button>
                </div>
              </div>
            )
          }}
        </For>
      </div>
    </section>
  )
}
