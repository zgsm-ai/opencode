import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Select } from "@opencode-ai/ui/select"
import { showToast } from "@opencode-ai/ui/toast"
import { createMemo, createSignal, createEffect } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useAuth } from "../hooks/use-auth"
import { useRepoFilter } from "../context/repo-filter"
import { typeKey, categoryKey } from "../lib/constants"
import { itemApi, repoApi, registryApi2, type Repository } from "../lib/api"
import type { ContentMode } from "../lib/content"
import { canArchive, contentValue, usableMode } from "../lib/content"

const CATEGORIES = [
  "developer-tools",
  "database",
  "file-system",
  "cloud-infrastructure",
  "productivity",
  "ai-task-management",
  "web-search",
  "browser-automation",
  "version-control",
  "api-development",
  "utilities",
  "other",
] as const

const TYPE_PREFIX: Record<string, string> = {
  skill: "skill-",
  subagent: "agent-",
  command: "cmd-",
  mcp: "mcp-",
}

const TYPE_CONTENT_PLACEHOLDER: Record<string, string> = {
  skill: "# Skill Instructions\n\nDescribe what this skill does...",
  subagent: "# Subagent\n\nDescribe the subagent behavior...",
  command: "# Command\n\nDescribe the command behavior...",
  mcp: "# MCP Server\n\nDescribe the MCP server...",
}

const TYPE_LABEL: Record<string, string> = {
  skill: "store.capability.type.skill",
  subagent: "store.capability.type.subagent",
  command: "store.capability.type.command",
  mcp: "store.capability.type.mcp",
}
import { ContentField } from "./content-field"

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

type NamespaceOption = {
  value: string
  label: string
  sublabel: string
  visibility: "public" | "private" | "repo"
}

type ItemCrudDialogProps = {
  itemType: "skill" | "subagent" | "command" | "mcp"
  onCreated?: () => void
}

const inputClass =
  "w-full h-9 rounded-md border border-border-weak-base bg-background-base px-3 text-sm text-text-strong outline-none transition-colors focus:border-border-strong"

const textAreaClass =
  "w-full rounded-md border border-border-weak-base bg-background-base px-3 py-2 text-sm font-mono text-text-strong outline-none transition-colors focus:border-border-strong resize-y"

