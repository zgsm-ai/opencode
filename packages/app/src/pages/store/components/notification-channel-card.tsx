import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import type { NotificationChannel } from "../lib/api"

const EVENT_LABELS: Record<string, string> = {
  "session.created": "Session Created",
  "session.completed": "Session Completed",
  "session.failed": "Session Failed",
  "device.connected": "Device Connected",
  "device.disconnected": "Device Disconnected",
}

function maskWebhook(webhook: string): string {
  try {
    const url = new URL(webhook)
    const keyParam = url.searchParams.get("key")
    if (keyParam && keyParam.length > 6) {
      url.searchParams.set("key", keyParam.slice(0, 3) + "***" + keyParam.slice(-3))
    }
    return url.toString()
  } catch {
    return webhook.slice(0, 30) + "..."
  }
}

export function NotificationChannelCard(props: {
  channel: NotificationChannel
  onEdit: (channel: NotificationChannel) => void
  onDelete: (channel: NotificationChannel) => void
  onToggle: (channel: NotificationChannel) => void
}) {
  const language = useLanguage()

  return (
    <div class="flex flex-col rounded-md border border-border-weak-base bg-background-base">
      <div class="flex items-start justify-between gap-2 px-4 py-3 border-b border-border-weak-base">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-lg">💬</span>
          <span class="font-medium text-sm truncate text-text-strong">{props.channel.name}</span>
        </div>
        <Show when={props.channel.enabled}>
          <span class="text-xs text-text-success-base bg-surface-success-base/20 px-2 py-0.5 rounded shrink-0">
            {language.t("store.notificationChannel.enabled")}
          </span>
        </Show>
        <Show when={!props.channel.enabled}>
          <span class="text-xs text-text-weak bg-bg-muted px-2 py-0.5 rounded shrink-0">
            {language.t("store.notificationChannel.disabled")}
          </span>
        </Show>
      </div>

      <div class="px-4 py-3 space-y-3">
        <div>
          <div class="text-xs text-text-weak mb-1">{language.t("store.notificationChannel.webhook")}</div>
          <div class="text-xs text-text-strong font-mono truncate" title={props.channel.webhook}>
            {maskWebhook(props.channel.webhook)}
          </div>
        </div>

        <div>
          <div class="text-xs text-text-weak mb-1.5">{language.t("store.notificationChannel.events")}</div>
          <div class="flex flex-wrap gap-1">
            <For each={props.channel.events}>
              {(event) => (
                <span class="text-xs text-text-info-base bg-surface-info-base/20 px-1.5 py-0.5 rounded">
                  {EVENT_LABELS[event] || event}
                </span>
              )}
            </For>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-1 px-4 py-2 border-t border-border-weak-base bg-bg-muted/30">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => props.onToggle(props.channel)}
          title={
            props.channel.enabled
              ? language.t("store.notificationChannel.disable")
              : language.t("store.notificationChannel.enable")
          }
        >
          <Show when={props.channel.enabled}>
            <Icon name="pause" size="sm" />
          </Show>
          <Show when={!props.channel.enabled}>
            <Icon name="play" size="sm" />
          </Show>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => props.onEdit(props.channel)}
          title={language.t("store.notificationChannel.edit")}
        >
          <Icon name="pencil" size="sm" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => props.onDelete(props.channel)}
          title={language.t("store.notificationChannel.delete")}
        >
          <Icon name="trash" size="sm" class="text-text-danger-base" />
        </Button>
      </div>
    </div>
  )
}
