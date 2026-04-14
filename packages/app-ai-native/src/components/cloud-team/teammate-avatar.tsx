import { Show, type Component } from "solid-js"
import { useCloudTeam } from "@/context/cloud-team"
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
  teammateId: string
  machineName: string
  status: TeammateStatus
  currentTaskName?: string
}> = (props) => {
  const cloudTeam = useCloudTeam()

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
