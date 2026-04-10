import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { projectsApi } from "../lib/project-api"
import type { Project } from "../lib/project-types"
import { Modal } from "@/components/modal"

type Props = {
  onCreated?: (project: Project) => void
}

export default function CreateProjectDialog(props: Props) {
  const dialog = useDialog()
  const language = useLanguage()
  const [store, setStore] = createStore({
    name: "",
    description: "",
    saving: false,
    error: "",
  })

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!store.name.trim()) return

    setStore("saving", true)
    setStore("error", "")

    try {
      const res = await projectsApi.create({
        name: store.name.trim(),
        description: store.description.trim(),
      })
      showToast({
        variant: "success",
        title: language.t("projects.createDialog.toast.success"),
      })
      props.onCreated?.(res.project)
      dialog.close()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStore("error", message)
      showToast({
        variant: "error",
        title: language.t("projects.createDialog.toast.failed"),
        description: message,
      })
    } finally {
      setStore("saving", false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Modal
        title={language.t("projects.createDialog.title")}
        maxWidth="640px"
        maxHeight="calc(100vh - 120px)"
        footer={
          <>
            <button
              class="modal-btn modal-btn-ghost"
              type="button"
              onClick={() => dialog.close()}
            >
              {language.t("common.cancel")}
            </button>
            <button
              class="modal-btn modal-btn-primary"
              type="submit"
              disabled={store.saving || !store.name.trim()}
            >
              {store.saving ? language.t("common.saving") : language.t("projects.createDialog.submit")}
            </button>
          </>
        }
      >
        <div class="modal-section">
          <div class="modal-field">
            <label class="modal-label">
              {language.t("projects.createDialog.field.name")} <span class="req">*</span>
            </label>
            <input
              autofocus
              value={store.name}
              onInput={(e) => setStore("name", e.currentTarget.value)}
              placeholder={language.t("projects.createDialog.field.namePlaceholder")}
              class="modal-input"
              required
            />
          </div>

          <div class="modal-field">
            <label class="modal-label">
              {language.t("projects.createDialog.field.description")}
            </label>
            <textarea
              value={store.description}
              onInput={(e) => setStore("description", e.currentTarget.value)}
              placeholder={language.t("projects.createDialog.field.descriptionPlaceholder")}
              class="modal-input"
              style={{ "min-height": "96px", resize: "vertical" }}
            />
          </div>
        </div>

        {store.error ? <p class="modal-error">{store.error}</p> : null}
      </Modal>
    </form>
  )
}
