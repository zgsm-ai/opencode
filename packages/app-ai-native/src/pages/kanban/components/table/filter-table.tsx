import type { JSX } from "solid-js"
import { For, Show } from "solid-js"
import { Popover } from "@opencode-ai/ui/popover"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SelectRoot, SelectControl, SelectTrigger, SelectValueText, SelectIndicator, SelectPositioner, SelectContent, SelectList, SelectItem, SelectItemText, createListCollection } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { TableFilterController } from "../../hooks/use-table-filters"
import type { DateRangeValue, EfficiencyRow, KanbanColumn } from "../../lib/types"
import { filterDisplay } from "../../lib/filter-utils"
import { FilterPanel } from "./filter-panel"
import { FilterTagBar } from "./filter-tag-bar"

type Props<Row extends EfficiencyRow> = {
  columns: KanbanColumn<Row>[]
  rows: Row[]
  rawRows?: Row[]
  class?: string
  controller: TableFilterController<Row>
  loading?: boolean
  total: number
  page: number
  pageSize: number
  pageSizeOptions?: number[]
  actions?: JSX.Element
  dateRange?: DateRangeValue
  emptyText?: string
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onRowClick?: (row: Row) => void
}

function valueOf<Row extends EfficiencyRow>(row: Row, column: KanbanColumn<Row>) {
  return column.filter?.valueGetter ? column.filter.valueGetter(row) : row[column.prop]
}

function displayOf<Row extends EfficiencyRow>(row: Row, column: KanbanColumn<Row>) {
  return column.display ? column.display(row) : String(valueOf(row, column) ?? "-")
}

function alignClass(align?: KanbanColumn["align"]) {
  if (align === "center") return "text-center"
  if (align === "right") return "text-right"
  return "text-left"
}

function rangePages(page: number, totalPages: number) {
  const size = 5
  if (totalPages <= size) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const start = Math.max(1, Math.min(page - 2, totalPages - size + 1))
  return Array.from({ length: size }, (_, i) => start + i)
}

