import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { itemApi, type CapabilityItem } from "../lib/api"
import type { ContentMode } from "../lib/content"
import { canArchive, contentValue, sourceTypeToMode, usableMode } from "../lib/content"
import { CATEGORIES, typeKey, categoryKey } from "../lib/constants"
import { ContentField } from "./content-field"

const inputClass =
  "w-full h-9 rounded-md border border-border-weak-base bg-background-base px-3 text-sm text-text-strong outline-none focus:border-border-strong"

const textAreaClass =
  "w-full rounded-md border border-border-weak-base bg-background-base px-3 py-2 text-sm text-text-strong outline-none focus:border-border-strong resize-y"

type EditCapabilityDialogProps = {
  item: CapabilityItem
  onSaved?: (item: CapabilityItem) => void
}

export function EditCapabilityDialog(props: EditCapabilityDialogProps) {
  const dialog = useDialog()
  const language = useLanguage()
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
    <Dialog
      title={language.t("store.capabilityDialog.edit.title", { type: typeLabel() })}
      class="w-full max-w-[760px] mx-auto"
    >
      <form onSubmit={handleSubmit} class="flex max-h-[calc(100vh-120px)] flex-col overflow-hidden">
        <div class="flex-1 overflow-y-auto px-6 pb-6 pt-2 space-y-4">
          <div>
            <label class="mb-2 block text-12-medium text-text-strong">
              {language.t("store.capabilityDialog.field.displayName")}
            </label>
            <input
              autofocus
              value={store.name}
              onInput={(e) => setStore("name", e.currentTarget.value)}
              class={inputClass}
              required
            />
          </div>

          <div>
            <label class="mb-2 block text-12-medium text-text-strong">
              {language.t("store.capabilityDialog.field.description")}
            </label>
            <input
              value={store.description}
              onInput={(e) => setStore("description", e.currentTarget.value)}
              class={inputClass}
            />
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <label class="mb-2 block text-12-medium text-text-strong">
                {language.t("store.capabilityDialog.field.category")}
              </label>
              <select
                value={store.category}
                onInput={(e) => setStore("category", e.currentTarget.value)}
                class={inputClass}
              >
                {CATEGORIES.map((category) => (
                  <option value={category}>{language.t(categoryKey(category))}</option>
                ))}
              </select>
            </div>

            <div>
              <label class="mb-2 block text-12-medium text-text-strong">
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
                class={inputClass + " cursor-not-allowed opacity-60"}
              />
            </div>
          </div>

          <ContentField
            archive={archive}
            mode={store.contentMode}
            text={store.content}
            file={store.file}
            rows={14}
            textClass={textAreaClass}
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

          {store.error ? <p class="text-12-regular text-icon-critical-base">{store.error}</p> : null}
        </div>

        <div class="flex shrink-0 items-center justify-end gap-2 border-t border-border-weak-base bg-surface-base px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button type="submit" disabled={store.saving || !store.name.trim()}>
            {store.saving
              ? mode() === "archive"
                ? language.t("store.capabilityDialog.content.uploading")
                : language.t("common.saving")
              : language.t("store.capabilityDialog.edit.submit")}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
