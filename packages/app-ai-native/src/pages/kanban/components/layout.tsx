import type { ParentProps } from "solid-js"
import { Toast } from "@opencode-ai/ui/toast"

export default function KanbanLayout(props: ParentProps) {
  return (
    <div class="thin-scrollbar relative h-full w-full min-h-0 overflow-x-hidden overflow-y-auto bg-background-base">
      <div class="pointer-events-none absolute inset-0 overflow-hidden">
        <div class="absolute left-[-8rem] top-[-8rem] h-[18rem] w-[18rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--native-success)_8%,transparent),transparent_72%)]" />
        <div class="absolute bottom-[-9rem] right-[-8rem] h-[19rem] w-[19rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--native-warning)_8%,transparent),transparent_72%)]" />
      </div>
      {props.children}
      <Toast.Region />
    </div>
  )
}