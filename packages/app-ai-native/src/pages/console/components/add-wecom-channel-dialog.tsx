import { useDialog } from "@opencode-ai/ui/context/dialog"
import { createResource } from "solid-js"
import { createStore } from "solid-js/store"
import { type WecomChannel } from "@/context/settings"
import { notificationChannelApi } from "@/pages/store/lib/api"
import { useLanguage } from "@/context/language"
import { Modal } from "@/components/modal"
import { Button } from "@/components/ui/button"

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
      <Modal
        title={language.t("store.notificationChannels.dialog.addTitle")}
        maxWidth="480px"
        maxHeight="460px"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => dialog.close()}
            >
              {language.t("common.cancel")}
            </Button>
            <Button
              size="sm"
              type="submit"
              disabled={form.saving}
            >
              {form.saving
                ? language.t("store.notificationChannels.dialog.adding")
                : language.t("store.notificationChannels.dialog.confirmAdd")}
            </Button>
          </>
        }
      >
        <div class="modal-section">
          <div class="modal-field">
            <label class="modal-label">
              {language.t("store.notificationChannels.dialog.name")} <span class="req">*</span>
            </label>
            <input
              autofocus
              value={form.name}
              onInput={(e) => setForm("name", e.currentTarget.value)}
              placeholder={language.t("store.notificationChannels.dialog.namePlaceholder")}
              class="modal-input"
            />
          </div>
          <div class="modal-field">
            <label class="modal-label">
              {language.t("store.notificationChannels.dialog.webhook")} <span class="req">*</span>
            </label>
            <input
              value={form.webhook}
              onInput={(e) => setForm("webhook", e.currentTarget.value)}
              placeholder={language.t("store.notificationChannels.dialog.webhookPlaceholder")}
              class="modal-input"
              autocomplete="off"
            />
          </div>
        </div>

        <div class="modal-section">
          <div class="modal-section-title">
            {language.t("store.notificationChannels.dialog.events")}
          </div>
          <div class="modal-field">
            <label class="modal-checkbox">
              <input
                type="checkbox"
                checked={form.events.permission}
                onChange={(e) => setForm("events", "permission", e.currentTarget.checked)}
              />
              {language.t("store.notificationChannels.event.permission")}
            </label>
            <label class="modal-checkbox">
              <input
                type="checkbox"
                checked={form.events.question}
                onChange={(e) => setForm("events", "question", e.currentTarget.checked)}
              />
              {language.t("store.notificationChannels.event.question")}
            </label>
            <label class="modal-checkbox">
              <input
                type="checkbox"
                checked={form.events.idle}
                onChange={(e) => setForm("events", "idle", e.currentTarget.checked)}
              />
              {language.t("store.notificationChannels.event.idle")}
            </label>
          </div>
        </div>

        {form.error && <p class="modal-error">{form.error}</p>}
      </Modal>
    </form>
  )
}
