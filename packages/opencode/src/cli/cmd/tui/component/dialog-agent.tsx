import { createMemo } from "solid-js"
import { useLocal } from "@tui/context/local"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useDialog } from "@tui/ui/dialog"
import { DialogCodingProposal } from "@tui/component/dialog-coding-proposal"
import { DialogFixProposal } from "@tui/component/dialog-fix-proposal"
import { DialogTaskcheckProposal } from "@tui/component/dialog-taskcheck-proposal"

export function DialogAgent() {
  const local = useLocal()
  const dialog = useDialog()

  const options = createMemo(() =>
    local.agent.list().map((item) => {
      return {
        value: item.name,
        title: item.name,
        description: item.native ? "native" : item.description,
      }
    }),
  )

  return (
    <DialogSelect
      title="Select agent"
      current={local.agent.current().name}
      options={options()}
      onSelect={(option) => {
        if (option.value === "coding") {
          dialog.replace(() => <DialogCodingProposal />)
          return
        }
        if (option.value === "FixAgent") {
          dialog.replace(() => <DialogFixProposal />)
          return
        }
        if (option.value === "taskcheck") {
          dialog.replace(() => <DialogTaskcheckProposal />)
          return
        }
        local.agent.set(option.value)
        dialog.clear()
      }}
    />
  )
}
