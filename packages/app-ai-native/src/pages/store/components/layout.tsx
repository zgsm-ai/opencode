import type { ParentProps } from "solid-js"
import { Toast } from "@opencode-ai/ui/toast"

export default function StoreLayout(props: ParentProps) {
  return (
    <>
      <div class="flex h-full w-full min-h-0 overflow-x-hidden">
        <div class="thin-scrollbar relative flex-1 min-h-0 overflow-x-hidden overflow-y-auto bg-background-base">
          {props.children}
        </div>
      </div>
      <Toast.Region />
    </>
  )
}
