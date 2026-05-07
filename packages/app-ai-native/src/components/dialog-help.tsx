import { Component, createMemo } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useLanguage } from "@/context/language"
import { useSync } from "@/context/sync"
import { Icon } from "@opencode-ai/ui/icon"

export const DialogHelp: Component = () => {
  const dialog = useDialog()
  const language = useLanguage()
  const sync = useSync()

  const commands = createMemo(() => sync.data.command.filter((c) => c.scope !== "tui-only"))

  return (
    <Dialog
      title={language.t("command.help.title")}
      description={language.t("command.help.description")}
    >
      <div class="flex flex-col gap-1 max-h-80 overflow-auto">
        {commands().map((cmd) => (
          <div class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-surface-hover">
            <div class="flex items-center gap-2">
              <code class="text-sm font-mono bg-surface-raised px-1.5 py-0.5 rounded">
                /{cmd.name}
              </code>
              {cmd.aliases && cmd.aliases.length > 0 && (
                <span class="text-xs text-foreground-muted">
                  ({cmd.aliases.map((a) => `/${a}`).join(", ")})
                </span>
              )}
            </div>
            <span class="text-sm text-foreground-secondary">{cmd.title || cmd.description}</span>
            {cmd.keybind && (
              <kbd class="text-xs font-mono bg-surface-raised px-1.5 py-0.5 rounded ml-2">
                {cmd.keybind}
              </kbd>
            )}
          </div>
        ))}
      </div>
    </Dialog>
  )
}
