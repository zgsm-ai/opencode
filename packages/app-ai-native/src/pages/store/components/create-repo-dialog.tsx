import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { repoApi, type Repository } from "../lib/api"
import { Modal } from "@/components/modal"

type CreateRepoDialogProps = {
  userId: string
  onCreated?: (repo: Repository) => void
}

export function CreateRepoDialog(props: CreateRepoDialogProps) {
  const dialog = useDialog()
  const language = useLanguage()
  const [store, setStore] = createStore({
    name: "",
    displayName: "",
    description: "",
    visibility: "private" as "public" | "private",
    repoType: "normal" as "normal" | "sync",
    externalUrl: "",
    externalBranch: "main",
    syncEnabled: true,
    syncInterval: 86400,
    includePatterns:
      "skills/**/SKILL.md\ncommands/**/*.md\nagents/**/*.md\n.claude-plugin/plugin.json\nhooks/hooks.json\n.mcp.json",
    excludePatterns: "node_modules/**",
    conflictStrategy: "keep_remote" as "keep_remote" | "keep_local",
    saving: false,
    error: "",
  })

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!store.name.trim()) return

    if (store.repoType === "sync" && !store.externalUrl.trim()) {
      setStore("error", language.t("store.repoDialog.error.syncUrlRequired"))
      return
    }

    setStore("saving", true)
    setStore("error", "")

    try {
      const payload: Parameters<typeof repoApi.create>[0] = {
        name: store.name.trim(),
        displayName: store.displayName.trim() || store.name.trim(),
        description: store.description.trim(),
        visibility: store.visibility,
        ownerId: props.userId,
        repoType: store.repoType,
      }

      if (store.repoType === "sync") {
        payload.syncRegistries = [
          {
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
          },
        ]
      }

      const result = await repoApi.create(payload)
      const repo = "repository" in result ? result.repository : result
      props.onCreated?.(repo)
      showToast({ title: language.t("store.repoDialog.toast.created") })
      dialog.close()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStore("error", message)
      showToast({ title: language.t("store.repoDialog.toast.createFailed"), description: message })
    } finally {
      setStore("saving", false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Modal
        title={language.t("store.repoDialog.create.title")}
        maxWidth="860px"
        maxHeight="calc(100vh - 40px)"
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
                ? language.t("store.repoDialog.create.submitting")
                : language.t("store.repoDialog.create.submit")}
            </button>
          </>
        }
      >
        <div class="modal-section">
          <div class="modal-section-title">{language.t("store.repoDialog.create.info")}</div>
          <div class="modal-section-desc">
            {language.t("store.repoDialog.create.infoDescription")}
          </div>

          <div class="modal-row">
            <div class="modal-field" style={{ flex: "1" }}>
              <label class="modal-label">
                {language.t("store.repoDialog.field.name")} <span class="req">*</span>
              </label>
              <input
                autofocus
                value={store.name}
                onInput={(e) => setStore("name", e.currentTarget.value)}
                placeholder="team-space"
                class="modal-input"
                required
              />
            </div>
            <div class="modal-field" style={{ flex: "1" }}>
              <label class="modal-label">
                {language.t("store.repoDialog.field.displayName")}
              </label>
              <input
                value={store.displayName}
                onInput={(e) => setStore("displayName", e.currentTarget.value)}
                placeholder="Team Space"
                class="modal-input"
              />
            </div>
          </div>

          <div class="modal-field">
            <label class="modal-label">
              {language.t("store.repoDialog.field.description")}
            </label>
            <textarea
              value={store.description}
              onInput={(e) => setStore("description", e.currentTarget.value)}
              placeholder={language.t("store.repoDialog.field.descriptionPlaceholder")}
              class="modal-input"
            />
          </div>

          <div class="modal-row">
            <div class="modal-field" style={{ flex: "1" }}>
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
            <div class="modal-field" style={{ flex: "1" }}>
              <label class="modal-label">
                {language.t("store.repoDialog.field.repoType")}
              </label>
              <div class="modal-toggle-group">
                <button
                  type="button"
                  class={`modal-toggle ${store.repoType === "normal" ? "on" : ""}`}
                  onClick={() => setStore("repoType", "normal")}
                >
                  {language.t("store.repoDialog.repoType.normal")}
                </button>
                <button
                  type="button"
                  class={`modal-toggle ${store.repoType === "sync" ? "on" : ""}`}
                  onClick={() => setStore("repoType", "sync")}
                >
                  {language.t("store.repoDialog.repoType.sync")}
                </button>
              </div>
            </div>
          </div>
        </div>

        {store.repoType === "sync" ? (
          <div class="modal-section">
            <div class="modal-section-title">{language.t("store.sync.settings")}</div>
            <div class="modal-section-desc">{language.t("store.sync.settingsDescription")}</div>

            <div class="modal-field">
              <label class="modal-label">
                {language.t("store.sync.gitUrl")} <span class="req">*</span>
              </label>
              <input
                value={store.externalUrl}
                onInput={(e) => setStore("externalUrl", e.currentTarget.value)}
                placeholder="https://github.com/org/repo"
                class="modal-input"
                required={store.repoType === "sync"}
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
                onInput={(e) => setStore("conflictStrategy", e.currentTarget.value as "keep_remote" | "keep_local")}
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
