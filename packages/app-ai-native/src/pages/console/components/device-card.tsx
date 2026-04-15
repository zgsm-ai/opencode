import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { cn } from "@/lib/utils"
import { sx } from "@/pages/store/lib/styles"
import type { UpdateDeviceRequest, Device } from "@/pages/workspace/types"
import { DeviceEditDialog } from "./device-edit-dialog"
import { Button } from "@/components/ui/button"

type DeviceCardProps = {
  device: Device
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

  const sp = () => statusProps(props.device.status)
  const labels = () => props.device.label?.split(",").map((l) => l.trim()).filter(Boolean) ?? []

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

      <div class={sx.dashFoot}>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          aria-label={language.t("common.edit")}
          title={language.t("common.edit")}
          onClick={handleEdit}
        >
          <Icon name="edit" size="small" />
        </Button>
      </div>
    </div>
  )
}
