import { DatePicker as Ark, parseDate } from "@ark-ui/solid/date-picker"
import { Portal } from "solid-js/web"
import { Show, children, splitProps, type ComponentProps, type ParentProps } from "solid-js"

import { cn } from "@/lib/utils"

export { parseDate }
export type {
  DatePickerDateView,
  DatePickerSelectionMode,
  DatePickerValueChangeDetails,
  DateValue,
} from "@ark-ui/solid/date-picker"

export interface DatePickerProps extends ComponentProps<typeof Ark.Root> {}
export interface DatePickerContextProps extends ComponentProps<typeof Ark.Context> {}
export interface DatePickerControlProps extends ComponentProps<typeof Ark.Control> {}
export interface DatePickerInputProps extends ComponentProps<typeof Ark.Input> {}
export interface DatePickerTriggerProps extends ComponentProps<typeof Ark.Trigger> {}
export interface DatePickerPositionerProps extends ComponentProps<typeof Ark.Positioner> {}
export interface DatePickerContentProps extends ComponentProps<typeof Ark.Content> {}
export interface DatePickerViewProps extends ComponentProps<typeof Ark.View> {}
export interface DatePickerViewControlProps extends ComponentProps<typeof Ark.ViewControl> {}
export interface DatePickerPrevTriggerProps extends ComponentProps<typeof Ark.PrevTrigger> {}
export interface DatePickerNextTriggerProps extends ComponentProps<typeof Ark.NextTrigger> {}
export interface DatePickerViewTriggerProps extends ComponentProps<typeof Ark.ViewTrigger> {}
export interface DatePickerRangeTextProps extends ComponentProps<typeof Ark.RangeText> {}
export interface DatePickerTableProps extends ComponentProps<typeof Ark.Table> {}
export interface DatePickerTableHeadProps extends ComponentProps<typeof Ark.TableHead> {}
export interface DatePickerTableBodyProps extends ComponentProps<typeof Ark.TableBody> {}
export interface DatePickerTableRowProps extends ComponentProps<typeof Ark.TableRow> {}
export interface DatePickerTableHeaderProps extends ComponentProps<typeof Ark.TableHeader> {}
export interface DatePickerTableCellProps extends ComponentProps<typeof Ark.TableCell> {}
export interface DatePickerTableCellTriggerProps extends ComponentProps<typeof Ark.TableCellTrigger> {}

function calendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-4">
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
    </svg>
  )
}

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

export function DatePicker(props: DatePickerProps) {
  const [local, rest] = splitProps(props, ["class"])
  return <Ark.Root class={cn("flex flex-col gap-3", local.class)} {...rest} />
}

export function DatePickerContext(props: DatePickerContextProps) {
  return <Ark.Context {...props} />
}

export function DatePickerControl(props: ParentProps<DatePickerControlProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.Control class={cn("grid gap-3 sm:grid-cols-2", local.class)} {...rest}>
      {local.children}
    </Ark.Control>
  )
}

export function DatePickerInput(props: DatePickerInputProps) {
  const [local, rest] = splitProps(props, ["class"])
  return (
    <Ark.Input
      class={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        local.class,
      )}
      {...rest}
    />
  )
}

export function DatePickerTrigger(props: ParentProps<DatePickerTriggerProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.Trigger
      class={cn(
        "inline-flex size-8 items-center justify-center rounded-md border border-input bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
        local.class,
      )}
      {...rest}
    >
      {local.children ?? calendar()}
    </Ark.Trigger>
  )
}

export function DatePickerPositioner(props: ParentProps<DatePickerPositionerProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Portal>
      <Ark.Positioner class={cn("z-50", local.class)} {...rest}>
        {local.children}
      </Ark.Positioner>
    </Portal>
  )
}

export function DatePickerContent(props: ParentProps<DatePickerContentProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.Content class={cn("flex flex-col gap-3 rounded-lg border border-border bg-background p-3 shadow-md outline-none", local.class)} {...rest}>
      {local.children}
    </Ark.Content>
  )
}

