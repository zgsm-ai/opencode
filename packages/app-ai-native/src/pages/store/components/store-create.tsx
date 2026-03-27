import { Icon } from "@opencode-ai/ui/icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ItemCrudDialog } from "./item-crud-dialog"

export function StoreCreateButton(props: {
  itemType: "skill" | "subagent" | "command" | "mcp"
  label: string
  onCreated?: () => void
}) {
  const dialog = useDialog()

  function openCreateDialog() {
    dialog.show(() => <ItemCrudDialog itemType={props.itemType} onCreated={props.onCreated} />)
  }

  return (
    <button
      onClick={openCreateDialog}
      class="flex items-center justify-center size-10 rounded-full border border-border-weak-base bg-surface-inset-base text-icon-base hover:bg-surface-inset-base-hover transition-colors cursor-pointer shrink-0"
      title={props.label}
    >
      <Icon name="plus" class="size-4" />
    </button>
  )
}
