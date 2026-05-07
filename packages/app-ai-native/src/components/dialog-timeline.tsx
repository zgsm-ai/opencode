import { Component, createMemo } from "solid-js"
import { useParams } from "@solidjs/router"
import { useSync } from "@/context/sync"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { List } from "@opencode-ai/ui/list"
import { useLanguage } from "@/context/language"
import type { TextPart as SDKTextPart } from "@opencode-ai/sdk/v2/client"

interface TimelineMessage {
  id: string
  text: string
  time: string
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { timeStyle: "short" })
}

export const DialogTimeline: Component = () => {
  const params = useParams()
  const sync = useSync()
  const dialog = useDialog()
  const language = useLanguage()

  const messages = createMemo((): TimelineMessage[] => {
    const sessionID = params.id
    if (!sessionID) return []

    const msgs = sync.data.message[sessionID] ?? []
    const result: TimelineMessage[] = []

    for (const message of msgs) {
      if (message.role !== "user") continue
      const parts = sync.data.part[message.id] ?? []
      const textPart = parts.find((x): x is SDKTextPart => x.type === "text" && !x.synthetic && !x.ignored)
      if (!textPart) continue
      result.push({
        id: message.id,
        text: textPart.text.replace(/\n/g, " ").slice(0, 200),
        time: formatTime(new Date(message.time.created)),
      })
    }
    return result
  })

  return (
    <Dialog
      title={language.t("command.session.timeline.title")}
      description={language.t("command.session.timeline.description")}
    >
      <List
        items={messages()}
        key={(m) => m.id}
        onSelect={(item) => {
          if (!item) return
          dialog.close()
        }}
      >
        {(m) => (
          <div class="flex flex-col">
            <span class="text-sm font-medium">{m.text || language.t("common.emptyMessage")}</span>
            <span class="text-xs text-foreground-muted">{m.time}</span>
          </div>
        )}
      </List>
    </Dialog>
  )
}
