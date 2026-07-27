import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { DialogDeleteSession, DialogRenameSession } from "./session-dialogs"

export function SessionActionMenuItems(props: {
  sessionID: string
  getTitle: () => string
  onRename: (title: string) => Promise<void>
  onDelete: () => Promise<boolean>
  onDeleted?: () => void
  onDeleteFailed?: (err: unknown) => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  return (
    <>
      <DropdownMenu.Item
        onSelect={() => dialog.show(() => (
          <DialogRenameSession
            initial={props.getTitle()}
            onConfirm={(title) => props.onRename(title)}
          />
        ))}
      >
        {language.t("common.rename")}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        class="text-status-danger-hover focus:text-status-danger-hover"
        onSelect={() => dialog.show(() => (
          <DialogDeleteSession
            name={props.getTitle()}
            onConfirm={() => props.onDelete()}
            onDeleted={props.onDeleted}
            onDeleteFailed={props.onDeleteFailed}
          />
        ))}
      >
        {language.t("common.delete")}
      </DropdownMenu.Item>
    </>
  )
}
