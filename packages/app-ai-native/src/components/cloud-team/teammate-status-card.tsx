import { type Component, For, Show, createMemo, createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { useCloudTeam } from "@/context/cloud-team"
import { TeammateAvatar } from "./teammate-avatar"
import { TaskItem } from "./task-item"
import { ApprovalItem } from "./approval-item"
import { CloudTeamMessages } from "./cloud-team-messages"

export const TeammateStatusCard: Component = () => {
  const cloudTeam = useCloudTeam()
  const [expanded, setExpanded] = createSignal(true)

  const completedCount = createMemo(() => cloudTeam.tasks().filter((t) => t.status === "completed").length)
  const totalCount = createMemo(() => cloudTeam.tasks().length)
  const progressPercent = createMemo(() => {
    const total = totalCount()
    if (total === 0) return 0
    return Math.round((completedCount() / total) * 100)
  })

  const getTeammateName = (teammateId: string | undefined) => {
    if (!teammateId) return undefined
    return cloudTeam.teammateById().get(teammateId)?.machineName
  }

  const getTaskProgress = (taskId: string) => {
    return cloudTeam.progress()[taskId]?.percentage
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
                      cloudTeam.tasks().find((t) => t.taskId === teammate.currentTaskId),
                    )
                    return (
                      <TeammateAvatar
                        teammateId={teammate.teammateId}
                        machineName={teammate.machineName}
                        status={teammate.status}
                        currentTaskName={currentTask()?.description}
                      />
                    )
                  }}
                </For>
              </div>
            </div>
          </Show>

          {/* Tasks */}
          <Show when={cloudTeam.tasks().length > 0}>
            <div class="px-3 py-2 border-b border-border-weak-base">
              <div class="flex items-center justify-between mb-1.5">
                <div class="text-11-regular text-text-weak">
                  Tasks ({completedCount()}/{totalCount()})
                </div>
                <Show when={totalCount() > 0}>
                  <div class="flex items-center gap-2">
                    <div class="w-20 h-1.5 rounded-full bg-background-stronger overflow-hidden">
                      <div
                        class="h-full rounded-full bg-green-500 transition-all"
                        style={{ width: `${progressPercent()}%` }}
                      />
                    </div>
                    <span class="text-10-regular text-text-weak">{progressPercent()}%</span>
                  </div>
                </Show>
              </div>
              <div class="space-y-0.5 max-h-40 overflow-y-auto">
                <For each={cloudTeam.tasks()}>
                  {(task) => (
                    <TaskItem
                      taskId={task.taskId}
                      description={task.description}
                      status={task.status}
                      assigneeName={getTeammateName(task.assignedTeammateId)}
                      progress={getTaskProgress(task.taskId)}
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
                      approvalId={approval.approvalId}
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

          {/* Messages */}
          <div class="px-1 py-2">
            <CloudTeamMessages />
          </div>
        </div>
      </Show>
    </div>
  )
}
