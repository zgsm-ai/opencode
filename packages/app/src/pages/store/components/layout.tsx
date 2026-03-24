import type { ParentProps } from "solid-js"
import { Toast } from "@opencode-ai/ui/toast"
import { RepoFilterProvider } from "../context/repo-filter"
import Sidebar from "./sidebar"

export default function StoreLayout(props: ParentProps) {
   return (
      <RepoFilterProvider>
         <div class="flex h-full w-full min-h-0">
            <Sidebar />
            <div class="flex-1 min-h-0 overflow-y-auto">{props.children}</div>
         </div>
         <Toast.Region />
      </RepoFilterProvider>
   )
}
