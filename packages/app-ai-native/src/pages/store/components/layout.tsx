import type { ParentProps } from "solid-js"
import { Toast } from "@opencode-ai/ui/toast"

export default function StoreLayout(props: ParentProps) {
  return (
    <>
      <div class="flex h-full w-full min-h-0 overflow-x-hidden">
        <div class="thin-scrollbar relative flex-1 min-h-0 overflow-x-hidden overflow-y-auto bg-background-base before:pointer-events-none before:absolute before:right-[-8rem] before:top-[-8rem] before:h-[18rem] before:w-[18rem] before:rounded-full before:bg-[radial-gradient(circle,color-mix(in_oklab,var(--native-primary)_7%,transparent),transparent_72%)] before:content-['']">
          {props.children}
        </div>
      </div>
      <Toast.Region />
    </>
  )
}
