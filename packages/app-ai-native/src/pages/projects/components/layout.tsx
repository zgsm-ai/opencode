import type { ParentProps } from "solid-js"
import { Toast } from "@opencode-ai/ui/toast"
import "@/pages/store/store.css"
import "../projects.css"

export default function ProjectsLayout(props: ParentProps) {
  return (
    <div class="store-main custom-scrollbar h-full w-full min-h-0 overflow-y-auto">
      {props.children}
      <Toast.Region />
    </div>
  )
}
