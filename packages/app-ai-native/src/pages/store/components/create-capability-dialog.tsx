import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { itemApi, repoApi, registryApi2, type CapabilityItem, type Repository } from "../lib/api"
import type { ContentMode } from "../lib/content"
import { canArchive, contentValue, usableMode } from "../lib/content"
import { CATEGORIES, TYPE_PREFIX, TYPE_CONTENT_PLACEHOLDER, typeKey, categoryKey } from "../lib/constants"
import { ContentField } from "./content-field"
import { StoreDialog } from "./store-dialog"

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
    <form onSubmit={handleSubmit}>
      <StoreDialog
        title={language.t("store.capabilityDialog.create.title")}
        maxWidth="860px"
        maxHeight="calc(100vh - 40px)"
        footer={
          <>
            <button
              class="store-modal-btn store-modal-btn-ghost"
              type="button"
              onClick={() => dialog.close()}
            >
              {language.t("common.cancel")}
            </button>
            <button
              class="store-modal-btn store-modal-btn-primary"
              type="submit"
              disabled={store.saving || !store.name.trim() || !store.slug.trim()}
            >
              {store.saving
                ? mode() === "archive"
                  ? language.t("store.capabilityDialog.content.uploading")
                  : language.t("store.capabilityDialog.create.submitting")
                : language.t("store.capabilityDialog.create.submit")}
            </button>
          </>
        }
      >
        <div class="store-modal-section">
          <div class="store-modal-section-title">{language.t("store.capabilityDialog.create.type")}</div>
          <div class="store-modal-section-desc">
            {language.t("store.capabilityDialog.create.typeDescription")}
          </div>
          <div class="store-modal-field">
            <select
              class="store-modal-input"
              value={store.itemType}
              onInput={(e) => setItemType(e.currentTarget.value as "skill" | "subagent" | "command" | "mcp")}
            >
              {(["skill", "subagent", "command", "mcp"] as const).map((type) => (
                <option value={type}>{language.t(typeKey(type))}</option>
              ))}
            </select>
          </div>
        </div>

        <div class="store-modal-section">
          <div class="store-modal-field">
            <label class="store-modal-label">
              {language.t("store.capabilityDialog.field.ownerPackage")} <span class="req">*</span>
            </label>
            <div style={{ display: "flex", "align-items": "center", gap: "0.5rem" }}>
              <select
                value={store.namespace}
                onInput={(e) => setStore("namespace", e.currentTarget.value)}
                class="store-modal-input"
                style={{ "min-width": "200px", flex: "1" }}
              >
                {namespaceOptions().map((option) => (
                  <option value={option.value}>{option.label}</option>
                ))}
              </select>
              <span style={{ color: "var(--st-text-secondary)" }}>/</span>
              <input
                value={store.slug}
                onInput={(e) => {
                  setStore("slug", e.currentTarget.value)
                  setStore("slugManual", true)
                }}
                placeholder={`${slugPrefix()}my-${store.itemType}`}
                class="store-modal-input"
                style={{ flex: "1.2", "font-family": "'SF Mono', 'Fira Code', monospace" }}
                required
              />
            </div>
            <div class="store-modal-hint">
              {selectedNamespace()?.sublabel} ·{" "}
              {(selectedNamespace()?.label ?? "public") + "/" + (store.slug || `${slugPrefix()}my-${store.itemType}`)}
            </div>
          </div>
        </div>

        <div class="store-modal-section">
          <div class="store-modal-field">
            <label class="store-modal-label">
              {language.t("store.capabilityDialog.field.displayName")} <span class="req">*</span>
            </label>
            <input
              autofocus
              value={store.name}
              onInput={(e) => handleNameInput(e.currentTarget.value)}
              placeholder={language.t("store.capabilityDialog.field.displayNamePlaceholder", { type: typeLabel() })}
              class="store-modal-input"
              required
            />
          </div>

          <div class="store-modal-field">
            <label class="store-modal-label">
              {language.t("store.capabilityDialog.field.description")}
            </label>
            <input
              value={store.description}
              onInput={(e) => setStore("description", e.currentTarget.value)}
              placeholder={language.t("store.capabilityDialog.field.descriptionPlaceholder")}
              class="store-modal-input"
            />
          </div>

          <div class="store-modal-row">
            <div class="store-modal-field" style={{ flex: "1" }}>
              <label class="store-modal-label">
                {language.t("store.capabilityDialog.field.category")} <span class="req">*</span>
              </label>
              <select
                value={store.category}
                onInput={(e) => setStore("category", e.currentTarget.value)}
                class="store-modal-input"
              >
                {CATEGORIES.map((category) => (
                  <option value={category}>{language.t(categoryKey(category))}</option>
                ))}
              </select>
            </div>
            <div class="store-modal-field" style={{ flex: "1" }}>
              <label class="store-modal-label">
                {language.t("store.capabilityDialog.field.visibility")}
              </label>
              <div
                class="store-modal-input"
                style={{ display: "flex", "align-items": "center", opacity: "0.6" }}
              >
                {visibilityLabel(selectedNamespace()?.visibility)}
              </div>
            </div>
          </div>
        </div>

        <div class="store-modal-section">
          <ContentField
            archive={archive()}
            mode={store.contentMode}
            text={store.content}
            file={store.file}
            rows={6}
            textClass="store-modal-input"
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

        {store.error ? <p class="store-modal-error">{store.error}</p> : null}
      </StoreDialog>
    </form>
  )
}
