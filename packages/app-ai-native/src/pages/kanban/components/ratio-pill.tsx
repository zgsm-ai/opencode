import { formatPercent } from "../lib/formatters"

type Props = {
  value?: number | null
  digits?: number
}

function tone(value?: number | null) {
  if (value == null || value <= 0) return "border-border bg-muted/40 text-muted-foreground"
  if (value >= 300) return "border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
  if (value >= 150) return "border-sky-500/30 bg-sky-500/12 text-sky-700 dark:text-sky-300"
  return "border-border bg-muted/50 text-muted-foreground"
}

export function RatioPill(props: Props) {
  const label = () => props.value == null || props.value <= 0 ? "-" : formatPercent(props.value, props.digits ?? 0)

  return (
    <span class={`inline-flex min-w-[4.5rem] items-center justify-center rounded-full border px-2 py-1 text-xs font-medium ${tone(props.value)}`}>
      {label()}
    </span>
  )
}

export default RatioPill