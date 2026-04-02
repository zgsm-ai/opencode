import { createMemo, For, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import type { Device } from "../types"
import { useLanguage } from "@/context/language"

export type DeviceListProps = {
  devices: () => Device[]
  onCreateWorkspace: (device: Device) => void
  searchQuery: () => string
  onSearchChange: (query: string) => void
  isCollapsed: () => boolean
  onToggleCollapse: () => void
}

export function DeviceList(props: DeviceListProps) {
  const language = useLanguage()
  const t = language.t
  const filtered = createMemo(() => {
    const query = props.searchQuery().toLowerCase()
    if (!query) return props.devices()
    return props
      .devices()
      .filter(
        (device) =>
          device.displayName.toLowerCase().includes(query) ||
          device.deviceId.toLowerCase().includes(query) ||
          device.platform.toLowerCase().includes(query),
      )
  })

  const detail = (device: Device) => {
    const parts = [device.platform, device.version].filter(Boolean)
    return parts.join(" · ") || device.deviceId
  }

  return (
    <div class="flex flex-col py-1">
      {/* Header — matches code.html Devices section */}
      <button class="flex items-center gap-1.5 px-4 py-1.5 w-full cursor-pointer" onClick={props.onToggleCollapse}>
        <span class="text-xs font-medium text-sidebar-foreground/70 uppercase tracking-wider">{t("workspace.device.list")}</span>
        <span class="text-[11px] text-sidebar-foreground/50 ml-auto">{filtered().length}</span>
      </button>

      <Show when={!props.isCollapsed()}>
        {/* Device rows */}
        <ul class="space-y-0.5 px-2">
          <For each={filtered()}>
            {(device) => (
              <li
                class="group/device flex items-center gap-2 px-2 py-1.5 text-xs rounded-md transition-all duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                classList={{
                  "opacity-60 text-sidebar-foreground/40": device.status === "offline",
                  "text-sidebar-foreground/70": device.status !== "offline",
                }}
              >
                <Tooltip
                  placement="bottom-end"
                  value={detail(device)}
                  class="flex-1 min-w-0"
                  contentStyle={{
                    background: "hsl(var(--sidebar-accent))",
                    color: "hsl(var(--sidebar-accent-foreground))",
                    border: "1px solid hsl(var(--sidebar-border))",
                    "box-shadow": "var(--shadow-xs)",
                  }}
                >
                  <div class="flex-1 min-w-0 flex items-center gap-2 text-left">
                    <Icon name="server" class="text-sm" />
                    <span class="text-xs truncate flex-1">{device.displayName}</span>
                  </div>
                </Tooltip>
                <Tooltip
                  placement="bottom-end"
                  value={device.status === "offline" ? t("workspace.device.offlineHint") : t("workspace.device.createWorkspace")}
                  contentStyle={{
                    background: "hsl(var(--sidebar-accent))",
                    color: "hsl(var(--sidebar-accent-foreground))",
                    border: "1px solid hsl(var(--sidebar-border))",
                    "box-shadow": "var(--shadow-xs)",
                  }}
                >
                  <button
                    class="opacity-0 group-hover/device:opacity-100 flex items-center justify-center w-5 h-5 rounded-md hover:bg-sidebar-accent transition-all duration-150"
                    classList={{
                      "cursor-pointer": device.status !== "offline",
                      "cursor-not-allowed": device.status === "offline",
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (device.status !== "offline") props.onCreateWorkspace(device)
                    }}
                  >
                    <Icon name="plus-small" />
                  </button>
                </Tooltip>
              </li>
            )}
          </For>

          <Show when={filtered().length === 0}>
            <li class="flex flex-col items-center justify-center py-8 text-sidebar-foreground/50">
              <Icon name="magnifying-glass" class="text-2xl mb-2 opacity-30" />
              <span class="text-xs">{t("workspace.device.notFound")}</span>
            </li>
          </Show>
        </ul>
      </Show>
    </div>
  )
}
