import { type Component, For, Show, createSignal, createMemo } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { useCloudTeam } from "@/context/cloud-team"
import type { SubTask, TaskStatus } from "@/client/cloud-team-types"

/**
 * Task plan review/edit UI.
 *
 * After decomposition, the Leader sees the proposed task list and can:
 *  - Edit descriptions
 *  - Adjust priorities
 *  - Assign tasks to specific teammates
 *  - Edit dependencies
 *  - Approve (submit) or reject (discard) the plan
 */
export const CloudTeamTaskPlanReview: Component = () => {
  const cloudTeam = useCloudTeam()

  const [editing, setEditing] = createSignal(false)
  const [planTasks, setPlanTasks] = createSignal<SubTask[]>([])
  const [submitting, setSubmitting] = createSignal(false)

  const hasPendingTasks = createMemo(() => cloudTeam.tasks().some((t) => t.status === "pending"))

  const startEditing = () => {
    setPlanTasks(
      cloudTeam.tasks().map((t) => ({
        taskId: t.id,
        description: t.description,
        repoAffinity: t.repoAffinity,
        fileHints: t.fileHints,
        dependencies: t.dependencies,
        assignedMemberId: t.assignedMemberId,
        priority: t.priority,
      })),
    )
    setEditing(true)
  }

  const cancelEditing = () => {
    setEditing(false)
    setPlanTasks([])
  }

  const updateTask = (index: number, updates: Partial<SubTask>) => {
    setPlanTasks((prev) => prev.map((t, i) => (i === index ? { ...t, ...updates } : t)))
  }

  const removeTask = (index: number) => {
    setPlanTasks((prev) => prev.filter((_, i) => i !== index))
  }

  const addTask = () => {
    setPlanTasks((prev) => [
      ...prev,
      {
        taskId: `new-${Date.now()}`,
        description: "",
        repoAffinity: [],
        fileHints: [],
        dependencies: [],
        priority: 5,
      },
    ])
  }

  const submitPlan = async () => {
    const sessionId = cloudTeam.session()?.id
    if (!sessionId) return

    const leader = cloudTeam.leader()
    if (!leader?.elected) return

    const tasks = planTasks().filter((t) => t.description.trim() !== "")
    if (tasks.length === 0) return

    setSubmitting(true)
    try {
      const { cloudTeamApi } = await import("@/client/cloud-team-api")
      await cloudTeamApi.task.submitPlan(sessionId, {
        tasks,
        fencingToken: leader.fencingToken,
      })
      setEditing(false)
      setPlanTasks([])
    } catch (err) {
      console.error("[task-plan-review] Submit failed:", err)
    } finally {
      setSubmitting(false)
    }
  }

  const teammateOptions = createMemo(() => {
    const teammates = cloudTeam.teammates()
    return [{ id: "", name: "Auto" }, ...teammates.map((t) => ({ id: t.id, name: t.machineName }))]
  })

  return (
    <div class="px-3 py-2 space-y-2">
      <div class="flex items-center justify-between">
        <div class="text-11-regular text-text-weak">Task Plan</div>
        <Show when={!editing() && hasPendingTasks()}>
          <Button variant="ghost" size="small" class="text-11-regular" onClick={startEditing}>
            Edit Plan
          </Button>
        </Show>
      </div>

      <Show when={!editing()}>
        {/* Read-only task list */}
        <div class="space-y-0.5">
          <For each={cloudTeam.tasks()}>
            {(task) => {
              const assigneeName = createMemo(() => {
                if (!task.assignedMemberId) return null
                const tm = cloudTeam.teammateById().get(task.assignedMemberId!)
                return tm?.machineName ?? task.assignedMemberId!.slice(0, 8)
              })
              return (
              <div class="flex items-center gap-2 text-12-regular">
                <span
                  class={`shrink-0 size-2 rounded-full ${
                    task.status === "completed"
                      ? "bg-green-500"
                      : task.status === "running"
                        ? "bg-amber-500"
                        : task.status === "failed"
                          ? "bg-red-500"
                          : task.status === "interrupted"
                            ? "bg-orange-500"
                            : task.status === "claimed"
                              ? "bg-blue-600"
                              : task.status === "assigned"
                                ? "bg-blue-400"
                                : "bg-gray-400"
                  }`}
                />
                <span class="flex-1 min-w-0 truncate text-text-base">{task.description}</span>
                <Show when={assigneeName()}>
                  <span class="text-10-regular text-blue-400 shrink-0 truncate max-w-[80px]" title={assigneeName() ?? ""}>
                    {assigneeName()}
                  </span>
                </Show>
                <span class="text-10-regular text-text-weak shrink-0">P{task.priority}</span>
              </div>
              )
            }}
          </For>
        </div>
      </Show>

      <Show when={editing()}>
        {/* Editable task list */}
        <div class="space-y-2">
          <For each={planTasks()}>
            {(task, index) => (
              <div class="space-y-1 rounded border border-border-weak-base p-1.5">
                <div class="flex items-start gap-1.5">
                  <input
                    type="text"
                    value={task.description}
                    onInput={(e) => updateTask(index(), { description: e.currentTarget.value })}
                    class="flex-1 min-w-0 text-12-regular bg-transparent border-b border-border-weak-base px-1 py-0.5 outline-none focus:border-border-base"
                    placeholder="Task description..."
                  />
                  <button
                    class="text-11-regular text-red-400 hover:text-red-600 shrink-0"
                    onClick={() => removeTask(index())}
                  >
                    x
                  </button>
                </div>
                <div class="flex items-center gap-2">
                  {/* Priority */}
                  <div class="flex items-center gap-1">
                    <span class="text-10-regular text-text-weak">P</span>
                    <input
                      type="number"
                      value={task.priority ?? 5}
                      min={1}
                      max={10}
                      class="w-8 text-11-regular bg-transparent border-b border-border-weak-base px-0.5 py-0 outline-none focus:border-border-base text-center"
                      onInput={(e) => updateTask(index(), { priority: parseInt(e.currentTarget.value) || 5 })}
                    />
                  </div>
                  {/* Assignee */}
                  <div class="flex items-center gap-1">
                    <span class="text-10-regular text-text-weak">Assign:</span>
                    <select
                      class="text-11-regular bg-transparent border-b border-border-weak-base px-0.5 py-0 outline-none focus:border-border-base max-w-[100px]"
                      value={task.assignedMemberId ?? ""}
                      onChange={(e) => updateTask(index(), { assignedMemberId: e.currentTarget.value || undefined })}
                    >
                      <For each={teammateOptions()}>
                        {(opt) => <option value={opt.id}>{opt.name}</option>}
                      </For>
                    </select>
                  </div>
                  {/* Dependencies */}
                  <div class="flex items-center gap-1 flex-1 min-w-0">
                    <span class="text-10-regular text-text-weak shrink-0">Deps:</span>
                    <input
                      type="text"
                      value={task.dependencies?.join(", ") ?? ""}
                      onInput={(e) => {
                        const deps = e.currentTarget.value.split(",").map((s) => s.trim()).filter(Boolean)
                        updateTask(index(), { dependencies: deps })
                      }}
                      class="flex-1 min-w-0 text-10-regular bg-transparent border-b border-border-weak-base px-0.5 py-0 outline-none focus:border-border-base"
                      placeholder="task IDs..."
                    />
                  </div>
                </div>
              </div>
            )}
          </For>
          <Button variant="ghost" size="small" class="text-11-regular" onClick={addTask}>
            + Add task
          </Button>
        </div>

        {/* Actions */}
        <div class="flex items-center gap-2 pt-1">
          <Button
            variant="primary"
            size="small"
            class="text-11-regular"
            disabled={submitting() || planTasks().length === 0}
            onClick={submitPlan}
          >
            {submitting() ? "Submitting..." : "Submit Plan"}
          </Button>
          <Button variant="ghost" size="small" class="text-11-regular" onClick={cancelEditing}>
            Cancel
          </Button>
        </div>
      </Show>
    </div>
  )
}
