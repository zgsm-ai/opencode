import { Button } from "@opencode-ai/ui/button"
import type { FollowupDraft } from "@/components/prompt-input/submit"

type FollowupItem = { id: string; text: string }

export function SessionFollowupDock(props: {
  items: FollowupItem[]
  sending?: string
  queue?: boolean
  edit?: { id: string; prompt: FollowupDraft["prompt"]; context: FollowupDraft["context"] }
  onSend: (id: string) => void
  onEdit: (id: string) => void
  onAbort: () => void
}) {
  if (props.items.length === 0) return null

  return (
    <div class="mb-2 rounded-xl border border-border-weak-base bg-background-base px-3 py-3">
      <div class="flex flex-col gap-2">
        {props.items.map((item) => {
          const sending = props.sending === item.id
          const editing = props.edit?.id === item.id
          return (
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 text-13-regular text-text-base whitespace-pre-wrap">{item.text}</div>
              <div class="flex shrink-0 items-center gap-2">
                {sending ? (
                  <Button size="small" variant="secondary" onClick={props.onAbort}>
                    Stop
                  </Button>
                ) : (
                  <Button size="small" variant="secondary" onClick={() => props.onSend(item.id)}>
                    {props.queue ? "Queue" : "Send"}
                  </Button>
                )}
                <Button size="small" variant={editing ? "primary" : "ghost"} onClick={() => props.onEdit(item.id)}>
                  Edit
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
