import { createResource, createSignal, For, Show } from "solid-js"
import { useNavigate, useSearchParams } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { itemApi } from "../lib/api"
import TopNav from "../components/top-nav"
import SearchFilters from "../components/search-filters"
import CapabilityListItem from "../components/capability-list-item"

export default function SearchPage() {
  const language = useLanguage()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [selectedType, setSelectedType] = createSignal(
    typeof searchParams.type === "string" ? searchParams.type : ""
  )
  const [selectedCategories, setSelectedCategories] = createSignal<string[]>(
    typeof searchParams.category === "string" ? [searchParams.category] : []
  )
  const [selectedSecurity, setSelectedSecurity] = createSignal<string[]>([])

  const [results] = createResource(
    () => ({
      query: typeof searchParams.q === "string" ? searchParams.q : "",
      type: selectedType() || undefined,
      categories: selectedCategories(),
      security: selectedSecurity(),
    }),
    async (params) => {
      const result = await itemApi.list({
        search: params.query,
        type: params.type,
        categories: params.categories.length > 0 ? params.categories : undefined,
        securityStatuses: params.security.length > 0 ? params.security : undefined,
        page: 1,
        pageSize: 20,
      })
      return result
    }
  )

  const handleTypeChange = (type: string) => {
    setSelectedType(type)
  }

  const handleCategoryChange = (categories: string[]) => {
    setSelectedCategories(categories)
  }

  const handleSecurityChange = (statuses: string[]) => {
    setSelectedSecurity(statuses)
  }

  return (
    <>
      <TopNav />
      <div class="flex h-[calc(100vh-3.5rem)]">
        <SearchFilters
          selectedType={selectedType()}
          selectedCategories={selectedCategories()}
          selectedSecurityStatuses={selectedSecurity()}
          onTypeChange={handleTypeChange}
          onCategoryChange={handleCategoryChange}
          onSecurityChange={handleSecurityChange}
        />
        <div class="flex-1 overflow-y-auto p-6">
          <Show
            when={results()}
            fallback={
              <div class="flex h-full items-center justify-center text-[var(--native-muted)]">
                Loading...
              </div>
            }
          >
            {(data) => (
              <>
                <div class="mb-4 text-sm text-[var(--native-muted)]">
                  {data().total} results
                  {typeof searchParams.q === "string" && searchParams.q && ` for "${searchParams.q}"`}
                </div>
                <div class="space-y-3">
                  <For each={data().items}>
                    {(item) => (
                      <CapabilityListItem
                        item={item}
                        onClick={() => navigate(`/store/${item.slug}`)}
                      />
                    )}
                  </For>
                </div>
              </>
            )}
          </Show>
        </div>
      </div>
    </>
  )
}
