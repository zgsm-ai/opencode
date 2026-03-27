import { For } from "solid-js"
import { useLanguage } from "@/context/language"
import { categoryKey } from "../lib/constants"

export function CategoryFilter(props: {
  categories: { id: string; count: number }[]
  selected: string
  onSelect: (id: string) => void
}) {
  const language = useLanguage()

  const active = "bg-surface-inset-base border border-border-weak-base text-text-strong"
  const idle = "text-text-weak hover:text-text-strong hover:bg-surface-inset-base"

  return (
    <div class="flex flex-wrap items-center gap-1 mb-6">
      <button
        onClick={() => props.onSelect("all")}
        class={`px-4 py-1.5 text-sm rounded-full transition-colors cursor-pointer ${props.selected === "all" ? active : idle}`}
      >
        {language.t("store.console.filters.all")}
      </button>
      <For each={props.categories}>
        {(cat) => (
          <button
            onClick={() => props.onSelect(cat.id)}
            class={`px-4 py-1.5 text-sm rounded-full transition-colors cursor-pointer ${props.selected === cat.id ? active : idle}`}
          >
            {language.t(categoryKey(cat.id))}
          </button>
        )}
      </For>
    </div>
  )
}
