import { createSignal } from "solid-js"
import { useParams, useNavigate } from "@solidjs/router"
import { useAuth } from "@/context/auth"
import { behaviorApi, type CapabilityItem } from "../lib/api"
import ItemDetailContent from "../components/item-detail-content"

export default function StoreDetail() {
  const params = useParams<{ itemId: string }>()
  const navigate = useNavigate()
  const auth = useAuth()

  // Standalone full-page detail (deep link / refresh) has no Sheet host to own
  // the favorite state, so it keeps its own copy fed by onItemLoaded — same
  // pattern as mobile/detail.tsx.
  const [favorited, setFavorited] = createSignal(false)
  const [favoriteCount, setFavoriteCount] = createSignal(0)
  const [favoritePending, setFavoritePending] = createSignal(false)
  const [currentItem, setCurrentItem] = createSignal<CapabilityItem | null>(null)

  const onItemLoaded = (item: CapabilityItem) => {
    setCurrentItem(item)
    setFavorited(Boolean(item.favorited))
    setFavoriteCount(item.favoriteCount ?? 0)
  }

  const toggleFavorite = async (invokeMode?: "auto" | "manual") => {
    const data = currentItem()
    if (!data || !auth.user() || auth.loading() || favoritePending()) return
    setFavoritePending(true)
    try {
      // invokeMode present = subscribe-or-switch (upsert mode); absent = plain toggle.
      const result = invokeMode
        ? await behaviorApi.favorite(data.id, invokeMode)
        : favorited()
          ? await behaviorApi.unfavorite(data.id)
          : await behaviorApi.favorite(data.id)
      setFavorited(result.favorited)
      setFavoriteCount(result.favoriteCount)
    } finally {
      setFavoritePending(false)
    }
  }

  return (
    <div class="h-full w-full">
      <ItemDetailContent
        itemId={params.itemId}
        showBackButton={true}
        onBack={() => (window.history.length > 1 ? navigate(-1) : navigate("/store"))}
        onItemLoaded={onItemLoaded}
        favorited={favorited()}
        favoriteCount={favoriteCount()}
        onToggleFavorite={toggleFavorite}
        favoritePending={favoritePending()}
        isAuthenticated={!!auth.user() && !auth.loading()}
      />
    </div>
  )
}
