import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { repoApi, type Repository } from "../lib/api"

const inputClass =
  "w-full h-9 rounded-md border border-border-weak-base bg-background-base px-3 text-sm text-text-strong outline-none focus:border-border-strong"

const textAreaClass =
  "w-full min-h-[84px] rounded-md border border-border-weak-base bg-background-base px-3 py-2 text-sm text-text-strong outline-none focus:border-border-strong resize-y"

const monoTextAreaClass = `${textAreaClass} font-mono`

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
    <Dialog title={language.t("store.repoDialog.create.title")} class="w-full max-w-[720px] mx-auto">
      <form onSubmit={handleSubmit} class="flex max-h-[calc(100vh-120px)] flex-col overflow-hidden">
        <div class="flex-1 overflow-y-auto px-6 pb-6 pt-2">
          <div class="rounded-xl border border-border-weak-base bg-surface-raised-base">
            <div class="border-b border-border-weak-base px-4 py-4">
              <div class="text-14-medium text-text-strong">{language.t("store.repoDialog.create.info")}</div>
              <div class="mt-1 text-12-regular text-text-weak">
                {language.t("store.repoDialog.create.infoDescription")}
              </div>
            </div>

            <div class="grid gap-4 border-b border-border-weak-base px-4 py-4 md:grid-cols-2">
              <div>
                <label class="mb-2 block text-12-medium text-text-strong">
                  {language.t("store.repoDialog.field.name")} <span class="text-icon-info-base">*</span>
                </label>
                <input
                  autofocus
                  value={store.name}
                  onInput={(e) => setStore("name", e.currentTarget.value)}
                  placeholder="team-repo"
                  class={inputClass}
                  required
                />
              </div>
              <div>
                <label class="mb-2 block text-12-medium text-text-strong">
                  {language.t("store.repoDialog.field.displayName")}
                </label>
                <input
                  value={store.displayName}
                  onInput={(e) => setStore("displayName", e.currentTarget.value)}
                  placeholder="Team Repository"
                  class={inputClass}
                />
              </div>
            </div>

            <div class="border-b border-border-weak-base px-4 py-4">
              <label class="mb-2 block text-12-medium text-text-strong">
                {language.t("store.repoDialog.field.description")}
              </label>
              <textarea
                value={store.description}
                onInput={(e) => setStore("description", e.currentTarget.value)}
                placeholder={language.t("store.repoDialog.field.descriptionPlaceholder")}
                class={textAreaClass}
              />
            </div>

            <div class="grid gap-4 border-b border-border-weak-base px-4 py-4 md:grid-cols-2">
              <div>
                <label class="mb-2 block text-12-medium text-text-strong">
                  {language.t("store.repoDialog.field.visibility")}
                </label>
                <select
                  value={store.visibility}
                  onInput={(e) => setStore("visibility", e.currentTarget.value as "public" | "private")}
                  class={inputClass}
                >
                  <option value="private">{language.t("store.capabilityDialog.visibility.private")}</option>
                  <option value="public">{language.t("store.capabilityDialog.visibility.public")}</option>
                </select>
              </div>
              <div>
                <label class="mb-2 block text-12-medium text-text-strong">
                  {language.t("store.repoDialog.field.repoType")}
                </label>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    class="rounded-md border px-3 py-2 text-sm"
                    classList={{
                      "border-border-weak-base text-text-weak": store.repoType !== "normal",
                      "border-border-strong bg-surface-info-base/20 text-text-strong": store.repoType === "normal",
                    }}
                    onClick={() => setStore("repoType", "normal")}
                  >
                    {language.t("store.repoDialog.repoType.normal")}
                  </button>
                  <button
                    type="button"
                    class="rounded-md border px-3 py-2 text-sm"
                    classList={{
                      "border-border-weak-base text-text-weak": store.repoType !== "sync",
                      "border-border-strong bg-surface-info-base/20 text-text-strong": store.repoType === "sync",
                    }}
                    onClick={() => setStore("repoType", "sync")}
                  >
                    {language.t("store.repoDialog.repoType.sync")}
                  </button>
                </div>
              </div>
            </div>

            {store.repoType === "sync" ? (
              <div class="px-4 py-4">
                <div class="text-12-medium text-text-strong">{language.t("store.sync.settings")}</div>
                <div class="mt-1 text-12-regular text-text-weak">{language.t("store.sync.settingsDescription")}</div>

                <div class="mt-4 grid gap-4 md:grid-cols-2">
                  <div class="md:col-span-2">
                    <label class="mb-2 block text-12-medium text-text-strong">
                      {language.t("store.sync.gitUrl")} <span class="text-icon-info-base">*</span>
                    </label>
                    <input
                      value={store.externalUrl}
                      onInput={(e) => setStore("externalUrl", e.currentTarget.value)}
                      placeholder="https://github.com/org/repo"
                      class={inputClass}
                      required={store.repoType === "sync"}
                    />
                  </div>
                  <div>
                    <label class="mb-2 block text-12-medium text-text-strong">{language.t("store.sync.branch")}</label>
                    <input
                      value={store.externalBranch}
                      onInput={(e) => setStore("externalBranch", e.currentTarget.value)}
                      placeholder="main"
                      class={inputClass}
                    />
                  </div>
                  <div>
                    <label class="mb-2 block text-12-medium text-text-strong">
                      {language.t("store.sync.interval")}
                    </label>
                    <select
                      value={String(store.syncInterval)}
                      onInput={(e) => setStore("syncInterval", Number(e.currentTarget.value))}
                      class={inputClass}
                    >
                      <option value="3600">{language.t("store.sync.interval.hour")}</option>
                      <option value="21600">{language.t("store.sync.interval.6hours")}</option>
                      <option value="86400">{language.t("store.sync.interval.day")}</option>
                    </select>
                  </div>
                </div>

                <label class="mt-4 flex items-center gap-2 text-12-medium text-text-strong">
                  <input
                    type="checkbox"
                    checked={store.syncEnabled}
                    onChange={(e) => setStore("syncEnabled", e.currentTarget.checked)}
                  />
                  {language.t("store.sync.enableAuto")}
                </label>

                <div class="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label class="mb-2 block text-12-medium text-text-strong">
                      {language.t("store.sync.includePatterns")}
                    </label>
                    <textarea
                      value={store.includePatterns}
                      onInput={(e) => setStore("includePatterns", e.currentTarget.value)}
                      class={monoTextAreaClass}
                    />
                  </div>
                  <div>
                    <label class="mb-2 block text-12-medium text-text-strong">
                      {language.t("store.sync.excludePatterns")}
                    </label>
                    <textarea
                      value={store.excludePatterns}
                      onInput={(e) => setStore("excludePatterns", e.currentTarget.value)}
                      class={monoTextAreaClass}
                    />
                  </div>
                </div>

                <div class="mt-4 max-w-[240px]">
                  <label class="mb-2 block text-12-medium text-text-strong">
                    {language.t("store.sync.conflictStrategy")}
                  </label>
                  <select
                    value={store.conflictStrategy}
                    onInput={(e) => setStore("conflictStrategy", e.currentTarget.value as "keep_remote" | "keep_local")}
                    class={inputClass}
                  >
                    <option value="keep_remote">{language.t("store.sync.conflict.keepRemote")}</option>
                    <option value="keep_local">{language.t("store.sync.conflict.keepLocal")}</option>
                  </select>
                </div>
              </div>
            ) : null}
          </div>

          {store.error ? <p class="mt-4 text-12-regular text-icon-critical-base">{store.error}</p> : null}
        </div>

        <div class="flex shrink-0 items-center justify-end gap-2 border-t border-border-weak-base bg-surface-base px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button type="submit" disabled={store.saving || !store.name.trim()}>
            {store.saving
              ? language.t("store.repoDialog.create.submitting")
              : language.t("store.repoDialog.create.submit")}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
