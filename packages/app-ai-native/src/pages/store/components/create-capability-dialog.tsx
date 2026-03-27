import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { itemApi, repoApi, registryApi2, type CapabilityItem, type Repository } from "../lib/api"
import type { ContentMode } from "../lib/content"
import { canArchive, contentValue, usableMode } from "../lib/content"
import { CATEGORIES, TYPE_PREFIX, TYPE_CONTENT_PLACEHOLDER, typeKey, categoryKey } from "../lib/constants"
import { ContentField } from "./content-field"

const inputClass =
  "w-full h-9 rounded-md border border-border-weak-base bg-background-base px-3 text-sm text-text-strong outline-none focus:border-border-strong"

const textAreaClass =
  "w-full rounded-md border border-border-weak-base bg-background-base px-3 py-2 text-sm font-mono text-text-strong outline-none focus:border-border-strong resize-y"

type NamespaceOption = {
  value: string
  label: string
  sublabel: string
  visibility: "public" | "private" | "repo"
}

type CreateCapabilityDialogProps = {
  userId: string
  username?: string
  repositories: Repository[]
  onCreated?: (item: CapabilityItem) => void
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export function CreateCapabilityDialog(props: CreateCapabilityDialogProps) {
  const dialog = useDialog()
  const language = useLanguage()
  const [store, setStore] = createStore({
    itemType: "skill" as "skill" | "subagent" | "command" | "mcp",
    namespace: "public",
    name: "",
    slug: "",
    slugManual: false,
    description: "",
    category: "utilities",
    content: TYPE_CONTENT_PLACEHOLDER.skill,
    contentMode: "text" as ContentMode,
    file: null as File | null,
    saving: false,
    error: "",
  })

  const typeLabel = createMemo(() => language.t(typeKey(store.itemType)))
  const slugPrefix = createMemo(() => TYPE_PREFIX[store.itemType] ?? "")

  const archive = createMemo(() => canArchive(store.itemType))
  const mode = createMemo(() => usableMode(archive(), store.contentMode))

  const visibilityLabel = (visibility: NamespaceOption["visibility"] | undefined) => {
    if (visibility === "private") return language.t("store.capabilityDialog.visibility.private")
    if (visibility === "repo") return language.t("store.capabilityDialog.visibility.repository")
    return language.t("store.capabilityDialog.visibility.public")
  }

  const namespaceOptions = createMemo<NamespaceOption[]>(() => {
    const options: NamespaceOption[] = [
      {
        value: "public",
        label: "public",
        sublabel: language.t("store.capabilityDialog.namespace.publicDescription"),
        visibility: "public",
      },
    ]
    // if (props.username) {
    //   options.push({
    //     value: "personal",
    //     label: `@${props.username}`,
    //     sublabel: language.t("store.capabilityDialog.namespace.personalDescription"),
    //     visibility: "private",
    //   })
    // }
    // Backward compatibility for old prop name if it still appears in runtime transforms
    const legacyOrganizations = (props as unknown as { organizations?: Repository[] }).organizations ?? []
    for (const repo of legacyOrganizations) {
      options.push({
        value: `repo:${repo.id}`,
        label: `@${repo.displayName || repo.name}`,
        sublabel: language.t("store.capabilityDialog.namespace.repositoryDescription"),
        visibility: "repo",
      })
    }
    for (const repo of props.repositories) {
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

  function setItemType(value: "skill" | "subagent" | "command" | "mcp") {
    setStore("itemType", value)
    setStore("content", TYPE_CONTENT_PLACEHOLDER[value] ?? "")
    if (!store.slugManual) setStore("slug", `${TYPE_PREFIX[value] ?? ""}${slugify(store.name)}`)
  }

  function handleNameInput(value: string) {
    setStore("name", value)
    if (!store.slugManual) setStore("slug", `${slugPrefix()}${slugify(value)}`)
  }

  async function resolveRegistryId() {
    const namespace = selectedNamespace()?.value

    if (namespace === "public") return (await registryApi2.getPublic()).id
    if (namespace?.startsWith("repo:")) return (await repoApi.getRegistry(namespace.slice(5))).id
    return undefined
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
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
        itemType: store.itemType,
        name: store.name.trim(),
        slug: store.slug.trim(),
        description: store.description.trim(),
        category: store.category,
        content: contentValue(mode(), store.content.trim()),
        visibility: selectedNamespace()?.visibility,
        registryId,
        createdBy: props.userId,
        file: mode() === "archive" ? store.file : null,
      })
      props.onCreated?.(item)
      showToast({ title: language.t("store.capabilityDialog.toast.created", { type: typeLabel() }) })
      dialog.close()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
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
    <Dialog title={language.t("store.capabilityDialog.create.title")} size="x-large">
      <form onSubmit={handleSubmit} class="flex h-full flex-col overflow-hidden">
        <div class="flex-1 overflow-y-auto px-6 pb-4 pt-2">
          <div class="rounded-xl border border-border-weak-base bg-surface-raised-base">
            <div class="border-b border-border-weak-base px-4 py-3">
              <div class="text-14-medium text-text-strong">{language.t("store.capabilityDialog.create.type")}</div>
              <div class="mt-1 text-12-regular text-text-weak">
                {language.t("store.capabilityDialog.create.typeDescription")}
              </div>
              <div class="mt-2 grid grid-cols-2 gap-2">
                {(["skill", "subagent", "command", "mcp"] as const).map((type) => (
                  <button
                    type="button"
                    class="rounded-md border px-3 py-2 text-left text-sm"
                    classList={{
                      "border-border-weak-base text-text-weak": store.itemType !== type,
                      "border-border-strong bg-surface-info-base/20 text-text-strong": store.itemType === type,
                    }}
                    onClick={() => setItemType(type)}
                  >
                    {language.t(typeKey(type))}
                  </button>
                ))}
              </div>
            </div>

            <div class="border-b border-border-weak-base px-4 py-3">
              <label class="mb-2 block text-12-medium text-text-strong">
                {language.t("store.capabilityDialog.field.ownerPackage")} <span class="text-icon-info-base">*</span>
              </label>
              <div class="flex items-center gap-2">
                <select
                  value={store.namespace}
                  onInput={(e) => setStore("namespace", e.currentTarget.value)}
                  class={`${inputClass} min-w-[200px] flex-1`}
                >
                  {namespaceOptions().map((option) => (
                    <option value={option.value}>{option.label}</option>
                  ))}
                </select>
                <span class="text-text-weak">/</span>
                <input
                  value={store.slug}
                  onInput={(e) => {
                    setStore("slug", e.currentTarget.value)
                    setStore("slugManual", true)
                  }}
                  placeholder={`${slugPrefix()}my-${store.itemType}`}
                  class={`${inputClass} flex-[1.2] font-mono`}
                  required
                />
              </div>
              <p class="mt-2 text-12-regular text-text-weak">
                {selectedNamespace()?.sublabel} ·{" "}
                {(selectedNamespace()?.label ?? "public") + "/" + (store.slug || `${slugPrefix()}my-${store.itemType}`)}
              </p>
            </div>

            <div class="border-b border-border-weak-base px-4 py-3">
              <label class="mb-2 block text-12-medium text-text-strong">
                {language.t("store.capabilityDialog.field.displayName")} <span class="text-icon-info-base">*</span>
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
                placeholder={language.t("store.capabilityDialog.field.descriptionPlaceholder")}
                class={inputClass}
              />
            </div>

            <div class="grid gap-3 border-b border-border-weak-base px-4 py-3 md:grid-cols-2">
              <div>
                <label class="mb-2 block text-12-medium text-text-strong">
                  {language.t("store.capabilityDialog.field.category")} <span class="text-icon-info-base">*</span>
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
                  {visibilityLabel(selectedNamespace()?.visibility)}
                </div>
              </div>
            </div>

            <div class="px-4 py-3">
              <ContentField
                archive={archive()}
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

          {store.error ? <p class="mt-4 text-12-regular text-icon-critical-base">{store.error}</p> : null}
        </div>

        <div class="flex shrink-0 items-center justify-end gap-2 border-t border-border-weak-base bg-surface-base px-6 py-3">
          <Button type="button" variant="ghost" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button type="submit" disabled={store.saving || !store.name.trim() || !store.slug.trim()}>
            {store.saving
              ? mode() === "archive"
                ? language.t("store.capabilityDialog.content.uploading")
                : language.t("store.capabilityDialog.create.submitting")
              : language.t("store.capabilityDialog.create.submit")}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
