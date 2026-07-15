import { createSignal, createEffect } from "solid-js"
import { showToast } from "@opencode-ai/ui/toast"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { deviceManagementService } from "@/pages/console/lib/device-management-service"
import { DeviceUpgradeDialog } from "@/pages/console/components/device-upgrade-dialog"
import { useLanguage } from "@/context/language"
import type { Device, UpdateCheckResponse } from "../types"

const UPGRADE_POLL_MS = 2000
const UPGRADE_TIMEOUT_MS = 3 * 60 * 1000
const UPGRADE_SUPPRESS_MS = 5 * 60 * 1000

export type UpgradeState = {
  commandId: string
  progress: number
  done: "completed" | "failed" | null
}

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

export function useDeviceUpgrade(opts: {
  devices: () => Device[]
  onUpgradeCompleted?: () => void
}) {
  const language = useLanguage()
  const t = language.t
  const dialog = useDialog()

  const [upgradeMap, setUpgradeMap] = createSignal<Record<string, UpgradeState>>({})

  const sendUpgrade = async (deviceId: string): Promise<string | undefined> => {
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

  function startUpgradePolling(deviceId: string, commandId: string, oldVersion: string) {
    setUpgradeMap((prev) => ({ ...prev, [deviceId]: { commandId, progress: 5, done: null } }))
    saveUpgradeCmdId(deviceId, commandId)
    startDevicePolling(
      deviceId,
      commandId,
      oldVersion,
      (_id, progress) => {
        setUpgradeMap((prev) => {
          const cur = prev[deviceId]
          if (!cur || cur.done !== null) return prev
          return { ...prev, [deviceId]: { ...cur, progress: progress === -1 ? Math.min(cur.progress + 0.5, 95) : progress } }
        })
      },
      (_id, outcome, errMsg) => {
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
          const cur = prev[deviceId]
          if (!cur) return prev
          return { ...prev, [deviceId]: { ...cur, progress: outcome === "completed" ? 100 : cur.progress, done: outcome } }
        })
        const delay = outcome === "completed" ? 1500 : 2000
        setTimeout(() => {
          setUpgradeMap((prev) => {
            const next = { ...prev }
            delete next[deviceId]
            return next
          })
          if (outcome === "completed") {
            let count = 0
            const tick = async () => {
              if (++count > 3) return
              await new Promise((r) => setTimeout(r, 5000))
              opts.onUpgradeCompleted?.()
              for (const d of opts.devices()) {
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

  const upgradeDevice = async (device: Device) => {
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
          const cmdId = await sendUpgrade(device.deviceId)
          if (cmdId) {
            startUpgradePolling(device.deviceId, cmdId, device.version)
          }
        }}
      />
    ))
  }

  createEffect(() => {
    const deviceIds = new Set(opts.devices().map((d) => d.deviceId))
    for (const deviceId of deviceIds) {
      if (upgradeMap()[deviceId] || activePollers.has(deviceId)) continue
      const saved = loadUpgradeCmdId(deviceId)
      if (saved) {
        startUpgradePolling(deviceId, saved, "")
      }
    }
  })

  return {
    upgradeMap,
    upgradeDevice,
    isRecentlyUpgraded,
  }
}
