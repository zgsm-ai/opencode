import { useNavigate, useParams } from "@solidjs/router"
import { createEffect, createSignal } from "solid-js"
import ItemDetailContent from "../components/item-detail-content"
import { behaviorApi, type CapabilityItem } from "../lib/api"
import { useAuth } from "../hooks/use-auth"

export default function ItemDetail() {
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const auth = useAuth()

  const [item, setItem] = createSignal<CapabilityItem | null>(null)
  const [favoritePending, setFavoritePending] = createSignal(false)
  const [favorited, setFavorited] = createSignal(false)
  const [favoriteCount, setFavoriteCount] = createSignal(0)
  const [previewCount, setPreviewCount] = createSignal(0)
  const [installCount, setInstallCount] = createSignal(0)
  const [trackedItemId, setTrackedItemId] = createSignal<string | null>(null)

  const toggleFavorite = async () => {
    const data = item()
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
    const data = item()
    if (!data) return
    setPreviewCount(data.previewCount ?? 0)
    setInstallCount(data.installCount ?? 0)
    setFavorited(Boolean(data.favorited))
    setFavoriteCount(data.favoriteCount ?? 0)
  })

  createEffect(() => {
    const data = item()
    if (!data) return
    if (trackedItemId() === data.id) return

    setTrackedItemId(data.id)
    void behaviorApi
      .log(data.id, {
        actionType: "view",
        context: "direct_access",
        metadata: {
          source: "app-ai-native",
          route: "item-detail",
        },
      })
      .then(() => setPreviewCount((count) => count + 1))
      .catch(() => undefined)
  })

  return (
    <div class="mx-auto h-full w-full max-w-3xl">
      <ItemDetailContent
        itemId={params.id}
        showBackButton
        onBack={() => navigate("/store")}
        onItemLoaded={setItem}
        favorited={favorited()}
        favoriteCount={favoriteCount()}
        previewCount={previewCount()}
        installCount={installCount()}
        onToggleFavorite={toggleFavorite}
        favoritePending={favoritePending()}
        isAuthenticated={!!auth.user() && !auth.loading()}
      />
    </div>
  )
}
