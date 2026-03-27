import { createMemo, For, Show, createSelector } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import type { Device } from "../types"
import { useLanguage } from "@/context/language"

export type DeviceListProps = {
  devices: () => Device[]
  selectedDeviceId: () => string | undefined
  onSelectDevice: (deviceId: string) => void
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

  const isSelected = createSelector(() => props.selectedDeviceId())

  const detail = (device: Device) => {
    const parts = [device.platform, device.version].filter(Boolean)
    return parts.join(" · ") || device.deviceId
  }

  return (
    <div class="flex flex-col py-1">
      {/* Header — matches workspace section headers */}
      <button class="flex items-center gap-1.5 px-3 py-1.5 w-full cursor-pointer" onClick={props.onToggleCollapse}>
        <Icon
          name={props.isCollapsed() ? "chevron-right" : "chevron-down"}
          size="small"
          class="size-4 text-icon-weak shrink-0"
        />
        <span class="text-xs font-medium text-text-weak uppercase tracking-wider">{t("workspace.device.list")}</span>
        <div class="ml-auto flex items-center gap-1.5">
          <div
            classList={{
              "size-2 rounded-full": true,
              "bg-icon-success-base": props.devices().length > 0 && props.devices().every((d) => d.status === "online"),
              "bg-icon-critical-base": props.devices().some((d) => d.status === "offline"),
              "bg-border-weak-base":
                props.devices().length === 0 ||
                (!props.devices().some((d) => d.status === "offline") &&
                  !props.devices().every((d) => d.status === "online")),
            }}
          />
          <span class="text-[11px] text-text-weaker">{filtered().length}</span>
        </div>
      </button>

      <Show when={!props.isCollapsed()}>
        {/* Search */}
        <div class="px-3 py-1.5">
          <div class="flex items-center h-9 w-full rounded-lg bg-surface-inset-base border border-border-weak-base focus-within:border-border-strong-base transition-all duration-200">
            <Icon name="magnifying-glass" class="size-4 text-text-weak shrink-0 ml-3" />
            <input
              type="text"
              placeholder={t("workspace.device.search")}
              value={props.searchQuery()}
              onInput={(e: Event) => props.onSearchChange((e.target as HTMLInputElement).value)}
              class="flex-1 min-w-0 h-full px-2 text-sm bg-transparent placeholder:text-text-weak focus:outline-none"
            />
            <Show when={props.searchQuery()}>
              <button
                type="button"
                onClick={() => props.onSearchChange("")}
                class="flex items-center justify-center size-6 rounded-full text-icon-weak hover:text-icon-strong hover:bg-surface-inset-base transition-colors cursor-pointer mr-1"
              >
                <Icon name="close" class="size-3.5" />
              </button>
            </Show>
          </div>
        </div>

        {/* Device rows */}
        <div class="flex flex-col gap-0.5 px-2">
          <For each={filtered()}>
            {(device) => (
              <div
                class="group/device flex items-center rounded-lg transition-all duration-150 hover:bg-surface-base-hover"
                classList={{
                  "bg-surface-base-hover": isSelected(device.id),
                  "opacity-60": device.status === "offline",
                }}
              >
                <Tooltip
                  placement="bottom-end"
                  value={detail(device)}
                  class="flex-1 min-w-0"
                  contentStyle={{
                    background: "var(--surface-base-hover)",
                    color: "var(--text-base)",
                    border: "1px solid var(--border-weak-base)",
                    "box-shadow": "var(--shadow-xs)",
                  }}
                >
                  <button
                    class="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-150 text-left"
                    classList={{
                      "text-text-strong font-medium": isSelected(device.id),
                      "text-text-weak": !isSelected(device.id) && device.status !== "offline",
                      "text-text-weaker cursor-not-allowed": device.status === "offline",
                      "cursor-pointer": device.status !== "offline",
                    }}
                    onClick={() => {
                      if (device.status !== "offline") props.onSelectDevice(device.id)
                    }}
                  >
                    <div
                      classList={{
                        "size-2 rounded-full shrink-0": true,
                        "bg-icon-success-base": device.status === "online",
                        "bg-icon-critical-base": device.status === "offline",
                        "bg-border-weak-base": device.status !== "online" && device.status !== "offline",
                      }}
                    />
                    <span class="text-sm truncate flex-1">{device.displayName}</span>
                  </button>
                </Tooltip>
                <div class="shrink-0 flex items-center gap-0.5 ml-auto opacity-0 group-hover/device:opacity-100 transition-opacity duration-150 pr-1">
                  <Tooltip
                    placement="top"
                    value={
                      device.status === "offline"
                        ? t("workspace.device.offlineHint")
                        : t("workspace.device.createWorkspace")
                    }
                  >
                    <IconButton
                      icon="plus-small"
                      variant="ghost"
                      class="size-7 rounded-lg cursor-pointer"
                      aria-label={t("workspace.device.createWorkspace")}
                      onClick={(e: MouseEvent) => {
                        e.stopPropagation()
                        if (device.status !== "offline") props.onCreateWorkspace(device)
                      }}
                    />
                  </Tooltip>
                </div>
              </div>
            )}
          </For>

          <Show when={filtered().length === 0}>
            <div class="flex flex-col items-center justify-center py-8 text-text-weak">
              <Icon name="magnifying-glass" class="size-8 mb-2 opacity-30" />
              <span class="text-xs">{t("workspace.device.notFound")}</span>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}
