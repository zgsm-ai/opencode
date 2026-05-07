import { DatePicker, parseDate, type DateValue } from "@ark-ui/solid/date-picker"
import { createEffect, createMemo, createSignal, For, Index, Show } from "solid-js"
import { Popover } from "@opencode-ai/ui/popover"
import { useLanguage } from "@/context/language"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { dateShortcuts, detectShortcut, displayDateRange, formatDay, hasRange, normalizeDateRange, shortcutRange } from "../../lib/date-range"
import type { DateRangeValue } from "../../lib/types"
import "./date-range-calendar.css"

type Props = {
  value?: DateRangeValue
  onChange: (value: DateRangeValue) => void
  clearable?: boolean
  placeholder?: string
  size?: "sm" | "default" | "lg"
  fullWidth?: boolean
}

const sizeClass = {
  sm: "h-8 min-w-[13rem] text-xs",
  default: "h-10 min-w-[15rem] text-sm",
  lg: "h-11 min-w-[16rem] text-sm",
} as const

const nav = "inline-flex size-8 items-center justify-center rounded-md border border-input bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none active:scale-95"
const view = "inline-flex min-h-8 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
const table = "kb-date-range__table w-full"
const head = "h-8 w-10 text-center text-xs font-medium text-muted-foreground"
const cell = "kb-date-range__cell"
const day = "kb-date-range__day"
const grid = "kb-date-range__grid"

function left() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" class="size-4">
      <path d="M12.5 5 7.5 10l5 5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  )
}

function right() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" class="size-4">
      <path d="m7.5 5 5 5-5 5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  )
}

function monthViewLabel(value: { start: { year: number }; end: { year: number } }) {
  return value.start.year === value.end.year ? String(value.start.year) : `${value.start.year} - ${value.end.year}`
}

function yearViewLabel(value: { start?: number; end?: number }, t: (key: string) => string) {
  if (value.start == null || value.end == null) return t("kanban.date.selectYear")
  return `${value.start} - ${value.end}`
}

function later(fn: () => void) {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => fn())
    return
  }

  setTimeout(fn, 0)
}

