import { type Component, For, Show, createMemo, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { Popover as Kobalte } from "@kobalte/core/popover"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Icon } from "@opencode-ai/ui/icon"
import { List } from "@opencode-ai/ui/list"
import { showToast } from "@opencode-ai/ui/toast"
import { useCloudTeam } from "@/context/cloud-team"
import { TaskItem } from "./task-item"
import { CloudTeamPlanConfirmation } from "./cloud-team-plan-confirmation"

const statusDot: Record<string, string> = {
  online: "bg-green-500",
  busy: "bg-amber-500",
  offline: "bg-red-400",
}

const statusLabel: Record<string, string> = {
  completed: "text-green-600 bg-green-50",
  failed: "text-red-600 bg-red-50",
  active: "text-blue-600 bg-blue-50",
  paused: "text-amber-600 bg-amber-50",
}

/**
 * Cloud Team main page — three-column layout.
 * Left: online teammates
 * Middle: session history + task list
 * Right: new session / prompt input
 */
export const CloudTeamTaskDashboard: Component = () => {
  const cloudTeam = useCloudTeam()
  const [promptText, setPromptText] = createSignal("")
  const [sending, setSending] = createSignal(false)

  const hasSession = createMemo(() => !!cloudTeam.session()?.id)

  const stats = createMemo(() => {
    const tasks = cloudTeam.tasks()
    const prog = cloudTeam.sessionProgress()
    if (prog && prog.totalTasks > 0) {
      return { total: prog.totalTasks, completed: prog.completedTasks, running: prog.runningTasks, failed: prog.failedTasks, pending: prog.pendingTasks }
    }
    let completed = 0, running = 0, failed = 0, pending = 0
    for (const t of tasks) {
      if (t.status === "completed") completed++
      else if (t.status === "running") running++
      else if (t.status === "failed") failed++
      else pending++
    }
    return { total: tasks.length, completed, running, failed, pending }
  })

  const progressPercent = createMemo(() =>
    stats().total > 0 ? Math.round((stats().completed / stats().total) * 100) : 0,
  )

  const onlineCount = createMemo(() => cloudTeam.teammates().filter((t) => t.status === "online" || t.status === "busy").length)
  const totalTeammates = createMemo(() => cloudTeam.teammates().length)

  const latestError = createMemo(() => {
    const tasks = cloudTeam.tasks()
    for (let i = tasks.length - 1; i >= 0; i--) {
      const t = tasks[i]
      if ((t.status === "failed" || t.status === "interrupted") && t.errorMessage) {
        return t.errorMessage
      }
    }
    return undefined
  })

  const activeSessionUpdatedAt = createMemo(() => {
    const sid = cloudTeam.session()?.id
    if (!sid) return undefined
    return cloudTeam.sessions().find((s) => s.id === sid)?.updatedAt
  })

  const tasksByTeammate = createMemo(() => {
    const map = new Map<string, import("@/client/cloud-team-types").Task[]>()
    for (const task of cloudTeam.tasks()) {
      const key = task.assignedMemberId ?? "unassigned"
      const list = map.get(key) ?? []
      list.push(task)
      map.set(key, list)
    }
    return map
  })

  const assigneeGroups = createMemo(() => {
    const map = tasksByTeammate()
    return Array.from(map.entries()).filter(([, tasks]) => tasks.length > 0)
  })

  const sortedTimeline = createMemo(() =>
    [...cloudTeam.timeline()].sort((a, b) => a.timestamp - b.timestamp),
  )

  function getEventActor(from?: string): string {
    if (!from) return "System"
    const tm = cloudTeam.teammates().find((t) => t.id === from || t.machineId === from)
    if (tm) {
      const device = cloudTeam.deviceById().get(tm.machineId)
      return device?.displayName || tm.machineName
    }
    return from.slice(0, 8)
  }

  function getTimelineItemText(event: import("@/client/cloud-team-types").CloudEvent): string {
    const p = event.payload
    switch (event.type) {
      case "task.assigned":
        return `任务已分配: ${(p.description as string) ?? (p.taskId as string) ?? ""}`
      case "task.claim":
        return `领取任务: ${p.taskId as string}`
      case "task.progress": {
        const pct = (p as any).percentage ?? (p as any).progress
        const msg = (p as any).message
        return `进度更新${pct != null ? ` ${pct}%` : ""}${msg ? `: ${msg}` : ""}`
      }
      case "task.complete":
        return `任务完成: ${(p.description as string) ?? (p.taskId as string) ?? ""}`
      case "task.fail":
        return `任务失败: ${(p.description as string) ?? (p.taskId as string) ?? ""}`
      case "task.interrupted":
        return `任务中断: ${p.taskId as string}`
      case "task.terminate":
        return `任务终止: ${p.taskId as string}`
      case "decompose.request":
        return "开始分解任务..."
      case "decompose.result":
        return `任务分解完成，共 ${(p.tasks as any[])?.length ?? 0} 个子任务`
      case "approval.request":
      case "approval.push":
        return `审批请求: ${(p.approval as any)?.toolName ?? ""}`
      case "approval.response":
      case "approval.respond":
        return `审批响应: ${p.status as string}`
      case "message.send":
      case "message.receive": {
        if (typeof p.content === "string") return p.content
        if (typeof p.text === "string") return p.text
        if (p.message && typeof p.message === "object") {
          const m = p.message as Record<string, unknown>
          if (typeof m.content === "string") return m.content
          if (typeof m.text === "string") return m.text
        }
        return JSON.stringify(p).slice(0, 200)
      }
      case "session.join":
        return "加入会话"
      case "leader.elected":
        return `Leader 选举完成: ${getEventActor(p.leaderId as string)}`
      case "leader.expired":
        return "Leader 过期"
      case "orchestrate.progress":
        return `编排进度: ${p.phase as string}`
      case "teammate.status":
        return `状态更新: ${p.status as string}`
      case "repo.register":
        return `注册仓库: ${(p.repoUrl as string) ?? ""}`
      default:
        return `${event.type}`
    }
  }

  function getTimelineItemActor(event: import("@/client/cloud-team-types").CloudEvent): string {
    const p = event.payload
    switch (event.type) {
      case "task.assigned":
        return getEventActor((p.assignedMemberId as string) ?? undefined)
      case "task.claim":
      case "task.progress":
      case "task.complete":
      case "task.fail":
      case "task.interrupted": {
        const taskId = p.taskId as string
        const task = cloudTeam.tasks().find((t) => t.id === taskId)
        return getEventActor(task?.assignedMemberId ?? undefined)
      }
      case "message.send":
      case "message.receive":
        return getEventActor(typeof p.from === "string" ? p.from : undefined)
      case "leader.elected":
        return getEventActor(p.leaderId as string)
      case "teammate.status":
        return getEventActor(p.machineId as string)
      default:
        return "System"
    }
  }

  function getTimelineItemColor(type: string): string {
    if (type.startsWith("task.complete")) return "text-green-600"
    if (type.startsWith("task.fail") || type.startsWith("task.interrupted")) return "text-red-600"
    if (type.startsWith("task.")) return "text-amber-600"
    if (type.startsWith("message.")) return "text-blue-600"
    if (type.startsWith("approval.")) return "text-purple-600"
    if (type.startsWith("leader.")) return "text-orange-600"
    return "text-text-weaker"
  }

  const handleSend = async () => {
    const text = promptText().trim()
    if (!text || sending()) return
    setSending(true)
    try {
      const result = cloudTeam.runtimeMode() === "auto"
        ? await cloudTeam.orchestratePrompt(text)
        : await cloudTeam.submitPrompt(text)
      const taskCount = Array.isArray((result as any)?.tasks) ? (result as any).tasks.length : 0
      showToast({
        title: taskCount > 0 ? `Plan ready (${taskCount} tasks)` : "Request sent",
        description: taskCount > 0 ? "Review and confirm the task plan." : "Processing...",
      })
      setPromptText("")
    } catch (err) {
      showToast({
        title: "Failed to send",
        description: err instanceof Error ? err.message : "Unknown error",
      })
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const handleJoinSession = async (sessionId: string) => {
    try {
      await cloudTeam.joinSession(sessionId)
    } catch (err) {
      showToast({
        title: "Failed to join session",
        description: err instanceof Error ? err.message : "Unknown error",
      })
    }
  }

  function formatDate(input: string | undefined): string {
    if (!input) return ""
    const t = Date.parse(input)
    if (Number.isNaN(t)) return input
    return new Date(t).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  }

  // ── Model selector ──
  const [popoverStore, setPopoverStore] = createStore<{
    open: boolean
    dismiss: "escape" | "outside" | null
  }>({
    open: false,
    dismiss: null,
  })

  const currentModelItem = createMemo(() => {
    const selected = cloudTeam.selectedModel()
    if (!selected) return undefined
    return cloudTeam.models().find(
      (m) => m.providerID === selected.providerID && m.modelID === selected.modelID,
    )
  })

  const handleLeaveSession = async () => {
    try {
      await cloudTeam.leaveSession()
    } catch (err) {
      showToast({
        title: "Failed to leave session",
        description: err instanceof Error ? err.message : "Unknown error",
      })
    }
  }

  const memberInfoMap = createMemo(() => {
    const map = new Map<string, { machineName: string; repos: import("@/client/cloud-team-types").RepoInfo[] }>()
    for (const t of cloudTeam.teammates()) {
      map.set(t.id, { machineName: t.machineName, repos: t.repos })
    }
    return map
  })

  const getTeammateDisplayName = (teammateId?: string) => {
    if (!teammateId) return undefined
    const tm = cloudTeam.teammates().find((t) => t.id === teammateId)
    if (!tm) return teammateId.slice(0, 8)
    const device = cloudTeam.deviceById().get(tm.machineId)
    return device?.displayName || tm.machineName
  }

  return (
    <div class="relative bg-background-base size-full overflow-hidden flex">
      {/* ── Left Column: Session History ── */}
      <div class="w-56 shrink-0 border-r border-border-weak-base bg-background-base flex flex-col">
        <div class="px-4 py-3 border-b border-border-weak-base flex items-center justify-between">
          <div class="text-13-medium text-text-base">Team Sessions</div>
          <Show when={hasSession()}>
            <button
              type="button"
              onClick={handleLeaveSession}
              class="text-10-regular text-text-weaker hover:text-text-base transition-colors px-2 py-0.5 rounded hover:bg-background-stronger"
            >
              Leave
            </button>
          </Show>
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto scrollbar-none">
          {/* Active session */}
          <Show when={hasSession()}>
            <div class="px-3 py-2">
              <div class="rounded-lg border border-border-base bg-background-stronger px-3 py-2.5">
                <div class="flex items-center gap-2">
                  <span class="text-13-medium text-text-base truncate flex-1">{cloudTeam.session()?.title ?? "Untitled"}</span>
                  <span class="text-10-regular px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 shrink-0">active</span>
                </div>
                <Show when={activeSessionUpdatedAt()}>
                  <div class="mt-0.5 text-[10px] text-text-weaker">{formatDate(activeSessionUpdatedAt())}</div>
                </Show>
                <Show when={stats().total > 0}>
                  <div class="mt-2 flex items-center gap-2 text-10-regular text-text-weak">
                    <span>{stats().completed}/{stats().total}</span>
                    <div class="flex-1 h-1 rounded-full bg-background-base overflow-hidden">
                      <div class="h-full rounded-full bg-green-500 transition-all duration-500" style={{ width: `${progressPercent()}%` }} />
                    </div>
                    <span class="tabular-nums">{progressPercent()}%</span>
                  </div>
                </Show>
                <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-10-regular text-text-weaker">
                  <span>{totalTeammates()} teammate{totalTeammates() !== 1 ? "s" : ""}</span>
                  <Show when={stats().running > 0}>
                    <span class="text-amber-600">{stats().running} running</span>
                  </Show>
                  <Show when={stats().failed > 0}>
                    <span class="text-red-600">{stats().failed} failed</span>
                  </Show>
                  <Show when={stats().pending > 0}>
                    <span>{stats().pending} pending</span>
                  </Show>
                </div>
                <Show when={latestError()}>
                  <div class="mt-1 text-10-regular text-red-500 line-clamp-2">
                    {latestError()}
                  </div>
                </Show>
              </div>
            </div>
          </Show>

          {/* Session list */}
          <Show when={cloudTeam.sessions().length > 0}>
            <div class="px-3 py-1">
              <div class="text-10-regular text-text-weaker px-1 mb-1">History</div>
              <div class="flex flex-col gap-0.5">
                <For each={cloudTeam.sessions().filter((s) => s.id !== cloudTeam.session()?.id)}>
                  {(s) => (
                    <button
                      type="button"
                      onClick={() => handleJoinSession(s.id)}
                      class="flex flex-col gap-0.5 rounded-md px-2 py-2 hover:bg-background-stronger transition-colors text-left w-full"
                    >
                      <div class="flex items-center gap-2 w-full">
                        <span class="text-12-regular text-text-base truncate flex-1">{s.title || s.id.slice(0, 8)}</span>
                        <span class={`text-10-regular px-1.5 py-0.5 rounded shrink-0 ${statusLabel[s.status] ?? "bg-background-base text-text-weaker"}`}>
                          {s.status}
                        </span>
                      </div>
                      <div class="text-[10px] text-text-weaker">
                        {formatDate(s.updatedAt)}
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <Show when={cloudTeam.sessions().length === 0 && !hasSession()}>
            <div class="px-4 py-8 text-11-regular text-text-weaker text-center">
              No sessions yet
            </div>
          </Show>
        </div>
      </div>

      {/* ── Middle Column: Teammates ── */}
      <div class="w-72 shrink-0 border-r border-border-weak-base bg-background-stronger flex flex-col">
        <div class="px-4 py-3 border-b border-border-weak-base">
          <div class="text-13-medium text-text-base">Teammates</div>
          <Show when={totalTeammates() > 0}>
            <div class="text-11-regular text-text-weak mt-0.5">{onlineCount()}/{totalTeammates()} online</div>
          </Show>
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto scrollbar-none">
          <Show when={totalTeammates() > 0}>
            <div class="py-2 px-2 flex flex-col gap-0.5">
              <For each={cloudTeam.teammates()}>
                {(tm) => {
                  const info = memberInfoMap().get(tm.id)
                  const device = () => cloudTeam.deviceById().get(tm.machineId)
                  const currentTask = () => cloudTeam.tasks().find((t) => t.assignedMemberId === tm.id && (t.status === "running" || t.status === "claimed" || t.status === "assigned"))
                  const workingDir = () => info?.repos[0]?.localPath
                  return (
                    <div
                      class="group/teammate flex flex-col gap-1 rounded-md border border-transparent px-2.5 py-2 transition-all hover:border-border-weak-base hover:bg-background-base"
                      classList={{
                        "opacity-60": tm.status === "offline",
                      }}
                    >
                      {/* Main row: icon + name + details */}
                      <div class="flex items-center gap-2.5">
                        {/* Device icon with status dot */}
                        <span class="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--native-radius-sm)] bg-[color:color-mix(in_oklab,var(--native-panel)_76%,var(--native-bg-subtle))] text-sidebar-foreground/70 shadow-[var(--native-shadow-sm)]">
                          <span
                            class="absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
                            classList={{
                              "bg-[var(--native-success)]": tm.status === "online",
                              "bg-amber-500": tm.status === "busy",
                              "bg-red-400": tm.status === "offline",
                            }}
                          />
                          <Icon name="server" size="small" />
                        </span>

                        {/* Name + detail — match workspace device list format */}
                        <div class="min-w-0 flex-1">
                          <span class="block truncate text-[0.8125rem] font-medium text-sidebar-foreground">
                            {device()?.displayName || tm.machineName}
                          </span>
                          <span class="block truncate text-[11px] text-sidebar-foreground/45">
                            {device()
                              ? `${device()!.platform} · ${device()!.version}`
                              : (tm.role ?? "member")}
                            <Show when={workingDir()}>
                              <span> · </span>
                              <span class="font-mono">{workingDir()}</span>
                            </Show>
                          </span>
                        </div>
                      </div>

                      {/* Current task (if busy) */}
                      <Show when={currentTask()}>
                        <div class="pl-10.5 text-10-regular text-text-weaker truncate">
                          <span class="text-amber-600">{currentTask()!.status}</span>
                          <span class="text-text-weaker">: </span>
                          {currentTask()!.description}
                        </div>
                      </Show>
                    </div>
                  )
                }}
              </For>
            </div>
          </Show>
          <Show when={totalTeammates() === 0}>
            <div class="px-4 py-6 text-11-regular text-text-weaker text-center">
              No teammates connected
            </div>
          </Show>
        </div>
        <Show when={cloudTeam.wsConnected()}>
          <div class="px-4 py-2 border-t border-border-weak-base">
            <span class="text-10-regular text-green-600 flex items-center gap-1">
              <span class="size-1.5 rounded-full bg-green-500" />
              connected
            </span>
          </div>
        </Show>
      </div>

      {/* ── Right Column: Main workspace ── */}
      <div class="flex-1 min-w-0 flex flex-col bg-background-stronger">
        <div class="flex-1 min-h-0 overflow-y-auto scrollbar-none">
          <div class="min-w-0 w-full h-full">

            {/* Empty state — no session */}
            <Show when={!hasSession()}>
              <div class="size-full flex flex-col justify-end items-start gap-4 max-w-200 mx-auto 2xl:max-w-[1000px] px-6 pb-16">
                <div class="text-20-medium text-text-weaker">Cloud Team</div>
                <div class="flex justify-center items-start gap-3 min-h-5">
                  <Icon name="bubble-5" size="small" class="mt-0.5 shrink-0" />
                  <div class="text-12-medium text-text-weak">Orchestrate tasks across your team</div>
                </div>
                <div class="text-12-regular text-text-weaker pl-8">Send a prompt below to get started.</div>
              </div>
            </Show>

            {/* Active session content */}
            <Show when={hasSession()}>
              <div class="max-w-200 mx-auto 2xl:max-w-[1000px] px-4 md:px-5 pt-4 pb-16">

                {/* Orchestrate progress */}
                <Show when={cloudTeam.orchestrating()}>
                  <div class="flex items-center gap-3 py-3 px-4 mb-4 rounded-lg border border-blue-200 bg-blue-50/50">
                    <Spinner class="size-4 text-blue-500" />
                    <div>
                      <div class="text-13-medium text-blue-700">
                        {cloudTeam.orchestratePhase() === "exploring" && "Exploring codebases..."}
                        {cloudTeam.orchestratePhase() === "decomposing" && "Decomposing into tasks..."}
                        {cloudTeam.orchestratePhase() === "ready_for_review" && "Review ready"}
                        {!cloudTeam.orchestratePhase() && "Processing..."}
                      </div>
                    </div>
                  </div>
                </Show>

                {/* Plan confirmation */}
                <Show when={cloudTeam.pendingPlan() && cloudTeam.pendingPlan()!.length > 0}>
                  <div class="mb-4 rounded-lg border border-border-base overflow-hidden">
                    <CloudTeamPlanConfirmation />
                  </div>
                </Show>

                {/* Timeline activity feed */}
                <Show when={sortedTimeline().length > 0}>
                  <div class="mb-4 rounded-lg border border-border-weak-base bg-background-base overflow-hidden">
                    <div class="px-3 py-2 border-b border-border-weak-base bg-background-stronger flex items-center justify-between">
                      <span class="text-13-medium text-text-base">Timeline</span>
                      <span class="text-10-regular text-text-weaker">{sortedTimeline().length} events</span>
                    </div>
                    <div class="px-3 py-2 space-y-1.5 max-h-96 overflow-y-auto scrollbar-none">
                      <For each={sortedTimeline()}>
                        {(event) => {
                          const time = () => new Date(event.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                          const actor = () => getTimelineItemActor(event)
                          const text = () => getTimelineItemText(event)
                          const color = () => getTimelineItemColor(event.type)
                          return (
                            <div class="flex items-start gap-2">
                              <span class="text-[10px] text-text-weaker shrink-0 pt-0.5 w-14 text-right">{time()}</span>
                              <span class={`text-10-regular shrink-0 mt-0.5 ${color()}`}>●</span>
                              <div class="min-w-0 flex-1">
                                <span class="text-11-medium text-text-base">{actor()}</span>
                                <span class="text-11-regular text-text-weak ml-1">{text()}</span>
                              </div>
                            </div>
                          )
                        }}
                      </For>
                    </div>
                  </div>
                </Show>

                {/* Tasks grouped by teammate */}
                <Show when={cloudTeam.tasks().length > 0}>
                  <div class="space-y-4">
                    <For each={assigneeGroups()}>
                      {([memberId, tasks]) => {
                        const tm = () => cloudTeam.teammates().find((t) => t.id === memberId)
                        const device = () => {
                          const m = tm()
                          return m ? cloudTeam.deviceById().get(m.machineId) : undefined
                        }
                        const info = () => memberInfoMap().get(memberId)
                        const workingDir = () => info()?.repos[0]?.localPath
                        const isUnassigned = memberId === "unassigned"
                        return (
                          <div class="rounded-lg border border-border-weak-base bg-background-base overflow-hidden">
                            {/* Teammate header */}
                            <Show when={!isUnassigned}>
                              <div class="px-3 py-2.5 border-b border-border-weak-base bg-background-stronger">
                                <div class="flex items-center gap-2.5">
                                  <span class="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--native-radius-sm)] bg-[color:color-mix(in_oklab,var(--native-panel)_76%,var(--native-bg-subtle))] text-sidebar-foreground/70 shadow-[var(--native-shadow-sm)]">
                                    <span
                                      class="absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
                                      classList={{
                                        "bg-[var(--native-success)]": tm()?.status === "online",
                                        "bg-amber-500": tm()?.status === "busy",
                                        "bg-red-400": tm()?.status === "offline",
                                      }}
                                    />
                                    <Icon name="server" size="small" />
                                  </span>
                                  <div class="min-w-0 flex-1">
                                    <span class="block truncate text-[0.8125rem] font-medium text-sidebar-foreground">
                                      {device()?.displayName || tm()?.machineName || memberId.slice(0, 8)}
                                    </span>
                                    <span class="block truncate text-[11px] text-sidebar-foreground/45">
                                      {device()
                                        ? `${device()!.platform} · ${device()!.version}`
                                        : (tm()?.role ?? "member")}
                                      <Show when={workingDir()}>
                                        <span> · </span>
                                        <span class="font-mono">{workingDir()}</span>
                                      </Show>
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </Show>
                            <Show when={isUnassigned}>
                              <div class="px-3 py-2 border-b border-border-weak-base bg-background-stronger">
                                <span class="text-13-medium text-text-base">Unassigned</span>
                              </div>
                            </Show>
                            {/* Tasks for this teammate */}
                            <div class="divide-y divide-border-weak-base">
                              <For each={tasks}>
                                {(task) => (
                                  <TaskItem
                                    id={task.id}
                                    description={task.description}
                                    status={task.status}
                                    progress={cloudTeam.progress()[task.id]?.percentage}
                                    progressMessage={cloudTeam.progress()[task.id]?.message}
                                    result={task.result}
                                    errorMessage={task.errorMessage}
                                    retryCount={task.retryCount}
                                  />
                                )}
                              </For>
                            </div>
                          </div>
                        )
                      }}
                    </For>
                  </div>
                </Show>

                {/* Status breakdown */}
                <Show when={stats().total > 0}>
                  <div class="mt-4 flex items-center gap-3 text-11-regular text-text-weaker">
                    <Show when={stats().running > 0}><span class="text-amber-600">{stats().running} running</span></Show>
                    <Show when={stats().failed > 0}><span class="text-red-600">{stats().failed} failed</span></Show>
                    <Show when={stats().pending > 0}><span>{stats().pending} pending</span></Show>
                  </div>
                </Show>

              </div>
            </Show>

          </div>
        </div>

        {/* Composer — bottom-docked */}
        <div class="shrink-0 w-full pb-3 flex flex-col justify-center items-center bg-background-stronger">
          <div class="w-full px-3 max-w-200 md:mx-auto 2xl:max-w-[1000px]">
            <form
              onSubmit={(e) => { e.preventDefault(); void handleSend() }}
              class="relative bg-background-base rounded-xl shadow-[var(--shadow-xs-border)] overflow-hidden"
            >
              <textarea
                value={promptText()}
                onInput={(e) => {
                  setPromptText(e.currentTarget.value)
                  const el = e.currentTarget
                  el.style.height = "auto"
                  el.style.height = Math.min(el.scrollHeight, 400) + "px"
                }}
                onKeyDown={handleKeyDown}
                placeholder={hasSession() ? "Send another prompt..." : "Describe what you want to build..."}
                class="w-full resize-none bg-transparent pl-3 pr-10 pt-2 pb-11 text-14-regular text-text-strong focus:outline-none placeholder:text-text-weaker min-h-[80px] max-h-[400px] whitespace-pre-wrap"
                rows={1}
              />
              <button
                type="submit"
                class="absolute bottom-2.5 right-2.5 size-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30"
                classList={{
                  "bg-text-base text-background-base hover:opacity-90": !!promptText().trim() && !sending(),
                  "bg-background-stronger text-text-weaker": !promptText().trim() || !!sending(),
                }}
                disabled={!promptText().trim() || sending()}
              >
                <Show when={sending()} fallback={<Icon name="arrow-up" size="small" />}>
                  <Spinner class="size-4" />
                </Show>
              </button>
            </form>
            <div class="mt-1.5 px-1 flex items-center gap-2">
              <Show when={onlineCount() > 0}>
                <span class="text-10-regular text-text-weaker">{onlineCount()} teammate{onlineCount() !== 1 ? "s" : ""} online</span>
              </Show>

              {/* Model selector */}
              <Kobalte
                open={popoverStore.open}
                onOpenChange={(next) => {
                  if (next) setPopoverStore("dismiss", null)
                  setPopoverStore("open", next)
                }}
                modal={false}
                placement="top-start"
                gutter={4}
              >
                <Kobalte.Trigger as="div" class="text-10-regular text-text-weaker flex items-center gap-1 hover:text-text-base transition-colors cursor-pointer">
                  <span class="truncate max-w-[120px]">{cloudTeam.selectedModel()?.name ?? "选择模型"}</span>
                  <Icon name="chevron-down" size="small" class="shrink-0" />
                </Kobalte.Trigger>
                <Kobalte.Portal>
                  <Kobalte.Content
                    class="w-72 h-80 flex flex-col p-2 rounded-md border border-border-base bg-surface-raised-stronger-non-alpha shadow-md z-50 outline-none overflow-hidden"
                    onEscapeKeyDown={(event) => {
                      setPopoverStore("dismiss", "escape")
                      setPopoverStore("open", false)
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    onPointerDownOutside={() => {
                      setPopoverStore("dismiss", "outside")
                      setPopoverStore("open", false)
                    }}
                    onFocusOutside={() => {
                      setPopoverStore("dismiss", "outside")
                      setPopoverStore("open", false)
                    }}
                    onCloseAutoFocus={(event) => {
                      if (popoverStore.dismiss === "outside") event.preventDefault()
                      setPopoverStore("dismiss", null)
                    }}
                  >
                    <Kobalte.Title class="sr-only">选择模型</Kobalte.Title>
                    <List
                      class="flex-1 min-h-0 [&_[data-slot=list-scroll]]:flex-1 [&_[data-slot=list-scroll]]:min-h-0 p-1"
                      search={{ placeholder: "搜索模型", autofocus: true }}
                      emptyMessage="暂无模型"
                      key={(x) => `${x.providerID}:${x.modelID}`}
                      items={cloudTeam.models}
                      current={currentModelItem()}
                      filterKeys={["providerName", "name"]}
                      sortBy={(a, b) => a.name.localeCompare(b.name)}
                      groupBy={(x) => x.providerName}
                      sortGroupsBy={(a, b) => {
                        const aProvider = a.items[0].providerID
                        const bProvider = b.items[0].providerID
                        if (aProvider === "costrict" && bProvider !== "costrict") return -1
                        if (bProvider === "costrict" && aProvider !== "costrict") return 1
                        return a.category.localeCompare(b.category)
                      }}
                      onSelect={(x) => {
                        cloudTeam.setSelectedModel(x ? { providerID: x.providerID, modelID: x.modelID } : undefined)
                        setPopoverStore("open", false)
                      }}
                    >
                      {(i) => (
                        <div class="w-full flex items-center gap-x-2 text-13-regular">
                          <span class="truncate">{i.name}</span>
                        </div>
                      )}
                    </List>
                  </Kobalte.Content>
                </Kobalte.Portal>
              </Kobalte>

              <Show when={cloudTeam.session()?.id}>
                <span class="text-10-regular text-text-weaker ml-auto">
                  {cloudTeam.runtimeMode()} mode
                </span>
              </Show>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
