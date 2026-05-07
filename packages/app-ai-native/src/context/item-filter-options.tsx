import { createMemo, createResource } from "solid-js"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { useLanguage } from "@/context/language"
import { itemFilterApi, type Category, type FilterOption, type ItemFilterOptions, type SourceOption } from "@/pages/store/lib/api"

const EMPTY_FILTER_OPTIONS: ItemFilterOptions = {
  categories: [],
  securityStatuses: [],
  securityRiskGroups: [],
  sources: [],
}

export const { use: useItemFilterOptions, provider: ItemFilterOptionsProvider } = createSimpleContext({
  name: "ItemFilterOptions",
  init: () => {
    const language = useLanguage()
    const [options, { refetch }] = createResource(async () => itemFilterApi.list().catch(() => EMPTY_FILTER_OPTIONS))

    const data = createMemo(() => options() ?? EMPTY_FILTER_OPTIONS)
    const securityStatuses = createMemo(() => data().securityStatuses ?? [])
    const securityRiskGroups = createMemo(() => data().securityRiskGroups ?? [])
    const categories = createMemo(() => data().categories ?? [])
    const sources = createMemo(() => data().sources ?? [])

    const securityStatusMap = createMemo(() => new Map(securityStatuses().map((option) => [option.value, option] as const)))
    const securityRiskGroupMap = createMemo(() => new Map(securityRiskGroups().map((option) => [option.value, option] as const)))
    const categoryMap = createMemo(() => new Map(categories().map((category) => [category.slug, category] as const)))
    const sourceMap = createMemo(() => new Map(sources().map((option) => [option.value, option] as const)))

    const categoryBySlug = (slug?: string, category?: Category) => {
      if (category) return category
      if (!slug) return undefined
      return categoryMap().get(slug)
    }

    const categoryLabel = (slug?: string, category?: Category) => {
      if (!slug && !category) return ""
      const locale = language.locale()
      const matched = categoryBySlug(slug, category)
      return matched?.names?.[locale] || matched?.names?.en || slug || category?.slug || ""
    }

    const securityStatusLabel = (value?: string, option?: FilterOption) => {
      if (!value) return ""
      const locale = language.locale()
      const matched = option ?? securityStatusMap().get(value)
      return (matched?.names?.[locale] || matched?.names?.en || language.t(`store.security.${value}`)).replace(/\.{2,}$/g, "")
    }

    const securityRiskGroupLabel = (value?: string, option?: FilterOption) => {
      if (!value) return ""
      const locale = language.locale()
      const matched = option ?? securityRiskGroupMap().get(value)
      return (matched?.names?.[locale] || matched?.names?.en || value).replace(/\.{2,}$/g, "")
    }

    const sourceLabel = (value?: string, option?: SourceOption) => {
      if (!value) return ""
      return option?.label || sourceMap().get(value)?.label || value
    }

    const sourceUrl = (value?: string, option?: SourceOption) => {
      if (!value) return ""
      return option?.url || sourceMap().get(value)?.url || ""
    }

    return {
      data,
      categories,
      securityStatuses,
      securityRiskGroups,
      sources,
      loading: createMemo(() => options.loading),
      error: createMemo(() => options.error),
      categoryBySlug,
      categoryLabel,
      securityStatusLabel,
      securityRiskGroupLabel,
      sourceLabel,
      sourceUrl,
      refetch,
    }
  },
})
