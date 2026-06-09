import { useParams, useNavigate } from "@solidjs/router"
import ItemDetailContent from "../components/item-detail-content"

export default function StoreDetail() {
  const params = useParams<{ itemId: string }>()
  const navigate = useNavigate()

  return (
    <div class="h-full w-full">
      <ItemDetailContent
        itemId={params.itemId}
        showBackButton={true}
        onBack={() => navigate("/store")}
      />
    </div>
  )
}
