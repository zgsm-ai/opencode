import { createEffect, onCleanup, onMount, Show, type Component } from "solid-js"
import { Portal } from "solid-js/web"

export type ContextMenuItem = {
  label: string
  onSelect: () => void
  danger?: boolean
}

export type ContextMenuProps = {
  open: boolean
  position: { x: number; y: number }
  items: ContextMenuItem[]
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus?: () => void
}

export const ContextMenu: Component<ContextMenuProps> = (props) => {
  createEffect(() => {
    console.log("[context-menu] effect", { open: props.open, position: props.position, itemCount: props.items.length })
  })

  const close = () => {
    props.onOpenChange(false)
    props.onCloseAutoFocus?.()
  }

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") close()
  }

  const handleOutside = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null
    if (target?.closest("[data-context-menu]")) return
    close()
  }

  const handleResize = () => close()

  onMount(() => {
    window.addEventListener("keydown", handleKeydown, true)
    window.addEventListener("mousedown", handleOutside, true)
    window.addEventListener("resize", handleResize)
    window.addEventListener("blur", handleResize)
  })

  onCleanup(() => {
    window.removeEventListener("keydown", handleKeydown, true)
    window.removeEventListener("mousedown", handleOutside, true)
    window.removeEventListener("resize", handleResize)
    window.removeEventListener("blur", handleResize)
  })

  return (
    <Show when={props.open}>
      <Portal>
        <div
          data-context-menu
          class="fixed z-50 min-w-[160px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none"
          style={{
            left: `${props.position.x}px`,
            top: `${props.position.y}px`,
          }}
        >
          {props.items.map((item, idx) => (
            <button
              type="button"
              class="flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
              classList={{ "text-destructive hover:text-destructive": !!item.danger }}
              onClick={() => {
                item.onSelect()
                close()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </Portal>
    </Show>
  )
}
