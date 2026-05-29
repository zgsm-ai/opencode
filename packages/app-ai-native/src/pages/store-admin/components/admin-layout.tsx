import type { ParentProps } from "solid-js"

export default function AdminLayout(props: ParentProps) {
  return (
    <div class="flex h-full w-full">
      <div class="flex-1 min-w-0 overflow-hidden">
        {props.children}
      </div>
    </div>
  )
}
