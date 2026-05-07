import { Component, createMemo } from "solid-js"
import { useParams } from "@solidjs/router"
import { useSync } from "@/context/sync"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { List } from "@opencode-ai/ui/list"
import { useLanguage } from "@/context/language"
import { useWorkspaceNavigate } from "@/hooks/use-workspace-navigate"

export const DialogSessionList: Component = () => {
  const params = useParams()
  const sync = useSync()
  const dialog = useDialog()
  const language = useLanguage()
  const { navigateToSession } = useWorkspaceNavigate()

  const sessions = createMemo(() => {
    const dir = params.dir
    if (!dir) return sync.data.session.slice(0, 20)
    return sync.data.session
      .filter((s) => s.directory === dir)
      .slice(0, 20)
  })

  return (
    <Dialog
      title={language.t("command.sessions.title")}
      description={language.t("command.sessions.description")}
    >
      <List
        items={sessions()}
        key={(s) => s.id}
        onSelect={(item) => {
          if (!item) return
          navigateToSession(item.id, {})
          dialog.close()
        }}
      >
        {(s) => (
          <div class="flex flex-col">
            <span class="text-sm font-medium">{s.title || language.t("common.untitled")}</span>
            <span class="text-xs text-foreground-muted">{new Date(s.time.created).toLocaleDateString()}</span>
          </div>
        )}
      </List>
    </Dialog>
  )
}
