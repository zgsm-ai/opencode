import { Icon } from "@opencode-ai/ui/icon"
import { createSignal, Show } from "solid-js"
import type { ChannelConfig } from "../lib/api"
import { useLanguage } from "@/context/language"

type Props = {
  channel: ChannelConfig
  onEdit: (channel: ChannelConfig) => void
  onRemove: (id: string) => Promise<void> | void
  onTest: (id: string) => Promise<void> | void
  onToggle: (id: string, enabled: boolean) => Promise<void> | void
}

const TYPE_LABELS: Record<string, string> = {
  wechat: "WeChat",
  wecom: "WeCom",
}

export function ChannelCard(props: Props) {
  const [testing, setTesting] = createSignal(false)
  const language = useLanguage()

  const handleTest = async () => {
    setTesting(true)
    try {
      await props.onTest(props.channel.id)
    } finally {
      setTesting(false)
    }
  }

  const handleToggle = () => {
    void props.onToggle(props.channel.id, !props.channel.enabled)
  }

  const label = () => TYPE_LABELS[props.channel.channelType] ?? props.channel.channelType

  const enabledStyle = () =>
    props.channel.enabled
      ? { bg: "color-mix(in srgb, #22c55e 12%, transparent)", c: "#22c55e", text: language.t("channels.enabled") }
      : { bg: "rgba(156,163,175,0.12)", c: "var(--st-text-secondary)", text: language.t("channels.disabled") }

  return (
    <div class="store-dash-card">
      <div class="store-dash-card-head">
        <span class="store-dash-card-name" style={{ display: "flex", "align-items": "center", gap: "0.375rem" }}>
          <Icon name="comment" size="small" />
          {label()} — {props.channel.name}
        </span>
        <span class="store-dash-pill" style={{ background: enabledStyle().bg, color: enabledStyle().c }}>
          {enabledStyle().text}
        </span>
      </div>

      <Show when={props.channel.lastError}>
        <div class="store-notif-card-field" style={{ color: "#ef4444", "font-size": "12px" }}>
          {props.channel.lastError}
        </div>
      </Show>

      <Show when={props.channel.lastActiveAt}>
        <div class="store-notif-card-field" style={{ "font-size": "12px", color: "var(--st-text-secondary)" }}>
          {language.t("channels.lastActive")}: {new Date(props.channel.lastActiveAt!).toLocaleString()}
        </div>
      </Show>

      <div class="store-dash-card-foot" style={{ "justify-content": "space-between" }}>
        <div style={{ display: "flex", gap: "0.25rem" }}>
          <button
            class="store-notif-test-btn"
            disabled={!props.channel.enabled || testing()}
            onClick={handleTest}
          >
            {testing() ? language.t("channels.testing") : language.t("channels.test")}
          </button>
          <button
            class="store-notif-test-btn"
            onClick={handleToggle}
          >
            {props.channel.enabled ? language.t("channels.disable") : language.t("channels.enable")}
          </button>
        </div>
        <div style={{ display: "flex", gap: "2px" }}>
          <button
            class="store-abtn"
            title={language.t("common.edit")}
            onClick={() => props.onEdit(props.channel)}
          >
            <Icon name="edit" size="small" />
          </button>
          <button
            class="store-abtn"
            title={language.t("common.delete")}
            onClick={() => void props.onRemove(props.channel.id)}
          >
            <Icon name="trash" size="small" />
          </button>
        </div>
      </div>
    </div>
  )
}
