import type { JSX } from "solid-js"
import { For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import type { FilterTag } from "../../lib/types"

type Props = {
  tags: FilterTag[]
  actions?: JSX.Element
  onEdit: (prop: string) => void
  onRemove: (prop: string) => void
  onClearAll: () => void
}

export function FilterTagBar(props: Props) {
  const language = useLanguage()
  return (
    <Show when={props.tags.length > 0 || props.actions}>
      <div class="flex flex-col gap-3 border-b border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
        <Show when={props.tags.length > 0}>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-[0.8125rem] text-[var(--native-muted)]">{language.t("kanban.filter.filters")}</span>
            <For each={props.tags}>
              {(tag) => (
                <div class="inline-flex items-center gap-1 rounded-full border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--native-surface)_82%,var(--native-panel))] px-3 py-1 text-[0.75rem] text-[var(--native-foreground)] shadow-[var(--native-shadow-sm)]">
                  <button type="button" class="truncate text-left" onClick={() => props.onEdit(tag.prop)}>
                    {tag.label}: {tag.display}
                  </button>
                  <button type="button" class="text-[var(--native-dim)] hover:text-[var(--native-primary)]" onClick={() => props.onRemove(tag.prop)} aria-label={language.t("kanban.aria.removeLabel", { label: tag.label })}>
                    ×
                  </button>
                </div>
              )}
            </For>
            <button type="button" class="text-[0.75rem] text-[var(--native-primary)] hover:underline" onClick={props.onClearAll}>
              {language.t("kanban.action.clearAll")}
            </button>
          </div>
        </Show>
        {props.actions ? <div class="flex flex-wrap items-center gap-2 self-end lg:ml-auto lg:self-auto">{props.actions}</div> : null}
      </div>
    </Show>
  )
}

export default FilterTagBar