import { createMemo, createSignal, For, Show, createEffect, onCleanup } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import type { CommandStatusResponse, Device, UpdateCheckResponse } from "../types"
import { useLanguage } from "@/context/language"
import { deviceManagementService } from "@/pages/console/lib/device-management-service"
import { DeviceUpgradeDialog } from "@/pages/console/components/device-upgrade-dialog"

const UPGRADE_POLL_MS = 2000
const UPGRADE_TIMEOUT_MS = 3 * 60 * 1000
const UPGRADE_SUPPRESS_MS = 5 * 60 * 1000
const REFRESH_MIN_SPIN_MS = 600
const REFRESH_DEBOUNCE_MS = 1000

function loadUpgradeCmdId(deviceId: string): string | null {
  try {
    return localStorage.getItem(`upgrade_${deviceId}`)
  } catch {
    return null
  }
}

function saveUpgradeCmdId(deviceId: string, commandId: string) {
  try {
    localStorage.setItem(`upgrade_${deviceId}`, commandId)
  } catch {}
}

function clearUpgradeCmdId(deviceId: string) {
  try {
    localStorage.removeItem(`upgrade_${deviceId}`)
  } catch {}
}

function markUpgradeCompleted(deviceId: string, oldVersion: string) {
  try {
    localStorage.setItem(`upgrade_done_${deviceId}`, JSON.stringify({ ts: Date.now(), v: oldVersion }))
  } catch {}
}

function isRecentlyUpgraded(deviceId: string): boolean {
  try {
    const raw = localStorage.getItem(`upgrade_done_${deviceId}`)
    if (!raw) return false
    const data = JSON.parse(raw)
    if (Date.now() - data.ts > UPGRADE_SUPPRESS_MS) {
      localStorage.removeItem(`upgrade_done_${deviceId}`)
      return false
    }
    return true
  } catch {
    return false
  }
}

function clearUpgradeSuppressedIfVersionChanged(deviceId: string, currentVersion: string) {
  try {
    const raw = localStorage.getItem(`upgrade_done_${deviceId}`)
    if (!raw) return
    const data = JSON.parse(raw)
    if (data.v && data.v !== currentVersion) {
      localStorage.removeItem(`upgrade_done_${deviceId}`)
    }
  } catch {}
}

const activePollers = new Set<string>()

function startDevicePolling(
  deviceId: string,
  commandId: string,
  oldVersion: string,
  onProgress: (deviceId: string, progress: number) => void,
  onDone: (deviceId: string, outcome: "completed" | "failed", errMsg?: string) => void,
) {
  if (activePollers.has(deviceId)) return
  activePollers.add(deviceId)

  const startTime = Date.now()
  let stopped = false
  let timerId: ReturnType<typeof setTimeout> | undefined

  async function poll() {
    if (stopped) return
    if (Date.now() - startTime > UPGRADE_TIMEOUT_MS) {
      stopped = true
      activePollers.delete(deviceId)
      onDone(deviceId, "failed")
      clearUpgradeCmdId(deviceId)
      return
    }

    try {
      const status = await deviceManagementService.getCommandStatus(deviceId, commandId)
      if (stopped) return
      if (status === null) {
        stopped = true
        activePollers.delete(deviceId)
        onDone(deviceId, "failed")
        clearUpgradeCmdId(deviceId)
        return
      }
      if (status.progress && status.progress > 0) {
        onProgress(deviceId, status.progress)
      }
      if (status.status === "completed") {
        stopped = true
        activePollers.delete(deviceId)
        onProgress(deviceId, 100)
        onDone(deviceId, "completed")
        clearUpgradeCmdId(deviceId)
        markUpgradeCompleted(deviceId, oldVersion)
        return
      }
      if (status.status === "failed") {
        stopped = true
        activePollers.delete(deviceId)
        onDone(deviceId, "failed", status.error)
        clearUpgradeCmdId(deviceId)
        return
      }
    } catch {
      if (!stopped && Date.now() - startTime > 30 * 1000) {
        onProgress(deviceId, -1)
      }
    }

    if (!stopped) {
      timerId = setTimeout(poll, UPGRADE_POLL_MS)
    }
  }

  timerId = setTimeout(poll, UPGRADE_POLL_MS)

  return () => {
    stopped = true
    activePollers.delete(deviceId)
    if (timerId !== undefined) clearTimeout(timerId)
  }
}

