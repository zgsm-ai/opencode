import { Component, createResource } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"

export const DialogCredit: Component = () => {
  const dialog = useDialog()
  const language = useLanguage()
  const sdk = useSDK()

  const [credit] = createResource(async () => {
    try {
      const res = await sdk.client.config.providers()
      // Credit info may come from provider config or a dedicated endpoint.
      return res.data
    } catch {
      return undefined
    }
  })

  return (
    <Dialog
      title={language.t("command.credit.title")}
      description={language.t("command.credit.description")}
    >
      <div class="flex flex-col gap-2">
        {credit.loading && <span>{language.t("common.loading")}</span>}
        {credit.error && <span>{language.t("common.requestFailed")}</span>}
        {credit() && (
          <pre class="text-sm font-mono bg-surface-raised p-2 rounded overflow-auto">
            {JSON.stringify(credit(), null, 2)}
          </pre>
        )}
      </div>
    </Dialog>
  )
}
