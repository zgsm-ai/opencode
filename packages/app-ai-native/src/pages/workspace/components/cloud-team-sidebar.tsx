import { type Accessor, type Component, For, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { useCloudTeam } from "@/context/cloud-team"
import type { DeviceClient } from "@/client/device-client"
import { cloudTeamApi } from "@/client/cloud-team-api"
import type {
  ApprovalRequest,
  SessionProgress,
  Task,
  TeamSession,
  TeammateRegistration,
} from "@/client/cloud-team-types"
import { DeviceSDKContext } from "@/context/device-sdk"
import { CloudTeamRuntimeRequests } from "@/components/cloud-team/cloud-team-runtime-requests"
import { CloudTeamPlanConfirmation } from "@/components/cloud-team/cloud-team-plan-confirmation"

type RuntimeSDKValue = {
  client: DeviceClient
  directory: string
  url: string
  createClient: (opts: { directory: string; throwOnError?: boolean }) => DeviceClient
}

type CloudTeamSidebarProps = {
  runtimeSDK?: RuntimeSDKValue
  refreshNonce?: Accessor<number>
}

type SessionStats = {
  total: number
  completed: number
  running: number
  failed: number
  pending: number
}

type AssignmentSummary = {
  key: string
  name: string
  total: number
  completed: number
  running: number
  failed: number
  pending: number
}

type TeammateNode = {
  machineId: string
  machineName: string
  status: "online" | "offline" | "busy"
  sessions: TeamSession[]
}

function sessionStatusClass(status: string): string {
  if (status === "active") return "text-green-600"
  if (status === "paused") return "text-amber-600"
  if (status === "failed") return "text-red-600"
  if (status === "completed") return "text-blue-600"
  return "text-sidebar-foreground/50"
}

function teammateStatusDot(status: TeammateRegistration["status"] | undefined): string {
  if (status === "online") return "bg-[var(--native-success)]"
  if (status === "busy") return "bg-amber-500"
  if (status === "offline") return "bg-[var(--native-error)]"
  return "bg-sidebar-border"
}

function taskStatusBadgeClass(status: string): string {
  if (status === "completed") return "bg-green-50 text-green-700"
  if (status === "running") return "bg-amber-50 text-amber-700"
  if (status === "failed") return "bg-red-50 text-red-700"
  if (status === "assigned" || status === "claimed") return "bg-blue-50 text-blue-700"
  if (status === "interrupted") return "bg-orange-50 text-orange-700"
  return "bg-gray-100 text-gray-600"
}

function parseTime(input: string | undefined): number {
  if (!input) return 0
  const t = Date.parse(input)
  return Number.isFinite(t) ? t : 0
}

function displayDate(input: string | undefined): string {
  if (!input) return "-"
  const t = parseTime(input)
  if (!t) return "-"
  return new Date(t).toLocaleString()
}

function summarizeTasks(tasks: Task[]): SessionStats {
  let completed = 0
  let running = 0
  let failed = 0
  let pending = 0
  for (const task of tasks) {
    if (task.status === "completed") completed += 1
    else if (task.status === "running") running += 1
    else if (task.status === "failed") failed += 1
    else pending += 1
  }
  return { total: tasks.length, completed, running, failed, pending }
}

function summarizeAssignments(tasks: Task[], memberNames: Map<string, string>): AssignmentSummary[] {
  const map = new Map<string, AssignmentSummary>()
  for (const task of tasks) {
    const key = task.assignedMemberId ?? "__unassigned__"
    const existing = map.get(key) ?? {
      key,
      name: task.assignedMemberId ? (memberNames.get(task.assignedMemberId) ?? task.assignedMemberId.slice(0, 8)) : "Unassigned",
      total: 0,
      completed: 0,
      running: 0,
      failed: 0,
      pending: 0,
    }
    existing.total += 1
    if (task.status === "completed") existing.completed += 1
    else if (task.status === "running") existing.running += 1
    else if (task.status === "failed") existing.failed += 1
    else existing.pending += 1
    map.set(key, existing)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

export const CloudTeamSidebar: Component<CloudTeamSidebarProps> = (props) => {
  const cloudTeam = useCloudTeam()

  const [collapsed, setCollapsed] = createSignal(false)
  const [sessions, setSessions] = createSignal<TeamSession[]>([])
  const [sessionDetails, setSessionDetails] = createSignal<Record<string, TeamSession>>({})

  // Auto-expand sidebar when pendingPlan, orchestrate progress, or tasks arrive
  createEffect(() => {
    if (cloudTeam.pendingPlan() || cloudTeam.orchestrating()) {
      setCollapsed(false)
    }
    // Auto-expand the current teammate + session when tasks are created after plan confirmation
    const tasks = cloudTeam.tasks()
    const session = cloudTeam.session()
    if (tasks.length > 0 && session) {
      setCollapsed(false)
      const mid = cloudTeam.teammates().find((t) => t.machineId)?.machineId
      if (mid && !expandedTeammates().has(mid)) {
        toggleSetFlag(setExpandedTeammates, mid)
      }
      if (session.id && !expandedSessions().has(session.id)) {
        toggleSetFlag(setExpandedSessions, session.id)
      }
    }
  })
  const [taskMap, setTaskMap] = createSignal<Record<string, Task[]>>({})
  const [approvalMap, setApprovalMap] = createSignal<Record<string, ApprovalRequest[]>>({})
  const [progressMap, setProgressMap] = createSignal<Record<string, SessionProgress>>({})
  const [expandedTeammates, setExpandedTeammates] = createSignal<Set<string>>(new Set())
  const [expandedSessions, setExpandedSessions] = createSignal<Set<string>>(new Set())
  const [loadingSessions, setLoadingSessions] = createSignal(false)
  const [loadingDetails, setLoadingDetails] = createSignal<Set<string>>(new Set())
  const [loadingSessionData, setLoadingSessionData] = createSignal<Set<string>>(new Set())
  const [approvalBusy, setApprovalBusy] = createSignal<Set<string>>(new Set())
  const [error, setError] = createSignal("")

  const currentSession = createMemo<TeamSession | undefined>(() => {
    const current = cloudTeam.session()
    if (!current) return undefined
    return {
      id: current.id,
      name: current.title,
      creatorId: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: current.status,
      leaderMachineId: current.leaderId ?? "",
      leaderUserId: "",
      fencingToken: cloudTeam.leader()?.fencingToken ?? 0,
      metadata: {},
      teammates: cloudTeam.teammates(),
      leaderId: current.leaderId,
    }
  })

  const currentSessionId = createMemo(() => currentSession()?.id)

  const setSetFlag = (
    setter: (fn: (prev: Set<string>) => Set<string>) => void,
    id: string,
    enabled: boolean,
  ) => {
    setter((prev) => {
      const next = new Set(prev)
      if (enabled) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const toggleSetFlag = (setter: (fn: (prev: Set<string>) => Set<string>) => void, id: string) => {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const hasDetail = (sessionId: string) => Boolean(sessionDetails()[sessionId])

  const fetchSessionDetail = async (sessionId: string, force: boolean = false) => {
    if (!force && hasDetail(sessionId)) return
    if (loadingDetails().has(sessionId)) return
    setSetFlag(setLoadingDetails, sessionId, true)
    try {
      const detail = await cloudTeamApi.session.get(sessionId)
      setSessionDetails((prev) => ({ ...prev, [sessionId]: detail }))
    } finally {
      setSetFlag(setLoadingDetails, sessionId, false)
    }
  }

  const refreshSessions = async () => {
    if (loadingSessions()) return
    setLoadingSessions(true)
    setError("")
    try {
      const list = await cloudTeamApi.session.list()
      setSessions(list)
      const activeCandidates = list
        .filter((s) => s.status === "active" || s.status === "paused")
        .slice(0, 12)
      await Promise.allSettled(activeCandidates.map((s) => fetchSessionDetail(s.id)))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingSessions(false)
    }
  }

  const fetchSessionData = async (sessionId: string) => {
    if (sessionId === currentSessionId()) return
    if (loadingSessionData().has(sessionId)) return
    setSetFlag(setLoadingSessionData, sessionId, true)
    try {
      const [tasks, approvals, progress] = await Promise.all([
        cloudTeamApi.task.list(sessionId),
        cloudTeamApi.approval.list(sessionId),
        cloudTeamApi.progress.get(sessionId),
      ])
      setTaskMap((prev) => ({ ...prev, [sessionId]: tasks }))
      setApprovalMap((prev) => ({ ...prev, [sessionId]: approvals }))
      setProgressMap((prev) => ({ ...prev, [sessionId]: progress }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSetFlag(setLoadingSessionData, sessionId, false)
    }
  }

  const allSessions = createMemo(() => {
    const map = new Map<string, TeamSession>()
    for (const session of sessions()) {
      const detail = sessionDetails()[session.id]
      map.set(session.id, detail ? { ...session, ...detail } : session)
    }
    const current = currentSession()
    if (current) {
      const detail = sessionDetails()[current.id]
      map.set(current.id, detail ? { ...current, ...detail, teammates: cloudTeam.teammates() } : current)
    }
    return [...map.values()].sort((a, b) => parseTime(b.updatedAt) - parseTime(a.updatedAt))
  })

  const sessionTeammates = (session: TeamSession): TeammateRegistration[] => {
    if (session.id === currentSessionId()) return cloudTeam.teammates()
    return sessionDetails()[session.id]?.teammates ?? session.teammates ?? []
  }

  const teammates = createMemo<TeammateNode[]>(() => {
    const map = new Map<string, TeammateNode>()
    for (const session of allSessions()) {
      for (const teammate of sessionTeammates(session)) {
        const key = teammate.machineId || teammate.id
        const existing = map.get(key)
        if (!existing) {
          map.set(key, {
            machineId: key,
            machineName: teammate.machineName || key,
            status: teammate.status,
            sessions: [session],
          })
          continue
        }
        if (!existing.sessions.some((s) => s.id === session.id)) {
          existing.sessions.push(session)
        }
        if (teammate.status === "online") existing.status = "online"
        else if (existing.status !== "online" && teammate.status === "busy") existing.status = "busy"
      }
    }
    return [...map.values()]
      .map((node) => ({
        ...node,
        sessions: node.sessions.sort((a, b) => parseTime(b.updatedAt) - parseTime(a.updatedAt)),
      }))
      .sort((a, b) => {
        const rank = (status: TeammateNode["status"]) => (status === "online" ? 0 : status === "busy" ? 1 : 2)
        const diff = rank(a.status) - rank(b.status)
        if (diff !== 0) return diff
        return a.machineName.localeCompare(b.machineName)
      })
  })

  const tasksForSession = (sessionId: string): Task[] => {
    if (sessionId === currentSessionId()) return cloudTeam.tasks()
    return taskMap()[sessionId] ?? []
  }

  const approvalsForSession = (sessionId: string): ApprovalRequest[] => {
    if (sessionId === currentSessionId()) return cloudTeam.approvals()
    return approvalMap()[sessionId] ?? []
  }

  const progressForSession = (sessionId: string): SessionProgress | undefined => {
    if (sessionId === currentSessionId()) return cloudTeam.sessionProgress()
    return progressMap()[sessionId]
  }

  const memberNameMap = (session: TeamSession): Map<string, string> => {
    const map = new Map<string, string>()
    for (const teammate of sessionTeammates(session)) {
      map.set(teammate.id, teammate.machineName)
    }
    return map
  }

  const onToggleTeammate = (machineId: string) => {
    toggleSetFlag(setExpandedTeammates, machineId)
  }

  const onToggleSession = (sessionId: string) => {
    const willExpand = !expandedSessions().has(sessionId)
    toggleSetFlag(setExpandedSessions, sessionId)
    if (willExpand) {
      void fetchSessionDetail(sessionId)
      void fetchSessionData(sessionId)
    }
  }

  const handleApproval = async (sessionId: string, approvalId: string, status: "approved" | "rejected") => {
    if (approvalBusy().has(approvalId)) return
    setSetFlag(setApprovalBusy, approvalId, true)
    try {
      if (sessionId === currentSessionId()) {
        await cloudTeam.respondApproval(approvalId, status)
      } else {
        await cloudTeamApi.approval.respond(approvalId, { status })
        const approvals = await cloudTeamApi.approval.list(sessionId)
        setApprovalMap((prev) => ({ ...prev, [sessionId]: approvals }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSetFlag(setApprovalBusy, approvalId, false)
    }
  }

  createEffect(() => {
    const session = currentSession()
    if (!session) return
    setSessionDetails((prev) => ({ ...prev, [session.id]: session }))
  })

  createEffect(
    on(
      () => [collapsed(), cloudTeam.mode()] as const,
      ([isCollapsed, mode]) => {
        if (isCollapsed || mode !== "cloud") return
        void refreshSessions()
        const timer = window.setInterval(() => {
          void refreshSessions()
        }, 30_000)
        onCleanup(() => window.clearInterval(timer))
      },
    ),
  )

  createEffect(
    on(
      () => props.refreshNonce?.(),
      () => {
        if (cloudTeam.mode() !== "cloud") return
        void refreshSessions()
      },
      { defer: true },
    ),
  )

  return (
    <div class="flex flex-col py-1 border-t border-sidebar-border/50 mt-1">
      <button
        type="button"
        class="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-sidebar-accent/50 focus:outline-none focus-visible:bg-sidebar-accent/60"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed()}
      >
        <span class="flex h-7 w-7 items-center justify-center rounded-[var(--native-radius-sm)] bg-[color:color-mix(in_oklab,var(--native-panel)_80%,var(--native-bg-subtle))] text-sidebar-foreground/70 shadow-[var(--native-shadow-sm)]">
          <Icon name={collapsed() ? "chevron-right" : "chevron-down"} class="size-4" />
        </span>
        <span class="text-[11px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/70">Cloud Team</span>
        <span class="ml-auto rounded-[var(--native-radius-full)] bg-[color:color-mix(in_oklab,var(--native-panel)_82%,var(--native-bg-subtle))] px-2 py-0.5 text-[11px] font-medium text-sidebar-foreground/55 shadow-[var(--native-shadow-sm)]">
          {teammates().length}
        </span>
      </button>

      <Show when={!collapsed()}>
        <div class="px-2.5 pb-2 space-y-2">
          <Show when={cloudTeam.mode() === "cloud"}>
            {/* Orchestrate progress indicator */}
            <Show when={cloudTeam.orchestrating()}>
              <div class="flex items-center gap-2 px-1 py-1.5 text-[11px] text-blue-600 animate-pulse">
                <span class="size-2.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                <span>
                  {cloudTeam.orchestratePhase() === "exploring" && "Exploring codebases..."}
                  {cloudTeam.orchestratePhase() === "decomposing" && "Decomposing into tasks..."}
                  {(!cloudTeam.orchestratePhase() || cloudTeam.orchestratePhase() === "ready_for_review") && "Processing..."}
                </span>
              </div>
            </Show>

            {/* Plan confirmation — shown when pendingPlan is non-empty */}
            <Show when={cloudTeam.pendingPlan()}>
              <div class="rounded-[var(--native-radius-md)] border border-sidebar-border/70 overflow-hidden">
                <CloudTeamPlanConfirmation />
              </div>
            </Show>

            <Show when={loadingSessions()}>
              <div class="text-[11px] text-sidebar-foreground/55 px-1">Loading Cloud Team sessions...</div>
            </Show>

            <Show when={teammates().length === 0 && !loadingSessions()}>
              <div class="rounded-[var(--native-radius-md)] border border-dashed border-sidebar-border px-2.5 py-4 text-center text-[11px] text-sidebar-foreground/55">
                No teammates found in active sessions.
              </div>
            </Show>

            <div class="space-y-1">
              <For each={teammates()}>
                {(teammate) => {
                  const opened = createMemo(() => expandedTeammates().has(teammate.machineId))
                  return (
                    <div class="rounded-[var(--native-radius-md)] border border-sidebar-border bg-[color:color-mix(in_oklab,var(--native-panel)_86%,var(--native-bg-subtle))]">
                      <button
                        type="button"
                        class="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-sidebar-accent/50"
                        onClick={() => onToggleTeammate(teammate.machineId)}
                        aria-expanded={opened()}
                      >
                        <Icon name={opened() ? "chevron-down" : "chevron-right"} class="size-3.5 text-sidebar-foreground/55 shrink-0" />
                        <span class={`size-1.5 rounded-full shrink-0 ${teammateStatusDot(teammate.status)}`} />
                        <span class="text-[12px] font-medium text-sidebar-foreground truncate flex-1">{teammate.machineName}</span>
                        <span class="text-[10px] text-sidebar-foreground/55">{teammate.sessions.length} sessions</span>
                      </button>

                      <Show when={opened()}>
                        <div class="px-2.5 pb-2 space-y-1.5">
                          <For each={teammate.sessions}>
                            {(session) => {
                              const sessionOpen = createMemo(() => expandedSessions().has(session.id))
                              const tasks = createMemo(() => tasksForSession(session.id))
                              const approvals = createMemo(() => approvalsForSession(session.id))
                              const progress = createMemo(() => progressForSession(session.id))
                              const loadingData = createMemo(() => loadingSessionData().has(session.id))
                              const memberNames = createMemo(() => memberNameMap(session))
                              const stats = createMemo(() =>
                                progress()
                                  ? {
                                      total: progress()!.totalTasks,
                                      completed: progress()!.completedTasks,
                                      running: progress()!.runningTasks,
                                      failed: progress()!.failedTasks,
                                      pending: progress()!.pendingTasks,
                                    }
                                  : summarizeTasks(tasks()),
                              )
                              const assignment = createMemo(() => summarizeAssignments(tasks(), memberNames()))

                              return (
                                <div class="rounded border border-sidebar-border/70 bg-sidebar px-2 py-1.5">
                                  <button
                                    type="button"
                                    class="flex w-full items-center gap-2 text-left"
                                    onClick={() => onToggleSession(session.id)}
                                    aria-expanded={sessionOpen()}
                                  >
                                    <Icon name={sessionOpen() ? "chevron-down" : "chevron-right"} class="size-3 text-sidebar-foreground/55 shrink-0" />
                                    <span class="text-[11px] font-medium text-sidebar-foreground truncate flex-1">{session.name}</span>
                                    <span class={`text-[10px] ${sessionStatusClass(session.status)}`}>{session.status}</span>
                                  </button>

                                  <Show when={sessionOpen()}>
                                    <div class="mt-1.5 space-y-1.5">
                                      <Show when={loadingData()}>
                                        <div class="text-[10px] text-sidebar-foreground/55">Loading session data...</div>
                                      </Show>

                                      <div class="text-[10px] text-sidebar-foreground/60">
                                        {stats().completed}/{stats().total} completed · {stats().running} running · {stats().failed} failed · {stats().pending} pending
                                      </div>
                                      <div class="text-[10px] text-sidebar-foreground/45">Updated: {displayDate(session.updatedAt)}</div>

                                      <Show when={assignment().length > 0}>
                                        <div class="rounded border border-sidebar-border/70 bg-[color:color-mix(in_oklab,var(--native-panel)_88%,var(--native-bg-subtle))] px-2 py-1.5">
                                          <div class="text-[10px] text-sidebar-foreground/60 mb-1">Task distribution</div>
                                          <div class="space-y-0.5">
                                            <For each={assignment()}>
                                              {(item) => (
                                                <div class="text-[10px] text-sidebar-foreground/70 flex items-center gap-1">
                                                  <span class="truncate flex-1">{item.name}</span>
                                                  <span>{item.completed}/{item.total}</span>
                                                  <span class="text-amber-600">{item.running}r</span>
                                                  <span class="text-red-600">{item.failed}f</span>
                                                </div>
                                              )}
                                            </For>
                                          </div>
                                        </div>
                                      </Show>

                                      <Show when={tasks().length > 0}>
                                        <div class="space-y-1 max-h-44 overflow-y-auto pr-0.5">
                                          <For each={tasks()}>
                                            {(task) => (
                                              <div class="rounded border border-sidebar-border/70 bg-[color:color-mix(in_oklab,var(--native-panel)_90%,var(--native-bg-subtle))] px-2 py-1.5">
                                                <div class="flex items-center gap-1.5">
                                                  <span class="text-[11px] text-sidebar-foreground truncate flex-1">{task.description}</span>
                                                  <span class={`text-[10px] px-1 py-0.5 rounded ${taskStatusBadgeClass(task.status)}`}>{task.status}</span>
                                                </div>
                                                <div class="text-[10px] text-sidebar-foreground/55 mt-0.5">
                                                  Assignee: {task.assignedMemberId ? (memberNames().get(task.assignedMemberId) ?? task.assignedMemberId.slice(0, 8)) : "Unassigned"}
                                                </div>
                                                <Show when={task.result?.summary}>
                                                  <div class="text-[10px] text-sidebar-foreground/70 mt-0.5 line-clamp-2">
                                                    Result: {task.result?.summary}
                                                  </div>
                                                </Show>
                                              </div>
                                            )}
                                          </For>
                                        </div>
                                      </Show>

                                      <Show when={approvals().length > 0}>
                                        <div class="rounded border border-sidebar-border/70 bg-[color:color-mix(in_oklab,var(--native-panel)_88%,var(--native-bg-subtle))] px-2 py-1.5 space-y-1">
                                          <div class="text-[10px] text-sidebar-foreground/60">Approvals</div>
                                          <For each={approvals()}>
                                            {(approval) => (
                                              <div class="rounded border border-sidebar-border/60 px-2 py-1">
                                                <div class="text-[10px] text-sidebar-foreground/80">{approval.description}</div>
                                                <div class="flex items-center gap-1 mt-1">
                                                  <span class="text-[10px] text-sidebar-foreground/55 flex-1">{approval.requesterName || approval.requesterId}</span>
                                                  <Show when={approval.status === "pending"}>
                                                    <>
                                                      <Button
                                                        variant="ghost"
                                                        size="small"
                                                        class="text-[10px] text-green-600"
                                                        disabled={approvalBusy().has(approval.id)}
                                                        onClick={() => void handleApproval(session.id, approval.id, "approved")}
                                                      >
                                                        Approve
                                                      </Button>
                                                      <Button
                                                        variant="ghost"
                                                        size="small"
                                                        class="text-[10px] text-red-600"
                                                        disabled={approvalBusy().has(approval.id)}
                                                        onClick={() => void handleApproval(session.id, approval.id, "rejected")}
                                                      >
                                                        Reject
                                                      </Button>
                                                    </>
                                                  </Show>
                                                  <Show when={approval.status !== "pending"}>
                                                    <span class="text-[10px] text-sidebar-foreground/55">{approval.status}</span>
                                                  </Show>
                                                </div>
                                              </div>
                                            )}
                                          </For>
                                        </div>
                                      </Show>

                                      <Show when={session.id === currentSessionId() && props.runtimeSDK}>
                                        <div class="rounded border border-sidebar-border/70 overflow-hidden">
                                          <DeviceSDKContext.Provider value={props.runtimeSDK!}>
                                            <CloudTeamRuntimeRequests />
                                          </DeviceSDKContext.Provider>
                                        </div>
                                      </Show>
                                    </div>
                                  </Show>
                                </div>
                              )
                            }}
                          </For>
                        </div>
                      </Show>
                    </div>
                  )
                }}
              </For>
            </div>
          </Show>

          <Show when={error()}>
            <div class="text-[11px] text-red-500">{error()}</div>
          </Show>
        </div>
      </Show>
    </div>
  )
}
