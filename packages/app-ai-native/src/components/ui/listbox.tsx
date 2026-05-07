import { Listbox as Ark, createListCollection, useListbox, useListboxContext, useListboxItemContext } from "@ark-ui/solid/listbox"
import type {
  CollectionItem,
  ListboxContentProps as ArkContentProps,
  ListboxContextProps as ArkContextProps,
  ListboxEmptyProps as ArkEmptyProps,
  ListboxInputProps as ArkInputProps,
  ListboxItemContextProps as ArkItemContextProps,
  ListboxItemGroupLabelProps as ArkGroupLabelProps,
  ListboxItemGroupProps as ArkGroupProps,
  ListboxItemIndicatorProps as ArkIndicatorProps,
  ListboxItemProps as ArkItemProps,
  ListboxItemTextProps as ArkTextProps,
  ListboxLabelProps as ArkLabelProps,
  ListboxRootProviderProps as ArkProviderProps,
  ListboxRootProps as ArkRootProps,
  ListboxValueTextProps as ArkValueProps,
} from "@ark-ui/solid/listbox"
import { children, Show, splitProps, type ParentProps } from "solid-js"

import { cn } from "@/lib/utils"

export { createListCollection, useListbox, useListboxContext, useListboxItemContext }
export { useListCollection } from "@ark-ui/solid/collection"
export type {
  ListboxHighlightChangeDetails,
  ListboxScrollToIndexDetails,
  ListboxSelectionDetails,
  ListboxSelectionMode,
  ListboxValueChangeDetails,
} from "@ark-ui/solid/listbox"

function check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export type ListboxRootProps<T extends CollectionItem = CollectionItem> = ArkRootProps<T>
export interface ListboxRootProviderProps<T extends CollectionItem = CollectionItem> extends ArkProviderProps<T> {}
export interface ListboxContextProps<T extends CollectionItem = CollectionItem> extends ArkContextProps<T> {}
export interface ListboxItemContextProps extends ArkItemContextProps {}
export interface ListboxLabelProps extends ArkLabelProps {}
export interface ListboxInputProps extends ArkInputProps {}
export interface ListboxContentProps extends ArkContentProps {}
export interface ListboxEmptyProps extends ArkEmptyProps {}
export interface ListboxItemGroupProps extends ArkGroupProps {}
export interface ListboxItemGroupLabelProps extends ArkGroupLabelProps {}
export interface ListboxItemProps extends ArkItemProps {}
export interface ListboxItemTextProps extends ArkTextProps {}
export interface ListboxItemIndicatorProps extends ArkIndicatorProps {}
export interface ListboxValueTextProps extends ArkValueProps {}

export function ListboxRoot<T extends CollectionItem>(props: ParentProps<ListboxRootProps<T>>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.Root class={cn("flex flex-col gap-2", local.class)} {...rest}>
      {local.children}
    </Ark.Root>
  )
}

export const Listbox = ListboxRoot

export function ListboxContext<T extends CollectionItem>(props: ListboxContextProps<T>) {
  return <Ark.Context {...props} />
}

export function ListboxItemContext(props: ListboxItemContextProps) {
  return <Ark.ItemContext {...props} />
}

export function ListboxRootProvider<T extends CollectionItem>(props: ParentProps<ListboxRootProviderProps<T>>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.RootProvider class={cn("flex flex-col gap-2", local.class)} {...rest}>
      {local.children}
    </Ark.RootProvider>
  )
}

export function ListboxLabel(props: ParentProps<ListboxLabelProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.Label class={cn("text-sm font-medium text-foreground", local.class)} {...rest}>
      {local.children}
    </Ark.Label>
  )
}

export function ListboxInput(props: ListboxInputProps) {
  const [local, rest] = splitProps(props, ["class"])
  return (
    <Ark.Input
      class={cn(
        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        local.class,
      )}
      {...rest}
    />
  )
}

export function ListboxContent(props: ParentProps<ListboxContentProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.Content
      class={cn(
        "max-h-64 min-w-32 overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-sm outline-none data-[orientation=horizontal]:flex data-[orientation=horizontal]:items-center",
        local.class,
      )}
      {...rest}
    >
      {local.children}
    </Ark.Content>
  )
}

export function ListboxEmpty(props: ParentProps<ListboxEmptyProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.Empty class={cn("px-2 py-6 text-center text-sm text-muted-foreground", local.class)} {...rest}>
      {local.children}
    </Ark.Empty>
  )
}

export function ListboxItemGroup(props: ParentProps<ListboxItemGroupProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.ItemGroup class={cn("space-y-1", local.class)} {...rest}>
      {local.children}
    </Ark.ItemGroup>
  )
}

export function ListboxItemGroupLabel(props: ParentProps<ListboxItemGroupLabelProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.ItemGroupLabel class={cn("px-2 py-1.5 text-sm font-semibold", local.class)} {...rest}>
      {local.children}
    </Ark.ItemGroupLabel>
  )
}

export function ListboxItem(props: ParentProps<ListboxItemProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.Item
      class={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[selected]:bg-accent data-[selected]:text-accent-foreground",
        local.class,
      )}
      {...rest}
    >
      {local.children}
    </Ark.Item>
  )
}

export function ListboxItemText(props: ParentProps<ListboxItemTextProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  return (
    <Ark.ItemText class={cn("flex-1", local.class)} {...rest}>
      {local.children}
    </Ark.ItemText>
  )
}

export function ListboxItemIndicator(props: ParentProps<ListboxItemIndicatorProps>) {
  const [local, rest] = splitProps(props, ["class", "children"])
  const body = children(() => local.children)
  return (
    <Ark.ItemIndicator class={cn("ml-auto flex size-4 items-center justify-center text-primary data-[state=unchecked]:invisible", local.class)} {...rest}>
      <Show when={body.toArray().length > 0} fallback={check()}>
        {body()}
      </Show>
    </Ark.ItemIndicator>
  )
}

export function ListboxValueText(props: ListboxValueTextProps) {
  const [local, rest] = splitProps(props, ["class"])
  return <Ark.ValueText class={cn("text-sm text-foreground", local.class)} {...rest} />
}
