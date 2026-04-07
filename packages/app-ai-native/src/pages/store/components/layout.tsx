import type { ParentProps } from "solid-js"
import { Toast } from "@opencode-ai/ui/toast"
import StoreSidebar from "./store-sidebar"
import "../store.css"

export default function StoreLayout(props: ParentProps) {
  return (
    <>
      <div class="flex h-full w-full min-h-0">
        <StoreSidebar />
        <div class="store-main custom-scrollbar flex-1 min-h-0 overflow-y-auto">
          {props.children}
        </div>
      </div>
      <Toast.Region />
    </>
  )
}
