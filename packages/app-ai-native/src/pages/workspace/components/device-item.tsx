import { Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import type { Device } from "../types"
import type { UpgradeState } from "./use-device-upgrade"
import { useLanguage } from "@/context/language"

export type DeviceItemProps = {
  device: Device
  upgradeState?: UpgradeState
  hasUpgrade: boolean
  onCreate: (device: Device) => void
  onUpgrade: (device: Device) => void
}

const tooltipContentStyle = {
  background: "hsl(var(--sidebar-accent))",
  color: "hsl(var(--sidebar-accent-foreground))",
  border: "1px solid hsl(var(--sidebar-border))",
  "box-shadow": "var(--shadow-xs)",
}

export function DeviceItem(props: DeviceItemProps) {
  const language = useLanguage()
  const t = language.t

  const detail = () => {
    const parts = [props.device.platform, props.device.version].filter(Boolean)
    return parts.join(" · ") || props.device.deviceId
  }

  const isUpgrading = () => !!props.upgradeState
  const isOffline = () => props.device.status === "offline" && !isUpgrading()

  const open = () => {
    if (props.device.status === "offline") return
    props.onCreate(props.device)
  }

  return (
    <li
      class="group/device relative flex items-center gap-2 rounded-[var(--native-radius-md)] border border-transparent px-2.5 py-2 text-xs transition-all duration-150 hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground overflow-hidden"
      classList={{
        "opacity-60 text-sidebar-foreground/40": isOffline(),
        "text-sidebar-foreground/70": !isOffline(),
        "border-[color:color-mix(in_srgb,#ff9800_25%,transparent)]": isUpgrading(),
      }}
    >
      <Tooltip placement="bottom-end" value={detail()} class="flex-1 min-w-0" contentStyle={tooltipContentStyle}>
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-2.5 text-left focus:outline-none"
          classList={{
            "cursor-pointer": props.device.status !== "offline",
            "cursor-not-allowed": props.device.status === "offline",
          }}
          onClick={open}
        >
          <span class="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--native-radius-sm)] bg-[color:color-mix(in_oklab,var(--native-panel)_76%,var(--native-bg-subtle))] text-sidebar-foreground/70 shadow-[var(--native-shadow-sm)]">
            <span
              class="absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
              classList={{
                "bg-[#ff9800] animate-pulse": isUpgrading(),
                "bg-[var(--native-success)]": !isUpgrading() && props.device.status === "online",
                "bg-[var(--native-error)]": !isUpgrading() && props.device.status === "offline",
                "bg-sidebar-border": !isUpgrading() && props.device.status !== "online" && props.device.status !== "offline",
              }}
            />
            <Icon name="server" class="text-sm" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[0.8125rem] font-medium text-sidebar-foreground">{props.device.displayName}</span>
            <span class="block truncate text-[11px] text-sidebar-foreground/45">{detail()}</span>
          </span>
        </button>
      </Tooltip>
      <Tooltip
        placement="bottom-end"
        value={props.device.status === "offline" ? t("workspace.device.offlineHint") : t("workspace.device.createWorkspace")}
        contentStyle={tooltipContentStyle}
      >
        <button
          type="button"
          class="flex h-7 items-center justify-center rounded-[var(--native-radius-sm)] text-sidebar-foreground/55 max-w-0 opacity-0 transition-all duration-150 group-hover/device:max-w-7 group-hover/device:opacity-100 group-focus-within/device:max-w-7 group-focus-within/device:opacity-100 hover:bg-sidebar-accent focus:outline-none focus-visible:bg-sidebar-accent overflow-hidden px-0"
          classList={{
            "cursor-pointer": props.device.status !== "offline",
            "cursor-not-allowed": props.device.status === "offline",
          }}
          onClick={(e) => {
            e.stopPropagation()
            open()
          }}
        >
          <Icon name="plus-small" />
        </button>
      </Tooltip>
      <Show when={props.hasUpgrade}>
        <Tooltip
          placement="bottom-end"
          value={t("workspace.device.upgradeHint", { version: props.device.latestVersion ?? "" })}
          contentStyle={tooltipContentStyle}
        >
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-colors hover:opacity-80"
            style={{ background: "#ff9800", color: "white" }}
            onClick={(e) => {
              e.stopPropagation()
              props.onUpgrade(props.device)
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
            width: `${props.upgradeState?.progress ?? 0}%`,
            background:
              props.upgradeState?.done === "failed"
                ? "#ef4444"
                : props.upgradeState?.done === "completed"
                  ? "linear-gradient(90deg, #22c55e, #16a34a)"
                  : "linear-gradient(90deg, #ff9800, #f57c00)",
          }}
        />
      </Show>
    </li>
  )
}
