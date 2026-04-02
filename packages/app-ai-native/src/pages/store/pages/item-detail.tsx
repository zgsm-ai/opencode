import { useNavigate, useParams } from "@solidjs/router"
import ItemDetailContent from "../components/item-detail-content"

export default function ItemDetail() {
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()

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
      <ItemDetailContent itemId={params.id} showBackButton onBack={() => navigate("/store")} />
    </div>
  )
}
