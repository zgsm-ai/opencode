import { type Component, For, Show, createMemo } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
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
import { CloudTeamRuntimeRequests } from "./cloud-team-runtime-requests"
import type { TeammateProgress } from "@/client/cloud-team-types"

const taskStatusBadge: Record<string, { color: string; bg: string }> = {
  pending: { color: "text-gray-600", bg: "bg-gray-100" },
  assigned: { color: "text-blue-700", bg: "bg-blue-50" },
  claimed: { color: "text-cyan-700", bg: "bg-cyan-50" },
  running: { color: "text-amber-700", bg: "bg-amber-50" },
  completed: { color: "text-green-700", bg: "bg-green-50" },
  failed: { color: "text-red-700", bg: "bg-red-50" },
  interrupted: { color: "text-orange-700", bg: "bg-orange-50" },
}

export const TeammateStatusCard: Component = () => {
  const cloudTeam = useCloudTeam()

  const completedCount = createMemo(() => cloudTeam.tasks().filter((t) => t.status === "completed").length)
  const failedCount = createMemo(() => cloudTeam.tasks().filter((t) => t.status === "failed").length)
  const runningCount = createMemo(() => cloudTeam.tasks().filter((t) => t.status === "running").length)
  const totalCount = createMemo(() => cloudTeam.tasks().length)
  const progressPercent = createMemo(() => {
    const total = totalCount()
    if (total === 0) return 0
    return Math.round((completedCount() / total) * 100)
  })
  const showChat = createMemo(() => cloudTeam.teammates().length > 1 || cloudTeam.messages().length > 0)

  // Build per-member progress from sessionProgress API data
  const memberProgressMap = createMemo(() => {
    const sp = cloudTeam.sessionProgress()
    if (!sp) return new Map<string, TeammateProgress>()
    const teammates = Array.isArray((sp as any).teammates) ? (sp as any).teammates as TeammateProgress[] : []
    const map = new Map<string, TeammateProgress>()
    for (const tp of teammates) {
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

  const canTerminate = createMemo(() => cloudTeam.isCurrentLeader())

  return (
    <div class="rounded-lg border border-border-weak-base bg-background-base overflow-hidden">
      <div>
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
                    const teammateTasks = createMemo(() => cloudTeam.tasks().filter((t) => t.assignedMemberId === teammate.id))
                    const activeTeammateTasks = createMemo(() =>
                      teammateTasks().filter((t) => t.status === "running" || t.status === "claimed" || t.status === "assigned"),
                    )
                    return (
                      <div class="flex flex-col items-center min-w-[180px] rounded-md border border-border-weak-base px-2 py-1.5">
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
                        <Show when={teammateTasks().length > 0}>
                          <div class="mt-1 w-full">
                            <div class="text-9-regular text-text-weaker text-center">
                              {teammateTasks().length} tasks
                            </div>
                            <div class="mt-0.5 flex flex-wrap justify-center gap-1">
                              <For each={teammateTasks()}>
                                {(task) => {
                                  const style = taskStatusBadge[task.status] ?? taskStatusBadge.pending
                                  return (
                                    <span class={`text-9-regular px-1 py-0.5 rounded ${style.bg} ${style.color}`}>
                                      {task.status}
                                    </span>
                                  )
                                }}
                              </For>
                            </div>
                            <Show when={activeTeammateTasks().length > 0}>
                              <div class="mt-1 space-y-1">
                                <For each={activeTeammateTasks()}>
                                  {(task) => (
                                    <div class="w-full rounded border border-border-weak-base px-1.5 py-1">
                                      <div class="text-10-regular text-text-base truncate">
                                        {task.description}
                                      </div>
                                      <div class="flex items-center justify-between mt-0.5">
                                        <span class={`text-9-regular px-1 py-0.5 rounded ${(taskStatusBadge[task.status] ?? taskStatusBadge.pending).bg} ${(taskStatusBadge[task.status] ?? taskStatusBadge.pending).color}`}>
                                          {task.status}
                                        </span>
                                        <Show when={canTerminate()}>
                                          <Button
                                            variant="ghost"
                                            size="small"
                                            class="text-10-regular text-red-600"
                                            onClick={() => {
                                              void cloudTeam.terminateTask(task.id, "terminated by leader")
                                            }}
                                          >
                                            Terminate
                                          </Button>
                                        </Show>
                                      </div>
                                    </div>
                                  )}
                                </For>
                              </div>
                            </Show>
                          </div>
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

          {/* Local runtime permission/question requests for teammate execution */}
          <Show when={cloudTeam.session()}>
            <CloudTeamRuntimeRequests />
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

          {/* Team chat: only show when there are multiple teammates or existing messages */}
          <Show when={showChat()}>
            <div class="px-1 py-2 border-t border-border-weak-base">
              <div class="px-2 pb-1 text-10-regular text-text-weaker">
                Team Chat (does not create tasks)
              </div>
              <CloudTeamMessages />
            </div>
          </Show>
      </div>
    </div>
  )
}
