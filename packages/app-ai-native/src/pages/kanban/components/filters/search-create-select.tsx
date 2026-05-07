import { createMemo, createSignal, Show } from "solid-js"
import { List } from "@opencode-ai/ui/list"
import { Popover } from "@opencode-ai/ui/popover"
import { useLanguage } from "@/context/language"
import { cn } from "@/lib/utils"
import type { FilterOption } from "../../lib/types"

type Option = FilterOption

type Props = {
  value?: string
  options: string[] | Option[]
  onChange: (value: string) => void
  onCreate?: (value: string) => void
  clearable?: boolean
  allowCreate?: boolean
  loading?: boolean
  placeholder?: string
  emptyMessage?: string
  class?: string
}

function normalize(items: Props["options"]) {
  return items.map((item) => (typeof item === "string" ? { label: item, value: item } : item))
}

export function SearchCreateSelect(props: Props) {
  const language = useLanguage()
  const [open, setOpen] = createSignal(false)
  const [query, setQuery] = createSignal("")
  const items = createMemo(() => normalize(props.options))
  const current = createMemo(() => items().find((item) => item.value === (props.value ?? "")))
  const canCreate = createMemo(() => {
    const txt = query().trim()
    if (!txt || props.allowCreate === false) return false
    return !items().some((item) => item.value.toLowerCase() === txt.toLowerCase())
  })

  const commitCreate = () => {
    const txt = query().trim()
    if (!txt) return
    props.onCreate?.(txt)
    props.onChange(txt)
    setOpen(false)
  }

  return (
    <Popover
      open={open()}
      onOpenChange={setOpen}
      placement="bottom-start"
      gutter={8}
      class="w-[min(22rem,calc(100vw-2rem))] rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] p-2 shadow-[var(--native-shadow-lg)]"
      trigger={
        <div
          class={cn(
            "flex h-10 w-full items-center gap-2 rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_34%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_88%,var(--native-bg-subtle))] px-3 text-left text-sm shadow-[var(--native-shadow-sm)] transition-colors hover:border-[color:color-mix(in_oklab,var(--native-primary)_24%,var(--native-border))]",
            props.class,
          )}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4 shrink-0 text-[var(--native-dim)]">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span class={cn("truncate", props.value ? "text-[var(--native-foreground)]" : "text-[var(--native-dim)]")}>
            {props.value || props.placeholder || language.t("kanban.search.searchAndSelect")}
          </span>
          <Show when={props.clearable && props.value}>
            <button
              type="button"
              class="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--native-dim)] transition-colors hover:bg-[var(--native-primary-soft)] hover:text-[var(--native-primary)]"
              onClick={(e) => {
                e.stopPropagation()
                props.onChange("")
                setQuery("")
                setOpen(false)
              }}
              aria-label={language.t("kanban.aria.clearSelection")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-3.5 w-3.5">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </Show>
        </div>
      }
    >
      <List
        class="max-h-[22rem] [&_[data-slot=list-scroll]]:max-h-[18rem] [&_[data-slot=list-item]]:w-full [&_[data-slot=list-item]]:rounded-md [&_[data-slot=list-item]]:px-3 [&_[data-slot=list-item]]:py-2 [&_[data-slot=list-item]]:text-left [&_[data-slot=list-item]]:text-sm [&_[data-slot=list-item][data-active=true]]:bg-[var(--native-primary-soft)] [&_[data-slot=list-item][data-active=true]]:text-[var(--native-primary)]"
        search={{ placeholder: props.placeholder ?? language.t("kanban.search.searchPlaceholder"), autofocus: true }}
        emptyMessage={props.loading ? language.t("kanban.misc.loading") : (props.emptyMessage ?? language.t("kanban.search.noOptions"))}
        key={(item) => item.value}
        items={items}
        current={current()}
        filterKeys={["label", "value"]}
        onFilter={setQuery}
        onSelect={(item) => {
          if (!item) return
          props.onChange(item.value)
          setOpen(false)
        }}
        add={canCreate() ? {
          render: () => (
            <button
              type="button"
              class="mt-2 flex w-full items-center justify-between rounded-md border border-dashed border-[color:color-mix(in_oklab,var(--native-primary)_28%,transparent)] px-3 py-2 text-left text-sm text-[var(--native-primary)] transition-colors hover:bg-[var(--native-primary-soft)]"
              onClick={commitCreate}
            >
              <span>{language.t("kanban.action.create")}</span>
              <span class="truncate font-medium">{query().trim()}</span>
            </button>
          ),
        } : undefined}
      >
        {(item) => (
          <div class="flex min-w-0 items-center justify-between gap-3">
            <span class="truncate">{item.label}</span>
            <span class="text-[0.75rem] text-[var(--native-dim)]">{item.value}</span>
          </div>
        )}
      </List>
    </Popover>
  )
}

export default SearchCreateSelect