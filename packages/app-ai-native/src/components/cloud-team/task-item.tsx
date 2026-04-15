import { Show, type Component } from "solid-js"
import type { TaskStatus } from "@/client/cloud-team-types"

const statusConfig: Record<TaskStatus, { label: string; color: string; bgColor: string }> = {
  pending: { label: "pending", color: "text-gray-500", bgColor: "bg-gray-100" },
  assigned: { label: "assigned", color: "text-blue-600", bgColor: "bg-blue-50" },
  claimed: { label: "claimed", color: "text-blue-600", bgColor: "bg-blue-50" },
  running: { label: "running", color: "text-amber-600", bgColor: "bg-amber-50" },
  completed: { label: "completed", color: "text-green-600", bgColor: "bg-green-50" },
  failed: { label: "failed", color: "text-red-600", bgColor: "bg-red-50" },
  interrupted: { label: "interrupted", color: "text-orange-600", bgColor: "bg-orange-50" },
}

export const TaskItem: Component<{
  id: string
  description: string
  status: TaskStatus
  assigneeName?: string
  progress?: number
}> = (props) => {
  const config = () => statusConfig[props.status]

  return (
    <div class="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-background-stronger transition-colors">
      <div class="flex-1 min-w-0">
        <div class="text-13-regular text-text-base truncate">{props.description}</div>
        <Show when={props.assigneeName}>
          <div class="text-11-regular text-text-weak">{props.assigneeName}</div>
        </Show>
      </div>
      <Show when={props.status === "running" && props.progress !== undefined}>
        <div class="w-12 shrink-0">
          <div class="h-1.5 rounded-full bg-background-stronger overflow-hidden">
            <div
              class="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${props.progress ?? 0}%` }}
            />
          </div>
          <div class="text-10-regular text-text-weak text-center mt-0.5">{props.progress ?? 0}%</div>
        </div>
      </Show>
      <span
        class={`shrink-0 text-11-regular px-1.5 py-0.5 rounded ${config().bgColor} ${config().color}`}
      >
        {config().label}
      </span>
    </div>
  )
}
