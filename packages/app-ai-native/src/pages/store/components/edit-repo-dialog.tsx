import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { createEffect } from "solid-js"
import { createStore } from "solid-js/store"
import { repoApi, repoRegistryApi, type CapabilityRegistry, type Repository } from "../lib/api"

const inputClass =
  "w-full h-9 rounded-md border border-border-weak-base bg-background-base px-3 text-sm text-text-strong outline-none focus:border-border-strong"

const textAreaClass =
  "w-full min-h-[84px] rounded-md border border-border-weak-base bg-background-base px-3 py-2 text-sm text-text-strong outline-none focus:border-border-strong resize-y"

const monoTextAreaClass = `${textAreaClass} font-mono`

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
    <Dialog title={language.t("store.repoDialog.edit.title")} class="w-full max-w-[640px] mx-auto">
      <form onSubmit={handleSubmit} class="flex max-h-[calc(100vh-120px)] flex-col overflow-hidden">
        <div class="flex-1 overflow-y-auto px-6 pb-6 pt-2 space-y-4">
          <div>
            <label class="mb-2 block text-12-medium text-text-strong">
              {language.t("store.repoDialog.field.name")}
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
              {language.t("store.repoDialog.field.displayName")}
            </label>
            <input
              value={store.displayName}
              onInput={(e) => setStore("displayName", e.currentTarget.value)}
              class={inputClass}
            />
          </div>

          <div>
            <label class="mb-2 block text-12-medium text-text-strong">
              {language.t("store.repoDialog.field.description")}
            </label>
            <textarea
              value={store.description}
              onInput={(e) => setStore("description", e.currentTarget.value)}
              class={textAreaClass}
            />
          </div>

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

          {props.repo.repoType === "sync" ? (
            <div class="rounded-xl border border-border-weak-base bg-surface-raised-base px-4 py-4 space-y-4">
              <div>
                <div class="text-12-medium text-text-strong">{language.t("store.sync.settings")}</div>
                <div class="mt-1 text-12-regular text-text-weak">{language.t("store.sync.settingsDescription")}</div>
              </div>

              <div>
                <label class="mb-2 block text-12-medium text-text-strong">{language.t("store.sync.gitUrl")}</label>
                <input
                  value={store.externalUrl}
                  onInput={(e) => setStore("externalUrl", e.currentTarget.value)}
                  placeholder="https://github.com/org/repo"
                  class={inputClass}
                />
              </div>

              <div class="grid gap-4 md:grid-cols-2">
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
                  <label class="mb-2 block text-12-medium text-text-strong">{language.t("store.sync.interval")}</label>
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

              <label class="flex items-center gap-2 text-12-medium text-text-strong">
                <input
                  type="checkbox"
                  checked={store.syncEnabled}
                  onChange={(e) => setStore("syncEnabled", e.currentTarget.checked)}
                />
                {language.t("store.sync.enableAuto")}
              </label>

              <div class="grid gap-4 md:grid-cols-2">
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

              <div class="max-w-[240px]">
                <label class="mb-2 block text-12-medium text-text-strong">
                  {language.t("store.sync.conflictStrategy")}
                </label>
                <select
                  value={store.conflictStrategy}
                  onInput={(e) => setStore("conflictStrategy", e.currentTarget.value)}
                  class={inputClass}
                >
                  <option value="keep_remote">{language.t("store.sync.conflict.keepRemote")}</option>
                  <option value="keep_local">{language.t("store.sync.conflict.keepLocal")}</option>
                </select>
              </div>
            </div>
          ) : null}

          {store.error ? <p class="text-12-regular text-icon-critical-base">{store.error}</p> : null}
        </div>

        <div class="flex shrink-0 items-center justify-end gap-2 border-t border-border-weak-base bg-surface-base px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button type="submit" disabled={store.saving || !store.name.trim()}>
            {store.saving ? language.t("common.saving") : language.t("store.capabilityDialog.edit.submit")}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
