import { createEffect, createMemo, createSignal, For, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import type { Device, UpdateCheckResponse } from "../types"
import { useLanguage } from "@/context/language"
import { deviceManagementService } from "@/pages/console/lib/device-management-service"
import { DeviceUpgradeDialog } from "@/pages/console/components/device-upgrade-dialog"

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
  const dialog = useDialog()
  const [upgrades, setUpgrades] = createSignal<Record<string, UpdateCheckResponse>>({})

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

  const checkUpdates = (list: Device[]) => {
    const online = list.filter((d) => d.status === "online" && d.platform && d.version)
    if (online.length === 0) return

    Promise.allSettled(
      online.map(async (d) => {
        const info = await deviceManagementService.checkUpdate(d.platform, d.version)
        return [d.deviceId, info] as const
      }),
    ).then((results) => {
      const map: Record<string, UpdateCheckResponse> = {}
      for (const r of results) {
        if (r.status === "fulfilled" && r.value[1].can_update) {
          map[r.value[0]] = r.value[1]
        }
      }
      setUpgrades((prev) => ({ ...prev, ...map }))
    })
  }

  const handleUpgrade = async (deviceId: string) => {
    try {
      await deviceManagementService.sendCommand(deviceId, {
        command_id: `upgrade-${Date.now()}`,
        type: "upgrade",
        timestamp: new Date().toISOString(),
      })
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("store.devices.upgrade.toast.sent.title"),
        description: language.t("store.devices.upgrade.toast.sent.description"),
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      const unsupported = /404|not found/i.test(msg)
      showToast({
        variant: "error",
        icon: "circle-x",
        title: language.t(unsupported ? "store.devices.upgrade.toast.unsupported.title" : "store.devices.upgrade.toast.failed.title"),
        description: language.t(unsupported ? "store.devices.upgrade.toast.unsupported.description" : "store.devices.upgrade.toast.failed.description"),
      })
    }
  }

  const detail = (device: Device) => {
    const parts = [device.platform, device.version].filter(Boolean)
    return parts.join(" · ") || device.deviceId
  }

  const open = (device: Device) => {
    if (device.status === "offline") return
    props.onCreateWorkspace(device)
  }

  const upgrade = (device: Device) => {
    const info = upgrades()[device.deviceId]
    if (!info || device.status !== "online") return
    dialog.show(() => (
      <DeviceUpgradeDialog
        deviceName={device.displayName}
        currentVersion={device.version}
        update={info}
        onConfirm={() => handleUpgrade(device.deviceId)}
      />
    ))
  }

  let checked = false
  const checkUpdatesOnce = (list: Device[]) => {
    if (checked) return
    checked = true
    checkUpdates(list)
  }

  createEffect(() => {
    const d = props.devices()
    if (d.length > 0) checkUpdatesOnce(d)
  })

  return (
    <div class="flex flex-col py-1">
      <button
        type="button"
        class="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-sidebar-accent/50 focus:outline-none focus-visible:bg-sidebar-accent/60"
        onClick={props.onToggleCollapse}
        aria-expanded={!props.isCollapsed()}
      >
        <span class="flex h-7 w-7 items-center justify-center rounded-[var(--native-radius-sm)] bg-[color:color-mix(in_oklab,var(--native-panel)_80%,var(--native-bg-subtle))] text-sidebar-foreground/70 shadow-[var(--native-shadow-sm)]">
          <Icon name={props.isCollapsed() ? "chevron-right" : "chevron-down"} class="size-4" />
        </span>
        <span class="text-[11px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/70">{t("workspace.device.list")}</span>
        <span class="ml-auto rounded-[var(--native-radius-full)] bg-[color:color-mix(in_oklab,var(--native-panel)_82%,var(--native-bg-subtle))] px-2 py-0.5 text-[11px] font-medium text-sidebar-foreground/55 shadow-[var(--native-shadow-sm)]">{filtered().length}</span>
      </button>

      <Show when={!props.isCollapsed()}>
        <div class="px-3 pb-2">
          <div class="flex h-8 w-full items-center rounded-[var(--native-radius-sm)] border border-sidebar-border bg-[color:color-mix(in_oklab,var(--native-panel)_82%,var(--native-bg-subtle))] shadow-[var(--native-shadow-sm)] transition-all duration-200 focus-within:border-sidebar-ring focus-within:ring-1 focus-within:ring-sidebar-ring">
            <Icon name="magnifying-glass" class="ml-3 size-4 shrink-0 text-sidebar-foreground/45" />
            <input
              type="text"
              value={props.searchQuery()}
              placeholder={t("workspace.device.search")}
              onInput={(e: Event) => props.onSearchChange((e.target as HTMLInputElement).value)}
              class="h-full min-w-0 flex-1 bg-transparent px-2 text-[0.8125rem] text-sidebar-foreground placeholder:text-sidebar-foreground/45 focus:outline-none"
            />
            <Show when={props.searchQuery()}>
              <button
                type="button"
                class="mr-1 flex h-6 w-6 items-center justify-center rounded-full text-sidebar-foreground/45 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus:outline-none focus-visible:bg-sidebar-accent"
                onClick={() => props.onSearchChange("")}
              >
                <Icon name="close" class="size-3.5" />
              </button>
            </Show>
          </div>
        </div>

        <ul class="space-y-1 px-2">
          <For each={filtered()}>
            {(device) => {
              const hasUpgrade = () => upgrades()[device.deviceId]?.can_update && device.status === "online"

              return (
                <li
                  class="group/device flex items-center gap-2 rounded-[var(--native-radius-md)] border border-transparent px-2.5 py-2 text-xs transition-all duration-150 hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
                    <button
                      type="button"
                      class="flex min-w-0 flex-1 items-center gap-2.5 text-left focus:outline-none"
                      classList={{
                        "cursor-pointer": device.status !== "offline",
                        "cursor-not-allowed": device.status === "offline",
                      }}
                      onClick={() => open(device)}
                    >
                       <span class="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--native-radius-sm)] bg-[color:color-mix(in_oklab,var(--native-panel)_76%,var(--native-bg-subtle))] text-sidebar-foreground/70 shadow-[var(--native-shadow-sm)]">
                         <span
                           class="absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
                           classList={{
                             "bg-[var(--native-success)]": device.status === "online",
                             "bg-[var(--native-error)]": device.status === "offline",
                             "bg-sidebar-border": device.status !== "online" && device.status !== "offline",
                           }}
                         />
                         <Icon name="server" class="text-sm" />
                       </span>
                       <span class="min-w-0 flex-1">
                         <span class="block truncate text-[0.8125rem] font-medium text-sidebar-foreground">{device.displayName}</span>
                         <span class="block truncate text-[11px] text-sidebar-foreground/45">
                           {detail(device)}
                         </span>
                       </span>
                    </button>
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
                      type="button"
                        class="flex h-7 items-center justify-center rounded-[var(--native-radius-sm)] text-sidebar-foreground/55 max-w-0 opacity-0 transition-all duration-150 group-hover/device:max-w-7 group-hover/device:opacity-100 group-focus-within/device:max-w-7 group-focus-within/device:opacity-100 hover:bg-sidebar-accent focus:outline-none focus-visible:bg-sidebar-accent overflow-hidden px-0"
                      classList={{
                        "cursor-pointer": device.status !== "offline",
                        "cursor-not-allowed": device.status === "offline",
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        open(device)
                      }}
                    >
                      <Icon name="plus-small" />
                    </button>
                  </Tooltip>
                  <Show when={hasUpgrade()}>
                    <Tooltip
                      placement="bottom-end"
                      value={t("workspace.device.upgradeHint", { version: upgrades()[device.deviceId].version })}
                      contentStyle={{
                        background: "hsl(var(--sidebar-accent))",
                        color: "hsl(var(--sidebar-accent-foreground))",
                        border: "1px solid hsl(var(--sidebar-border))",
                        "box-shadow": "var(--shadow-xs)",
                      }}
                    >
                       <button
                         type="button"
                         class="flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-colors hover:opacity-80"
                        style={{
                          background: "#ff9800",
                          color: "white",
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          upgrade(device)
                        }}
                      >
                        <Icon name="cloud-upload" size="small" style={{ color: "white" }} />
                      </button>
                    </Tooltip>
                  </Show>
                 </li>
              )
            }}
          </For>

          <Show when={filtered().length === 0}>
            <li class="flex flex-col items-center justify-center rounded-[var(--native-radius-md)] border border-dashed border-sidebar-border py-8 text-sidebar-foreground/50">
              <Icon name="magnifying-glass" class="text-2xl mb-2 opacity-30" />
              <span class="text-xs">{t("workspace.device.notFound")}</span>
            </li>
          </Show>
        </ul>
      </Show>
    </div>
  )
}
