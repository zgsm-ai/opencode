import { Component, createMemo } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useLanguage } from "@/context/language"
import { useSync } from "@/context/sync"

export const DialogStatus: Component = () => {
  const dialog = useDialog()
  const language = useLanguage()
  const sync = useSync()

  const providers = createMemo(() => sync.data.provider?.connected ?? [])

  return (
    <Dialog
      title={language.t("command.status.title")}
      description={language.t("command.status.description")}
    >
      <div class="flex flex-col gap-2 max-h-80 overflow-auto">
        {providers().length === 0 && (
          <span class="text-sm text-foreground-secondary">
            {language.t("command.status.noProviders")}
          </span>
        )}
        {providers().map((p) => (
          <div
            class="flex items-center justify-between py-1.5 px-2 rounded bg-surface-raised"
          >
            <span class="text-sm font-medium">{p.name}</span>
            <span class="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-600">
              {language.t("command.status.connected")}
            </span>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
