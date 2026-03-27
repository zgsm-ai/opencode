import { Show, createEffect } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"

export default function SearchBar(props: {
  value: string
  onChange: (v: string) => void
  onSearch?: () => void
  placeholder?: string
}) {
  let ref!: HTMLInputElement

  createEffect(() => {
    if (ref.value !== props.value) ref.value = props.value
  })

  const input = (e: InputEvent & { currentTarget: HTMLInputElement }) => {
    const v = e.currentTarget.value
    if (v !== props.value) props.onChange(v)
  }

  const submit = (e: KeyboardEvent) => {
    if (e.key === "Enter" && props.onSearch) props.onSearch()
  }

  const clear = () => props.onChange("")

  return (
    <div class="group/search flex items-center h-10 w-full rounded-full bg-surface-inset-base border border-border-weak-base transition-all duration-200 pr-1">
      <input
        ref={ref}
        type="search"
        onInput={input}
        onKeyDown={submit}
        placeholder={props.placeholder ?? "Search..."}
        class="flex-1 min-w-0 h-full pl-4 bg-transparent border-0 text-sm text-text-strong placeholder:text-text-weak focus:outline-none [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
      />

      <Show when={props.value}>
        <button
          type="button"
          onClick={clear}
          class="flex items-center justify-center size-6 rounded-full text-icon-weak hover:text-icon-strong hover:bg-surface-inset-base transition-colors cursor-pointer mr-0.5"
          title="Clear"
        >
          <Icon name="close" class="size-3.5" />
        </button>
      </Show>

      <Show when={props.onSearch}>
        <button
          type="button"
          onClick={props.onSearch}
          class="flex items-center justify-center size-8 rounded-full text-icon-weak hover:text-icon-strong hover:bg-surface-inset-base-hover transition-colors cursor-pointer shrink-0"
          title="Search"
        >
          <Icon name="magnifying-glass" class="size-3.5" />
        </button>
      </Show>
    </div>
  )
}