export function DateRangePicker(props: Props) {
  const language = useLanguage()
  const [open, setOpen] = createSignal(false)
  const [start, setStart] = createSignal("")
  const [end, setEnd] = createSignal("")
  const [pick, setPick] = createSignal<DateValue[]>([])
  const label = createMemo(() => displayDateRange(props.value, props.placeholder ?? language.t("kanban.filter.selectDateRange")))
  const filled = createMemo(() => hasRange(props.value))
  const active = createMemo(() => detectShortcut([start(), end()]))
  const syncFromRange = (value?: DateRangeValue) => {
    const next = normalizeDateRange(value)
    setStart(next?.[0] ?? "")
    setEnd(next?.[1] ?? "")
    setPick(next ? next.map((item) => parseDate(item)) : [])
  }

  const commit = (value: DateRangeValue) => {
    syncFromRange(value)
    setOpen(false)
    later(() => props.onChange(value))
  }

  const syncDraft = (value: DateValue[]) => {
    const next = value.filter(Boolean)
    setPick(next)
    setStart(next[0]?.toString() ?? "")
    setEnd(next[1]?.toString() ?? "")

    const range = normalizeDateRange(next.map((item) => item.toString()) as DateRangeValue)
    if (range) commit(range)
  }

  const handleOpenChange = (next: boolean) => {
    syncFromRange(props.value)
    setOpen(next)
  }

  const clear = () => {
    syncFromRange(null)
    setOpen(false)
    later(() => props.onChange(null))
  }

  createEffect(() => {
    if (!open()) syncFromRange(props.value)
  })

  return (
    <Popover
      open={open()}
      onOpenChange={handleOpenChange}
      placement="bottom-end"
      gutter={8}
      flip={false}
      overflowPadding={16}
      triggerAs="div"
      triggerProps={{
        class: cn(
          "flex items-center gap-2 rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_34%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_88%,var(--native-bg-subtle))] px-3 text-left shadow-[var(--native-shadow-sm)] transition-colors hover:border-[color:color-mix(in_oklab,var(--native-primary)_24%,var(--native-border))] focus:outline-none cursor-pointer",
          props.fullWidth === false ? "w-auto max-w-full" : "w-full",
          open() && "border-[color:color-mix(in_oklab,var(--native-primary)_40%,var(--native-border))]",
          sizeClass[props.size ?? "default"],
        ),
      }}
      class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] p-0 shadow-[var(--native-shadow-lg)] [&_[data-slot=popover-body]]:p-0"
      style={{
        width: "min(760px, calc(100vw - 2rem))",
        "min-width": "0",
        "max-width": "min(760px, calc(100vw - 2rem))",
      }}
      trigger={
        <>
          <span class={cn("min-w-0 flex-1 truncate whitespace-nowrap", filled() ? "text-[var(--native-foreground)]" : "text-[var(--native-dim)]")}>
            {label()}
          </span>

          <div class="ml-auto flex items-center gap-1">
            <Show when={props.clearable && filled()}>
              <button
                type="button"
                class="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--native-dim)] transition-colors hover:bg-[var(--native-primary-soft)] hover:text-[var(--native-primary)]"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  clear()
                }}
                aria-label={language.t("kanban.aria.clearDateRange")}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-3.5 w-3.5">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </Show>

            <span class="inline-flex h-7 w-7 items-center justify-center text-[var(--native-dim)] transition-colors hover:text-[var(--native-foreground)]" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4 shrink-0">
                <path d="M8 2v4" />
                <path d="M16 2v4" />
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M3 10h18" />
              </svg>
            </span>
          </div>
        </>
      }
    >
          <DatePicker.Root
            inline
            open
            closeOnSelect={false}
            selectionMode="range"
            numOfMonths={2}
            startOfWeek={1}
            class="flex flex-col gap-3"
            value={pick()}
            onValueChange={(details) => syncDraft(details.value)}
            format={(item) => formatDay(item.toDate("UTC"))}
          >
            <div class="w-[min(760px,calc(100vw-2rem))] max-w-[min(760px,calc(100vw-2rem))] overflow-hidden rounded-[var(--native-radius-lg)] border-0 bg-[var(--native-panel)] p-0 shadow-none">
              <div class="flex flex-col md:flex-row md:gap-3">
                <div class="flex flex-wrap content-start gap-1 border-b border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] p-3 md:w-[120px] md:flex-none md:flex-col md:flex-nowrap md:border-b-0 md:pr-0">
                  <For each={dateShortcuts}>
                    {(item) => (
                      <div
                        role="button"
                        tabIndex={-1}
                        class={cn(
                          "inline-flex h-8 w-[120px] cursor-pointer select-none items-center px-3 text-left text-[13px] leading-none whitespace-nowrap transition-colors",
                          active() === item.label
                            ? "bg-[var(--native-primary)] text-[var(--native-primary-foreground)]"
                            : "rounded-none bg-transparent text-[var(--native-muted)] hover:bg-[var(--native-primary-soft)] hover:text-[var(--native-primary)]",
                        )}
                        onClick={() => {
                          const next = shortcutRange(item.days)
                          syncFromRange(next)
                          setOpen(false)
                          later(() => props.onChange(next))
                        }}
                      >
                        {item.label}
                      </div>
                    )}
                  </For>
                </div>

                <div class="min-w-0 flex-1 bg-[color:color-mix(in_oklab,var(--native-panel)_86%,var(--native-bg-subtle))] p-3 md:my-3 md:mr-3 md:ml-0 md:rounded-[var(--native-radius-md)] md:p-4">
                  <DatePicker.View view="day" class="kb-date-range__view flex flex-col gap-4">
                    <DatePicker.Context>
                      {(api) => {
                        const offset = createMemo(() => api().getOffset({ months: 1 }))

                        return (
                          <>
                            <DatePicker.ViewControl class="flex items-center justify-between gap-2">
                              <DatePicker.PrevTrigger class={nav}>{left()}</DatePicker.PrevTrigger>
                              <DatePicker.ViewTrigger class={view}>
                                <DatePicker.RangeText class="text-sm font-medium text-foreground" />
                              </DatePicker.ViewTrigger>
                              <DatePicker.NextTrigger class={nav}>{right()}</DatePicker.NextTrigger>
                            </DatePicker.ViewControl>

                            <div class="grid gap-4 md:grid-cols-2">
                              <DatePicker.Table class={cn(table, "mx-auto")}>
                                <DatePicker.TableHead>
                                  <DatePicker.TableRow>
                                    <Index each={api().weekDays}>
                                      {(item) => <DatePicker.TableHeader class={head}>{item().short}</DatePicker.TableHeader>}
                                    </Index>
                                  </DatePicker.TableRow>
                                </DatePicker.TableHead>
                                <DatePicker.TableBody>
                                  <Index each={api().weeks}>
                                    {(week) => (
                                      <DatePicker.TableRow>
                                        <Index each={week()}>
                                          {(item) => (
                                            <DatePicker.TableCell class={cell} value={item()}>
                                              <DatePicker.TableCellTrigger class={day}>{item().day}</DatePicker.TableCellTrigger>
                                            </DatePicker.TableCell>
                                          )}
                                        </Index>
                                      </DatePicker.TableRow>
                                    )}
                                  </Index>
                                </DatePicker.TableBody>
                              </DatePicker.Table>

                              <DatePicker.Table class={cn(table, "mx-auto")}>
                                <DatePicker.TableHead>
                                  <DatePicker.TableRow>
                                    <Index each={api().weekDays}>
                                      {(item) => <DatePicker.TableHeader class={head}>{item().short}</DatePicker.TableHeader>}
                                    </Index>
                                  </DatePicker.TableRow>
                                </DatePicker.TableHead>
                                <DatePicker.TableBody>
                                  <Index each={offset().weeks}>
                                    {(week) => (
                                      <DatePicker.TableRow>
                                        <Index each={week()}>
                                          {(item) => (
                                            <DatePicker.TableCell class={cell} value={item()} visibleRange={offset().visibleRange}>
                                              <DatePicker.TableCellTrigger class={day}>{item().day}</DatePicker.TableCellTrigger>
                                            </DatePicker.TableCell>
                                          )}
                                        </Index>
                                      </DatePicker.TableRow>
                                    )}
                                  </Index>
                                </DatePicker.TableBody>
                              </DatePicker.Table>
                            </div>
                          </>
                        )
                      }}
                    </DatePicker.Context>
                  </DatePicker.View>

                  <DatePicker.View view="month" class="kb-date-range__view flex flex-col gap-4">
                    <DatePicker.Context>
                      {(api) => (
                        <>
                          <DatePicker.ViewControl class="flex items-center justify-between gap-2">
                            <DatePicker.PrevTrigger class={nav}>{left()}</DatePicker.PrevTrigger>
                            <DatePicker.ViewTrigger class={view}>{monthViewLabel(api().visibleRange)}</DatePicker.ViewTrigger>
                            <DatePicker.NextTrigger class={nav}>{right()}</DatePicker.NextTrigger>
                          </DatePicker.ViewControl>

                          <DatePicker.Table class={cn(table, "mx-auto")}>
                            <DatePicker.TableBody>
                              <For each={api().getMonthsGrid({ columns: 4, format: "short" })}>
                                {(row) => (
                                  <DatePicker.TableRow>
                                    <For each={row}>
                                      {(item) => (
                                        <DatePicker.TableCell class={cell} value={item.value}>
                                          <DatePicker.TableCellTrigger class={grid}>{item.label}</DatePicker.TableCellTrigger>
                                        </DatePicker.TableCell>
                                      )}
                                    </For>
                                  </DatePicker.TableRow>
                                )}
                              </For>
                            </DatePicker.TableBody>
                          </DatePicker.Table>
                        </>
                      )}
                    </DatePicker.Context>
                  </DatePicker.View>

                  <DatePicker.View view="year" class="kb-date-range__view flex flex-col gap-4">
                    <DatePicker.Context>
                      {(api) => (
                        <>
                          <DatePicker.ViewControl class="flex items-center justify-between gap-2">
                            <DatePicker.PrevTrigger class={nav}>{left()}</DatePicker.PrevTrigger>
                            <DatePicker.ViewTrigger class={view}>{yearViewLabel(api().getDecade(), language.t)}</DatePicker.ViewTrigger>
                            <DatePicker.NextTrigger class={nav}>{right()}</DatePicker.NextTrigger>
                          </DatePicker.ViewControl>

                          <DatePicker.Table class={cn(table, "mx-auto")}>
                            <DatePicker.TableBody>
                              <For each={api().getYearsGrid({ columns: 4 })}>
                                {(row) => (
                                  <DatePicker.TableRow>
                                    <For each={row}>
                                      {(item) => (
                                        <DatePicker.TableCell class={cell} value={item.value}>
                                          <DatePicker.TableCellTrigger class={grid}>{item.label}</DatePicker.TableCellTrigger>
                                        </DatePicker.TableCell>
                                      )}
                                    </For>
                                  </DatePicker.TableRow>
                                )}
                              </For>
                            </DatePicker.TableBody>
                          </DatePicker.Table>
                        </>
                      )}
                    </DatePicker.Context>
                  </DatePicker.View>
                </div>
              </div>

              <div class="flex items-center justify-end gap-2 border-t border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] px-4 py-3">
                <Show when={props.clearable}>
                  <Button variant="ghost" size="sm" onClick={clear}>
                    {language.t("kanban.action.clear")}
                  </Button>
                </Show>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    syncFromRange(props.value)
                    handleOpenChange(false)
                  }}
                >
                  {language.t("kanban.action.close")}
                </Button>
              </div>
            </div>
          </DatePicker.Root>
    </Popover>
  )
}

export default DateRangePicker