export function ItemCrudDialog(props: ItemCrudDialogProps) {
  const dialog = useDialog()
  const { user } = useAuth()
  const { selectedRepo } = useRepoFilter()
  const language = useLanguage()

  const currentUser = createMemo(() => user())
  const typeLabel = createMemo(() => language.t(typeKey(props.itemType)))
  const slugPrefix = createMemo(() => TYPE_PREFIX[props.itemType] ?? "")

  const [repos, setRepos] = createSignal<Repository[]>([])

  createEffect(() => {
    const u = currentUser()
    if (u?.sub) {
      repoApi
        .listMy(u.sub)
        .then((res) => setRepos(res.repositories ?? []))
        .catch(() => {})
    }
  })

  const [store, setStore] = createStore({
    namespace: selectedRepo()?.id ? `repo:${selectedRepo()!.id}` : "public",
    name: "",
    slug: "",
    slugManual: false,
    description: "",
    category: "utilities",
    content: TYPE_CONTENT_PLACEHOLDER[props.itemType] ?? "",
    contentMode: "text" as ContentMode,
    file: null as File | null,
    saving: false,
    error: "",
  })

  const archive = canArchive(props.itemType)
  const mode = createMemo(() => usableMode(archive, store.contentMode))

  const namespaceOptions = createMemo<NamespaceOption[]>(() => {
    const options: NamespaceOption[] = [
      {
        value: "public",
        label: "public",
        sublabel: language.t("store.capabilityDialog.namespace.publicDescription"),
        visibility: "public",
      },
    ]
    for (const repo of repos()) {
      options.push({
        value: `repo:${repo.id}`,
        label: `@${repo.displayName || repo.name}`,
        sublabel: language.t("store.capabilityDialog.namespace.repositoryDescription"),
        visibility: "repo",
      })
    }
    return options
  })

  const selectedNamespace = createMemo(
    () => namespaceOptions().find((option) => option.value === store.namespace) ?? namespaceOptions()[0],
  )

  const visibilityLabel = createMemo(() => {
    if (selectedNamespace()?.visibility === "private") return language.t("store.capabilityDialog.visibility.private")
    if (selectedNamespace()?.visibility === "repo") return language.t("store.capabilityDialog.visibility.repository")
    return language.t("store.capabilityDialog.visibility.public")
  })

  function handleNameInput(value: string) {
    setStore("name", value)
    if (!store.slugManual) setStore("slug", `${slugPrefix()}${slugify(value)}`)
  }

  async function resolveRegistryId() {
    const namespace = selectedNamespace()?.value
    const u = currentUser()

    if (namespace === "public") return (await registryApi2.getPublic()).id

    if (namespace?.startsWith("repo:")) {
      return (await repoApi.getRegistry(namespace.slice(5))).id
    }

    return undefined
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    const u = currentUser()
    if (!u?.sub) {
      setStore("error", language.t("store.itemCrud.signInRequired"))
      return
    }

    if (!store.name.trim() || !store.slug.trim()) return

    if (mode() === "archive" && !store.file) {
      setStore("error", language.t("store.capabilityDialog.content.required"))
      return
    }

    setStore("saving", true)
    setStore("error", "")

    try {
      const registryId = await resolveRegistryId()
      const item = await itemApi.createDirect({
        itemType: props.itemType,
        name: store.name.trim(),
        slug: store.slug.trim(),
        description: store.description.trim(),
        category: store.category,
        content: contentValue(mode(), store.content.trim()),
        visibility: selectedNamespace()?.visibility,
        registryId,
        createdBy: u.sub,
        file: mode() === "archive" ? store.file : null,
      })
      showToast({ title: language.t("store.capabilityDialog.toast.created", { type: typeLabel() }) })
      props.onCreated?.()
      dialog.close()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStore("error", message)
      showToast({
        title: language.t("store.capabilityDialog.toast.createFailed", { type: typeLabel() }),
        description: message,
      })
    } finally {
      setStore("saving", false)
    }
  }

  return (
    <Dialog title={language.t("store.itemCrud.title", { type: typeLabel() })} size="x-large">
      <form onSubmit={handleSubmit} class="flex h-full flex-col overflow-hidden">
        <div class="flex-1 overflow-y-auto px-6 pb-4 pt-3">
          <div class="overflow-hidden rounded-2xl border border-border-weak-base bg-surface-raised-base">
            <div class="border-b border-border-weak-base px-4 py-3">
              <div class="flex items-center gap-1 text-14-medium text-text-strong">
                <span>{language.t("store.capabilityDialog.field.ownerPackage")}</span>
                <span class="text-icon-info-base">*</span>
              </div>
              <div class="mt-3 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
                <div>
                  <Select
                    options={namespaceOptions()}
                    current={selectedNamespace()}
                    value={(option) => option.value}
                    label={(option) => option.label}
                    onSelect={(option) => option && setStore("namespace", option.value)}
                    variant="secondary"
                    size="small"
                  />
                </div>
                <input
                  value={store.slug}
                  onInput={(e) => {
                    setStore("slug", e.currentTarget.value)
                    setStore("slugManual", true)
                  }}
                  placeholder={`${slugPrefix()}my-${props.itemType}`}
                  class={`${inputClass} font-mono`}
                  required
                />
              </div>
              <p class="mt-2 text-12-regular text-text-weak">
                {language.t("store.itemCrud.fullIdentifier")}{" "}
                {(selectedNamespace()?.label ?? "public") + "/" + (store.slug || `${slugPrefix()}my-${props.itemType}`)}
              </p>
            </div>

            <div class="border-b border-border-weak-base px-4 py-3">
              <label class="mb-2 flex items-center gap-1 text-12-medium text-text-strong">
                <span>{language.t("store.capabilityDialog.field.displayName")}</span>
                <span class="text-icon-info-base">*</span>
              </label>
              <input
                autofocus
                value={store.name}
                onInput={(e) => handleNameInput(e.currentTarget.value)}
                placeholder={language.t("store.capabilityDialog.field.displayNamePlaceholder", { type: typeLabel() })}
                class={inputClass}
                required
              />
            </div>

            <div class="border-b border-border-weak-base px-4 py-3">
              <label class="mb-2 block text-12-medium text-text-strong">
                {language.t("store.capabilityDialog.field.description")}
              </label>
              <input
                value={store.description}
                onInput={(e) => setStore("description", e.currentTarget.value)}
                placeholder={language.t("store.itemCrud.descriptionPlaceholder", { type: typeLabel() })}
                class={inputClass}
              />
            </div>

            <div class="grid gap-3 border-b border-border-weak-base px-4 py-3 md:grid-cols-2">
              <div>
                <label class="mb-2 flex items-center gap-1 text-12-medium text-text-strong">
                  <span>{language.t("store.capabilityDialog.field.category")}</span>
                  <span class="text-icon-info-base">*</span>
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
                <div class="flex h-9 items-center rounded-md border border-border-weak-base bg-background-base px-3 text-sm text-text-weak">
                  {visibilityLabel()}
                </div>
              </div>
            </div>

            <div class="px-4 py-3">
              <ContentField
                archive={archive}
                mode={store.contentMode}
                text={store.content}
                file={store.file}
                rows={6}
                textClass={textAreaClass}
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
            </div>
          </div>

          {store.error ? <p class="mt-3 px-1 text-12-regular text-icon-critical-base">{store.error}</p> : null}
        </div>

        <div class="flex shrink-0 items-center justify-between gap-3 border-t border-border-weak-base bg-surface-base px-6 py-3">
          {/* <p class="text-12-regular text-text-weak">{language.t("store.itemCrud.publishHint")}</p> */}
          <div class="flex items-center gap-2 ml-auto">
            <Button type="button" variant="ghost" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button type="submit" disabled={store.saving || !store.name.trim() || !store.slug.trim()}>
              {store.saving
                ? mode() === "archive"
                  ? language.t("store.capabilityDialog.content.uploading")
                  : language.t("store.capabilityDialog.create.submitting")
                : language.t("store.itemCrud.submit", { type: typeLabel() })}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  )
}

export function CreateSkillDialog(props: { onCreated?: () => void }) {
  return <ItemCrudDialog itemType="skill" onCreated={props.onCreated} />
}
