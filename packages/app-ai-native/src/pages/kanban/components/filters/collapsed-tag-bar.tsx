import { For, Show } from "solid-js"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/context/language"

type Tag = {
  key: string
  label: string
}

type Props = {
  tags: Tag[]
  onExpand: (key: string) => void
}

export function CollapsedTagBar(props: Props) {
  const language = useLanguage()
  return (
    <Show when={props.tags.length > 0}>
      <div class="fixed right-0 top-[72px] z-40 flex max-w-[12rem] flex-col gap-1 rounded-l-[var(--native-radius-lg)] border border-r-0 border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_92%,var(--native-bg-subtle))] px-2 py-2 shadow-[var(--native-shadow-md)]">
        <div class="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--native-dim)]">{language.t("kanban.tag.collapsed")}</div>
        <For each={props.tags}>
          {(tag) => (
            <button
              type="button"
              class={cn(
                "group flex items-center gap-2 rounded-l-[var(--native-radius-md)] px-2 py-2 text-left text-[0.8125rem] text-[var(--native-muted)] transition-all hover:bg-[var(--native-primary-soft)] hover:text-[var(--native-primary)]",
              )}
              title={language.t("kanban.tag.expandTitle", { label: tag.label })}
              onClick={() => props.onExpand(tag.key)}
            >
              <svg viewBox="0 0 16 16" fill="none" class="h-3 w-3 shrink-0 opacity-70 transition-opacity group-hover:opacity-100">
                <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span class="truncate">{tag.label}</span>
            </button>
          )}
        </For>
      </div>
    </Show>
  )
}

export default CollapsedTagBar