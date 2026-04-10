import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { For, Show, createEffect } from "solid-js"
import { createStore } from "solid-js/store"
import { repoRegistryApi, syncApi, type CapabilityRegistry } from "../lib/api"
import { useLanguage } from "@/context/language"
import { ConfirmDialog } from "./confirm-dialog"

const inputClass =
  "w-full h-8 rounded-md border border-border-weak-base bg-background-base px-3 text-sm text-text-strong outline-none focus:border-border-strong"

const textAreaClass =
  "w-full min-h-[72px] rounded-md border border-border-weak-base bg-background-base px-3 py-2 text-sm font-mono text-text-strong outline-none focus:border-border-strong resize-y"

type RepoSyncTabProps = { repoId: string }

export function RepoSyncTab(props: RepoSyncTabProps) {
  const [store, setStore] = createStore({
    registries: [] as CapabilityRegistry[],
    loading: true,
    adding: false,
    saving: false,
    error: "",
    externalUrl: "",
    externalBranch: "main",
    syncEnabled: true,
    syncInterval: 86400,
    includePatterns:
      "skills/**/SKILL.md\ncommands/**/*.md\nagents/**/*.md\n.claude-plugin/plugin.json\nhooks/hooks.json\n.mcp.json",
    excludePatterns: "node_modules/**",
    conflictStrategy: "keep_remote",
  })
  const language = useLanguage()
  const dialog = useDialog()

  async function loadRegistries() {
    setStore("loading", true)
    setStore("error", "")
    try {
      const res = await repoRegistryApi.list(props.repoId)
      setStore("registries", res.registries ?? [])
    } catch (error) {
      setStore("error", error instanceof Error ? error.message : String(error))
    } finally {
      setStore("loading", false)
    }
  }

  createEffect(() => {
    props.repoId
    void loadRegistries()
  })

  async function handleAddRegistry(e: SubmitEvent) {
    e.preventDefault()
    if (!store.externalUrl.trim()) return
    setStore("saving", true)
    try {
      await repoRegistryApi.add(props.repoId, {
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
      showToast({ title: language.t("store.sync.toast.added") })
      setStore({
        adding: false,
        externalUrl: "",
        externalBranch: "main",
        syncEnabled: true,
        syncInterval: 86400,
        includePatterns:
          "skills/**/SKILL.md\ncommands/**/*.md\nagents/**/*.md\n.claude-plugin/plugin.json\nhooks/hooks.json\n.mcp.json",
        excludePatterns: "node_modules/**",
        conflictStrategy: "keep_remote",
      })
      void loadRegistries()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStore("error", message)
      showToast({ title: language.t("store.sync.toast.addFailed"), description: message })
    } finally {
      setStore("saving", false)
    }
  }

  async function toggleRegistry(registry: CapabilityRegistry, enabled: boolean) {
    try {
      await repoRegistryApi.update(props.repoId, registry.id, { syncEnabled: enabled })
      setStore("registries", (items) =>
        items.map((item) => (item.id === registry.id ? { ...item, syncEnabled: enabled } : item)),
      )
      showToast({ title: enabled ? language.t("store.sync.toast.enabled") : language.t("store.sync.toast.disabled") })
    } catch (error) {
      showToast({
        title: language.t("store.sync.toast.updateFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async function runSync(registryId: string) {
    try {
      await syncApi.triggerRepoSync(props.repoId, false, registryId)
      showToast({ title: language.t("store.sync.toast.started") })
      void loadRegistries()
    } catch (error) {
      showToast({
        title: language.t("store.sync.toast.startFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  function removeRegistry(registryId: string) {
    dialog.show(() => (
      <ConfirmDialog
        title={language.t("common.delete")}
        description={language.t("store.sync.confirmRemove")}
        confirm={language.t("common.delete")}
        onConfirm={async () => {
          await repoRegistryApi.remove(props.repoId, registryId)
          setStore("registries", (items) => items.filter((item) => item.id !== registryId))
          showToast({ title: language.t("store.sync.toast.removed") })
        }}
      />
    ))
  }

  return (
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm text-text-strong">{language.t("store.sync.title")}</div>
          <div class="text-12-regular text-text-weak">{language.t("store.sync.description")}</div>
        </div>
      </div>

      <Show when={false}>
        <form
          onSubmit={handleAddRegistry}
          class="rounded-lg border border-border-weak-base bg-surface-raised-base p-3 space-y-3"
        >
          <div>
            <label class="mb-1 block text-12-regular text-text-strong">{language.t("store.sync.gitUrl")}</label>
            <input
              value={store.externalUrl}
              onInput={(e) => setStore("externalUrl", e.currentTarget.value)}
              placeholder="https://github.com/org/repo"
              class={inputClass}
              required
            />
          </div>
          <div class="grid gap-3 md:grid-cols-3">
            <div>
              <label class="mb-1 block text-12-regular text-text-strong">{language.t("store.sync.branch")}</label>
              <input
                value={store.externalBranch}
                onInput={(e) => setStore("externalBranch", e.currentTarget.value)}
                class={inputClass}
              />
            </div>
            <div>
              <label class="mb-1 block text-12-regular text-text-strong">{language.t("store.sync.interval")}</label>
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
            <div>
              <label class="mb-1 block text-12-regular text-text-strong">{language.t("store.sync.conflict")}</label>
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
          <label class="flex items-center gap-2 text-12-regular text-text-strong">
            <input
              type="checkbox"
              checked={store.syncEnabled}
              onChange={(e) => setStore("syncEnabled", e.currentTarget.checked)}
            />
            {language.t("store.sync.enableAuto")}
          </label>
          <div class="grid gap-3 md:grid-cols-2">
            <div>
              <label class="mb-1 block text-12-regular text-text-strong">
                {language.t("store.sync.includePatterns")}
              </label>
              <textarea
                value={store.includePatterns}
                onInput={(e) => setStore("includePatterns", e.currentTarget.value)}
                class={textAreaClass}
              />
            </div>
            <div>
              <label class="mb-1 block text-12-regular text-text-strong">
                {language.t("store.sync.excludePatterns")}
              </label>
              <textarea
                value={store.excludePatterns}
                onInput={(e) => setStore("excludePatterns", e.currentTarget.value)}
                class={textAreaClass}
              />
            </div>
          </div>
          <div class="flex justify-end">
            <Button type="submit" size="small" disabled={store.saving || !store.externalUrl.trim()}>
              {store.saving ? language.t("common.saving") : language.t("store.sync.addRegistry")}
            </Button>
          </div>
        </form>
      </Show>

      <Show
        when={!store.loading}
        fallback={<div class="text-12-regular text-text-weak">{language.t("store.sync.loading")}</div>}
      >
        <Show
          when={store.registries.length > 0}
          fallback={<div class="text-12-regular text-text-weak">{language.t("store.sync.empty")}</div>}
        >
          <div class="space-y-2">
            <For each={store.registries}>
              {(registry) => (
                <div class="rounded-lg border border-border-weak-base bg-surface-raised-base p-3">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <Tooltip value={registry.externalUrl} placement="top">
                        <div class="truncate text-sm text-text-strong">{registry.externalUrl}</div>
                      </Tooltip>
                      <div class="mt-1 text-12-regular text-text-weak">
                        {registry.externalBranch || "main"} · {registry.syncStatus || "idle"}
                      </div>
                    </div>
                    <div class="flex items-center gap-2">
                      <label class="flex items-center gap-1 text-12-regular text-text-weak">
                        <input
                          type="checkbox"
                          checked={registry.syncEnabled}
                          onChange={(e) => void toggleRegistry(registry, e.currentTarget.checked)}
                        />
                        {language.t("store.sync.auto")}
                      </label>
                      <Button
                        class="cursor-pointer"
                        size="small"
                        variant="ghost"
                        onClick={() => void runSync(registry.id)}
                      >
                        {language.t("store.sync.syncNow")}
                      </Button>
                      <Button
                        class="cursor-pointer"
                        size="small"
                        variant="ghost"
                        onClick={() => removeRegistry(registry.id)}
                      >
                        {language.t("store.sync.remove")}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>

      {store.error ? <p class="text-12-regular text-icon-critical-base">{store.error}</p> : null}
    </div>
  )
}
