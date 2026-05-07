import { Component, createSignal } from "solid-js"
import { useParams } from "@solidjs/router"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { TextField } from "@opencode-ai/ui/text-field"
import { Button } from "@opencode-ai/ui/button"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"

export const DialogSessionRename: Component = () => {
  const params = useParams()
  const sync = useSync()
  const sdk = useSDK()
  const dialog = useDialog()
  const language = useLanguage()

  const sessionID = params.id
  const session = () => (sessionID ? sync.session.get(sessionID) : undefined)
  const [title, setTitle] = createSignal(session()?.title ?? "")

  const handleSubmit = async () => {
    if (!sessionID) return
    const newTitle = title().trim()
    if (!newTitle) return

    try {
      await sdk.client.session.update({
        id: sessionID,
        body: { title: newTitle },
      })
      showToast({
        title: language.t("command.session.rename.success"),
        variant: "success",
      })
      dialog.close()
    } catch (err) {
      showToast({
        title: language.t("command.session.rename.error"),
        description: err instanceof Error ? err.message : undefined,
        variant: "error",
      })
    }
  }

  return (
    <Dialog
      title={language.t("command.session.rename.title")}
      description={language.t("command.session.rename.description")}
      action={
        <Button variant="primary" onClick={handleSubmit} disabled={!title().trim()}>
          {language.t("common.save")}
        </Button>
      }
    >
      <TextField
        label={language.t("command.session.rename.label")}
        value={title()}
        onChange={setTitle}
        autofocus
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit()
        }}
      />
    </Dialog>
  )
}
