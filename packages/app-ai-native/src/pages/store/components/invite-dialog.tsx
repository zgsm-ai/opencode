import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import AvatarDisplay from "@/components/avatar-display"
import { useLanguage } from "@/context/language"
import { For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { repoApi, userApi, type SearchedUser } from "../lib/api"
import { Modal } from "@/components/modal"

type Props = {
  repoId: string
  currentUserId: string
}

export function InviteDialog(props: Props) {
  const language = useLanguage()
  const [store, setStore] = createStore({
    query: "",
    results: [] as SearchedUser[],
    searching: false,
    inviting: "",
    invited: new Set<string>(),
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
        setStore(
          "results",
          (res.users ?? []).filter((u) => u.id !== props.currentUserId),
        )
      } catch (err) {
        showToast({
          variant: "error",
          title: language.t("store.inviteDialog.toast.failed"),
          description: err instanceof Error ? err.message : String(err),
        })
      } finally {
        setStore("searching", false)
      }
    }, 300)
  }

  const invite = async (user: SearchedUser) => {
    setStore("inviting", user.id)
    try {
      const res = await repoApi.invite(props.repoId, {
        inviteeId: user.id,
        inviteeUsername: user.name,
        role: "member",
      })
      if (res.autoAccepted) {
        setStore("invited", new Set([...store.invited, user.id]))
        showToast({
          variant: "success",
          title: language.t("store.inviteDialog.toast.success"),
          description: language.t("store.inviteDialog.toast.successMessage", { name: user.name }),
        })
      }
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("store.inviteDialog.toast.failed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setStore("inviting", "")
    }
  }

  return (
    <Modal title={language.t("store.inviteDialog.title")} maxWidth="640px">
      <div class="modal-section">
        <input
          autofocus
          placeholder={language.t("store.inviteDialog.searchPlaceholder")}
          value={store.query}
          onInput={(e) => {
            setStore("query", e.currentTarget.value)
            search(e.currentTarget.value)
          }}
          class="modal-input"
        />
      </div>
      <div class="modal-section" style={{ flex: "1", "overflow-y": "auto" }}>
        <Show when={store.searching}>
          <div style={{ padding: "1rem 0", "text-align": "center", "font-size": "0.8125rem", color: "var(--native-muted)" }}>
            {language.t("store.loading")}
          </div>
        </Show>
        <Show when={!store.searching && store.results.length === 0 && store.query.trim()}>
          <div style={{ padding: "1rem 0", "text-align": "center", "font-size": "0.8125rem", color: "var(--native-muted)" }}>
            {language.t("store.inviteDialog.empty")}
          </div>
        </Show>
        <Show when={store.results.length > 0}>
          <div style={{ display: "flex", "flex-direction": "column", gap: "0.5rem" }}>
            <For each={store.results}>
              {(user) => (
                <div
                  class="modal-info-card"
                  style={{ display: "flex", "align-items": "center", "justify-content": "space-between", gap: "0.75rem" }}
                >
                  <div style={{ display: "flex", "align-items": "center", gap: "0.75rem", "min-width": "0" }}>
                    <AvatarDisplay
                      avatarUrl={user.picture}
                      username={user.name || user.preferred_username || user.email}
                      size="2rem"
                      class="shrink-0"
                    />
                    <div style={{ "min-width": "0" }}>
                      <div
                        style={{
                          "font-size": "0.8125rem",
                          color: "var(--native-foreground)",
                          overflow: "hidden",
                          "text-overflow": "ellipsis",
                          "white-space": "nowrap",
                        }}
                      >
                        {user.name || user.preferred_username}
                      </div>
                      <div
                        style={{
                          "font-size": "12px",
                          color: "var(--native-muted)",
                          overflow: "hidden",
                          "text-overflow": "ellipsis",
                          "white-space": "nowrap",
                        }}
                      >
                        {user.email}
                      </div>
                    </div>
                  </div>
                  <button
                    class="modal-btn modal-btn-ghost"
                    style={{ height: "1.75rem", padding: "0 0.5rem", "flex-shrink": "0" }}
                    disabled={store.inviting === user.id || store.invited.has(user.id)}
                    onClick={() => void invite(user)}
                  >
                    <Show when={store.inviting === user.id} fallback={<Icon name="plus-small" size="small" />}>
                      <span style={{ "font-size": "0.8125rem" }}>{language.t("store.loading")}</span>
                    </Show>
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Modal>
  )
}
