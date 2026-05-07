import { Component, createMemo, Show } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { List } from "@opencode-ai/ui/list"
import { useLanguage } from "@/context/language"
import { useSync } from "@/context/sync"

export const DialogSkills: Component = () => {
  const dialog = useDialog()
  const language = useLanguage()
  const sync = useSync()

  const skills = createMemo(() =>
    Object.values(sync.data.command).filter((c) => c.source === "skill"),
  )

  return (
    <Dialog
      title={language.t("command.skills.title")}
      description={language.t("command.skills.description")}
    >
      <Show
        when={skills().length > 0}
        fallback={
          <div class="text-text-weak px-2 py-4 text-center">
            {language.t("command.skills.empty")}
          </div>
        }
      >
        <List
          items={skills()}
          key={(s) => s.name}
          onSelect={() => dialog.close()}
        >
          {(s) => (
            <div class="flex items-center w-full py-1">
              <div class="flex flex-col min-w-0 flex-1">
                <span class="text-sm font-medium text-text-strong">{s.title || s.name}</span>
                {s.description && (
                  <span class="text-xs text-foreground-muted truncate max-w-full">{s.description}</span>
                )}
              </div>
            </div>
          )}
        </List>
      </Show>
    </Dialog>
  )
}
