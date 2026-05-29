// src/pages/store/components/featured-carousel.tsx
import { createResource, For } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { itemApi } from "../lib/api"
import CapabilityCard from "./capability-card"

export default function FeaturedCarousel() {
  const language = useLanguage()
  const navigate = useNavigate()

  const [featured] = createResource(async () => {
    const result = await itemApi.list({
      sortBy: "installCount",
      sortOrder: "desc",
      page: 1,
      pageSize: 8,
    })
    return result.items
  })

  return (
    <section class="px-6 py-8">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-xl font-bold text-[var(--native-foreground)]">
          {language.t("store.browse.featured")}
        </h2>
        <button
          type="button"
          onClick={() => navigate("/store/search")}
          class="text-sm text-[var(--native-primary)] hover:underline"
        >
          {language.t("store.browse.seeAll")} →
        </button>
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <For each={featured()}>
          {(item) => (
            <CapabilityCard
              item={item}
              onClick={() => navigate(`/store/${item.slug}`)}
            />
          )}
        </For>
      </div>
    </section>
  )
}
