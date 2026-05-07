import { For, Show, createSignal, type Component } from "solid-js"
import type { RepoInfo, TaskResult, TaskStatus } from "@/client/cloud-team-types"

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
  assigneeRepos?: RepoInfo[]
  progress?: number
  progressMessage?: string
  result?: TaskResult | null
  errorMessage?: string
  retryCount?: number
}> = (props) => {
  const [showFiles, setShowFiles] = createSignal(true)
  const config = () => statusConfig[props.status]

  const hasResult = () => props.status === "completed" && props.result
  const hasError = () => (props.status === "failed" || props.status === "interrupted") && props.errorMessage
  const hasProgressMsg = () => (props.status === "running" || props.status === "claimed") && !!props.progressMessage
  const isActive = () => props.status === "assigned" || props.status === "claimed" || props.status === "running"
  const workingDir = () => props.assigneeRepos?.[0]?.localPath

  return (
    <div class="px-3 py-2.5 rounded-md hover:bg-background-stronger transition-colors">
      {/* Top row: status badge + description */}
      <div class="flex items-start gap-2">
        <span class={`text-10-regular px-1.5 py-0.5 rounded mt-0.5 shrink-0 ${config().bgColor} ${config().color}`}>
          {config().label}
        </span>
        <div class="flex-1 min-w-0">
          <div class="text-13-regular text-text-base">{props.description}</div>
        </div>
      </div>

      {/* Teammate info block */}
      <Show when={isActive() && props.assigneeName}>
        <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-11-regular text-text-weak">
          <div class="flex items-center gap-1">
            <span class="size-1.5 rounded-full bg-blue-500" />
            <span class="truncate">{props.assigneeName}</span>
          </div>
          <Show when={workingDir()}>
            <div class="flex items-center gap-1 font-mono text-text-weaker truncate">
              <span>📁</span>
              <span class="truncate">{workingDir()}</span>
            </div>
          </Show>
          <Show when={(props.retryCount ?? 0) > 0}>
            <span class="text-10-regular text-orange-500">×{props.retryCount}</span>
          </Show>
        </div>
      </Show>

      {/* Progress bar + percent */}
      <Show when={props.status === "running" && props.progress !== undefined}>
        <div class="mt-1.5 flex items-center gap-2">
          <div class="flex-1 h-1.5 rounded-full bg-background-stronger overflow-hidden">
            <div
              class="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${props.progress ?? 0}%` }}
            />
          </div>
          <span class="text-11-regular text-text-weak tabular-nums w-10 text-right">{props.progress ?? 0}%</span>
        </div>
      </Show>

      {/* Progress message */}
      <Show when={hasProgressMsg()}>
        <div class="mt-1 text-11-regular text-blue-500 animate-pulse truncate">
          {props.progressMessage}
        </div>
      </Show>

      {/* Result summary (completed) */}
      <Show when={hasResult()}>
        <div class="mt-1.5">
          <div class="flex items-center gap-1">
            <span class="text-11-regular text-text-weak break-words flex-1 min-w-0">
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
        <div class="mt-1 text-11-regular text-red-500 line-clamp-2">
          {props.errorMessage}
        </div>
      </Show>
    </div>
  )
}
