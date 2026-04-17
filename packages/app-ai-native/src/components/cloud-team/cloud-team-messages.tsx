import { type Component, For, Show, createSignal, onMount, onCleanup, createMemo } from "solid-js"
import { useCloudTeam } from "@/context/cloud-team"
import type { CloudEvent, MessageType } from "@/client/cloud-team-types"

const typeStyles: Partial<Record<MessageType, string>> = {
  task_message: "",
  progress_update: "text-text-weaker italic",
  approval_request: "text-amber-700 bg-amber-50 px-1 rounded",
  approval_response: "text-blue-600",
  task_complete: "text-green-600",
  teammate_idle: "text-text-weaker",
  session_event: "text-text-weaker text-center",
}

export const CloudTeamMessages: Component = () => {
  const cloudTeam = useCloudTeam()
  const [input, setInput] = createSignal("")
  let scrollRef: HTMLDivElement | undefined

  const teammateNames = createMemo(() => {
    const map = new Map<string, string>()
    for (const t of cloudTeam.teammates()) {
      map.set(t.machineId, t.machineName)
    }
    return map
  })

  const resolveName = (machineId: string): string => {
    const name = teammateNames().get(machineId)
    if (name) return name
    return machineId.length > 8 ? machineId.slice(0, 8) + "..." : machineId
  }

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
      <div ref={scrollRef} class="max-h-40 overflow-y-auto space-y-1 px-2">
        <For each={cloudTeam.messages()}>
          {(msg: CloudEvent) => {
            const from = (msg.payload?.from as string) ?? "unknown"
            const fromName = resolveName(from)
            const messageType = (msg.payload?.messageType as MessageType) ?? "task_message"
            const content =
              typeof msg.payload?.content === "string"
                ? msg.payload.content
                : JSON.stringify(msg.payload)
            const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""
            const style = typeStyles[messageType] ?? ""
            const isSystem = messageType === "session_event"

            if (isSystem) {
              return (
                <div class="text-10-regular text-text-weaker text-center py-0.5">
                  {content}
                </div>
              )
            }

            return (
              <div class={`text-12-regular ${style}`}>
                <span class="text-text-weak font-medium">{fromName}</span>
                <Show when={time}>
                  <span class="text-10-regular text-text-weaker ml-1">{time}</span>
                </Show>
                <span class="text-text-weak">: </span>
                <span class="text-text-base">{content}</span>
              </div>
            )
          }}
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