export function DatePickerView(props: ParentProps<DatePickerViewProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.View class={cn("flex flex-col gap-3", local.class)} {...rest}>
      {local.children}
    </Ark.View>
  )
}

export function DatePickerViewControl(props: ParentProps<DatePickerViewControlProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.ViewControl class={cn("flex items-center justify-between gap-2", local.class)} {...rest}>
      {local.children}
    </Ark.ViewControl>
  )
}

export function DatePickerPrevTrigger(props: ParentProps<DatePickerPrevTriggerProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  const body = children(() => local.children)
  return (
    <Ark.PrevTrigger
      class={cn(
        "inline-flex size-8 items-center justify-center rounded-md border border-input bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
        local.class,
      )}
      {...rest}
    >
      <Show when={body.toArray().length > 0} fallback={left()}>
        {body()}
      </Show>
    </Ark.PrevTrigger>
  )
}

export function DatePickerNextTrigger(props: ParentProps<DatePickerNextTriggerProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  const body = children(() => local.children)
  return (
    <Ark.NextTrigger
      class={cn(
        "inline-flex size-8 items-center justify-center rounded-md border border-input bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
        local.class,
      )}
      {...rest}
    >
      <Show when={body.toArray().length > 0} fallback={right()}>
        {body()}
      </Show>
    </Ark.NextTrigger>
  )
}

export function DatePickerViewTrigger(props: ParentProps<DatePickerViewTriggerProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.ViewTrigger
      class={cn(
        "inline-flex min-h-8 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
        local.class,
      )}
      {...rest}
    >
      {local.children}
    </Ark.ViewTrigger>
  )
}

export function DatePickerRangeText(props: DatePickerRangeTextProps) {
  const [local, rest] = splitProps(props, ["class"])
  return <Ark.RangeText class={cn("text-sm font-medium text-foreground", local.class)} {...rest} />
}

export function DatePickerTable(props: ParentProps<DatePickerTableProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.Table class={cn("w-full border-separate border-spacing-1", local.class)} {...rest}>
      {local.children}
    </Ark.Table>
  )
}

export function DatePickerTableHead(props: ParentProps<DatePickerTableHeadProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return <Ark.TableHead class={cn(local.class)} {...rest}>{local.children}</Ark.TableHead>
}

export function DatePickerTableBody(props: ParentProps<DatePickerTableBodyProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return <Ark.TableBody class={cn(local.class)} {...rest}>{local.children}</Ark.TableBody>
}

export function DatePickerTableRow(props: ParentProps<DatePickerTableRowProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return <Ark.TableRow class={cn(local.class)} {...rest}>{local.children}</Ark.TableRow>
}

export function DatePickerTableHeader(props: ParentProps<DatePickerTableHeaderProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.TableHeader class={cn("h-8 w-10 text-center text-xs font-medium text-muted-foreground", local.class)} {...rest}>
      {local.children}
    </Ark.TableHeader>
  )
}

export function DatePickerTableCell(props: ParentProps<DatePickerTableCellProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.TableCell
      class={cn(
        "rounded-md p-0 text-center data-[in-range]:bg-primary/10 data-[range-end]:rounded-r-md data-[range-start]:rounded-l-md",
        local.class,
      )}
      {...rest}
    >
      {local.children}
    </Ark.TableCell>
  )
}

export function DatePickerTableCellTrigger(props: ParentProps<DatePickerTableCellTriggerProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.TableCellTrigger
      class={cn(
        "flex size-9 items-center justify-center rounded-md text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 data-[disabled]:pointer-events-none data-[disabled]:text-muted-foreground/45 data-[in-range]:bg-primary/10 data-[outside-range]:text-muted-foreground/55 data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[selected]:hover:bg-primary data-[today]:border data-[today]:border-primary/40",
        local.class,
      )}
      {...rest}
    >
      {local.children ?? calendar()}
    </Ark.TableCellTrigger>
  )
}