export function FilterTable<Row extends EfficiencyRow>(props: Props<Row>) {
  const language = useLanguage()
  const pages = () => Math.max(1, Math.ceil(props.total / props.pageSize))
  const sizes = () => props.pageSizeOptions?.length ? props.pageSizeOptions : [10, 25, 50, 100]
  const visiblePages = () => rangePages(props.page, pages())
  const from = () => (props.total === 0 ? 0 : Math.min((props.page - 1) * props.pageSize + 1, props.total))
  const to = () => Math.min(props.page * props.pageSize, props.total)
  const showOverlay = () => props.loading && props.rows.length > 0

  return (
    <section class={cn("overflow-hidden rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] shadow-[var(--native-shadow-sm)]", props.class)}>
      <FilterTagBar
        tags={props.controller.activeTags()}
        actions={props.actions}
        onEdit={props.controller.edit}
        onRemove={props.controller.remove}
        onClearAll={props.controller.clearAll}
      />

      <Show when={props.rows.length > 0 || !props.loading} fallback={<div class="px-4 py-8 text-sm text-[var(--native-muted)]">{language.t("kanban.misc.loading")}</div>}>
        <Show when={props.rows.length > 0} fallback={<div class="px-4 py-10 text-center text-sm text-[var(--native-muted)]">{props.emptyText ?? language.t("kanban.empty.noData")}</div>}>
          <div class="relative overflow-x-auto">
            <Show when={showOverlay()}>
              <div class="absolute inset-0 z-10 flex items-center justify-center bg-[color:color-mix(in_oklab,var(--native-panel)_70%,transparent)] backdrop-blur-[4px]">
                <div class="h-8 w-8 animate-spin rounded-full border-[3px] border-[color:color-mix(in_srgb,var(--native-border)_30%,transparent)] border-t-[var(--native-primary)]" />
              </div>
            </Show>
            <Table class="min-w-max">
            <TableHeader>
              <TableRow>
                <For each={props.columns}>
                  {(column) => (
                    <TableHead
                      class={alignClass(column.align)}
                      style={{ width: typeof column.width === "number" ? `${column.width}px` : column.width, "min-width": typeof column.minWidth === "number" ? `${column.minWidth}px` : column.minWidth }}
                    >
                      <div class="flex items-center justify-between gap-2">
                        <span>{column.label}</span>
                        {column.filter ? (
                          <Popover
                            open={props.controller.openColumn() === column.prop}
                            onOpenChange={(open) => {
                              if (open) props.controller.edit(column.prop)
                              else props.controller.close()
                            }}
                            placement="bottom-end"
                            gutter={8}
                            class="max-w-none rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] p-0 shadow-[var(--native-shadow-lg)]"
                            triggerAs="button"
                            triggerProps={{
                              type: "button",
                              class: cn(
                                "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors",
                                filterDisplay(column, props.controller.filters[column.prop]) || props.controller.openColumn() === column.prop
                                  ? "bg-[var(--native-primary-soft)] text-[var(--native-primary)]"
                                  : "text-[var(--native-dim)] hover:bg-[color:color-mix(in_oklab,var(--native-border)_14%,transparent)] hover:text-[var(--native-foreground)]",
                              ),
                              "aria-label": language.t("kanban.aria.filterLabel", { label: column.label }),
                            }}
                            trigger={
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-3.5 w-3.5">
                                <path d="M4 6h16" />
                                <path d="M7 12h10" />
                                <path d="M10 18h4" />
                              </svg>
                            }
                          >
                            <FilterPanel
                              column={column}
                              rows={props.rawRows ?? props.rows}
                              value={props.controller.draft[column.prop]}
                              dateRange={props.dateRange}
                              onChange={(value) => props.controller.setDraftValue(column.prop, value)}
                              onApply={() => props.controller.apply(column.prop)}
                              onReset={() => props.controller.reset(column.prop)}
                            />
                          </Popover>
                        ) : null}
                      </div>
                    </TableHead>
                  )}
                </For>
              </TableRow>
            </TableHeader>
            <TableBody>
              <For each={props.rows}>
                {(row) => (
                  <TableRow class={props.onRowClick ? "cursor-pointer" : undefined} onClick={() => props.onRowClick?.(row)}>
                    <For each={props.columns}>
                      {(column) => (
                        <TableCell class={cn(alignClass(column.align), column.align === "right" ? "tabular-nums" : undefined)}>
                          {column.render ? column.render(row) : displayOf(row, column)}
                        </TableCell>
                      )}
                    </For>
                  </TableRow>
                )}
              </For>
            </TableBody>
            </Table>
          </div>
        </Show>
      </Show>

      <div class="flex flex-col gap-3 border-t border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div class="text-[0.8125rem] leading-[1.55] text-[var(--native-muted)]">
          <Show when={props.total > 0} fallback={language.t("kanban.empty.noData")}>
            {language.t("kanban.pagination.showing", { from: from(), to: to(), total: props.total })}
          </Show>
        </div>
        <div class="flex flex-wrap items-center justify-end gap-2">
          <div class="flex items-center gap-2">
            <span class="text-[0.8125rem] text-[var(--native-muted)]">{language.t("kanban.pagination.perPage")}</span>
            <SelectRoot
              collection={createListCollection({ items: sizes().map((s) => ({ label: String(s), value: String(s) })) })}
              value={[String(props.pageSize)]}
              onValueChange={(detail) => {
                const v = Number(detail.value[0])
                if (!isNaN(v)) props.onPageSizeChange(v)
              }}
            >
              <SelectControl>
                <SelectTrigger class="h-8 min-w-[4.5rem] px-3 py-0 text-[0.8125rem] text-[var(--native-foreground)]">
                  <SelectValueText />
                  <SelectIndicator />
                </SelectTrigger>
              </SelectControl>
              <SelectPositioner>
                <SelectContent>
                  <SelectList>
                    <For each={sizes()}>
                      {(size) => (
                        <SelectItem item={{ label: String(size), value: String(size) }}>
                          <SelectItemText>{size}</SelectItemText>
                        </SelectItem>
                      )}
                    </For>
                  </SelectList>
                </SelectContent>
              </SelectPositioner>
            </SelectRoot>
          </div>
          <button
            type="button"
            class="inline-flex h-8 w-8 items-center justify-center rounded-[var(--native-radius-full)] border border-transparent bg-transparent text-[var(--native-muted)] transition-[background-color,color,border-color] hover:bg-[color:color-mix(in_oklab,var(--native-surface)_72%,transparent)] hover:text-[var(--native-foreground)] disabled:cursor-not-allowed disabled:opacity-[var(--native-disabled-opacity)]"
            disabled={props.page <= 1}
            onClick={() => props.onPageChange(props.page - 1)}
          >
            <Icon name="chevron-left" />
          </button>
          <For each={visiblePages()}>
            {(page) => (
              <button
                type="button"
                class={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-[var(--native-radius-full)] border border-transparent bg-transparent text-[var(--native-muted)] transition-[background-color,color,border-color] hover:bg-[color:color-mix(in_oklab,var(--native-surface)_72%,transparent)] hover:text-[var(--native-foreground)] disabled:cursor-not-allowed disabled:opacity-[var(--native-disabled-opacity)]",
                  page === props.page && "border-[color:color-mix(in_srgb,var(--native-primary)_28%,transparent)] bg-[var(--native-primary)] text-[var(--native-primary-foreground)]",
                )}
                onClick={() => props.onPageChange(page)}
              >
                {page}
              </button>
            )}
          </For>
          <button
            type="button"
            class="inline-flex h-8 w-8 items-center justify-center rounded-[var(--native-radius-full)] border border-transparent bg-transparent text-[var(--native-muted)] transition-[background-color,color,border-color] hover:bg-[color:color-mix(in_oklab,var(--native-surface)_72%,transparent)] hover:text-[var(--native-foreground)] disabled:cursor-not-allowed disabled:opacity-[var(--native-disabled-opacity)]"
            disabled={props.page >= pages()}
            onClick={() => props.onPageChange(props.page + 1)}
          >
            <Icon name="chevron-right" />
          </button>
        </div>
      </div>
    </section>
  )
}

export default FilterTable