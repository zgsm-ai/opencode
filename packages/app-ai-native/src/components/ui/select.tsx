import { Select as Ark, createListCollection } from "@ark-ui/solid/select"
import type { SelectRootProps as ArkRootProps } from "@ark-ui/solid/select"
import { ChevronDown } from "lucide-solid"
import { Portal } from "solid-js/web"
import { Show, splitProps, type ComponentProps, type ParentProps } from "solid-js"

import { cn } from "@/lib/utils"

export { createListCollection }
export type { SelectValueChangeDetails } from "@ark-ui/solid/select"

export function SelectRoot(props: ArkRootProps<any>) {
  const [local, rest] = splitProps(props as Record<string, any>, ["class"])
  return <Ark.Root class={cn(local.class)} {...(rest as any)} />
}

export interface SelectTriggerProps extends ComponentProps<typeof Ark.Trigger> {}
export interface SelectValueTextProps extends ComponentProps<typeof Ark.ValueText> {}
export interface SelectControlProps extends ComponentProps<typeof Ark.Control> {}
export interface SelectIndicatorProps extends ComponentProps<typeof Ark.Indicator> {}
export interface SelectPositionerProps extends ComponentProps<typeof Ark.Positioner> {}
export interface SelectContentProps extends ComponentProps<typeof Ark.Content> {}
export interface SelectListProps extends ComponentProps<typeof Ark.List> {}
export interface SelectItemProps extends ComponentProps<typeof Ark.Item> {}
export interface SelectItemTextProps extends ComponentProps<typeof Ark.ItemText> {}
export interface SelectItemIndicatorProps extends ComponentProps<typeof Ark.ItemIndicator> {}

export function SelectTrigger(props: ParentProps<SelectTriggerProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.Trigger
      class={cn(
        "flex items-center justify-between gap-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        local.class,
      )}
      {...rest}
    >
      {local.children}
    </Ark.Trigger>
  )
}

export function SelectValueText(props: SelectValueTextProps) {
  const [local, rest] = splitProps(props, ["class"])
  return <Ark.ValueText class={cn(local.class)} {...rest} />
}

export function SelectControl(props: ParentProps<SelectControlProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.Control class={cn(local.class)} {...rest}>
      {local.children}
    </Ark.Control>
  )
}

export function SelectIndicator(props: ParentProps<SelectIndicatorProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.Indicator class={cn("flex items-center", local.class)} {...rest}>
      <Show when={local.children} fallback={<ChevronDown class="size-4" />}>
        {local.children}
      </Show>
    </Ark.Indicator>
  )
}

export function SelectPositioner(props: ParentProps<SelectPositionerProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Portal>
      <Ark.Positioner class={cn("z-50", local.class)} {...rest}>
        {local.children}
      </Ark.Positioner>
    </Portal>
  )
}

export function SelectContent(props: ParentProps<SelectContentProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.Content
      class={cn("overflow-hidden rounded-md border border-border bg-[var(--native-panel)] text-[var(--native-foreground)] shadow-md outline-none", local.class)}
      {...rest}
    >
      {local.children}
    </Ark.Content>
  )
}

export function SelectList(props: ParentProps<SelectListProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.List class={cn(local.class)} {...rest}>
      {local.children}
    </Ark.List>
  )
}

export function SelectItem(props: ParentProps<SelectItemProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.Item
      class={cn(
        "px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        local.class,
      )}
      {...rest}
    >
      {local.children}
    </Ark.Item>
  )
}

export function SelectItemText(props: SelectItemTextProps) {
  const [local, rest] = splitProps(props, ["class"])
  return <Ark.ItemText class={cn(local.class)} {...rest} />
}

export function SelectItemIndicator(props: ParentProps<SelectItemIndicatorProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.ItemIndicator class={cn(local.class)} {...rest}>
      {local.children}
    </Ark.ItemIndicator>
  )
}
