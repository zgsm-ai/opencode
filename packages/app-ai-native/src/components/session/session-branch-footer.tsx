import { createMemo, onMount, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { useSessionChat } from "@/context/session-chat"

export function SessionBranchFooter() {
  const chat = useSessionChat()
  const branch = createMemo(() => chat.vcs()?.branch)

  onMount(() => {
    if (chat.vcs() !== undefined) return
    void chat.vcsLoad()
  })

  return (
    <Show when={branch()}>
      <div class="inline-flex max-w-full min-w-0 items-center gap-1.5 text-12-regular text-text-weak">
        <Icon name="branch" size="small" class="shrink-0" />
        <span class="truncate">{branch()}</span>
      </div>
    </Show>
  )
}
