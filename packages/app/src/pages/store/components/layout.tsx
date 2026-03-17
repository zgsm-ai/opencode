import type { ParentProps } from "solid-js"
import { OrgFilterProvider } from "../context/org-filter"
import Sidebar from "./sidebar"

export default function StoreLayout(props: ParentProps) {
  return (
    <OrgFilterProvider>
      <div class="flex h-full w-full min-h-0">
        <Sidebar />
        <div class="flex-1 min-h-0 overflow-y-auto">{props.children}</div>
      </div>
    </OrgFilterProvider>
  )
}
