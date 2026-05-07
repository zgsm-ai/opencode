import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { useItemFilterOptions } from "@/context/item-filter-options"
import { useLanguage } from "@/context/language"
import { createEffect, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { itemApi, type CapabilityItem } from "../lib/api"
import type { ContentMode } from "../lib/content"
import { canArchive, contentValue, sourceTypeToMode, usableMode } from "../lib/content"
import { typeKey } from "../lib/constants"
import { ContentField } from "./content-field"
import { Modal } from "@/components/modal"

type EditCapabilityDialogProps = {
  item: CapabilityItem
  onSaved?: (item: CapabilityItem) => void
}

export function EditCapabilityDialog(props: EditCapabilityDialogProps) {
  const dialog = useDialog()
  const language = useLanguage()
  const itemFilterOptions = useItemFilterOptions()
  const [store, setStore] = createStore({
    name: props.item.name,
    description: props.item.description || "",
    category: props.item.category || "utilities",
    content: props.item.content || "",
    contentMode: usableMode(canArchive(props.item.itemType), sourceTypeToMode(props.item.sourceType)) as ContentMode,
    file: null as File | null,
    saving: false,
    error: "",
  })

  const typeLabel = createMemo(() => language.t(typeKey(props.item.itemType)))

  const archive = canArchive(props.item.itemType)
  const mode = createMemo(() => usableMode(archive, store.contentMode))

  const categoryOptions = createMemo(() => {
    const options = itemFilterOptions.categories().map((category) => category.slug)
    if (!store.category || options.includes(store.category)) return options
    return [...options, store.category]
  })

  createEffect(() => {
    const options = itemFilterOptions.categories()
    if (!options.length) return
    if (options.some((category) => category.slug === store.category)) return
    setStore("category", options[0]!.slug)
  })

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!store.name.trim()) return

    if (mode() === "archive" && !store.file && props.item.sourceType !== "archive") {
      setStore("error", language.t("store.capabilityDialog.content.required"))
      return
    }

    setStore("saving", true)
    setStore("error", "")

    try {
      const updated = await itemApi.update(props.item.id, {
        name: store.name.trim(),
        description: store.description.trim(),
        category: store.category,
        content: contentValue(mode(), store.content),
        ...(mode() === "archive" && store.file ? { file: store.file } : {}),
      })
      props.onSaved?.(updated)
      showToast({ title: language.t("store.capabilityDialog.toast.updated", { type: typeLabel() }) })
      dialog.close()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStore("error", message)
      showToast({
        title: language.t("store.capabilityDialog.toast.updateFailed", { type: typeLabel() }),
        description: message,
      })
    } finally {
      setStore("saving", false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Modal
        title={language.t("store.capabilityDialog.edit.title", { type: typeLabel() })}
        maxWidth="760px"
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
              {store.saving
                ? mode() === "archive"
                  ? language.t("store.capabilityDialog.content.uploading")
                  : language.t("common.saving")
                : language.t("store.capabilityDialog.edit.submit")}
            </button>
          </>
        }
      >
        <div class="modal-section">
          <div class="modal-field">
            <label class="modal-label">
              {language.t("store.capabilityDialog.field.displayName")} <span class="req">*</span>
            </label>
            <input
              autofocus
              value={store.name}
              onInput={(e) => setStore("name", e.currentTarget.value)}
              class="modal-input"
              required
            />
          </div>

          <div class="modal-field">
            <label class="modal-label">
              {language.t("store.capabilityDialog.field.description")}
            </label>
            <input
              value={store.description}
              onInput={(e) => setStore("description", e.currentTarget.value)}
              class="modal-input"
            />
          </div>

          <div class="modal-row">
            <div class="modal-field" style={{ flex: "1" }}>
              <label class="modal-label">
                {language.t("store.capabilityDialog.field.category")}
              </label>
              <select
                value={store.category}
                onInput={(e) => setStore("category", e.currentTarget.value)}
                class="modal-input"
              >
                {categoryOptions().map((category) => (
                  <option value={category}>{itemFilterOptions.categoryLabel(category)}</option>
                ))}
              </select>
            </div>

            <div class="modal-field" style={{ flex: "1" }}>
              <label class="modal-label">
                {language.t("store.capabilityDialog.field.visibility")}
              </label>
              <input
                value={
                  props.item.repoVisibility === "public"
                    ? language.t("store.capabilityDialog.visibility.public")
                    : props.item.repoVisibility === "private"
                      ? language.t("store.capabilityDialog.visibility.private")
                      : "-"
                }
                disabled
                class="modal-input"
                style={{ opacity: "0.6", cursor: "not-allowed" }}
              />
            </div>
          </div>
        </div>

        <div class="modal-section">
          <ContentField
            archive={archive}
            mode={store.contentMode}
            text={store.content}
            file={store.file}
            rows={14}
            textClass="modal-input"
            existingArchive={props.item.sourceType === "archive"}
            onModeChange={(mode) => {
              setStore("contentMode", mode)
              setStore("error", "")
            }}
            onTextChange={(text) => {
              setStore("content", text)
              setStore("error", "")
            }}
            onFileChange={(file) => {
              setStore("file", file)
              setStore("error", "")
            }}
            onError={(message) => setStore("error", message)}
          />
        </div>

        {store.error ? <p class="modal-error">{store.error}</p> : null}
      </Modal>
    </form>
  )
}
