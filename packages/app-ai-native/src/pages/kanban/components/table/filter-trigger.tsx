import { useLanguage } from "@/context/language"
import { cn } from "@/lib/utils"

type Props = {
  label: string
  active?: boolean
  open?: boolean
  onClick: () => void
}

export function FilterTrigger(props: Props) {
  const language = useLanguage()
  return (
    <button
      type="button"
      class={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors",
        props.active || props.open
          ? "bg-[var(--native-primary-soft)] text-[var(--native-primary)]"
          : "text-[var(--native-dim)] hover:bg-[color:color-mix(in_oklab,var(--native-border)_14%,transparent)] hover:text-[var(--native-foreground)]",
      )}
      onClick={props.onClick}
      aria-label={language.t("kanban.aria.filterLabel", { label: props.label })}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-3.5 w-3.5">
        <path d="M4 6h16" />
        <path d="M7 12h10" />
        <path d="M10 18h4" />
      </svg>
    </button>
  )
}

export default FilterTrigger