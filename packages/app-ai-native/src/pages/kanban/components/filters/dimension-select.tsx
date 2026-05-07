import { createMemo } from "solid-js"
import { useLanguage } from "@/context/language"
import { useAggregateKeys } from "../../hooks/use-aggregate-keys"
import { SearchCreateSelect } from "./search-create-select"

type Props = {
  value?: string
  dimension: string
  startDate?: string
  endDate?: string
  placeholder?: string
  allowCreate?: boolean
  onChange: (value: string) => void
}

export function DimensionSelect(props: Props) {
  const language = useLanguage()
  const range = createMemo(() => {
    if (!props.startDate || !props.endDate) return null
    return [props.startDate, props.endDate] as [string, string]
  })

  const keys = useAggregateKeys({
    dimension: () => props.dimension,
    dateRange: range,
  })

  return (
    <SearchCreateSelect
      value={props.value}
      options={keys.keys()}
      onChange={props.onChange}
      onCreate={props.onChange}
      allowCreate={props.allowCreate}
      clearable
      loading={keys.loading()}
      placeholder={props.placeholder ?? language.t("common.search.placeholder")}
      emptyMessage={language.t("kanban.search.noMatchingValues")}
    />
  )
}

export default DimensionSelect