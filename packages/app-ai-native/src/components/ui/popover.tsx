import type { Component, JSX, ValidComponent } from "solid-js"
import { splitProps } from "solid-js"

import * as PopoverPrimitive from "@kobalte/core/popover"
import type { PolymorphicProps } from "@kobalte/core/polymorphic"

import { cn } from "@/lib/utils"

const Popover: Component<PopoverPrimitive.PopoverRootProps> = (props) => {
  return <PopoverPrimitive.Root gutter={4} {...props} />
}

const PopoverTrigger = PopoverPrimitive.Trigger
const PopoverPortal = PopoverPrimitive.Portal

type PopoverContentProps<T extends ValidComponent = "div"> =
  PopoverPrimitive.PopoverContentProps<T> & {
    class?: string | undefined
    children?: JSX.Element
  }

const PopoverContent = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, PopoverContentProps<T>>,
) => {
  const [, rest] = splitProps(props as PopoverContentProps, ["class", "children"])
  return (
    <PopoverPortal>
      <PopoverPrimitive.Content
        class={cn(
          "z-50 min-w-32 origin-[var(--kb-popover-content-transform-origin)] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none",
          props.class,
        )}
        {...rest}
      >
        {props.children}
      </PopoverPrimitive.Content>
    </PopoverPortal>
  )
}

export { Popover, PopoverContent, PopoverPortal, PopoverTrigger }
