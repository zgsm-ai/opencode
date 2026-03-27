import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { itemApi, registryApi2, type CapabilityItem, type Repository } from "../lib/api"

type MoveCapabilityDialogProps = {
  item: CapabilityItem
  repositories: Repository[]
  onMoved?: (item: CapabilityItem) => void
}

const inputClass =
  "w-full h-9 rounded-md border border-border-weak-base bg-background-base px-3 text-sm text-text-strong outline-none focus:border-border-strong"

export function MoveCapabilityDialog(props: MoveCapabilityDialogProps) {
  const dialog = useDialog()
  const language = useLanguage()
  const [store, setStore] = createStore({
    namespace: props.item.registry?.repoId ? `repo:${props.item.registry.repoId}` : "public",
    saving: false,
    error: "",
    repoId: "",
  })

  const current = createMemo(() => props.item.repoName || "—")

  const targets = createMemo(() => props.repositories)

  const selected = createMemo(() => {
    if (store.repoId === "__public__") return null
    return targets().find((r) => r.id === store.repoId)
  })

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!store.repoId) return
    setStore("saving", true)
    setStore("error", "")
    try {
      let target = store.repoId
      if (target === "__public__") {
        const pub = await registryApi2.getPublic()
        target = pub.repoId
      }
      const updated = await itemApi.transfer(props.item.id, target)
      props.onMoved?.(updated)
      showToast({ title: language.t("store.capabilityDialog.toast.moved") })
      dialog.close()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStore("error", message)
      showToast({ title: language.t("store.capabilityDialog.toast.moveFailed"), description: message })
    } finally {
      setStore("saving", false)
    }
  }

  return (
    <Dialog title={language.t("store.capabilityDialog.move.title")} class="w-full max-w-[720px] mx-auto">
      <form onSubmit={handleSubmit} class="flex max-h-[calc(100vh-80px)] flex-col overflow-hidden">
        <div class="flex-1 overflow-y-auto px-6 pb-6 pt-2">
          {/* Capability info */}
          <div class="rounded-xl border border-border-weak-base bg-surface-raised-base px-5 py-4">
            <label class="mb-2 block text-12-medium text-text-weak">
              {language.t("store.capabilityDialog.move.currentCapability")}
            </label>
            <div class="flex items-center gap-2 text-sm text-text-strong">
              <span class="font-medium">{props.item.name}</span>
              <span class="text-text-weak">/</span>
              <span class="font-mono text-text-weak">{props.item.slug}</span>
            </div>
          </div>

          {/* Transfer direction */}
          <div class="mt-5 grid grid-cols-[1fr_auto_1fr] items-start gap-4">
            {/* Current repository */}
            <div class="rounded-xl border border-border-weak-base bg-surface-raised-base px-5 py-4">
              <label class="mb-2 block text-12-medium text-text-weak">
                {language.t("store.capabilityDialog.move.currentRepository")}
              </label>
              <div class="text-sm font-medium text-text-strong">{current()}</div>
            </div>

            {/* Arrow */}
            <div class="flex h-full items-center pt-6 text-icon-weak-base">
              <Icon name="chevron-right" size="small" />
            </div>

            {/* Target repository */}
            <div class="rounded-xl border border-border-weak-base bg-surface-raised-base px-5 py-4">
              <label class="mb-2 block text-12-medium text-text-weak">
                {language.t("store.capabilityDialog.move.targetRepository")}
              </label>
              <select
                value={store.repoId}
                onInput={(e) => setStore("repoId", e.currentTarget.value)}
                class={inputClass}
                required
              >
                <option value="" disabled>
                  {language.t("store.capabilityDialog.move.selectRepository")}
                </option>
                <option value="__public__">{language.t("store.capabilityDialog.visibility.public")}</option>
                <For each={targets()}>{(repo) => <option value={repo.id}>{repo.displayName || repo.name}</option>}</For>
              </select>
            </div>
          </div>

          <Show when={selected() || store.repoId === "__public__"}>
            <p class="mt-4 rounded-lg border border-border-weak-base bg-surface-raised-base px-4 py-3 text-12-regular text-text-weak">
              {language.t("store.capabilityDialog.move.transferHint", {
                name: props.item.name,
                repo:
                  store.repoId === "__public__"
                    ? language.t("store.capabilityDialog.visibility.public")
                    : selected()!.displayName || selected()!.name,
              })}
            </p>
          </Show>

          <Show when={store.error}>
            <p class="mt-4 text-12-regular text-icon-critical-base">{store.error}</p>
          </Show>
        </div>

        <div class="flex shrink-0 items-center justify-end gap-2 border-t border-border-weak-base bg-surface-base px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button type="submit" disabled={store.saving || !store.repoId}>
            {store.saving
              ? language.t("store.capabilityDialog.move.submitting")
              : language.t("store.capabilityDialog.move.submit")}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
