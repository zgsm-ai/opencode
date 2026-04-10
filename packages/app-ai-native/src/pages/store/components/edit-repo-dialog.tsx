import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { createEffect } from "solid-js"
import { createStore } from "solid-js/store"
import { repoApi, repoRegistryApi, type CapabilityRegistry, type Repository } from "../lib/api"
import { Modal } from "@/components/modal"

type EditRepoDialogProps = {
  repo: Repository
  onSaved?: (repo: Repository) => void
}

export function EditRepoDialog(props: EditRepoDialogProps) {
  const dialog = useDialog()
  const language = useLanguage()
  const [store, setStore] = createStore({
    name: props.repo.name,
    displayName: props.repo.displayName || props.repo.name,
    description: props.repo.description || "",
    visibility: props.repo.visibility,
    saving: false,
    error: "",
    registry: null as CapabilityRegistry | null,
    loadingRegistry: false,
    externalUrl: "",
    externalBranch: "main",
    syncEnabled: true,
    syncInterval: 86400,
    includePatterns:
      "skills/**/SKILL.md\ncommands/**/*.md\nagents/**/*.md\n.claude-plugin/plugin.json\nhooks/hooks.json\n.mcp.json",
    excludePatterns: "node_modules/**",
    conflictStrategy: "keep_remote",
  })

  createEffect(() => {
    if (props.repo.repoType !== "sync") return
    setStore("loadingRegistry", true)
    repoRegistryApi
      .list(props.repo.id)
      .then((res) => {
        const reg = res.registries[0] ?? null
        if (!reg) return
        setStore({
          registry: reg,
          externalUrl: reg.externalUrl || "",
          externalBranch: reg.externalBranch || "main",
          syncEnabled: reg.syncEnabled ?? true,
          syncInterval: reg.syncInterval ?? 86400,
          includePatterns:
            (reg.syncConfig?.includePatterns as string[] | undefined)?.join("\n") ??
            "skills/**/SKILL.md\ncommands/**/*.md\nagents/**/*.md\n.claude-plugin/plugin.json\nhooks/hooks.json\n.mcp.json",
          excludePatterns: (reg.syncConfig?.excludePatterns as string[] | undefined)?.join("\n") ?? "node_modules/**",
          conflictStrategy: (reg.syncConfig?.conflictStrategy as string | undefined) ?? "keep_remote",
        })
      })
      .catch(() => {})
      .finally(() => setStore("loadingRegistry", false))
  })

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!store.name.trim()) return

    setStore("saving", true)
    setStore("error", "")

    try {
      const updated = await repoApi.update(props.repo.id, {
        name: store.name.trim(),
        displayName: store.displayName.trim() || store.name.trim(),
        description: store.description.trim(),
        visibility: store.visibility,
      })

      if (props.repo.repoType === "sync" && store.registry) {
        await repoRegistryApi.update(props.repo.id, store.registry.id, {
          externalUrl: store.externalUrl.trim(),
          externalBranch: store.externalBranch.trim() || "main",
          syncEnabled: store.syncEnabled,
          syncInterval: store.syncInterval,
          includePatterns: store.includePatterns
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          excludePatterns: store.excludePatterns
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          conflictStrategy: store.conflictStrategy,
        })
      }

      props.onSaved?.(updated)
      showToast({ title: language.t("store.repoDialog.toast.updated") })
      dialog.close()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStore("error", message)
      showToast({ title: language.t("store.repoDialog.toast.updateFailed"), description: message })
    } finally {
      setStore("saving", false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Modal
        title={language.t("store.repoDialog.edit.title")}
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
              {store.saving ? language.t("common.saving") : language.t("store.capabilityDialog.edit.submit")}
            </button>
          </>
        }
      >
        <div class="modal-section">
          <div class="modal-field">
            <label class="modal-label">
              {language.t("store.repoDialog.field.name")} <span class="req">*</span>
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
              {language.t("store.repoDialog.field.displayName")}
            </label>
            <input
              value={store.displayName}
              onInput={(e) => setStore("displayName", e.currentTarget.value)}
              class="modal-input"
            />
          </div>

          <div class="modal-field">
            <label class="modal-label">
              {language.t("store.repoDialog.field.description")}
            </label>
            <textarea
              value={store.description}
              onInput={(e) => setStore("description", e.currentTarget.value)}
              class="modal-input"
            />
          </div>

          <div class="modal-field">
            <label class="modal-label">
              {language.t("store.repoDialog.field.visibility")}
            </label>
            <select
              value={store.visibility}
              onInput={(e) => setStore("visibility", e.currentTarget.value as "public" | "private")}
              class="modal-input"
            >
              <option value="private">{language.t("store.capabilityDialog.visibility.private")}</option>
              <option value="public">{language.t("store.capabilityDialog.visibility.public")}</option>
            </select>
          </div>
        </div>

        {props.repo.repoType === "sync" ? (
          <div class="modal-section">
            <div class="modal-section-title">{language.t("store.sync.settings")}</div>
            <div class="modal-section-desc">{language.t("store.sync.settingsDescription")}</div>

            <div class="modal-field">
              <label class="modal-label">{language.t("store.sync.gitUrl")}</label>
              <input
                value={store.externalUrl}
                onInput={(e) => setStore("externalUrl", e.currentTarget.value)}
                placeholder="https://github.com/org/repo"
                class="modal-input"
              />
            </div>

            <div class="modal-row">
              <div class="modal-field" style={{ flex: "1" }}>
                <label class="modal-label">{language.t("store.sync.branch")}</label>
                <input
                  value={store.externalBranch}
                  onInput={(e) => setStore("externalBranch", e.currentTarget.value)}
                  placeholder="main"
                  class="modal-input"
                />
              </div>
              <div class="modal-field" style={{ flex: "1" }}>
                <label class="modal-label">{language.t("store.sync.interval")}</label>
                <select
                  value={String(store.syncInterval)}
                  onInput={(e) => setStore("syncInterval", Number(e.currentTarget.value))}
                  class="modal-input"
                >
                  <option value="3600">{language.t("store.sync.interval.hour")}</option>
                  <option value="21600">{language.t("store.sync.interval.6hours")}</option>
                  <option value="86400">{language.t("store.sync.interval.day")}</option>
                </select>
              </div>
            </div>

            <div class="modal-field">
              <label class="modal-checkbox">
                <input
                  type="checkbox"
                  checked={store.syncEnabled}
                  onChange={(e) => setStore("syncEnabled", e.currentTarget.checked)}
                />
                {language.t("store.sync.enableAuto")}
              </label>
            </div>

            <div class="modal-row">
              <div class="modal-field" style={{ flex: "1" }}>
                <label class="modal-label">
                  {language.t("store.sync.includePatterns")}
                </label>
                <textarea
                  value={store.includePatterns}
                  onInput={(e) => setStore("includePatterns", e.currentTarget.value)}
                  class="modal-input"
                  style={{ "font-family": "'SF Mono', 'Fira Code', monospace" }}
                />
              </div>
              <div class="modal-field" style={{ flex: "1" }}>
                <label class="modal-label">
                  {language.t("store.sync.excludePatterns")}
                </label>
                <textarea
                  value={store.excludePatterns}
                  onInput={(e) => setStore("excludePatterns", e.currentTarget.value)}
                  class="modal-input"
                  style={{ "font-family": "'SF Mono', 'Fira Code', monospace" }}
                />
              </div>
            </div>

            <div class="modal-field" style={{ "max-width": "240px" }}>
              <label class="modal-label">
                {language.t("store.sync.conflictStrategy")}
              </label>
              <select
                value={store.conflictStrategy}
                onInput={(e) => setStore("conflictStrategy", e.currentTarget.value)}
                class="modal-input"
              >
                <option value="keep_remote">{language.t("store.sync.conflict.keepRemote")}</option>
                <option value="keep_local">{language.t("store.sync.conflict.keepLocal")}</option>
              </select>
            </div>
          </div>
        ) : null}

        {store.error ? <p class="modal-error">{store.error}</p> : null}
      </Modal>
    </form>
  )
}
