import { Button } from "@opencode-ai/ui/button"
import { Checkbox } from "@opencode-ai/ui/checkbox"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { createStore } from "solid-js/store"
import { type WecomChannel } from "@/context/settings"
import { useLanguage } from "@/context/language"

const inputClass =
  "w-full h-9 rounded-md border border-border-weak-base bg-background-base px-3 text-sm text-text-strong outline-none focus:border-border-strong"

type EditWecomChannelDialogProps = {
  channel: WecomChannel
  onSaved: (id: string, patch: Partial<WecomChannel>) => Promise<void> | void
}

export function EditWecomChannelDialog(props: EditWecomChannelDialogProps) {
  const dialog = useDialog()
  const language = useLanguage()
  const [form, setForm] = createStore({
    name: props.channel.name,
    webhook: props.channel.webhook,
    events: {
      permission: props.channel.events.permission,
      question: props.channel.events.question,
      idle: props.channel.events.idle,
    },
    error: "",
    saving: false,
  })

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
    try {
      const patch: Partial<WecomChannel> = {}
      if (form.name.trim() !== props.channel.name) {
        patch.name = form.name.trim()
      }
      if (form.webhook.trim() !== props.channel.webhook) {
        patch.webhook = form.webhook.trim()
      }
      if (
        form.events.permission !== props.channel.events.permission ||
        form.events.question !== props.channel.events.question ||
        form.events.idle !== props.channel.events.idle
      ) {
        patch.events = {
          permission: form.events.permission,
          question: form.events.question,
          idle: form.events.idle,
        }
      }
      await props.onSaved(props.channel.id, patch)
      dialog.close()
    } finally {
      setForm("saving", false)
    }
  }

  return (
    <Dialog title={language.t("store.notificationChannels.dialog.editTitle")} class="w-full max-w-md mx-auto">
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
            {form.saving ? language.t("common.saving") : language.t("common.save")}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
