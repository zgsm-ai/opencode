import { createResource, Show } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { itemApi } from "../lib/api"
import TopNav from "../components/top-nav"
import ItemDetailContent from "../components/item-detail-content"
import { Icon } from "@opencode-ai/ui/icon"

export default function DetailPage() {
  const language = useLanguage()
  const navigate = useNavigate()
  const params = useParams()

  const [item] = createResource(
    () => params.slug,
    (slug) => itemApi.list({ search: slug, page: 1, pageSize: 1 }).then((r) => r.items[0])
  )

  return (
    <>
      <TopNav />
      <div class="mx-auto max-w-7xl p-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          class="mb-4 flex items-center gap-2 text-sm text-[var(--native-muted)] hover:text-[var(--native-foreground)]"
        >
          <Icon name="chevron-left" class="size-4" />
          <span>{language.t("store.browse.back")}</span>
        </button>

        <Show
          when={item()}
          fallback={
            <div class="flex h-96 items-center justify-center text-[var(--native-muted)]">
              Loading...
            </div>
          }
        >
          {(data) => (
            <ItemDetailContent
              itemId={data().id}
              favorited={false}
              favoriteCount={data().favoriteCount ?? 0}
              previewCount={data().previewCount ?? 0}
              installCount={data().installCount ?? 0}
              isAuthenticated={true}
            />
          )}
        </Show>
      </div>
    </>
  )
}
