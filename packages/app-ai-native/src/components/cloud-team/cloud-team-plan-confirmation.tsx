import { type Component, For, Show, createEffect, createMemo, createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useCloudTeam } from "@/context/cloud-team"
import type { SubTask } from "@/client/cloud-team-types"

type EditableTask = SubTask & { _key: string }

/**
 * Shown when `cloudTeam.pendingPlan()` is non-empty.
 * Lets the Leader review, edit, and confirm (or discard) the decomposed task plan
 * before tasks are submitted to the server and distributed to teammates.
 */
export const CloudTeamPlanConfirmation: Component = () => {
  const cloudTeam = useCloudTeam()
  const [editableTasks, setEditableTasks] = createSignal<EditableTask[]>([])
  const [submitting, setSubmitting] = createSignal(false)
  const [confirmError, setConfirmError] = createSignal("")

  // Sync local editable state whenever pendingPlan changes (e.g. new decompose result)
  createEffect(() => {
    const plan = cloudTeam.pendingPlan()
    if (plan && plan.length > 0) {
      setEditableTasks(
        plan.map((t) => ({
          _key: t.id || `task-${Math.random().toString(36).slice(2)}`,
          taskId: t.id,
          description: t.description,
          repoAffinity: t.repoAffinity ?? [],
          fileHints: t.fileHints ?? [],
          dependencies: t.dependencies ?? [],
          assignedMemberId: t.assignedMemberId ?? "",
          priority: t.priority ?? 5,
        })),
      )
      setConfirmError("")
    }
  })

  const teammateOptions = createMemo(() => [
    { id: "", name: "Auto-assign" },
    ...cloudTeam.teammates().map((t) => ({ id: t.id, name: t.machineName })),
  ])

  const updateTask = (key: string, updates: Partial<EditableTask>) => {
    setEditableTasks((prev) => prev.map((t) => (t._key === key ? { ...t, ...updates } : t)))
  }

  const removeTask = (key: string) => {
    setEditableTasks((prev) => prev.filter((t) => t._key !== key))
  }

  const addTask = () => {
    setEditableTasks((prev) => [
      ...prev,
      {
        _key: `new-${Date.now()}`,
        taskId: "",
        description: "",
        repoAffinity: [],
        fileHints: [],
        dependencies: [],
        priority: 5,
        assignedMemberId: "",
      },
    ])
  }

  const handleConfirm = async () => {
    setConfirmError("")
    const valid = editableTasks().filter((t) => t.description.trim() !== "")
    if (valid.length === 0) {
      setConfirmError("Add at least one task before confirming.")
      return
    }
    setSubmitting(true)
    try {
      // Strip internal _key before submitting
      const tasks: SubTask[] = valid.map(({ _key: _, ...t }) => ({
        ...t,
        assignedMemberId: t.assignedMemberId ? t.assignedMemberId : undefined,
      }))
      await cloudTeam.confirmPlan(tasks)
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Failed to submit plan")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDiscard = () => {
    cloudTeam.discardPlan()
  }

  return (
    <div class="px-3 py-2 space-y-2">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-12-medium text-text-base">Plan Review</span>
          <span class="text-11-regular text-text-weak">
            · {editableTasks().length} task{editableTasks().length !== 1 ? "s" : ""}
          </span>
        </div>
        <Button variant="ghost" size="small" class="text-11-regular" onClick={addTask}>
          + Add task
        </Button>
      </div>

      {/* Editable task list */}
      <div class="space-y-1.5 max-h-64 overflow-y-auto">
        <For each={editableTasks()}>
          {(task) => (
            <div class="rounded border border-border-weak-base bg-background-stronger p-2 space-y-1.5">
              {/* Description row */}
              <div class="flex items-start gap-1.5">
                <span class="mt-1.5 shrink-0 size-1.5 rounded-full bg-blue-400" />
                <input
                  type="text"
                  value={task.description}
                  onInput={(e) => updateTask(task._key, { description: e.currentTarget.value })}
                  class="flex-1 min-w-0 text-13-regular bg-transparent border-b border-border-weak-base px-0.5 py-0.5 outline-none focus:border-border-base placeholder:text-text-weaker"
                  placeholder="Task description..."
                />
                <button
                  type="button"
                  class="shrink-0 text-11-regular text-text-weaker hover:text-red-500 transition-colors mt-0.5"
                  onClick={() => removeTask(task._key)}
                  title="Remove task"
                >
                  ×
                </button>
              </div>

              {/* Meta row: assignee + priority */}
              <div class="flex items-center gap-3 pl-3">
                <div class="flex items-center gap-1">
                  <span class="text-10-regular text-text-weaker shrink-0">Assign</span>
                  <select
                    class="text-11-regular bg-transparent border-b border-border-weak-base px-0.5 py-0 outline-none focus:border-border-base max-w-[120px] cursor-pointer"
                    value={task.assignedMemberId ?? ""}
                    onChange={(e) =>
                      updateTask(task._key, { assignedMemberId: e.currentTarget.value })
                    }
                  >
                    <For each={teammateOptions()}>
                      {(opt) => <option value={opt.id}>{opt.name}</option>}
                    </For>
                  </select>
                </div>
                <div class="flex items-center gap-1">
                  <span class="text-10-regular text-text-weaker shrink-0">P</span>
                  <input
                    type="number"
                    value={task.priority ?? 5}
                    min={1}
                    max={10}
                    class="w-8 text-11-regular bg-transparent border-b border-border-weak-base px-0.5 py-0 outline-none focus:border-border-base text-center"
                    onInput={(e) => updateTask(task._key, { priority: parseInt(e.currentTarget.value) || 5 })}
                  />
                </div>
                <Show when={(task.repoAffinity?.length ?? 0) > 0}>
                  <span class="text-10-regular text-text-weaker truncate max-w-[120px]" title={task.repoAffinity?.join(", ")}>
                    {task.repoAffinity?.[0]?.split("/").pop() ?? ""}
                    {(task.repoAffinity?.length ?? 0) > 1 ? ` +${(task.repoAffinity?.length ?? 0) - 1}` : ""}
                  </span>
                </Show>
              </div>
            </div>
          )}
        </For>

        {/* Empty state */}
        <Show when={editableTasks().length === 0}>
          <div class="py-3 text-center text-11-regular text-text-weaker">
            No tasks. Click "+ Add task" to create one.
          </div>
        </Show>
      </div>

      {/* Error message */}
      <Show when={confirmError()}>
        <div class="text-11-regular text-red-500">{confirmError()}</div>
      </Show>

      {/* Actions */}
      <div class="flex items-center gap-2 pt-1 border-t border-border-weak-base">
        <Button
          variant="primary"
          size="small"
          disabled={submitting() || editableTasks().every((t) => !t.description.trim())}
          onClick={handleConfirm}
        >
          <Show when={submitting()} fallback="Confirm & Execute">
            <span class="flex items-center gap-1.5">
              <Spinner class="size-3" />
              Submitting...
            </span>
          </Show>
        </Button>
        <Button
          variant="ghost"
          size="small"
          class="text-11-regular text-text-weak hover:text-red-500"
          disabled={submitting()}
          onClick={handleDiscard}
        >
          Discard
        </Button>
        <span class="text-10-regular text-text-weaker ml-auto">
          {editableTasks().filter((t) => t.description.trim()).length} valid task
          {editableTasks().filter((t) => t.description.trim()).length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  )
}
