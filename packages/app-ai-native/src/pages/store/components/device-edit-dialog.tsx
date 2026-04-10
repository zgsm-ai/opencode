import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import type { Device, UpdateDeviceRequest } from "@/pages/workspace/types"
import { Modal } from "@/components/modal"

type DeviceEditDialogProps = {
  device: Device
  onSaved: (data: UpdateDeviceRequest) => Promise<void> | void
}

export function DeviceEditDialog(props: DeviceEditDialogProps) {
  const d = useDialog()
  const language = useLanguage()
  const [form, setForm] = createStore({
    displayName: props.device.displayName,
    description: props.device.description || "",
    label: props.device.label || "",
    workspaceId: props.device.workspaceId || "",
    saving: false,
  })

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault()
    if (!form.displayName.trim()) {
      showToast({ variant: "error", icon: "circle-x", title: language.t("store.devices.dialog.error.nameRequired") })
      return
    }

    setForm("saving", true)
    try {
      await props.onSaved({
        displayName: form.displayName.trim(),
        description: form.description.trim(),
        label: form.label.trim() || undefined,
        workspaceId: form.workspaceId.trim() || undefined,
      })
      d.close()
    } finally {
      setForm("saving", false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Modal
        title={language.t("store.devices.dialog.editTitle")}
        maxWidth="480px"
        maxHeight="460px"
        footer={
          <>
            <button
              class="modal-btn modal-btn-ghost"
              type="button"
              onClick={() => d.close()}
            >
              {language.t("common.cancel")}
            </button>
            <button
              class="modal-btn modal-btn-primary"
              type="submit"
              disabled={form.saving || !form.displayName.trim()}
            >
              {form.saving ? language.t("common.saving") : language.t("common.save")}
            </button>
          </>
        }
      >
        <div class="modal-section">
          <div class="modal-field">
            <label class="modal-label">
              {language.t("store.devices.dialog.name")} <span class="req">*</span>
            </label>
            <input
              autofocus
              value={form.displayName}
              onInput={(e) => setForm("displayName", e.currentTarget.value)}
              placeholder={language.t("store.devices.dialog.namePlaceholder")}
              class="modal-input"
            />
          </div>
          <div class="modal-field">
            <label class="modal-label">
              {language.t("store.devices.dialog.description")}
            </label>
            <textarea
              value={form.description}
              onInput={(e) => setForm("description", e.currentTarget.value)}
              placeholder={language.t("store.devices.dialog.descriptionPlaceholder")}
              class="modal-input"
            />
          </div>
        </div>
      </Modal>
    </form>
  )
}
