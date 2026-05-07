import { showToast } from "@opencode-ai/ui/toast"
import { Icon } from "@opencode-ai/ui/icon"
import { createMemo, createResource, createSignal, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import type { Device, DeviceCommandAck, DeviceCommandRequest, UpdateCheckResponse, UpdateDeviceRequest } from "@/pages/workspace/types"
import { DeviceCard } from "./device-card"
import { deviceManagementService } from "../lib/device-management-service"

export function DevicesSection() {
  const language = useLanguage()
  const [deviceSearch, setDeviceSearch] = createSignal("")
  const [upgrades, setUpgrades] = createSignal<Record<string, UpdateCheckResponse>>({})

  const [devices, acts] = createResource(async () => {
    const list = await deviceManagementService.list()
    checkUpdates(list)
    return list
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

  const filteredDevices = createMemo(() => {
    const search = deviceSearch().toLowerCase().trim()
    const list = devices() ?? []
    if (!search) return list
    return list.filter((d) => {
      const displayName = d.displayName.toLowerCase()
      const deviceId = d.deviceId.toLowerCase()
      const platform = d.platform.toLowerCase()
      const description = d.description?.toLowerCase() ?? ""
      const label = d.label?.toLowerCase() ?? ""

      return (
        displayName.includes(search) ||
        deviceId.includes(search) ||
        platform.includes(search) ||
        description.includes(search) ||
        label.includes(search)
      )
    })
  })

  const handleUpdateDevice = async (payload: { deviceId: string; data: UpdateDeviceRequest }) => {
    const current = devices() ?? []
    const target = current.find((item) => item.deviceId === payload.deviceId)
    if (!target) return

    const optimistic: Device = {
      ...target,
      displayName: payload.data.displayName ?? target.displayName,
      workspaceId: payload.data.workspaceId ?? target.workspaceId,
      description: payload.data.description ?? target.description,
      label: payload.data.label ?? target.label,
      updatedAt: new Date().toISOString(),
    }

    acts.mutate((items) => (items ?? []).map((item) => (item.deviceId === payload.deviceId ? optimistic : item)))

    try {
      const updated = await deviceManagementService.update(payload.deviceId, payload.data)
      acts.mutate((items) => (items ?? []).map((item) => (item.deviceId === payload.deviceId ? updated : item)))
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("store.devices.toast.updated"),
      })
    } catch (error) {
      acts.mutate(() => current)
      showToast({
        variant: "error",
        icon: "circle-x",
        title: language.t("store.devices.toast.updateFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    }
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

  const handleDelete = async (deviceId: string) => {
    const current = devices() ?? []
    acts.mutate((items) => (items ?? []).filter((d) => d.deviceId !== deviceId))
    try {
      await deviceManagementService.remove(deviceId)
      setUpgrades((prev) => {
        const next = { ...prev }
        delete next[deviceId]
        return next
      })
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("store.devices.deregister.toast.success"),
      })
    } catch (error) {
      acts.mutate(() => current)
      showToast({
        variant: "error",
        icon: "circle-x",
        title: language.t("store.devices.deregister.toast.failed"),
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <section class="rounded-[1.25rem] border border-[color:color-mix(in_oklab,var(--native-border)_42%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_84%,var(--native-bg-subtle))] p-3 shadow-[var(--native-shadow-sm)] sm:p-4">
      <div class="mb-3.5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h2 class="m-0 font-[var(--native-font-display)] text-[0.9875rem] font-semibold tracking-[-0.03em] text-[var(--native-foreground)]">
            {language.t("store.devices.title")}
          </h2>
          <p class="mt-0.5 max-w-[62ch] text-[0.8125rem] leading-[1.55] text-[var(--native-muted)]">
            {language.t("store.devices.description")}
          </p>
        </div>
        <div class="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:justify-end">
          <div class="flex h-8 w-full items-center rounded-[var(--native-radius-sm)] border border-[color:color-mix(in_oklab,var(--native-border)_48%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_88%,var(--native-bg-subtle))] shadow-[var(--native-shadow-sm)] transition-[border-color,box-shadow,background-color] focus-within:border-[var(--native-primary)] focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--native-primary)_10%,transparent)] sm:w-44">
            <Icon name="magnifying-glass" size="small" class="ml-2.5 shrink-0 text-[var(--native-dim)]" />
            <input
              class="h-full min-w-0 flex-1 bg-transparent px-2.5 pr-3 text-[0.8125rem] text-[var(--native-foreground)] outline-none placeholder:text-[var(--native-dim)]"
              type="search"
              value={deviceSearch()}
              onInput={(e) => setDeviceSearch(e.currentTarget.value)}
              placeholder={language.t("store.devices.searchPlaceholder")}
            />
          </div>
        </div>
      </div>

      <Show
        when={!devices.loading}
        fallback={
          <div class="rounded-[var(--native-radius-lg)] border border-dashed border-[color:color-mix(in_srgb,var(--native-border)_20%,transparent)] px-6 py-8 text-center text-[0.8125rem] text-[var(--native-muted)] sm:px-8 sm:py-10">
            {language.t("store.devices.loading")}
          </div>
        }
      >
        <Show
          when={filteredDevices().length > 0}
          fallback={
            <div class="rounded-[var(--native-radius-lg)] border border-dashed border-[color:color-mix(in_srgb,var(--native-border)_20%,transparent)] px-6 py-8 text-center text-[0.8125rem] text-[var(--native-muted)] sm:px-8 sm:py-10">
              {deviceSearch() ? language.t("store.devices.empty.search") : language.t("store.devices.empty.default")}
            </div>
          }
        >
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <For each={filteredDevices()}>
              {(device) => (
                <DeviceCard
                  device={device}
                  updateInfo={upgrades()[device.deviceId]}
                  onUpgrade={handleUpgrade}
                  onDelete={handleDelete}
                  onUpdate={handleUpdateDevice}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>
    </section>
  )
}
