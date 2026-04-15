import type { ParentProps } from "solid-js"
import { Toast } from "@opencode-ai/ui/toast"
import ConsoleSidebar from "./console-sidebar"

export default function ConsoleLayout(props: ParentProps) {
  return (
    <>
      <div class="flex h-full w-full min-h-0 overflow-x-hidden">
        <ConsoleSidebar />
        <div class="custom-scrollbar relative flex-1 min-h-0 overflow-x-hidden overflow-y-auto rounded-l-[var(--native-radius-lg)] border-l border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--native-bg-subtle)_88%,var(--native-panel)),var(--native-bg))] before:pointer-events-none before:absolute before:right-[-8rem] before:top-[-8rem] before:h-[18rem] before:w-[18rem] before:rounded-full before:bg-[radial-gradient(circle,color-mix(in_oklab,var(--native-primary)_7%,transparent),transparent_72%)] before:content-['']">
          <div class="mx-auto flex max-w-[1100px] flex-col gap-6 px-7 pt-6 pb-12 max-[768px]:px-4 max-[768px]:pt-4 max-[768px]:pb-8">
            {props.children}
          </div>
        </div>
      </div>
      <Toast.Region />
    </>
  )
}
