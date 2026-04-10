import type { ParentProps } from "solid-js"
import { Toast } from "@opencode-ai/ui/toast"
import ConsoleSidebar from "./console-sidebar"
import "@/pages/store/store.css"
import "./console.css"

export default function ConsoleLayout(props: ParentProps) {
  return (
    <>
      <div class="flex h-full w-full min-h-0">
        <ConsoleSidebar />
        <div class="store-main custom-scrollbar flex-1 min-h-0 overflow-y-auto">
          <div class="console-page">
            {props.children}
          </div>
        </div>
      </div>
      <Toast.Region />
    </>
  )
}
