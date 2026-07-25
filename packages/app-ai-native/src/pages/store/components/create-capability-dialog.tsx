import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { createEffect, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { useItemFilterOptions } from "@/context/item-filter-options"
import { useLanguage } from "@/context/language"
import { itemApi, repoApi, registryApi2, type CapabilityItem, type Repository } from "../lib/api"
import type { ContentMode } from "../lib/content"
import { canArchive, contentValue, usableMode } from "../lib/content"
import { TYPE_CONTENT_PLACEHOLDER, typeKey } from "../lib/constants"
import { ContentField } from "./content-field"
import { Modal } from "@/components/modal"
import { slugify } from "@/lib/capability-slug"

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
  defaultItemType?: CreateItemType
  onCreated?: (item: CapabilityItem) => void
}

const CREATE_ITEM_TYPES = ["skill", "subagent", "command", "mcp", "plugin"] as const
type CreateItemType = (typeof CREATE_ITEM_TYPES)[number]

export function CreateCapabilityDialog(props: CreateCapabilityDialogProps) {
  const dialog = useDialog()
  const language = useLanguage()
  const itemFilterOptions = useItemFilterOptions()
  const initialItemType = CREATE_ITEM_TYPES.includes(props.defaultItemType ?? "skill") ? (props.defaultItemType ?? "skill") : "skill"
  const [store, setStore] = createStore({
    itemType: initialItemType,
    namespace: "public",
    name: "",
    slug: "",
    slugManual: false,
    description: "",
    category: "utilities",
    content: TYPE_CONTENT_PLACEHOLDER[initialItemType] ?? "",
    contentMode: "text" as ContentMode,
    file: null as File | null,
    saving: false,
    error: "",
  })

  const typeLabel = createMemo(() => language.t(typeKey(store.itemType)))

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

  const categoryOptions = createMemo(() => {
    const options = itemFilterOptions.categories().map((category) => category.slug)
    if (!store.category || options.includes(store.category)) return options
    return [...options, store.category]
  })

  createEffect(() => {
    const options = itemFilterOptions.categories()
    if (!options.length) return
    if (options.some((category) => category.slug === store.category)) return
    setStore("category", options[0]!.slug)
  })

  function setItemType(value: CreateItemType) {
    setStore("itemType", value)
    setStore("content", TYPE_CONTENT_PLACEHOLDER[value] ?? "")
    if (!store.slugManual) setStore("slug", slugify(store.name))
  }

  function handleNameInput(value: string) {
    setStore("name", value)
    if (!store.slugManual) setStore("slug", slugify(value))
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
      <Modal
        title={language.t("store.capabilityDialog.create.title")}
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
        <div class="modal-section">
          <div class="modal-section-title">{language.t("store.capabilityDialog.create.type")}</div>
          <div class="modal-section-desc">
            {language.t("store.capabilityDialog.create.typeDescription")}
          </div>
          <div class="modal-field">
            <select
              class="modal-input"
              value={store.itemType}
              onInput={(e) => setItemType(e.currentTarget.value as CreateItemType)}
            >
              {CREATE_ITEM_TYPES.map((type) => (
                <option value={type}>{language.t(typeKey(type))}</option>
              ))}
            </select>
          </div>
        </div>

        <div class="modal-section">
          <div class="modal-field">
            <label class="modal-label">
              {language.t("store.capabilityDialog.field.ownerPackage")} <span class="req">*</span>
            </label>
            <div style={{ display: "flex", "align-items": "center", gap: "0.5rem" }}>
              <select
                value={store.namespace}
                onInput={(e) => setStore("namespace", e.currentTarget.value)}
                class="modal-input"
                style={{ "min-width": "200px", flex: "1" }}
              >
                {namespaceOptions().map((option) => (
                  <option value={option.value}>{option.label}</option>
                ))}
              </select>
              <span style={{ color: "var(--native-muted)" }}>/</span>
              <input
                value={store.slug}
                onInput={(e) => {
                  setStore("slug", e.currentTarget.value)
                  setStore("slugManual", true)
                }}
                placeholder={`my-${store.itemType}`}
                class="modal-input"
                style={{ flex: "1.2", "font-family": "'SF Mono', 'Fira Code', monospace" }}
                required
              />
            </div>
            <div class="modal-hint">
              {selectedNamespace()?.sublabel} ·{" "}
              {(selectedNamespace()?.label ?? "public") + "/" + (store.slug || `my-${store.itemType}`)}
            </div>
          </div>
        </div>

        <div class="modal-section">
          <div class="modal-field">
            <label class="modal-label">
              {language.t("store.capabilityDialog.field.displayName")} <span class="req">*</span>
            </label>
            <input
              autofocus
              value={store.name}
              onInput={(e) => handleNameInput(e.currentTarget.value)}
              placeholder={language.t("store.capabilityDialog.field.displayNamePlaceholder", { type: typeLabel() })}
              class="modal-input"
              required
            />
          </div>

          <div class="modal-field">
            <label class="modal-label">
              {language.t("store.capabilityDialog.field.description")}
            </label>
            <input
              value={store.description}
              onInput={(e) => setStore("description", e.currentTarget.value)}
              placeholder={language.t("store.capabilityDialog.field.descriptionPlaceholder")}
              class="modal-input"
            />
          </div>

          <div class="modal-row">
            <div class="modal-field" style={{ flex: "1" }}>
              <label class="modal-label">
                {language.t("store.capabilityDialog.field.category")} <span class="req">*</span>
              </label>
              <select
                value={store.category}
                onInput={(e) => setStore("category", e.currentTarget.value)}
                class="modal-input"
              >
                {categoryOptions().map((category) => (
                  <option value={category}>{itemFilterOptions.categoryLabel(category)}</option>
                ))}
              </select>
            </div>
            <div class="modal-field" style={{ flex: "1" }}>
              <label class="modal-label">
                {language.t("store.capabilityDialog.field.visibility")}
              </label>
              <div
                class="modal-input"
                style={{ display: "flex", "align-items": "center", opacity: "0.6" }}
              >
                {visibilityLabel(selectedNamespace()?.visibility)}
              </div>
            </div>
          </div>
        </div>

        <div class="modal-section">
          <ContentField
            archive={archive()}
            mode={store.contentMode}
            text={store.content}
            file={store.file}
            rows={6}
            textClass="modal-input"
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

        {store.error ? <p class="modal-error">{store.error}</p> : null}
      </Modal>
    </form>
  )
}
