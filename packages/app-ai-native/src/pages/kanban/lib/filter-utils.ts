import { displayDateRange, formatDay, normalizeDateRange } from "./date-range"
import type { EfficiencyRow, FilterOption, FilterTag, FilterType, FilterValue, FilterValueMap, KanbanColumn, OrgCascadeValue } from "./types"

function text(value: unknown) {
  if (value == null) return ""
  return String(value)
}

function number(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (typeof value === "string" && value.trim()) {
    const out = Number(value)
    return Number.isFinite(out) ? out : undefined
  }
}

function active(value: FilterValue | undefined) {
  if (value == null) return false
  if (typeof value === "string") return !!value.trim()
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === "object") return Object.values(value).some((item) => item != null && item !== "")
  return true
}

function clone<T>(value: T): T {
  if (value == null) return value
  if (typeof value !== "object") return value
  return JSON.parse(JSON.stringify(value)) as T
}

export function normalizeFilterValue(type: FilterType | undefined, value: FilterValue | undefined) {
  if (value == null) return undefined
  if (type === "text" || type === "search-select") {
    const txt = text(value).trim()
    return txt ? txt : undefined
  }
  if (type === "date") {
    const next = normalizeDateRange(value as [string, string] | null)
    return next ?? undefined
  }
  if (type === "number") {
    const min = number((value as { min?: number }).min)
    const max = number((value as { max?: number }).max)
    if (min == null && max == null) return undefined
    return { min, max }
  }
  if (type === "enum" || type === "multi-select") {
    const items = (Array.isArray(value) ? value : []).map((item) => text(item).trim()).filter(Boolean)
    return items.length ? items : undefined
  }
  if (type === "cascade-org") {
    const next = Object.fromEntries(
      Object.entries(value as OrgCascadeValue).filter(([, item]) => typeof item === "string" && item.trim()),
    ) as OrgCascadeValue
    return Object.keys(next).length ? next : undefined
  }
  return active(value) ? clone(value) : undefined
}

function cellValue<Row extends EfficiencyRow>(row: Row, column: KanbanColumn<Row>) {
  return column.filter?.valueGetter ? column.filter.valueGetter(row) : row[column.prop]
}

function orgParts<Row extends EfficiencyRow>(row: Row, column: KanbanColumn<Row>) {
  const value = cellValue(row, column)
  if (typeof value === "string") return value.split("/").filter(Boolean)
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const current = value as Record<string, unknown>
    return [current.org1, current.org2, current.org3, current.org4].filter((item): item is string => typeof item === "string" && !!item)
  }
  return [row.org1, row.org2, row.org3, row.org4].filter((item): item is string => typeof item === "string" && !!item)
}

function dateStamp(value: unknown) {
  const txt = text(value).trim()
  if (!txt) return undefined
  const normalized = formatDay(txt)
  const stamp = new Date(normalized).getTime()
  return Number.isFinite(stamp) ? stamp : undefined
}

export function filterDisplay<Row extends EfficiencyRow>(column: KanbanColumn<Row>, value: FilterValue | undefined) {
  if (!active(value)) return ""
  const type = column.filter?.type
  if (type === "date") return displayDateRange(value as [string, string] | null, "")
  if (type === "number") {
    const range = value as { min?: number; max?: number }
    return `${range.min ?? "-"} ~ ${range.max ?? "-"}`
  }
  if (type === "enum" || type === "multi-select") return (value as string[]).join(", ")
  if (type === "cascade-org") return Object.values(value as OrgCascadeValue).filter(Boolean).join("/")
  return text(value)
}

export function getFilterTags<Row extends EfficiencyRow>(columns: KanbanColumn<Row>[], filters: FilterValueMap) {
  return columns.flatMap((column) => {
    const value = filters[column.prop]
    const display = filterDisplay(column, value)
    if (!display) return [] as FilterTag[]
    return [{ prop: column.prop, label: column.label, display }]
  })
}

export function deriveFilterOptions<Row extends EfficiencyRow>(column: KanbanColumn<Row>, rows: Row[]) {
  if (column.filter?.options?.length) return column.filter.options
  const seen = new Set<string>()
  const out: FilterOption[] = []
  for (const row of rows) {
    const value = cellValue(row, column)
    const items = Array.isArray(value) ? value : [value]
    for (const item of items) {
      const txt = text(item).trim()
      if (!txt || seen.has(txt)) continue
      seen.add(txt)
      out.push({ label: txt, value: txt })
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label))
}

export function applyClientFilters<Row extends EfficiencyRow>(rows: Row[], columns: KanbanColumn<Row>[], filters: FilterValueMap) {
  const activeColumns = columns.filter((column) => column.filter && !column.filter.serverSide && active(filters[column.prop]))
  if (!activeColumns.length) return rows

  return rows.filter((row) =>
    activeColumns.every((column) => {
      const value = filters[column.prop]
      const type = column.filter?.type
      const current = cellValue(row, column)

      if (type === "text") return text(current).toLowerCase().includes(text(value).toLowerCase())
      if (type === "search-select") return text(current).toLowerCase() === text(value).toLowerCase()
      if (type === "enum" || type === "multi-select") return (value as string[]).includes(text(current))
      if (type === "number") {
        const target = number(current)
        if (target == null) return false
        const range = value as { min?: number; max?: number }
        if (range.min != null && target < range.min) return false
        if (range.max != null && target > range.max) return false
        return true
      }
      if (type === "date") {
        const range = normalizeDateRange(value as [string, string] | null)
        if (!range) return true
        const target = dateStamp(current)
        if (target == null) return false
        const start = dateStamp(range[0])
        const end = dateStamp(range[1])
        if (start != null && target < start) return false
        if (end != null && target > end + 86400000 - 1) return false
        return true
      }
      if (type === "cascade-org") {
        const selected = value as OrgCascadeValue
        const parts = orgParts(row, column)
        return [selected.org1, selected.org2, selected.org3, selected.org4].every((item, index) => !item || parts[index] === item)
      }
      return true
    }),
  )
}