export type DeviceListProps = {
  devices: () => Device[]
  onCreateWorkspace: (device: Device) => void
  searchQuery: () => string
  onSearchChange: (query: string) => void
  isCollapsed: () => boolean
  onToggleCollapse: () => void
  onUpgradeCompleted?: () => void
  onRefresh?: () => Promise<void>
}

export function DeviceList(props: DeviceListProps) {
  const language = useLanguage()
  const t = language.t
  const dialog = useDialog()

  const [upgradeMap, setUpgradeMap] = createSignal<Record<string, { commandId: string; progress: number; done: "completed" | "failed" | null }>>({})
  const [spinning, setSpinning] = createSignal(false)

  let lastRefreshTs = 0
  const handleRefresh = () => {
    if (spinning()) return
    const now = Date.now()
    if (now - lastRefreshTs < REFRESH_DEBOUNCE_MS) return
    lastRefreshTs = now
    setSpinning(true)
    const minSpin = new Promise((r) => setTimeout(r, REFRESH_MIN_SPIN_MS))
    Promise.all([props.onRefresh?.(), minSpin]).finally(() => setSpinning(false))
  }

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

  const handleUpgrade = async (deviceId: string): Promise<string | undefined> => {
    const commandId = `upgrade-${Date.now()}`
    try {
      await deviceManagementService.sendCommand(deviceId, {
        command_id: commandId,
        type: "upgrade",
        timestamp: new Date().toISOString(),
      })
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("store.devices.upgrade.toast.sent.title"),
        description: language.t("store.devices.upgrade.toast.sent.description"),
      })
      return commandId
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      const unsupported = /404|not found/i.test(msg)
      showToast({
        variant: "error",
        icon: "circle-x",
        title: language.t(unsupported ? "store.devices.upgrade.toast.unsupported.title" : "store.devices.upgrade.toast.failed.title"),
        description: language.t(unsupported ? "store.devices.upgrade.toast.unsupported.description" : "store.devices.upgrade.toast.failed.description"),
      })
      return undefined
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

  const upgrade = async (device: Device) => {
    if (!device.canUpdate || !device.platform || !device.version || device.status !== "online") return
    let info: UpdateCheckResponse
    try {
      info = await deviceManagementService.checkUpdate(device.platform, device.version)
    } catch {
      info = { can_update: true, version: device.latestVersion ?? "", changelog: "", download_url: "", sha256: "", force: false, min_client_version: "", release_date: "", size: 0 }
    }
    dialog.show(() => (
      <DeviceUpgradeDialog
        deviceName={device.displayName}
        currentVersion={device.version}
        update={info}
        onConfirm={async () => {
          const cmdId = await handleUpgrade(device.deviceId)
          if (cmdId) {
             startUpgradePolling(device.deviceId, cmdId, device.version)
          }
        }}
      />
    ))
  }

  function startUpgradePolling(deviceId: string, commandId: string, oldVersion: string) {
    setUpgradeMap((prev) => ({ ...prev, [deviceId]: { commandId, progress: 5, done: null } }))
    saveUpgradeCmdId(deviceId, commandId)
    startDevicePolling(
      deviceId,
      commandId,
      oldVersion,
      (dId, progress) => {
        setUpgradeMap((prev) => {
          const cur = prev[dId]
          if (!cur || cur.done !== null) return prev
          return { ...prev, [dId]: { ...cur, progress: progress === -1 ? Math.min(cur.progress + 0.5, 95) : progress } }
        })
      },
      (dId, outcome, errMsg) => {
        if (outcome === "completed") {
          showToast({ variant: "success", icon: "circle-check", title: t("store.devices.upgrade.toast.sent.title") })
        } else {
          showToast({
            variant: "error",
            icon: "circle-x",
            title: t("store.devices.upgrade.toast.failed.title"),
            description: errMsg || t("store.devices.upgrade.toast.failed.description"),
          })
        }
        setUpgradeMap((prev) => {
          const cur = prev[dId]
          if (!cur) return prev
          return { ...prev, [dId]: { ...cur, progress: outcome === "completed" ? 100 : cur.progress, done: outcome } }
        })
        const delay = outcome === "completed" ? 1500 : 2000
        setTimeout(() => {
          setUpgradeMap((prev) => {
            const next = { ...prev }
            delete next[dId]
            return next
          })
          if (outcome === "completed") {
            let count = 0
            const tick = async () => {
              if (++count > 3) return
              await new Promise((r) => setTimeout(r, 5000))
              props.onUpgradeCompleted?.()
              for (const d of props.devices()) {
                clearUpgradeSuppressedIfVersionChanged(d.deviceId, d.version)
              }
              tick()
            }
            tick()
          }
        }, delay)
      },
    )
  }

  createEffect(() => {
    const deviceIds = new Set(props.devices().map((d) => d.deviceId))
    for (const deviceId of deviceIds) {
      if (upgradeMap()[deviceId] || activePollers.has(deviceId)) continue
      const saved = loadUpgradeCmdId(deviceId)
      if (saved) {
        startUpgradePolling(deviceId, saved, "")
      }
    }
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
          <div class="flex items-center gap-1">
            <div class="flex h-8 flex-1 items-center rounded-[var(--native-radius-sm)] border border-sidebar-border bg-[color:color-mix(in_oklab,var(--native-panel)_82%,var(--native-bg-subtle))] shadow-[var(--native-shadow-sm)] transition-all duration-200 focus-within:border-sidebar-ring focus-within:ring-1 focus-within:ring-sidebar-ring">
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
            <Show when={props.onRefresh}>
              <Tooltip value={t("workspace.device.refresh")} placement="bottom">
                <button
                  type="button"
                  class="flex size-8 shrink-0 items-center justify-center rounded-[var(--native-radius-sm)] border border-sidebar-border text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                  classList={{
                    "cursor-pointer": !spinning(),
                    "pointer-events-none": spinning(),
                  }}
                  onClick={handleRefresh}
                  aria-label={t("workspace.device.refresh")}
                >
                  <Icon name="arrows-rotate" size="small" classList={{ "animate-spin": spinning() }} />
                </button>
              </Tooltip>
            </Show>
          </div>
        </div>

        <ul class="space-y-1 px-2">
          <For each={filtered()}>
            {(device) => {
              const hasUpgrade = () => device.canUpdate && device.status === "online" && !upgradeMap()[device.deviceId] && !isRecentlyUpgraded(device.deviceId)
              const upgradeState = () => upgradeMap()[device.deviceId]
              const isUpgrading = () => !!upgradeState()

              return (
                <li
                  class="group/device relative flex items-center gap-2 rounded-[var(--native-radius-md)] border border-transparent px-2.5 py-2 text-xs transition-all duration-150 hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground overflow-hidden"
                  classList={{
                    "opacity-60 text-sidebar-foreground/40": device.status === "offline" && !isUpgrading(),
                    "text-sidebar-foreground/70": device.status !== "offline" || isUpgrading(),
                    "border-[color:color-mix(in_srgb,#ff9800_25%,transparent)]": isUpgrading(),
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
                             "bg-[#ff9800] animate-pulse": isUpgrading(),
                             "bg-[var(--native-success)]": !isUpgrading() && device.status === "online",
                             "bg-[var(--native-error)]": !isUpgrading() && device.status === "offline",
                             "bg-sidebar-border": !isUpgrading() && device.status !== "online" && device.status !== "offline",
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
                       value={t("workspace.device.upgradeHint", { version: device.latestVersion ?? "" })}
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

                  <Show when={isUpgrading()}>
                    <div
                      class="absolute bottom-0 left-0 h-[3px] rounded-b-[var(--native-radius-md)] transition-all duration-500 ease-out"
                      style={{
                        width: `${upgradeState()?.progress ?? 0}%`,
                        background: upgradeState()?.done === "failed"
                          ? "#ef4444"
                          : upgradeState()?.done === "completed"
                            ? "linear-gradient(90deg, #22c55e, #16a34a)"
                            : "linear-gradient(90deg, #ff9800, #f57c00)",
                      }}
                    />
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
