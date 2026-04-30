import { createEffect, createMemo, createSignal, For } from "solid-js"
import { useFilter } from "@ark-ui/solid/locale"
import { useLanguage } from "@/context/language"
import { Button } from "@/components/ui/button"
import {
  ListboxContent,
  ListboxEmpty,
  ListboxInput,
  ListboxItem,
  ListboxItemIndicator,
  ListboxItemText,
  ListboxRoot,
  useListCollection,
} from "@/components/ui/listbox"
import { TextField, TextFieldInput, TextFieldLabel } from "@/components/ui/text-field"
import { deriveFilterOptions } from "../../lib/filter-utils"
import type { DateRangeValue, EfficiencyRow, FilterValue, KanbanColumn, OrgCascadeValue } from "../../lib/types"
import { DateRangePicker } from "../filters/date-range-picker"
import { OrgCascadeSelect } from "../filters/org-cascade-select"
import { SearchCreateSelect } from "../filters/search-create-select"

type Props<Row extends EfficiencyRow> = {
  column: KanbanColumn<Row>
  rows: Row[]
  value: FilterValue | undefined
  dateRange?: DateRangeValue
  onChange: (value: FilterValue | undefined) => void
  onApply: () => void
  onReset: () => void
}

export function FilterPanel<Row extends EfficiencyRow>(props: Props<Row>) {
  const language = useLanguage()
  const opts = createMemo(() => deriveFilterOptions(props.column, props.rows))
  const type = () => props.column.filter?.type
  const shortcuts = () => props.column.filter?.shortcuts ?? []
  const intl = useFilter({ sensitivity: "base" })
  const list = useListCollection(() => ({
    initialItems: opts(),
    filter: (txt, q) => intl().contains(txt, q),
  }))
  const [q, setQ] = createSignal("")
  const sel = () => (Array.isArray(props.value) ? props.value : [])

  createEffect(() => {
    list.set(opts())
    setQ("")
  })

  return (
    <div class="flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-4 p-4">
      <div>
        <div class="text-sm font-semibold text-[var(--native-foreground)]">{language.t("kanban.filter.title", { label: props.column.label })}</div>
        <div class="mt-1 text-[0.75rem] text-[var(--native-muted)]">{language.t("kanban.filter.description")}</div>
      </div>

      {type() === "text" ? (
        <TextField class="gap-2">
          <TextFieldLabel class="text-[0.75rem] text-[var(--native-muted)]">{language.t("kanban.filter.keyword")}</TextFieldLabel>
          <TextFieldInput value={(props.value as string) ?? ""} onInput={(e) => props.onChange(e.currentTarget.value)} placeholder={props.column.filter?.placeholder ?? language.t("kanban.filter.enterKeyword")} />
        </TextField>
      ) : null}

      {type() === "search-select" ? (
        <SearchCreateSelect
          value={(props.value as string) ?? ""}
          options={opts()}
          onChange={(value) => props.onChange(value)}
          onCreate={(value) => props.onChange(value)}
          clearable
          placeholder={props.column.filter?.placeholder ?? language.t("kanban.filter.selectOrEnter")}
        />
      ) : null}

      {type() === "date" ? (
        <DateRangePicker value={(props.value as DateRangeValue) ?? null} onChange={props.onChange} clearable placeholder={props.column.filter?.placeholder ?? language.t("kanban.filter.selectDateRange")} />
      ) : null}

      {type() === "number" ? (
        <div class="grid gap-3 sm:grid-cols-2">
          <TextField class="gap-2">
            <TextFieldLabel class="text-[0.75rem] text-[var(--native-muted)]">{language.t("kanban.filter.min")}</TextFieldLabel>
            <TextFieldInput type="number" value={String((props.value as { min?: number })?.min ?? "")} onInput={(e) => props.onChange({ ...(props.value as { min?: number; max?: number }), min: e.currentTarget.value ? Number(e.currentTarget.value) : undefined })} />
          </TextField>
          <TextField class="gap-2">
            <TextFieldLabel class="text-[0.75rem] text-[var(--native-muted)]">{language.t("kanban.filter.max")}</TextFieldLabel>
            <TextFieldInput type="number" value={String((props.value as { max?: number })?.max ?? "")} onInput={(e) => props.onChange({ ...(props.value as { min?: number; max?: number }), max: e.currentTarget.value ? Number(e.currentTarget.value) : undefined })} />
          </TextField>
        </div>
      ) : null}

      {type() === "enum" || type() === "multi-select" ? (
        <ListboxRoot
          collection={list.collection()}
          value={sel()}
          selectionMode="multiple"
          onValueChange={(detail) => props.onChange(detail.value)}
          class="gap-2"
        >
          <ListboxInput
            value={q()}
            onInput={(e) => {
              setQ(e.currentTarget.value)
              list.filter(e.currentTarget.value)
            }}
            placeholder={props.column.filter?.placeholder ?? language.t("kanban.filter.enterKeyword")}
            class="h-9 border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--native-surface)_82%,var(--native-panel))] text-[var(--native-foreground)] placeholder:text-[var(--native-dim)] focus-visible:ring-[var(--native-primary)]"
          />
          <ListboxContent class="max-h-[min(16rem,40vh)] rounded-[var(--native-radius-md)] border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] text-[var(--native-foreground)] shadow-none">
            <ListboxEmpty>{language.t("kanban.empty.noData")}</ListboxEmpty>
            <For each={list.collection().items}>
              {(item) => (
                <ListboxItem
                  item={item}
                  class="cursor-pointer rounded-[var(--native-radius-sm)] text-[var(--native-foreground)] data-[highlighted]:bg-[var(--native-primary-soft)] data-[highlighted]:text-[var(--native-primary)] data-[selected]:bg-[var(--native-primary-soft)] data-[selected]:text-[var(--native-primary)]"
                >
                  <ListboxItemText>{item.label}</ListboxItemText>
                  <ListboxItemIndicator />
                </ListboxItem>
              )}
            </For>
          </ListboxContent>
        </ListboxRoot>
      ) : null}

      {type() === "cascade-org" ? (
        <OrgCascadeSelect value={(props.value as OrgCascadeValue) ?? {}} dateRange={props.dateRange} onChange={props.onChange as (value: OrgCascadeValue) => void} />
      ) : null}

      {shortcuts().length ? (
        <div class="flex flex-wrap gap-2">
          <For each={shortcuts()}>
            {(item) => (
              <button
                type="button"
                class="rounded-full border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--native-surface)_82%,var(--native-panel))] px-3 py-1 text-[0.75rem] text-[var(--native-muted)] transition-colors hover:bg-[var(--native-primary-soft)] hover:text-[var(--native-primary)]"
                onClick={() => props.onChange(item.value as FilterValue)}
              >
                {item.label}
              </button>
            )}
          </For>
        </div>
      ) : null}

      <div class="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={props.onReset}>{language.t("common.reset")}</Button>
        <Button size="sm" onClick={props.onApply}>{language.t("common.apply")}</Button>
      </div>
    </div>
  )
}

export default FilterPanel