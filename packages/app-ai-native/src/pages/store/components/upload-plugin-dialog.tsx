import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { Show, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { pluginApi, type CapabilityItem } from "../lib/api"
import { Modal } from "@/components/modal"

type Props = {
  repoId: string
  onUploaded?: (item: CapabilityItem) => void
}

export function UploadPluginDialog(props: Props) {
  const dialog = useDialog()
  const language = useLanguage()
  const [store, setStore] = createStore({
    repoId: props.repoId,
    file: null as File | null,
    uploading: false,
    progress: 0,
    error: "",
    dragOver: false,
  })

  const validateFile = (file: File): string | null => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      return language.t("store.uploadPlugin.error.notZip") || "请上传 .zip 格式的压缩包"
    }
    if (file.size > 50 * 1024 * 1024) {
      return language.t("store.uploadPlugin.error.tooLarge") || "文件超过 50MB 限制"
    }
    return null
  }

  const handleFileSelect = (file: File) => {
    const err = validateFile(file)
    if (err) {
      setStore("error", err)
      setStore("file", null)
      return
    }
    setStore("file", file)
    setStore("error", "")
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setStore("dragOver", false)
    if (e.dataTransfer?.files.length) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    if (!store.file || store.uploading) return

    setStore("uploading", true)
    setStore("error", "")
    setStore("progress", 0)

    try {
      const item = await pluginApi.upload(store.repoId, store.file, (p) => {
        setStore("progress", p)
      })
      showToast({
        title: language.t("store.uploadPlugin.success") || "Plugin 上传成功",
      })
      props.onUploaded?.(item)
      dialog.close()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStore("error", message)
      showToast({
        variant: "error",
        title: language.t("store.uploadPlugin.failed") || "上传失败",
        description: message,
      })
    } finally {
      setStore("uploading", false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Modal
        title={language.t("store.uploadPlugin.title") || "上传 Plugin"}
        maxWidth="520px"
        footer={
          <>
            <button class="modal-btn modal-btn-ghost" type="button" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </button>
            <button
              class="modal-btn modal-btn-primary"
              type="submit"
              disabled={store.uploading || !store.file}
            >
              {store.uploading
                ? `${language.t("common.uploading") || "上传中"} ${Math.round(store.progress * 100)}%`
                : language.t("store.uploadPlugin.submit") || "上传"}
            </button>
          </>
        }
      >
        <div class="space-y-4">
          {/* Drag & Drop area */}
          <div
            class={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
              store.dragOver
                ? "border-[var(--native-primary)] bg-[color-mix(in_srgb,var(--native-primary)_8%,transparent)]"
                : "border-border-weak-base"
            }`}
            onDragOver={(e) => { e.preventDefault(); setStore("dragOver", true) }}
            onDragLeave={() => setStore("dragOver", false)}
            onDrop={handleDrop}
          >
            <Show
              when={store.file}
              fallback={
                <>
                  <Icon name="cloud-upload" class="mx-auto mb-2 text-text-weak" />
                  <p class="text-12-regular text-text-weak">
                    {language.t("store.uploadPlugin.dragHint") || "拖拽文件到此处，或"}
                    <label class="cursor-pointer text-[var(--native-primary)] hover:underline">
                      {language.t("store.uploadPlugin.clickSelect") || "点击选择"}
                      <input
                        type="file"
                        accept=".zip"
                        class="hidden"
                        onChange={(e) => {
                          const f = e.currentTarget.files?.[0]
                          if (f) handleFileSelect(f)
                        }}
                      />
                    </label>
                  </p>
                  <p class="mt-1 text-[11px] text-text-weak">
                    {language.t("store.uploadPlugin.sizeHint") || "仅支持 .zip，最大 50MB"}
                  </p>
                </>
              }
            >
              <div class="flex items-center justify-center gap-2">
                <Icon name="folder" class="text-text-strong" />
                <span class="text-12-regular text-text-strong">{store.file!.name}</span>
                <button
                  type="button"
                  class="text-text-weak hover:text-text-strong"
                  onClick={() => setStore("file", null)}
                >
                  <Icon name="close" size="small" />
                </button>
              </div>
            </Show>
          </div>

          {/* Progress bar */}
          <Show when={store.uploading}>
            <div class="h-1.5 w-full overflow-hidden rounded-full bg-bg-muted">
              <div
                class="h-full rounded-full bg-[var(--native-primary)] transition-all"
                style={{ width: `${store.progress * 100}%` }}
              />
            </div>
          </Show>

          {/* Error */}
          <Show when={store.error}>
            <p class="text-12-regular text-[var(--native-error)]">{store.error}</p>
          </Show>
        </div>
      </Modal>
    </form>
  )
}
