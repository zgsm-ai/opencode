import { type Component, Show, createEffect, createMemo, createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { RadioGroup } from "@opencode-ai/ui/radio-group"
import { useCloudTeam } from "@/context/cloud-team"
import { TeammateStatusCard } from "./teammate-status-card"

/**
 * A lightweight status bar shown in the session page when CloudTeam mode is active.
 * Shows inline progress bar, teammate count, leader badge, and expandable details.
 */
export const CloudTeamStatusBar: Component = () => {
  const cloudTeam = useCloudTeam()
  const [showCard, setShowCard] = createSignal(false)

  const progressPercent = createMemo(() => cloudTeam.completedPercentage())
  const onlineCount = createMemo(() => cloudTeam.teammates().filter((t) => t.status === "online").length)
  const runningCount = createMemo(() => cloudTeam.tasks().filter((t) => t.status === "running").length)
  const pendingPlanCount = createMemo(() => cloudTeam.pendingPlan()?.length ?? 0)
  const hasPendingPlan = createMemo(() => pendingPlanCount() > 0)
  const hasSession = createMemo(() => Boolean(cloudTeam.session()))
  // First running task's progress message — shown inline in the bar
  const activeProgressMsg = createMemo(() => {
    const firstRunning = cloudTeam.tasks().find((t) => t.status === "running")
    if (!firstRunning) return undefined
    return cloudTeam.progress()[firstRunning.id]?.message
  })

  // Auto-expand details card when pendingPlan arrives
  createEffect(() => {
    if (hasPendingPlan()) setShowCard(true)
  })

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
          <Show when={!hasSession()}>
            <span class="text-10-regular text-text-weak ml-1">· No session</span>
          </Show>
          <Show when={cloudTeam.session()?.status === "paused"}>
            <span class="text-10-regular text-amber-500 ml-1">· Paused</span>
          </Show>
          <Show when={cloudTeam.session()?.status === "completed"}>
            <span class="text-10-regular text-green-600 ml-1">· Completed</span>
          </Show>
          <Show when={cloudTeam.session()?.status === "failed"}>
            <span class="text-10-regular text-red-500 ml-1">· Failed</span>
          </Show>
          <Show when={hasSession() && !cloudTeam.wsConnected()}>
            <span class="text-10-regular text-red-500 ml-1">· Disconnected</span>
          </Show>
          {/* Pending plan warning — shown instead of progress message */}
          <Show when={hasPendingPlan()}>
            <span class="text-11-regular text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded ml-1 shrink-0">
              ⚠ {pendingPlanCount()} tasks ready — review before executing
            </span>
          </Show>
          {/* Active task progress message — only when no pending plan */}
          <Show when={!hasPendingPlan() && activeProgressMsg()}>
            <span class="text-11-regular text-text-weak truncate max-w-40 ml-1 animate-pulse">
              {activeProgressMsg()}
            </span>
          </Show>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          {/* Decomposing indicator */}
          <Show when={cloudTeam.decomposing()}>
            <span class="text-11-regular text-blue-500 animate-pulse">
              Decomposing...
            </span>
          </Show>

          {/* Progress bar + task count */}
          <Show when={cloudTeam.tasks().length > 0 && !cloudTeam.decomposing()}>
            <div class="flex items-center gap-1.5">
              <div class="w-16 h-1.5 rounded-full bg-background-stronger overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  classList={{
                    "bg-green-500": progressPercent() === 100,
                    "bg-blue-500": progressPercent() > 0 && progressPercent() < 100,
                  }}
                  style={{ width: `${progressPercent()}%` }}
                />
              </div>
              <span class="text-10-regular text-text-weak">
                {cloudTeam.tasks().filter((t) => t.status === "completed").length}/{cloudTeam.tasks().length}
              </span>
              <Show when={runningCount() > 0}>
                <span class="text-11-regular text-amber-500 animate-pulse">
                  {runningCount()} running
                </span>
              </Show>
            </div>
          </Show>

          {/* Online teammates */}
          <Show when={cloudTeam.teammates().length > 0}>
            <span class="text-11-regular text-text-weak">
              {onlineCount()}/{cloudTeam.teammates().length} online
            </span>
          </Show>

          {/* Pending approvals */}
          <Show when={cloudTeam.pendingApprovals().length > 0}>
            <span class="text-11-regular text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
              {cloudTeam.pendingApprovals().length} approval{cloudTeam.pendingApprovals().length > 1 ? "s" : ""}
            </span>
          </Show>

          {/* Leader badge */}
          <Show when={cloudTeam.leader()?.elected}>
            <span class="text-10-regular text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <svg class="size-2.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" />
              </svg>
              Leader
            </span>
          </Show>
          <Show when={hasSession()}>
            <RadioGroup
              options={["auto", "manual"] as const}
              current={cloudTeam.runtimeMode()}
              value={(mode) => mode}
              label={(mode) => (
                <span class="text-10-regular leading-none">
                  {mode === "auto" ? "Auto" : "Manual"}
                </span>
              )}
              onSelect={(mode) => mode && cloudTeam.setRuntimeMode(mode)}
              pad="none"
              class="w-[112px]"
            />
          </Show>

          <Button
            variant="ghost"
            size="small"
            classList={{ "text-amber-600": hasPendingPlan(), "font-medium": hasPendingPlan() }}
            class="text-11-regular"
            onClick={() => setShowCard(!showCard())}
          >
            {showCard() ? "Hide" : hasPendingPlan() ? "Review Plan ▼" : "Details"}
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
