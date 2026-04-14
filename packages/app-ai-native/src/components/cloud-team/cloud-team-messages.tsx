import { type Component, For, Show, createSignal, onMount, onCleanup } from "solid-js"
import { useCloudTeam } from "@/context/cloud-team"
import type { CloudMessage } from "@/client/cloud-team-types"

export const CloudTeamMessages: Component = () => {
  const cloudTeam = useCloudTeam()
  const [input, setInput] = createSignal("")
  let scrollRef: HTMLDivElement | undefined

  const handleSubmit = (e: Event) => {
    e.preventDefault()
    const text = input().trim()
    if (!text) return
    cloudTeam.sendMessage(text)
    setInput("")
  }

  // Auto-scroll on new messages
  onMount(() => {
    const observer = new MutationObserver(() => {
      if (scrollRef) {
        scrollRef.scrollTop = scrollRef.scrollHeight
      }
    })
    if (scrollRef) {
      observer.observe(scrollRef, { childList: true, subtree: true })
    }
    onCleanup(() => observer.disconnect())
  })

  return (
    <div class="flex flex-col gap-1">
      <div ref={scrollRef} class="max-h-32 overflow-y-auto space-y-1 px-2">
        <For each={cloudTeam.messages()}>
          {(msg: CloudMessage) => (
            <div class="text-12-regular">
              <span class="text-text-weak font-medium">{msg.from}: </span>
              <span class="text-text-base">
                {typeof msg.payload === "object" && msg.payload !== null && "content" in msg.payload
                  ? String((msg.payload as { content: string }).content)
                  : JSON.stringify(msg.payload)}
              </span>
            </div>
          )}
        </For>
        <Show when={cloudTeam.messages().length === 0}>
          <div class="text-12-regular text-text-weaker px-2">No messages yet</div>
        </Show>
      </div>
      <form onSubmit={handleSubmit} class="flex items-center gap-1 px-2">
        <input
          type="text"
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          placeholder="Send a message..."
          class="flex-1 min-w-0 bg-transparent text-12-regular text-text-base placeholder:text-text-weaker outline-none border-b border-border-weak-base focus:border-border-base py-1"
        />
        <button
          type="submit"
          class="text-12-regular text-text-weak hover:text-text-base transition-colors"
          disabled={!input().trim()}
        >
          Send
        </button>
      </form>
    </div>
  )
}
