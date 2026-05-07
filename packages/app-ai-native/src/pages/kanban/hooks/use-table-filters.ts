import { createEffect, createMemo, createSignal } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { getFilterTags, normalizeFilterValue } from "../lib/filter-utils"
import type { EfficiencyRow, FilterTag, FilterValue, FilterValueMap, KanbanColumn } from "../lib/types"

const clone = <T,>(value: T): T => {
  if (value == null || typeof value !== "object") return value
  return JSON.parse(JSON.stringify(value)) as T
}

export type TableFilterController<Row extends EfficiencyRow> = {
  filters: FilterValueMap
  draft: FilterValueMap
  openColumn: () => string | undefined
  tagEdit: () => string | undefined
  activeTags: () => FilterTag[]
  edit: (prop: string) => void
  close: () => void
  setDraftValue: (prop: string, value: FilterValue | undefined) => void
  apply: (prop: string) => void
  reset: (prop: string) => void
  remove: (prop: string) => void
  clearAll: () => void
  setFilter: (prop: string, value: FilterValue | undefined) => void
}

type Options<Row extends EfficiencyRow> = {
  columns: () => KanbanColumn<Row>[]
  onChange?: (value: FilterValueMap) => void
}

export function useTableFilters<Row extends EfficiencyRow>(props: Options<Row>): TableFilterController<Row> {
  const [filters, setFilters] = createStore<FilterValueMap>({})
  const [draft, setDraft] = createStore<FilterValueMap>({})
  const [openColumn, setOpenColumn] = createSignal<string>()

  createEffect(() => {
    props.onChange?.({ ...filters })
  })

  const activeTags = createMemo(() => getFilterTags(props.columns(), filters))

  const setFilter = (prop: string, value: FilterValue | undefined) => {
    const column = props.columns().find((item) => item.prop === prop)
    const next = normalizeFilterValue(column?.filter?.type, value)
    if (next === undefined) {
      setFilters(prop, undefined)
      return
    }
    setFilters(prop, reconcile(clone(next)))
  }

  return {
    filters,
    draft,
    openColumn,
    tagEdit: openColumn,
    activeTags,
    edit(prop) {
      setDraft(prop, reconcile(clone(filters[prop])))
      setOpenColumn(prop)
    },
    close() {
      setOpenColumn(undefined)
    },
    setDraftValue(prop, value) {
      setDraft(prop, reconcile(clone(value)))
    },
    apply(prop) {
      setFilter(prop, draft[prop])
      setOpenColumn(undefined)
    },
    reset(prop) {
      setDraft(prop, undefined)
      setFilters(prop, undefined)
      setOpenColumn(undefined)
    },
    remove(prop) {
      setDraft(prop, undefined)
      setFilters(prop, undefined)
    },
    clearAll() {
      for (const prop of Object.keys(filters)) setFilters(prop, undefined)
      for (const prop of Object.keys(draft)) setDraft(prop, undefined)
      setOpenColumn(undefined)
    },
    setFilter,
  }
}

export default useTableFilters