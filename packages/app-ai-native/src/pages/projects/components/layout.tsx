import type { ParentProps } from "solid-js"
import { Toast } from "@opencode-ai/ui/toast"
import "../projects.css"

export default function ProjectsLayout(props: ParentProps) {
  return (
    <div class="custom-scrollbar relative h-full w-full min-h-0 overflow-x-hidden overflow-y-auto bg-[linear-gradient(180deg,color-mix(in_oklab,var(--native-bg-subtle)_88%,var(--native-panel)),var(--native-bg))] before:pointer-events-none before:absolute before:right-[-7rem] before:top-[-7rem] before:h-[16rem] before:w-[16rem] before:rounded-full before:bg-[radial-gradient(circle,color-mix(in_oklab,var(--native-primary)_7%,transparent),transparent_72%)] before:content-['']">
      {props.children}
      <Toast.Region />
    </div>
  )
}
