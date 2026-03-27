import { Button } from "@opencode-ai/ui/button"
import { Checkbox } from "@opencode-ai/ui/checkbox"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { createResource } from "solid-js"
import { createStore } from "solid-js/store"
import { type WecomChannel } from "@/context/settings"
import { notificationChannelApi } from "../lib/api"
import { useLanguage } from "@/context/language"

const inputClass =
  "w-full h-9 rounded-md border border-border-weak-base bg-background-base px-3 text-sm text-text-strong outline-none focus:border-border-strong"

type AddWecomChannelDialogProps = {
  onCreated: (ch: Omit<WecomChannel, "id">) => Promise<void> | void
}

export function AddWecomChannelDialog(props: AddWecomChannelDialogProps) {
  const dialog = useDialog()
  const language = useLanguage()
  const [form, setForm] = createStore({
    name: "",
    webhook: "",
    events: {
      permission: true,
      question: true,
      idle: false,
    },
    error: "",
    saving: false,
  })
  const [available] = createResource(() => notificationChannelApi.available())

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setForm("error", language.t("store.notificationChannels.dialog.error.nameRequired"))
      return
    }
    if (!form.webhook.trim()) {
      setForm("error", language.t("store.notificationChannels.dialog.error.webhookRequired"))
      return
    }
    setForm("error", "")
    setForm("saving", true)
    const wecom = (available()?.channelTypes ?? []).find((c) => c.type === "wecom")
    try {
      await props.onCreated({
        name: form.name.trim(),
        webhook: form.webhook.trim(),
        enabled: true,
        events: {
          permission: form.events.permission,
          question: form.events.question,
          idle: form.events.idle,
        },
        ...(wecom ? { systemChannelId: wecom.systemChannelId } : {}),
      })
      dialog.close()
    } finally {
      setForm("saving", false)
    }
  }

  return (
    <Dialog title={language.t("store.notificationChannels.dialog.addTitle")} class="w-full max-w-md mx-auto">
      <form onSubmit={handleSubmit} class="flex flex-col">
        <div class="flex flex-col gap-4 px-6 py-4">
          <div>
            <label class="mb-1.5 block text-xs font-medium text-text-strong">
              {language.t("store.notificationChannels.dialog.name")} <span class="text-icon-info-base">*</span>
            </label>
            <input
              autofocus
              value={form.name}
              onInput={(e) => setForm("name", e.currentTarget.value)}
              placeholder={language.t("store.notificationChannels.dialog.namePlaceholder")}
              class={inputClass}
            />
          </div>
          <div>
            <label class="mb-1.5 block text-xs font-medium text-text-strong">
              {language.t("store.notificationChannels.dialog.webhook")} <span class="text-icon-info-base">*</span>
            </label>
            <input
              value={form.webhook}
              onInput={(e) => setForm("webhook", e.currentTarget.value)}
              placeholder={language.t("store.notificationChannels.dialog.webhookPlaceholder")}
              class={inputClass}
            />
          </div>
          <div>
            <label class="mb-2 block text-xs font-medium text-text-strong">
              {language.t("store.notificationChannels.dialog.events")}
            </label>
            <div class="flex flex-col gap-2 text-sm text-text-strong">
              <Checkbox
                checked={form.events.permission}
                onChange={(checked) => setForm("events", "permission", checked)}
              >
                {language.t("store.notificationChannels.event.permission")}
              </Checkbox>
              <Checkbox checked={form.events.question} onChange={(checked) => setForm("events", "question", checked)}>
                {language.t("store.notificationChannels.event.question")}
              </Checkbox>
              <Checkbox checked={form.events.idle} onChange={(checked) => setForm("events", "idle", checked)}>
                {language.t("store.notificationChannels.event.idle")}
              </Checkbox>
            </div>
          </div>
          {form.error && <p class="text-xs text-icon-critical-base">{form.error}</p>}
        </div>
        <div class="flex shrink-0 items-center justify-end gap-2 border-t border-border-weak-base bg-surface-base px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button type="submit" disabled={form.saving}>
            {form.saving
              ? language.t("store.notificationChannels.dialog.adding")
              : language.t("store.notificationChannels.dialog.confirmAdd")}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
