import { Button } from "@opencode-ai/ui/button"

export function SessionRevertDock(props: {
  items: { id: string; text: string }[]
  restoring?: string
  disabled?: boolean
  onRestore: (id: string) => void
}) {
  if (props.items.length === 0) return null

  return (
    <div class="rounded-xl border border-border-weak-base bg-background-base px-3 py-3">
      <div class="flex flex-col gap-2">
        {props.items.map((item) => {
          const restoring = props.restoring === item.id
          return (
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 text-13-regular text-text-base whitespace-pre-wrap">{item.text}</div>
              <Button
                size="small"
                variant="secondary"
                disabled={props.disabled || restoring}
                onClick={() => props.onRestore(item.id)}
              >
                {restoring ? "Restoring" : "Restore"}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
