import { createMemo, splitProps, type ParentProps } from "solid-js"

type MessageTransitionProps = {
  messageID?: string
  isUpdating?: boolean
  onTransitionEnd?: () => void
} & ParentProps

export function MessageTransition(props: MessageTransitionProps) {
  const [local, rest] = splitProps(props, ["messageID", "isUpdating", "onTransitionEnd", "children"])
  const updating = createMemo(() => !!local.isUpdating)

  return (
    <div
      class={updating() ? "message-content-transition message-updating" : ""}
      data-message-id={local.messageID}
      data-is-transitioning={updating()}
      {...rest}
    >
      <div class={updating() ? "message-preserve-space" : ""}>
        {local.children}
      </div>
    </div>
  )
}
