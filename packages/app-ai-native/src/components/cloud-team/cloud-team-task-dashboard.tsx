import { type Component, For, Show, createMemo, createSignal } from "solid-js"
import { Popover as Kobalte } from "@kobalte/core/popover"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Icon } from "@opencode-ai/ui/icon"
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

  const memberNameMap = createMemo(() => {
    const map = new Map<string, string>()
    for (const t of cloudTeam.teammates()) {
      map.set(t.id, t.machineName)
    }
    return map
  })

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

  // ── Model selector ──
  const [modelPopoverOpen, setModelPopoverOpen] = createSignal(false)

  const modelsGrouped = createMemo(() => {
    const models = cloudTeam.models()
    const groups = new Map<string, { providerID: string; modelID: string; name: string }[]>()
    for (const m of models) {
      let list = groups.get(m.providerName)
      if (!list) { list = []; groups.set(m.providerName, list) }
      list.push({ providerID: m.providerID, modelID: m.modelID, name: m.name })
    }
    return [...groups.entries()]
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

  return (
    <div class="relative bg-background-base size-full overflow-hidden flex">
      {/* ── Left Column: Teammates ── */}
      <div class="w-56 shrink-0 border-r border-border-weak-base bg-background-base flex flex-col">
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
                {(tm) => (
                  <div class="flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-background-stronger transition-colors">
                    <span class={`size-2 rounded-full shrink-0 ${statusDot[tm.status] ?? "bg-text-weaker"}`} />
                    <div class="min-w-0">
                      <div class="text-12-regular text-text-base truncate">{tm.machineName}</div>
                      <div class="text-10-regular text-text-weaker">{tm.role ?? "member"}</div>
                    </div>
                  </div>
                )}
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

      {/* ── Middle Column: Session History ── */}
      <div class="w-72 shrink-0 border-r border-border-weak-base bg-background-stronger flex flex-col">
        <div class="px-4 py-3 border-b border-border-weak-base flex items-center justify-between">
          <div class="text-13-medium text-text-base">Sessions</div>
          <Show when={hasSession()}>
            <button
              type="button"
              onClick={handleLeaveSession}
              class="text-10-regular text-text-weaker hover:text-text-base transition-colors px-2 py-0.5 rounded hover:bg-background-base"
            >
              Leave
            </button>
          </Show>
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto scrollbar-none">
          {/* Active session */}
          <Show when={hasSession()}>
            <div class="px-3 py-2">
              <div class="rounded-lg border border-border-base bg-background-base px-3 py-2.5">
                <div class="flex items-center gap-2">
                  <span class="text-13-medium text-text-base truncate flex-1">{cloudTeam.session()?.title ?? "Untitled"}</span>
                  <span class="text-10-regular px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 shrink-0">active</span>
                </div>
                <Show when={stats().total > 0}>
                  <div class="mt-2 flex items-center gap-2 text-10-regular text-text-weak">
                    <span>{stats().completed}/{stats().total}</span>
                    <div class="flex-1 h-1 rounded-full bg-background-stronger overflow-hidden">
                      <div class="h-full rounded-full bg-green-500 transition-all duration-500" style={{ width: `${progressPercent()}%` }} />
                    </div>
                    <span class="tabular-nums">{progressPercent()}%</span>
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
                      class="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-background-base transition-colors text-left w-full"
                    >
                      <span class="text-12-regular text-text-base truncate flex-1">{s.title || s.id.slice(0, 8)}</span>
                      <span class={`text-10-regular px-1.5 py-0.5 rounded shrink-0 ${statusLabel[s.status] ?? "bg-background-base text-text-weaker"}`}>
                        {s.status}
                      </span>
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

                {/* Task list */}
                <Show when={cloudTeam.tasks().length > 0}>
                  <div class="space-y-3">
                    <For each={cloudTeam.tasks()}>
                      {(task) => (
                        <div class="rounded-lg border border-border-weak-base bg-background-base overflow-hidden">
                          <TaskItem
                            id={task.id}
                            description={task.description}
                            status={task.status}
                            assigneeName={
                              task.assignedMemberId
                                ? memberNameMap().get(task.assignedMemberId) ?? task.assignedMemberId.slice(0, 8)
                                : undefined
                            }
                            progress={cloudTeam.progress()[task.id]?.percentage}
                            progressMessage={cloudTeam.progress()[task.id]?.message}
                            result={task.result}
                            errorMessage={task.errorMessage}
                            retryCount={task.retryCount}
                          />
                        </div>
                      )}
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
                  open={modelPopoverOpen()}
                  onOpenChange={setModelPopoverOpen}
                  modal={false}
                  placement="top-start"
                  gutter={4}
                >
                  <Kobalte.Trigger as="button" type="button" class="text-10-regular text-text-weaker flex items-center gap-1 hover:text-text-base transition-colors">
                    <span class="truncate max-w-[120px]">{cloudTeam.selectedModel()?.name ?? "选择模型"}</span>
                    <Icon name="chevron-down" size="small" class="shrink-0" />
                  </Kobalte.Trigger>
                  <Kobalte.Portal>
                    <Kobalte.Content
                      class="w-64 max-h-72 flex flex-col p-2 rounded-md border border-border-base bg-surface-raised-stronger-non-alpha shadow-md z-50 outline-none overflow-hidden"
                      onPointerDownOutside={() => setModelPopoverOpen(false)}
                    >
                      <div class="flex-1 min-h-0 overflow-y-auto scrollbar-none">
                        <For each={modelsGrouped()}>
                          {([provider, models]) => (
                            <div class="mb-2">
                              <div class="text-10-medium text-text-weaker px-2 py-1">{provider}</div>
                              <For each={models}>
                                {(m) => {
                                  const isActive = () => cloudTeam.selectedModel()?.modelID === m.modelID && cloudTeam.selectedModel()?.providerID === m.providerID
                                  return (
                                    <button
                                      type="button"
                                      class="w-full text-left px-2 py-1.5 rounded-md text-12-regular transition-colors flex items-center gap-2"
                                      classList={{
                                        "bg-background-base text-text-base": isActive(),
                                        "text-text-weak hover:bg-background-base": !isActive(),
                                      }}
                                      onClick={() => {
                                        cloudTeam.setSelectedModel({ providerID: m.providerID, modelID: m.modelID })
                                        setModelPopoverOpen(false)
                                      }}
                                    >
                                      <span class="truncate flex-1">{m.name}</span>
                                      <Show when={isActive()}>
                                        <Icon name="check" size="small" class="shrink-0 text-text-base" />
                                      </Show>
                                    </button>
                                  )
                                }}
                              </For>
                            </div>
                          )}
                        </For>
                      </div>
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
