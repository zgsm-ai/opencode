import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { itemApi, registryApi2, type CapabilityItem, type Repository } from "../lib/api"
import { StoreDialog } from "./store-dialog"

type MoveCapabilityDialogProps = {
  item: CapabilityItem
  repositories: Repository[]
  onMoved?: (item: CapabilityItem) => void
}

export function MoveCapabilityDialog(props: MoveCapabilityDialogProps) {
  const dialog = useDialog()
  const language = useLanguage()
  const [store, setStore] = createStore({
    namespace: props.item.registry?.repoId ? `repo:${props.item.registry.repoId}` : "public",
    saving: false,
    error: "",
    repoId: "",
  })

  const current = createMemo(() => props.item.repoName || "\u2014")

  const targets = createMemo(() => props.repositories.filter((r) => r.id !== props.item.repoId))

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
    <form onSubmit={handleSubmit}>
      <StoreDialog
        title={language.t("store.capabilityDialog.move.title")}
        maxWidth="720px"
        maxHeight="520px"
        footer={
          <>
            <button class="store-modal-btn store-modal-btn-ghost" type="button" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </button>
            <button class="store-modal-btn store-modal-btn-primary" type="submit" disabled={store.saving || !store.repoId}>
              {store.saving
                ? language.t("store.capabilityDialog.move.submitting")
                : language.t("store.capabilityDialog.move.submit")}
            </button>
          </>
        }
      >
        {/* Capability info */}
        <div class="store-modal-section">
          <div class="store-modal-info-card">
            <label style={{ display: "block", "font-size": "0.6875rem", "font-weight": "600", color: "var(--st-text-secondary)", "margin-bottom": "0.5rem" }}>
              {language.t("store.capabilityDialog.move.currentCapability")}
            </label>
            <div style={{ display: "flex", "align-items": "center", gap: "0.5rem", "font-size": "0.8125rem", color: "var(--st-text)" }}>
              <span style={{ "font-weight": "600" }}>{props.item.name}</span>
              <span style={{ color: "var(--st-text-secondary)" }}>/</span>
              <span style={{ "font-family": "'SF Mono', 'Fira Code', monospace", color: "var(--st-text-secondary)" }}>{props.item.slug}</span>
            </div>
          </div>
        </div>

        {/* Transfer direction */}
        <div class="store-modal-section">
          <div style={{ display: "grid", "grid-template-columns": "1fr auto 1fr", "align-items": "stretch", gap: "1rem" }}>
            {/* Current repository */}
            <div class="store-modal-info-card" style={{ display: "flex", "flex-direction": "column" }}>
              <label style={{ display: "block", "font-size": "0.6875rem", "font-weight": "600", color: "var(--st-text-secondary)", "margin-bottom": "0.5rem" }}>
                {language.t("store.capabilityDialog.move.currentRepository")}
              </label>
              <div style={{ display: "flex", flex: "1", "align-items": "center", "font-size": "0.8125rem", "font-weight": "600", color: "var(--st-text)" }}>
                {current()}
              </div>
            </div>

            {/* Arrow */}
            <div style={{ display: "flex", "align-items": "center", color: "var(--st-text-secondary)" }}>
              <Icon name="chevron-right" size="small" />
            </div>

            {/* Target repository */}
            <div class="store-modal-info-card" style={{ display: "flex", "flex-direction": "column" }}>
              <label style={{ display: "block", "font-size": "0.6875rem", "font-weight": "600", color: "var(--st-text-secondary)", "margin-bottom": "0.5rem" }}>
                {language.t("store.capabilityDialog.move.targetRepository")}
              </label>
              <div style={{ display: "flex", flex: "1", "align-items": "center" }}>
                <select
                  value={store.repoId}
                  onInput={(e) => setStore("repoId", e.currentTarget.value)}
                  class="store-modal-input"
                  required
                >
                  <option value="" disabled>
                    {language.t("store.capabilityDialog.move.selectRepository")}
                  </option>
                  <Show when={!!props.item.repoId}>
                    <option value="__public__">{language.t("store.capabilityDialog.visibility.public")}</option>
                  </Show>
                  <For each={targets()}>
                    {(repo) => <option value={repo.id}>{repo.displayName || repo.name}</option>}
                  </For>
                </select>
              </div>
            </div>
          </div>

          <Show when={selected() || store.repoId === "__public__"}>
            <p class="store-modal-hint" style={{ "margin-top": "0.75rem", padding: "0.625rem 0.875rem", "border-radius": "var(--st-radius-sm, 0.5rem)", border: "1px solid color-mix(in srgb, var(--st-border-subtle) 12%, transparent)", background: "var(--st-surface-lowest)" }}>
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
            <p class="store-modal-error">{store.error}</p>
          </Show>
        </div>
      </StoreDialog>
    </form>
  )
}
