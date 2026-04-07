import type { ParentProps } from "solid-js"

export default function DashboardLayout(props: ParentProps) {
  return (
    <div class="store-main-inner">
      {props.children}
    </div>
  )
}
