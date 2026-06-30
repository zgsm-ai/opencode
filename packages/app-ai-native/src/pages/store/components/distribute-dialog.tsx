import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import AvatarDisplay from "@/components/avatar-display"
import { useLanguage } from "@/context/language"
import { For, Show, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { distributionApi, userApi, type SearchedUser } from "../lib/api"
import { Modal } from "@/components/modal"

type Props = {
  itemId: string
  itemName: string
}

const PERMISSION_OPTIONS = [
  { value: "readonly", label: "store.distribute.permission.readonly", desc: "store.distribute.permission.readonlyDesc" },
  { value: "dismissible", label: "store.distribute.permission.dismissible", desc: "store.distribute.permission.dismissibleDesc" },
] as const

export function DistributeDialog(props: Props) {
  const language = useLanguage()
  const dialog = useDialog()
  const [store, setStore] = createStore({
    permissionMode: "readonly" as "readonly" | "dismissible",
    query: "",
    results: [] as SearchedUser[],
    searching: false,
    selected: [] as SearchedUser[],
    message: "",
    submitting: false,
  })
  let timer: ReturnType<typeof setTimeout>

  const search = (q: string) => {
    clearTimeout(timer)
    const trimmed = q.trim()
    if (!trimmed) {
      setStore("results", [])
      return
    }
    timer = setTimeout(async () => {
      setStore("searching", true)
      try {
        const res = await userApi.search(trimmed)
        const existingIds = new Set(store.selected.map((s) => s.id))
        setStore(
          "results",
          (res.users ?? []).filter((u) => !existingIds.has(u.id)),
        )
      } catch (err) {
        showToast({
          variant: "error",
          title: language.t("store.distribute.toast.searchFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
      } finally {
        setStore("searching", false)
      }
    }, 300)
  }

  const toggleSelect = (user: SearchedUser) => {
    const exists = store.selected.find((s) => s.id === user.id)
    if (exists) {
      setStore(
        "selected",
        store.selected.filter((s) => s.id !== user.id),
      )
    } else {
      setStore("selected", [...store.selected, user])
      setStore("results", store.results.filter((r) => r.id !== user.id))
      setStore("query", "")
    }
  }

  const removeSelected = (userId: string) => {
    setStore("selected", store.selected.filter((s) => s.id !== userId))
  }

  const submit = async () => {
    if (store.selected.length === 0) {
      showToast({
        variant: "error",
        title: language.t("store.distribute.toast.noTarget"),
        description: language.t("store.distribute.toast.noTargetDesc"),
      })
      return
    }

    setStore("submitting", true)
    try {
      const targets = store.selected.map((user) => ({
        scopeType: "user" as const,
        targetId: user.id,
      }))
      const res = await distributionApi.distribute(props.itemId, {
        targets,
        permissionMode: store.permissionMode,
        message: store.message || undefined,
      })
      const totalRecipients = res.distributions.reduce((sum, d) => sum + d.recipientCount, 0)
      showToast({
        variant: "success",
        title: language.t("store.distribute.toast.success"),
        description: language.t("store.distribute.toast.successMessage", {
          count: String(totalRecipients),
        }),
      })
      dialog.close()
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("store.distribute.toast.failed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setStore("submitting", false)
    }
  }

  return (
    <Modal
      title={
        props.itemName
          ? language.t("store.distribute.titleNamed", { name: props.itemName })
          : language.t("store.distribute.title")
      }
      maxWidth="520px"
      maxHeight="640px"
      footer={
        <div class="modal-foot">
          <button class="modal-btn modal-btn-ghost" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </button>
          <button
            class="modal-btn modal-btn-primary"
            disabled={store.selected.length === 0 || store.submitting}
            onClick={() => void submit()}
          >
            <Show when={store.submitting} fallback={language.t("store.distribute.submit")}>
              <span>{language.t("store.loading")}</span>
            </Show>
          </button>
        </div>
      }
    >
      <div class="modal-body">
        {/* Permission mode */}
        <div class="modal-section">
          <div class="modal-section-title">{language.t("store.distribute.permission.title")}</div>
          <div class="modal-section-desc">{language.t("store.distribute.permission.subtitle")}</div>
          <div class="modal-toggle-group">
            <For each={PERMISSION_OPTIONS}>
              {(opt) => (
                <button
                  class="modal-toggle"
                  classList={{ on: store.permissionMode === opt.value }}
                  onClick={() => setStore("permissionMode", opt.value)}
                  title={language.t(opt.desc)}
                >
                  {language.t(opt.label)}
                </button>
              )}
            </For>
          </div>
        </div>

        {/* Search targets */}
        <div class="modal-section">
          <div class="modal-section-title">{language.t("store.distribute.target.title")}</div>
          <div class="modal-section-desc">{language.t("store.distribute.target.subtitle")}</div>
          <input
            class="modal-input"
            placeholder={language.t("store.distribute.searchPlaceholder")}
            value={store.query}
            onInput={(e) => {
              setStore("query", e.currentTarget.value)
              search(e.currentTarget.value)
            }}
          />
          <Show when={store.searching}>
            <div style={{ padding: "0.75rem 0", "text-align": "center", "font-size": "0.8125rem", color: "var(--native-muted)" }}>
              {language.t("store.loading")}
            </div>
          </Show>
          <Show when={!store.searching && store.results.length > 0}>
            <div style={{ display: "flex", "flex-direction": "column", gap: "0.375rem", "margin-top": "0.5rem" }}>
              <For each={store.results}>
                {(user) => (
                  <button
                    class="modal-info-card"
                    style={{
                      display: "flex",
                      "align-items": "center",
                      "justify-content": "space-between",
                      gap: "0.75rem",
                      padding: "0.5rem 0.625rem",
                      cursor: "pointer",
                      background: "transparent",
                      border: "1px solid color-mix(in oklab, var(--native-border) 40%, transparent)",
                      "border-radius": "var(--native-radius-sm)",
                    }}
                    onClick={() => toggleSelect(user)}
                  >
                    <div style={{ display: "flex", "align-items": "center", gap: "0.625rem", "min-width": "0" }}>
                      <AvatarDisplay
                        avatarUrl={user.avatarUrl}
                        username={user.displayName || user.name || user.id}
                        size="1.75rem"
                        class="shrink-0"
                      />
                      <div style={{ "min-width": "0", "text-align": "left" }}>
                        <div style={{ "font-size": "0.8125rem", color: "var(--native-foreground)", overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>
                          {user.displayName || user.name}
                        </div>
                      </div>
                    </div>
                    <Icon name="plus-small" size="small" style={{ color: "var(--native-muted)", "flex-shrink": "0" }} />
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={!store.searching && store.query.trim() && store.results.length === 0}>
            <div style={{ padding: "0.75rem 0", "text-align": "center", "font-size": "0.8125rem", color: "var(--native-muted)" }}>
              {language.t("store.distribute.empty")}
            </div>
          </Show>
        </div>

        {/* Selected targets */}
        <Show when={store.selected.length > 0}>
          <div class="modal-section">
            <div class="modal-section-title">{language.t("store.distribute.selected.title")}</div>
            <div style={{ display: "flex", "flex-direction": "column", gap: "0.375rem", "margin-top": "0.5rem" }}>
              <For each={store.selected}>
                {(user) => (
                  <div
                    style={{
                      display: "flex",
                      "align-items": "center",
                      "justify-content": "space-between",
                      gap: "0.75rem",
                      padding: "0.5rem 0.625rem",
                      "border-radius": "var(--native-radius-sm)",
                      background: "color-mix(in oklab, var(--native-primary) 6%, transparent)",
                      border: "1px solid color-mix(in oklab, var(--native-primary) 18%, transparent)",
                    }}
                  >
                    <div style={{ display: "flex", "align-items": "center", gap: "0.625rem", "min-width": "0" }}>
                      <AvatarDisplay
                        avatarUrl={user.avatarUrl}
                        username={user.displayName || user.name || user.id}
                        size="1.75rem"
                        class="shrink-0"
                      />
                      <div style={{ "min-width": "0" }}>
                        <div style={{ "font-size": "0.8125rem", color: "var(--native-foreground)", overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>
                          {user.displayName || user.name}
                        </div>
                      </div>
                    </div>
                    <button
                      class="modal-close"
                      style={{ width: "1.5rem", height: "1.5rem" }}
                      onClick={() => removeSelected(user.id)}
                      title={language.t("store.distribute.selected.remove")}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        {/* Message */}
        <div class="modal-section">
          <div class="modal-section-title">{language.t("store.distribute.message.title")}</div>
          <div class="modal-section-desc">{language.t("store.distribute.message.subtitle")}</div>
          <textarea
            class="modal-input"
            placeholder={language.t("store.distribute.message.placeholder")}
            value={store.message}
            onInput={(e) => setStore("message", e.currentTarget.value)}
            style={{ "min-height": "3.5rem" }}
          />
        </div>
      </div>
    </Modal>
  )
}
