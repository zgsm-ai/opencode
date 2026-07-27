import { createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"

export function DialogRenameSession(props: {
  initial: string
  onConfirm: (title: string) => Promise<void>
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const [value, setValue] = createSignal(props.initial)
  const handleRename = async () => {
    const next = value().trim()
    if (!next || next === props.initial) {
      dialog.close()
      return
    }
    await props.onConfirm(next)
    dialog.close()
  }
  return (
    <Dialog title={language.t("common.rename")} fit>
      <div class="flex flex-col gap-4 pl-6 pr-2.5 pb-3 pt-4">
        <input
          autofocus
          value={value()}
          onInput={(e) => setValue(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void handleRename()
            }
            if (e.key === "Escape") {
              e.preventDefault()
              dialog.close()
            }
          }}
          class="w-full rounded-md border border-border-strong bg-bg-base px-3 py-2 text-14-regular text-text-strong outline-none focus:border-border-active"
        />
        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="large" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button variant="primary" size="large" onClick={() => void handleRename()}>
            {language.t("common.confirm")}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

export function DialogDeleteSession(props: {
  name: string
  onConfirm: () => Promise<boolean>
  onDeleted?: () => void
  onDeleteFailed?: (err: unknown) => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const handleDelete = async () => {
    try {
      const ok = await props.onConfirm()
      if (!ok) {
        props.onDeleteFailed?.(new Error("delete returned false"))
        return
      }
      props.onDeleted?.()
      dialog.close()
    } catch (err) {
      props.onDeleteFailed?.(err)
    }
  }
  return (
    <Dialog title={language.t("session.delete.title")} fit>
      <div class="flex flex-col gap-4 pl-6 pr-2.5 pb-3">
        <div class="flex flex-col gap-1">
          <span class="text-14-regular text-text-strong">
            {language.t("session.delete.confirm", { name: props.name })}
          </span>
        </div>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="large" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button variant="primary" size="large" onClick={() => void handleDelete()}>
            {language.t("session.delete.button")}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
