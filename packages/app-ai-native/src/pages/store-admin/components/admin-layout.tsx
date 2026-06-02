import type { ParentProps } from "solid-js"
import AdminSidebar from "./admin-sidebar"

export default function AdminLayout(props: ParentProps) {
  return (
    <div class="flex h-full w-full">
      <AdminSidebar />
      <div class="flex-1 min-w-0 overflow-hidden">
        {props.children}
      </div>
    </div>
  )
}
