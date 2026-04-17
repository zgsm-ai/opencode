import { For, Show, createSignal, type Component } from "solid-js"
import type { TaskResult, TaskStatus } from "@/client/cloud-team-types"

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
  progressMessage?: string
  result?: TaskResult | null
  errorMessage?: string
  retryCount?: number
}> = (props) => {
  const [showFiles, setShowFiles] = createSignal(false)
  const config = () => statusConfig[props.status]

  const hasResult = () => props.status === "completed" && props.result
  const hasError = () => props.status === "failed" && props.errorMessage
  const hasProgressMsg = () => props.status === "running" && !!props.progressMessage

  return (
    <div class="px-3 py-2 rounded-md hover:bg-background-stronger transition-colors">
      {/* Main row */}
      <div class="flex items-center gap-2">
        <div class="flex-1 min-w-0">
          <div class="text-13-regular text-text-base truncate">{props.description}</div>
          <Show when={props.assigneeName}>
            <div class="text-11-regular text-text-weak">{props.assigneeName}</div>
          </Show>
        </div>

        {/* Progress bar (running only) */}
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

        {/* Status badge + retry count */}
        <div class="flex items-center gap-1 shrink-0">
          <Show when={(props.retryCount ?? 0) > 0}>
            <span class="text-10-regular text-orange-500">×{props.retryCount}</span>
          </Show>
          <span class={`text-11-regular px-1.5 py-0.5 rounded ${config().bgColor} ${config().color}`}>
            {config().label}
          </span>
        </div>
      </div>

      {/* Progress message (running) */}
      <Show when={hasProgressMsg()}>
        <div class="mt-0.5 text-11-regular text-blue-500 animate-pulse truncate pl-0.5">
          {props.progressMessage}
        </div>
      </Show>

      {/* Result summary (completed) */}
      <Show when={hasResult()}>
        <div class="mt-0.5 pl-0.5">
          <div class="flex items-center gap-1">
            <span class="text-11-regular text-text-weak truncate flex-1">
              {props.result!.summary}
            </span>
            <Show when={(props.result?.filesChanged?.length ?? 0) > 0}>
              <button
                type="button"
                class="text-10-regular text-text-weaker hover:text-text-weak shrink-0"
                onClick={() => setShowFiles(!showFiles())}
              >
                {showFiles() ? "▲" : `${props.result!.filesChanged.length} files`}
              </button>
            </Show>
          </div>
          <Show when={showFiles() && (props.result?.filesChanged?.length ?? 0) > 0}>
            <div class="mt-0.5 space-y-0.5 pl-2 border-l border-border-weak-base">
              <For each={props.result!.filesChanged}>
                {(file) => (
                  <div class="text-10-regular text-text-weaker font-mono truncate">{file}</div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>

      {/* Error message (failed) */}
      <Show when={hasError()}>
        <div class="mt-0.5 text-11-regular text-red-500 line-clamp-2 pl-0.5">
          {props.errorMessage}
        </div>
      </Show>
    </div>
  )
}
