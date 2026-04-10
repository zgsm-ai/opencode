import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import type { UpdateDeviceRequest, Device } from "@/pages/workspace/types"
import { DeviceEditDialog } from "./device-edit-dialog"

type DeviceCardProps = {
  device: Device
  onUpdate: (payload: { deviceId: string; data: UpdateDeviceRequest }) => Promise<void> | void
}

const statusProps = (status?: string) => {
  if (status === "online") return { c: "#22c55e", label: "Online" }
  if (status === "offline") return { c: "#9ca3af", label: "Offline" }
  return { c: "var(--st-text-secondary)", label: "Unknown" }
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

  const sp = () => statusProps(props.device.status)
  const labels = () => props.device.label?.split(",").map((l) => l.trim()).filter(Boolean) ?? []

  return (
    <div class="store-dash-card">
      <div class="store-dash-card-head">
        <span class="store-dash-card-name">{props.device.displayName}</span>
        <span
          class="store-dash-pill"
          style={{
            background: `color-mix(in srgb, ${sp().c} 12%, transparent)`,
            color: sp().c,
          }}
        >
          {language.t(`store.devices.status.${props.device.status}`) || sp().label}
        </span>
      </div>

      <div class="store-dev-card-platform">
        <Icon name="server" size="small" />
        {props.device.platform || language.t("store.devices.unknownPlatform")}
        {props.device.version ? ` · v${props.device.version}` : ""}
      </div>

      <div class="store-dash-card-slug" style={{ "margin-bottom": "0.25rem" }}>
        ID: {props.device.deviceId.slice(0, 8)}
      </div>

      <div class="store-dev-card-labels">
        {labels().map((label) => (
          <span
            class="store-dash-pill"
            style={{
              background: "color-mix(in srgb, var(--st-accent) 8%, transparent)",
              color: "var(--st-accent)",
            }}
          >
            {label}
          </span>
        ))}
      </div>

      <div class="store-dash-card-foot">
        <button class="store-abtn" title={language.t("common.edit")} onClick={handleEdit}>
          <Icon name="edit" size="small" />
        </button>
      </div>
    </div>
  )
}
