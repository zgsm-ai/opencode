import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import type { Device, UpdateDeviceRequest } from "@/pages/workspace/types"

const inputClass =
  "w-full h-9 rounded-md border border-border-weak-base bg-background-base px-3 text-sm text-text-strong outline-none focus:border-border-strong"

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
    <Dialog title={language.t("store.devices.dialog.editTitle")} class="mx-auto w-full max-w-md">
      <form onSubmit={handleSubmit} class="flex max-h-[calc(100vh-120px)] flex-col overflow-hidden">
        <div class="flex-1 overflow-y-auto px-6 pb-6 pt-2">
          <div class="flex flex-col gap-4">
            <div>
              <label class="mb-1.5 block text-xs font-medium text-text-strong">
                {language.t("store.devices.dialog.name")} <span class="text-icon-info-base">*</span>
              </label>
              <input
                autofocus
                value={form.displayName}
                onInput={(e) => setForm("displayName", e.currentTarget.value)}
                placeholder={language.t("store.devices.dialog.namePlaceholder")}
                class={inputClass}
              />
            </div>
            <div>
              <label class="mb-1.5 block text-xs font-medium text-text-strong">
                {language.t("store.devices.dialog.description")}
              </label>
              <textarea
                value={form.description}
                onInput={(e) => setForm("description", e.currentTarget.value)}
                placeholder={language.t("store.devices.dialog.descriptionPlaceholder")}
                class={`${inputClass} min-h-24 resize-y py-2`}
              />
            </div>
          </div>
        </div>
        <div class="flex shrink-0 items-center justify-end gap-2 border-t border-border-weak-base bg-surface-base px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => d.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button type="submit" disabled={form.saving || !form.displayName.trim()}>
            {form.saving ? language.t("common.saving") : language.t("common.save")}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
