import { useParams, useNavigate } from "@solidjs/router"
import { Suspense } from "solid-js"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"
import ItemDetailContent from "../components/item-detail-content"
import { ItemDetailLoadingSkeleton } from "../components/item-detail-loading-skeleton"

export default function StoreDetail() {
  const params = useParams<{ itemId: string }>()
  const navigate = useNavigate()
  const auth = useAuth()
  const language = useLanguage()

  return (
    <div class="mx-auto w-full max-w-[64rem] px-3 py-6 sm:px-4">
      <Suspense
        fallback={
          <div class="flex justify-center py-16 text-text-weak">
            {language.t("store.loading")}
          </div>
        }
      >
        <ItemDetailContent
          itemId={params.itemId}
          showBackButton
          onBack={() => navigate("/store")}
          isAuthenticated={!!auth.user() && !auth.loading()}
        />
      </Suspense>
    </div>
  )
}
