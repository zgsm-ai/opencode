import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { Show, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { itemApi, type CapabilityItem } from "../lib/api"
import { Modal } from "@/components/modal"

type Props = {
  itemId: string
  itemName: string
  onSuccess?: (item: CapabilityItem) => void
}

export function BuiltinContentDialog(props: Props) {
  const dialog = useDialog()
  const language = useLanguage()
  const [store, setStore] = createStore({
    file: null as File | null,
    fileContent: "",
    uploading: false,
    dragOver: false,
    error: "",
  })

  const validateFile = (file: File): string | null => {
    if (!file.name.toLowerCase().endsWith(".md")) {
      return "请上传 .md 格式的 Markdown 文件"
    }
    if (file.size > 5 * 1024 * 1024) {
      return "文件超过 5MB 限制"
    }
    return null
  }

  const readFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(String(e.target?.result ?? ""))
      reader.onerror = () => reject(new Error("读取文件失败"))
      reader.readAsText(file)
    })
  }

  const handleFileSelect = async (file: File) => {
    const err = validateFile(file)
    if (err) {
      setStore("error", err)
      setStore("file", null)
      setStore("fileContent", "")
      return
    }
    setStore("file", file)
    setStore("error", "")
    try {
      const content = await readFile(file)
      setStore("fileContent", content)
    } catch {
      setStore("error", "读取文件失败")
      setStore("fileContent", "")
    }
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setStore("dragOver", false)
    if (e.dataTransfer?.files.length) {
      void handleFileSelect(e.dataTransfer.files[0])
    }
  }

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    if (!store.file || store.uploading) return

    setStore("uploading", true)
    setStore("error", "")

    try {
      const item = await itemApi.update(props.itemId, {
        isBuiltIn: true,
        content: store.fileContent,
      })
      showToast({
        variant: "success",
        title: language.t("store.detail.setBuiltInSuccess") || "已设为内置 Plugin",
      })
      props.onSuccess?.(item)
      dialog.close()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStore("error", message)
      showToast({
        variant: "error",
        title: language.t("store.detail.toggleBuiltInFailed") || "设置失败",
        description: message,
      })
    } finally {
      setStore("uploading", false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Modal
        title={`设置 "${props.itemName}" 为内置`}
        maxWidth="520px"
        footer={
          <>
            <button class="modal-btn modal-btn-ghost" type="button" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </button>
            <button
              class="modal-btn modal-btn-primary"
              type="submit"
              disabled={store.uploading || !store.fileContent}
            >
              {store.uploading
                ? language.t("common.loading") || "保存中"
                : language.t("common.confirm") || "确认设为内置"}
            </button>
          </>
        }
      >
        <div class="space-y-4">
          <p class="text-12-regular text-text-weak">
            请上传一个 Markdown 文件作为该内置 Plugin 的展示内容。
          </p>

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
                    拖拽 Markdown 文件到此处，或
                    <label class="cursor-pointer text-[var(--native-primary)] hover:underline">
                      点击选择
                      <input
                        type="file"
                        accept=".md"
                        class="hidden"
                        onChange={(e) => {
                          const f = e.currentTarget.files?.[0]
                          if (f) void handleFileSelect(f)
                        }}
                      />
                    </label>
                  </p>
                  <p class="mt-1 text-[11px] text-text-weak">仅支持 .md，最大 5MB</p>
                </>
              }
            >
              <div class="flex items-center justify-center gap-2">
                <Icon name="folder" class="text-text-strong" />
                <span class="text-12-regular text-text-strong">{store.file!.name}</span>
                <button
                  type="button"
                  class="text-text-weak hover:text-text-strong"
                  onClick={() => {
                    setStore("file", null)
                    setStore("fileContent", "")
                  }}
                >
                  <Icon name="close" size="small" />
                </button>
              </div>
            </Show>
          </div>

          {/* Content preview */}
          <Show when={store.fileContent}>
            <div class="thin-scrollbar max-h-[12rem] overflow-y-auto rounded-lg border border-border-weak-base bg-bg-muted/50 px-4 py-3">
              <pre class="text-11-mono whitespace-pre-wrap text-text-weak">{store.fileContent.slice(0, 500)}{store.fileContent.length > 500 ? "..." : ""}</pre>
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
