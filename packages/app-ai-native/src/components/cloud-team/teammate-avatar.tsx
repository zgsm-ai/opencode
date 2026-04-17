import { Show, type Component } from "solid-js"
import type { TeammateStatus } from "@/client/cloud-team-types"

const statusColors: Record<TeammateStatus, string> = {
  online: "bg-green-500",
  busy: "bg-amber-500",
  offline: "bg-gray-400",
}

const statusLabels: Record<TeammateStatus, string> = {
  online: "online",
  busy: "busy",
  offline: "offline",
}

export const TeammateAvatar: Component<{
  id: string
  machineName: string
  status: TeammateStatus
  currentTaskName?: string
  isLeader?: boolean
}> = (props) => {
  return (
    <div class="flex flex-col items-center gap-1 min-w-0 max-w-[80px]">
      <div class="relative">
        <div class="w-10 h-10 rounded-full bg-background-stronger border border-border-weak-base flex items-center justify-center text-12-medium text-text-weak">
          {props.machineName.slice(0, 2).toUpperCase()}
        </div>
        <div
          class={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background-base ${statusColors[props.status]}`}
          title={statusLabels[props.status]}
        />
        <Show when={props.isLeader}>
          <div
            class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 border-2 border-background-base flex items-center justify-center"
            title="Leader"
          >
            <svg class="size-2.5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" />
            </svg>
          </div>
        </Show>
      </div>
      <span class="text-11-regular text-text-weak truncate w-full text-center" title={props.machineName}>
        {props.machineName}
      </span>
      <Show when={props.currentTaskName}>
        <span class="text-10-regular text-text-weaker truncate w-full text-center" title={props.currentTaskName}>
          {props.currentTaskName}
        </span>
      </Show>
    </div>
  )
}
