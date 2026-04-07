import { useDialog } from "@opencode-ai/ui/context/dialog"
import { createStore } from "solid-js/store"
import { type WecomChannel } from "@/context/settings"
import { useLanguage } from "@/context/language"
import { StoreDialog } from "./store-dialog"

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
    <form onSubmit={handleSubmit}>
      <StoreDialog
        title={language.t("store.notificationChannels.dialog.editTitle")}
        maxWidth="480px"
        maxHeight="460px"
        footer={
          <>
            <button
              class="store-modal-btn store-modal-btn-ghost"
              type="button"
              onClick={() => dialog.close()}
            >
              {language.t("common.cancel")}
            </button>
            <button
              class="store-modal-btn store-modal-btn-primary"
              type="submit"
              disabled={form.saving}
            >
              {form.saving ? language.t("common.saving") : language.t("common.save")}
            </button>
          </>
        }
      >
        <div class="store-modal-section">
          <div class="store-modal-section-title">
            {language.t("store.notificationChannels.dialog.name")}
          </div>
          <div class="store-modal-section-desc">
            {language.t("store.notificationChannels.dialog.webhook")}
          </div>
          <div class="store-modal-field">
            <label class="store-modal-label">
              {language.t("store.notificationChannels.dialog.name")} <span class="req">*</span>
            </label>
            <input
              autofocus
              value={form.name}
              onInput={(e) => setForm("name", e.currentTarget.value)}
              placeholder={language.t("store.notificationChannels.dialog.namePlaceholder")}
              class="store-modal-input"
            />
          </div>
          <div class="store-modal-field">
            <label class="store-modal-label">
              {language.t("store.notificationChannels.dialog.webhook")} <span class="req">*</span>
            </label>
            <input
              value={form.webhook}
              onInput={(e) => setForm("webhook", e.currentTarget.value)}
              placeholder={language.t("store.notificationChannels.dialog.webhookPlaceholder")}
              class="store-modal-input"
            />
            <div class="store-modal-hint">
              {language.t("store.notificationChannels.dialog.webhookPlaceholder")}
            </div>
          </div>
        </div>

        <div class="store-modal-section">
          <div class="store-modal-section-title">
            {language.t("store.notificationChannels.dialog.events")}
          </div>
          <div class="store-modal-field">
            <label class="store-modal-checkbox">
              <input
                type="checkbox"
                checked={form.events.permission}
                onChange={(e) => setForm("events", "permission", e.currentTarget.checked)}
              />
              {language.t("store.notificationChannels.event.permission")}
            </label>
            <label class="store-modal-checkbox">
              <input
                type="checkbox"
                checked={form.events.question}
                onChange={(e) => setForm("events", "question", e.currentTarget.checked)}
              />
              {language.t("store.notificationChannels.event.question")}
            </label>
            <label class="store-modal-checkbox">
              <input
                type="checkbox"
                checked={form.events.idle}
                onChange={(e) => setForm("events", "idle", e.currentTarget.checked)}
              />
              {language.t("store.notificationChannels.event.idle")}
            </label>
          </div>
        </div>

        {form.error && <p class="store-modal-error">{form.error}</p>}
      </StoreDialog>
    </form>
  )
}
