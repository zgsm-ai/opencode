import type { ParentProps } from "solid-js"

export function SettingsList(props: ParentProps) {
  return <div class="rounded-xl border border-border-weak-base bg-background-base overflow-hidden">{props.children}</div>
}
