import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import {
  notificationChannelApi,
  type NotificationChannel,
  type CreateNotificationChannelInput,
} from "../lib/api"

const inputClass =
  "w-full h-9 rounded-md border border-border-weak-base bg-background-base px-3 text-sm text-text-strong outline-none focus:border-border-strong"

const EVENT_OPTIONS = [
  { value: "session.created", label: "session.created" },
  { value: "session.completed", label: "session.completed" },
  { value: "session.failed", label: "session.failed" },
  { value: "device.connected", label: "device.connected" },
  { value: "device.disconnected", label: "device.disconnected" },
]

type NotificationChannelDialogProps = {
  mode: "create" | "edit"
  channel?: NotificationChannel
  onCreated?: (channel: NotificationChannel) => void
  onUpdated?: (channel: NotificationChannel) => void
}

export function NotificationChannelDialog(props: NotificationChannelDialogProps) {
  const dialog = useDialog()
  const language = useLanguage()
  const [store, setStore] = createStore({
    name: props.channel?.name || "",
    webhook: props.channel?.webhook || "",
    events: props.channel?.events || [] as string[],
    saving: false,
    error: "",
  })

  const isEventSelected = (event: string) => store.events.includes(event)

  const toggleEvent = (event: string) => {
    if (isEventSelected(event)) {
      setStore(
        "events",
        store.events.filter((e) => e !== event),
      )
    } else {
      setStore("events", [...store.events, event])
    }
  }

  const validate = (): boolean => {
    if (!store.name.trim()) {
      setStore("error", language.t("store.notificationChannelDialog.error.nameRequired"))
      return false
    }
    if (!store.webhook.trim()) {
      setStore("error", language.t("store.notificationChannelDialog.error.webhookRequired"))
      return false
    }
    if (store.events.length === 0) {
      setStore("error", language.t("store.notificationChannelDialog.error.eventsRequired"))
      return false
    }
    return true
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!validate()) return

    setStore("saving", true)
    setStore("error", "")

    try {
      if (props.mode === "create") {
        const input: CreateNotificationChannelInput = {
          name: store.name.trim(),
          type: "wecom",
          webhook: store.webhook.trim(),
          events: store.events,
          enabled: true,
        }
        const result = await notificationChannelApi.create(input)
        props.onCreated?.(result)
        showToast({ title: language.t("store.notificationChannelDialog.toast.created") })
      } else if (props.channel) {
        const result = await notificationChannelApi.update(props.channel.id, {
          name: store.name.trim(),
          webhook: store.webhook.trim(),
          events: store.events,
        })
        props.onUpdated?.(result)
        showToast({ title: language.t("store.notificationChannelDialog.toast.updated") })
      }
      dialog.close()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStore("error", message)
      showToast({
        title: language.t(
          props.mode === "create"
            ? "store.notificationChannelDialog.toast.createFailed"
            : "store.notificationChannelDialog.toast.updateFailed",
        ),
        description: message,
      })
    } finally {
      setStore("saving", false)
    }
  }

  const title = () =>
    props.mode === "create"
      ? language.t("store.notificationChannelDialog.create.title")
      : language.t("store.notificationChannelDialog.edit.title")

  return (
    <Dialog title={title()} class="w-full max-w-[480px] mx-auto">
      <form onSubmit={handleSubmit} class="flex flex-col">
        <div class="flex-1 overflow-y-auto px-6 pb-6 pt-2">
          <div class="rounded-xl border border-border-weak-base bg-surface-raised-base">
            <div class="border-b border-border-weak-base px-4 py-4">
              <div class="text-14-medium text-text-strong">
                {language.t("store.notificationChannelDialog.config")}
              </div>
              <div class="mt-1 text-12-regular text-text-weak">
                {language.t("store.notificationChannelDialog.configDescription")}
              </div>
            </div>

            <div class="border-b border-border-weak-base px-4 py-4">
              <label class="mb-2 block text-12-medium text-text-strong">
                {language.t("store.notificationChannelDialog.field.name")}{" "}
                <span class="text-icon-info-base">*</span>
              </label>
              <input
                autofocus
                value={store.name}
                onInput={(e) => setStore("name", e.currentTarget.value)}
                placeholder={language.t("store.notificationChannelDialog.field.namePlaceholder")}
                class={inputClass}
              />
            </div>

            <div class="border-b border-border-weak-base px-4 py-4">
              <label class="mb-2 block text-12-medium text-text-strong">
                {language.t("store.notificationChannelDialog.field.webhook")}{" "}
                <span class="text-icon-info-base">*</span>
              </label>
              <input
                value={store.webhook}
                onInput={(e) => setStore("webhook", e.currentTarget.value)}
                placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx"
                class={inputClass}
              />
            </div>

            <div class="px-4 py-4">
              <label class="mb-2 block text-12-medium text-text-strong">
                {language.t("store.notificationChannelDialog.field.events")}{" "}
                <span class="text-icon-info-base">*</span>
              </label>
              <p class="text-12-regular text-text-weak mb-3">
                {language.t("store.notificationChannelDialog.field.eventsDescription")}
              </p>
              <div class="flex flex-col gap-2">
                <For each={EVENT_OPTIONS}>
                  {(option) => (
                    <label class="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isEventSelected(option.value)}
                        onChange={() => toggleEvent(option.value)}
                        class="h-4 w-4 rounded border-border-weak-base text-text-info-base focus:ring-text-info-base"
                      />
                      <span class="text-sm text-text-strong">{option.label}</span>
                    </label>
                  )}
                </For>
              </div>
            </div>
          </div>

          <Show when={store.error}>
            <div class="mt-3 text-sm text-text-danger-base">{store.error}</div>
          </Show>
        </div>

        <div class="flex justify-end gap-2 px-6 py-4 border-t border-border-weak-base">
          <Button type="button" variant="outline" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button type="submit" disabled={store.saving}>
            {store.saving
              ? language.t("common.saving")
              : props.mode === "create"
                ? language.t("common.create")
                : language.t("common.save")}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
