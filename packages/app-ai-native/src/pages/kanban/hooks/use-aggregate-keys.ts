import { createMemo, createResource } from "solid-js"
import { loadDimensionKeys } from "../lib/api"
import { normalizeDateRange } from "../lib/date-range"
import type { DateRangeValue } from "../lib/types"

type UseAggregateKeysOptions = {
  dimension: () => string
  dateRange: () => DateRangeValue | undefined
}

export function useAggregateKeys(props: UseAggregateKeysOptions) {
  const [data, { refetch }] = createResource(
    () => ({
      dimension: props.dimension().trim(),
      dateRange: normalizeDateRange(props.dateRange()),
    }),
    async (input) => {
      if (!input.dimension || !input.dateRange) return [] as string[]
      try {
        const result = await loadDimensionKeys({ dimension: input.dimension, dateRange: input.dateRange })
        return result.keys
      } catch {
        return [] as string[]
      }
    },
  )

  const keys = createMemo(() => data.latest ?? [])

  const filter = (query: string) => {
    const txt = query.trim().toLowerCase()
    if (!txt) return keys()
    return keys().filter((item) => item.toLowerCase().includes(txt))
  }

  return {
    keys,
    loading: () => data.loading,
    reload: refetch,
    filter,
  }
}

export default useAggregateKeys