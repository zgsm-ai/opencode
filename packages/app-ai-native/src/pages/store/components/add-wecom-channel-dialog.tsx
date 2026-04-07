import { useDialog } from "@opencode-ai/ui/context/dialog"
import { createResource } from "solid-js"
import { createStore } from "solid-js/store"
import { type WecomChannel } from "@/context/settings"
import { notificationChannelApi } from "../lib/api"
import { useLanguage } from "@/context/language"
import { StoreDialog } from "./store-dialog"

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
    <form onSubmit={handleSubmit}>
      <StoreDialog
        title={language.t("store.notificationChannels.dialog.addTitle")}
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
              {form.saving
                ? language.t("store.notificationChannels.dialog.adding")
                : language.t("store.notificationChannels.dialog.confirmAdd")}
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
