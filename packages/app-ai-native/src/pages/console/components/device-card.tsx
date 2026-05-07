import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { cn } from "@/lib/utils"
import { sx } from "@/pages/store/lib/styles"
import type { UpdateCheckResponse, UpdateDeviceRequest, Device } from "@/pages/workspace/types"
import { ConfirmDialog } from "@/pages/store/components/confirm-dialog"
import { DeviceEditDialog } from "./device-edit-dialog"
import { DeviceUpgradeDialog } from "./device-upgrade-dialog"

type DeviceCardProps = {
  device: Device
  updateInfo?: UpdateCheckResponse
  onUpgrade: (deviceId: string) => Promise<void>
  onDelete: (deviceId: string) => Promise<void>
  onUpdate: (payload: { deviceId: string; data: UpdateDeviceRequest }) => Promise<void> | void
}

const statusProps = (status?: string) => {
  if (status === "online") return { c: "#22c55e", label: "Online" }
  if (status === "offline") return { c: "#9ca3af", label: "Offline" }
  return { c: "var(--native-muted)", label: "Unknown" }
}

export function DeviceCard(props: DeviceCardProps) {
  const dialog = useDialog()
  const language = useLanguage()

  const handleEdit = () => {
    dialog.show(() => (
      <DeviceEditDialog
        device={props.device}
        onSaved={(data) => props.onUpdate({ deviceId: props.device.deviceId, data })}
      />
    ))
  }

  const handleUpgrade = () => {
    const info = props.updateInfo
    if (!info) return
    dialog.show(() => (
      <DeviceUpgradeDialog
        deviceName={props.device.displayName}
        currentVersion={props.device.version}
        update={info}
        onConfirm={() => props.onUpgrade(props.device.deviceId)}
      />
    ))
  }

  const handleDelete = () => {
    dialog.show(() => (
      <ConfirmDialog
        title={language.t("store.devices.deregister.dialog.title")}
        description={language.t("store.devices.deregister.dialog.description", { device: props.device.displayName })}
        confirm={language.t("store.devices.deregister.button")}
        onConfirm={() => props.onDelete(props.device.deviceId)}
      />
    ))
  }

  const sp = () => statusProps(props.device.status)
  const labels = () => props.device.label?.split(",").map((l) => l.trim()).filter(Boolean) ?? []
  const hasUpgrade = () => props.updateInfo?.can_update && props.device.status === "online"

  return (
    <div class={sx.dashCard}>
      <div class={sx.dashHead}>
        <span class={sx.dashName}>{props.device.displayName}</span>
        <span
          class={sx.pill}
          style={{
            background: `color-mix(in srgb, ${sp().c} 12%, transparent)`,
            color: sp().c,
          }}
        >
          {language.t(`store.devices.status.${props.device.status}`) || sp().label}
        </span>
      </div>

      <div class={sx.platform}>
        <Icon name="server" size="small" />
        {props.device.platform || language.t("store.devices.unknownPlatform")}
        {props.device.version ? ` · v${props.device.version}` : ""}
      </div>

      <div class={cn(sx.dashSlug, "mb-1")}>
        ID: {props.device.deviceId.slice(0, 8)}
      </div>

      <Show when={labels().length > 0}>
        <div class={sx.labels}>
          {labels().map((label) => (
            <span
              class={sx.pill}
              style={{
                background: "color-mix(in srgb, var(--native-primary) 8%, transparent)",
                color: "var(--native-primary)",
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </Show>

      <div class={cn(sx.dashFoot, "gap-1 [&>button]:cursor-pointer")}>
        <Show when={hasUpgrade()}>
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-colors hover:opacity-80"
            style={{ background: "#ff9800" }}
            aria-label={language.t("store.devices.upgrade.button")}
            title={language.t("store.devices.upgrade.available", { version: props.updateInfo!.version })}
            onClick={handleUpgrade}
          >
            <Icon name="cloud-upload" size="small" style={{ color: "white" }} />
          </button>
        </Show>
        <button
          type="button"
          class="flex h-7 w-7 items-center justify-center rounded-md cursor-pointer text-[var(--native-muted)] transition-colors hover:bg-[var(--native-primary-soft)] hover:text-[var(--native-foreground)]"
          aria-label={language.t("common.edit")}
          title={language.t("common.edit")}
          onClick={handleEdit}
        >
          <Icon name="edit" size="small" />
        </button>
        <button
          type="button"
          class="flex h-7 w-7 items-center justify-center rounded-md cursor-pointer text-[var(--native-muted)] transition-colors"
          style={{ "background-color": "transparent" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.08)"
            e.currentTarget.querySelector("svg")?.style.setProperty("color", "#ef4444")
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = ""
            e.currentTarget.querySelector("svg")?.style.removeProperty("color")
          }}
          aria-label={language.t("store.devices.deregister.button")}
          title={language.t("store.devices.deregister.button")}
          onClick={handleDelete}
        >
          <Icon name="trash" size="small" />
        </button>
      </div>
    </div>
  )
}
