import { type Component, For, Show, createMemo, createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useCloudTeam } from "@/context/cloud-team"
import { TeammateAvatar } from "./teammate-avatar"
import { TaskItem } from "./task-item"
import { ApprovalItem } from "./approval-item"
import { CloudTeamMessages } from "./cloud-team-messages"
import { CloudTeamExplore } from "./cloud-team-explore"
import { CloudTeamTaskPlanReview } from "./cloud-team-task-plan-review"
import { CloudTeamPlanConfirmation } from "./cloud-team-plan-confirmation"
import { CloudTeamSessionBrowser } from "./cloud-team-session-browser"
import type { TeammateProgress } from "@/client/cloud-team-types"

const sessionStatusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  active: { label: "Active", color: "text-green-700", bgColor: "bg-green-50" },
  paused: { label: "Paused", color: "text-amber-700", bgColor: "bg-amber-50" },
  completed: { label: "Completed", color: "text-blue-700", bgColor: "bg-blue-50" },
  failed: { label: "Failed", color: "text-red-700", bgColor: "bg-red-50" },
}

export const TeammateStatusCard: Component = () => {
  const cloudTeam = useCloudTeam()
  const [expanded, setExpanded] = createSignal(true)

  const completedCount = createMemo(() => cloudTeam.tasks().filter((t) => t.status === "completed").length)
  const failedCount = createMemo(() => cloudTeam.tasks().filter((t) => t.status === "failed").length)
  const runningCount = createMemo(() => cloudTeam.tasks().filter((t) => t.status === "running").length)
  const totalCount = createMemo(() => cloudTeam.tasks().length)
  const progressPercent = createMemo(() => {
    const total = totalCount()
    if (total === 0) return 0
    return Math.round((completedCount() / total) * 100)
  })

  // Build per-member progress from sessionProgress API data
  const memberProgressMap = createMemo(() => {
    const sp = cloudTeam.sessionProgress()
    if (!sp) return new Map<string, TeammateProgress>()
    const map = new Map<string, TeammateProgress>()
    for (const tp of sp.teammates) {
      map.set(tp.memberId, tp)
    }
    return map
  })

  const getTeammateName = (teammateId: string | undefined) => {
    if (!teammateId) return undefined
    return cloudTeam.teammateById().get(teammateId)?.machineName
  }

  const getTaskProgress = (taskId: string) => {
    return cloudTeam.progress()[taskId]?.percentage
  }

  const getTaskProgressMessage = (taskId: string) => {
    return cloudTeam.progress()[taskId]?.message
  }

  const isLeader = (teammateId: string) => {
    const leader = cloudTeam.leader()
    if (!leader?.elected) return false
    const teammate = cloudTeam.teammateById().get(teammateId)
    return teammate?.machineId === leader.leaderId
  }

  const sessionStatus = () => {
    const status = cloudTeam.session()?.status ?? "active"
    return sessionStatusConfig[status] ?? sessionStatusConfig.active
  }

  return (
    <div class="rounded-lg border border-border-weak-base bg-background-base overflow-hidden">
      {/* Header */}
      <div
        class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-background-stronger transition-colors"
        onClick={() => setExpanded(!expanded())}
      >
        <div class="flex items-center gap-1.5 flex-1 min-w-0">
          <Icon name="cloud-upload" class="size-4 text-text-weak shrink-0" />
          <span class="text-13-medium text-text-base truncate">
            Cloud Team
          </span>
          <Show when={cloudTeam.session()?.title}>
            <span class="text-12-regular text-text-weak truncate">
              · {cloudTeam.session()?.title}
            </span>
          </Show>
          {/* Session status badge */}
          <span class={`text-10-regular px-1.5 py-0.5 rounded ${sessionStatus().bgColor} ${sessionStatus().color}`}>
            {sessionStatus().label}
          </span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <Show when={cloudTeam.pendingApprovals().length > 0}>
            <span class="text-11-regular text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
              {cloudTeam.pendingApprovals().length} pending
            </span>
          </Show>
          <Show when={!cloudTeam.wsConnected()}>
            <span class="text-11-regular text-red-500">Disconnected</span>
          </Show>
          <Icon
            name="chevron-down"
            class={`size-4 text-text-weak transition-transform ${expanded() ? "" : "-rotate-90"}`}
          />
        </div>
      </div>

      {/* Expanded content */}
      <Show when={expanded()}>
        <div class="border-t border-border-weak-base">
          {/* Session browser (when not in a session) */}
          <Show when={!cloudTeam.session()}>
            <div class="border-b border-border-weak-base">
              <CloudTeamSessionBrowser />
            </div>
          </Show>

          {/* Plan confirmation — shown first when pendingPlan exists */}
          <Show when={cloudTeam.pendingPlan()}>
            <div class="border-b border-border-weak-base">
              <CloudTeamPlanConfirmation />
            </div>
          </Show>

          {/* Teammates */}
          <Show when={cloudTeam.teammates().length > 0}>
            <div class="px-3 py-2 border-b border-border-weak-base">
              <div class="text-11-regular text-text-weak mb-1.5">
                Teammates ({cloudTeam.teammates().length})
              </div>
              <div class="flex gap-3 overflow-x-auto">
                <For each={cloudTeam.teammates()}>
                  {(teammate) => {
                    const currentTask = createMemo(() =>
                      cloudTeam.tasks().find((t) => t.id === teammate.currentTaskId),
                    )
                    const memberProg = createMemo(() => memberProgressMap().get(teammate.id))
                    return (
                      <div class="flex flex-col items-center">
                        <TeammateAvatar
                          id={teammate.id}
                          machineName={teammate.machineName}
                          status={teammate.status}
                          currentTaskName={currentTask()?.description}
                          isLeader={isLeader(teammate.id)}
                        />
                        {/* Per-teammate task counts from SessionProgress */}
                        <Show when={memberProg()}>
                          {(mp) => (
                            <div class="text-9-regular text-text-weaker mt-0.5 flex gap-1">
                              <span class="text-green-600">{mp().completed}✓</span>
                              <Show when={mp().running > 0}>
                                <span class="text-amber-600">{mp().running}►</span>
                              </Show>
                              <Show when={mp().failed > 0}>
                                <span class="text-red-600">{mp().failed}✗</span>
                              </Show>
                            </div>
                          )}
                        </Show>
                      </div>
                    )
                  }}
                </For>
              </div>
            </div>
          </Show>

          {/* Tasks */}
          <Show when={cloudTeam.decomposing() && cloudTeam.tasks().length === 0}>
            <div class="px-3 py-2 border-b border-border-weak-base">
              <div class="flex items-center gap-2 text-11-regular text-blue-500">
                <Spinner class="size-3.5" />
                Decomposing tasks...
              </div>
            </div>
          </Show>
          <Show when={cloudTeam.tasks().length > 0}>
            <div class="px-3 py-2 border-b border-border-weak-base">
              <div class="flex items-center justify-between mb-1.5">
                <div class="flex items-center gap-2 text-11-regular text-text-weak">
                  <span>Tasks ({completedCount()}/{totalCount()})</span>
                  <Show when={runningCount() > 0}>
                    <span class="text-amber-600">{runningCount()} running</span>
                  </Show>
                  <Show when={failedCount() > 0}>
                    <span class="text-red-600">{failedCount()} failed</span>
                  </Show>
                </div>
                <Show when={totalCount() > 0}>
                  <div class="flex items-center gap-2">
                    <div class="w-24 h-1.5 rounded-full bg-background-stronger overflow-hidden">
                      <div
                        class="h-full rounded-full transition-all"
                        classList={{
                          "bg-green-500": progressPercent() === 100,
                          "bg-blue-500": progressPercent() > 0 && progressPercent() < 100,
                        }}
                        style={{ width: `${progressPercent()}%` }}
                      />
                    </div>
                    <span class="text-10-regular text-text-weak">{progressPercent()}%</span>
                  </div>
                </Show>
              </div>
              <div class="space-y-0.5 max-h-48 overflow-y-auto">
                <For each={cloudTeam.tasks()}>
                  {(task) => (
                    <TaskItem
                      id={task.id}
                      description={task.description}
                      status={task.status}
                      assigneeName={getTeammateName(task.assignedMemberId ?? undefined)}
                      progress={getTaskProgress(task.id)}
                      progressMessage={getTaskProgressMessage(task.id)}
                      result={task.result}
                      errorMessage={task.errorMessage || undefined}
                      retryCount={task.retryCount}
                    />
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Approvals */}
          <Show when={cloudTeam.approvals().length > 0}>
            <div class="px-3 py-2 border-b border-border-weak-base">
              <div class="text-11-regular text-text-weak mb-1.5">
                Approvals ({cloudTeam.pendingApprovals().length} pending)
              </div>
              <div class="space-y-1.5">
                <For each={cloudTeam.approvals()}>
                  {(approval) => (
                    <ApprovalItem
                      id={approval.id}
                      description={approval.description}
                      toolName={approval.toolName}
                      requesterName={approval.requesterName}
                      riskLevel={approval.riskLevel}
                      status={approval.status}
                      onApprove={(id) => cloudTeam.respondApproval(id, "approved")}
                      onReject={(id) => cloudTeam.respondApproval(id, "rejected")}
                    />
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Task plan review (when tasks are running — not shown during initial confirmation) */}
          <Show when={cloudTeam.tasks().length > 0 && cloudTeam.leader()?.elected && !cloudTeam.pendingPlan()}>
            <div class="border-b border-border-weak-base">
              <CloudTeamTaskPlanReview />
            </div>
          </Show>

          {/* Explore (Leader only) */}
          <Show when={cloudTeam.leader()?.elected && cloudTeam.teammates().length > 0}>
            <div class="border-b border-border-weak-base">
              <CloudTeamExplore />
            </div>
          </Show>

          {/* Messages */}
          <div class="px-1 py-2">
            <CloudTeamMessages />
          </div>
        </div>
      </Show>
    </div>
  )
}
