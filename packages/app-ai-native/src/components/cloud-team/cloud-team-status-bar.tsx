import { type Component, Show, createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { useCloudTeam } from "@/context/cloud-team"
import { TeammateStatusCard } from "./teammate-status-card"

/**
 * A lightweight status bar shown in the session page when CloudTeam mode is active.
 * Clicking it expands the full TeammateStatusCard.
 */
export const CloudTeamStatusBar: Component = () => {
  const cloudTeam = useCloudTeam()
  const [showCard, setShowCard] = createSignal(false)

  return (
    <div class="space-y-1">
      {/* Status bar */}
      <div class="flex items-center gap-2 rounded-md border border-border-weak-base bg-background-base px-3 py-1.5">
        <div class="flex items-center gap-1.5 flex-1 min-w-0">
          <Icon name="cloud-upload" class="size-3.5 text-text-weak shrink-0" />
          <span class="text-12-medium text-text-base">Cloud Team</span>
          <Show when={cloudTeam.session()?.title}>
            <span class="text-11-regular text-text-weak truncate">
              · {cloudTeam.session()?.title}
            </span>
          </Show>
          <Show when={!cloudTeam.wsConnected()}>
            <span class="text-10-regular text-red-500 ml-1">· Disconnected</span>
          </Show>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <Show when={cloudTeam.decomposing()}>
            <span class="text-11-regular text-blue-500 animate-pulse">
              Decomposing tasks...
            </span>
          </Show>
          <Show when={cloudTeam.tasks().length > 0 && !cloudTeam.decomposing()}>
            <span class="text-11-regular text-text-weak">
              {cloudTeam.tasks().filter((t) => t.status === "completed").length}/{cloudTeam.tasks().length} tasks
            </span>
          </Show>
          <Show when={cloudTeam.pendingApprovals().length > 0}>
            <span class="text-11-regular text-amber-600">
              {cloudTeam.pendingApprovals().length} approval{cloudTeam.pendingApprovals().length > 1 ? "s" : ""}
            </span>
          </Show>
          <Button
            variant="ghost"
            size="small"
            class="text-11-regular"
            onClick={() => setShowCard(!showCard())}
          >
            {showCard() ? "Hide" : "Details"}
          </Button>
          <Button
            variant="ghost"
            size="small"
            class="text-11-regular text-red-500 hover:text-red-600"
            onClick={() => cloudTeam.deactivate()}
          >
            Leave
          </Button>
        </div>
      </div>

      {/* Expandable card */}
      <Show when={showCard()}>
        <TeammateStatusCard />
      </Show>
    </div>
  )
}
