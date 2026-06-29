import { Button } from "@opencode-ai/ui/button"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { projectsApi } from "../lib/project-api"
import type { SearchedUser } from "../lib/project-types"

const inputClass =
  "w-full h-9 rounded-md border border-border-weak-base bg-background-base px-3 text-sm text-text-strong outline-none focus:border-border-strong"

type Props = {
  projectId: string
  currentUserId?: string
  onInvited?: () => void
}

export default function ProjectInviteDialog(props: Props) {
  const language = useLanguage()
  const [store, setStore] = createStore({
    query: "",
    results: [] as SearchedUser[],
    searching: false,
    inviting: "",
    invited: new Set<string>(),
  })

  let timer: ReturnType<typeof setTimeout> | undefined

  const userDisplayName = (user: SearchedUser) => user.displayName || user.name || user.id
  const userAvatar = (user: SearchedUser) => user.avatarUrl

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
        const res = await projectsApi.searchUsers(trimmed)
        setStore(
          "results",
          (res.users ?? []).filter((user) => user.id !== props.currentUserId && !store.invited.has(user.id)),
        )
      } catch (err) {
        showToast({
          variant: "error",
          title: language.t("projects.inviteDialog.toast.failed"),
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
      await projectsApi.invite(props.projectId, { inviteeId: user.id, role: "member" })
      setStore("invited", new Set([...store.invited, user.id]))
      setStore("results", (results) => results.filter((item) => item.id !== user.id))
      showToast({
        variant: "success",
        title: language.t("projects.inviteDialog.toast.success"),
        description: language.t("projects.inviteDialog.toast.successMessage", {
          name: userDisplayName(user),
        }),
      })
      props.onInvited?.()
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("projects.inviteDialog.toast.failed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setStore("inviting", "")
    }
  }

  return (
    <Dialog title={language.t("projects.inviteDialog.title")} class="w-full max-w-[640px] mx-auto">
      <div class="flex max-h-[calc(100vh-120px)] flex-col overflow-hidden px-6 pb-6 pt-2">
        <input
          autofocus
          placeholder={language.t("projects.inviteDialog.searchPlaceholder")}
          value={store.query}
          onInput={(e) => {
            setStore("query", e.currentTarget.value)
            search(e.currentTarget.value)
          }}
          class={inputClass}
        />
        <div class="mt-4 flex-1 overflow-y-auto">
          <Show when={store.searching}>
            <div class="py-4 text-center text-sm text-text-weak">{language.t("store.loading")}</div>
          </Show>
          <Show when={!store.searching && store.results.length === 0 && store.query.trim()}>
            <div class="py-4 text-center text-sm text-text-weak">{language.t("projects.inviteDialog.empty")}</div>
          </Show>
          <Show when={store.results.length > 0}>
            <div class="flex flex-col gap-2">
              <For each={store.results}>
                {(user) => (
                  <div class="flex items-center justify-between gap-3 rounded-md border border-border-weak-base px-3 py-2">
                      <div class="flex items-center gap-3 min-w-0">
                        <Show
                          when={userAvatar(user)}
                        fallback={
                          <div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-selected-base text-xs font-medium text-text-strong">
                            {userDisplayName(user)[0]?.toUpperCase() || "?"}
                          </div>
                        }
                        >
                          <img src={userAvatar(user)} alt={userDisplayName(user)} class="size-8 shrink-0 rounded-full object-cover" />
                        </Show>
                        <div class="min-w-0">
                          <div class="truncate text-sm font-medium text-text-strong">{userDisplayName(user)}</div>
                        </div>
                      </div>
                    <Button
                      size="small"
                      variant="ghost"
                      class="shrink-0 border border-border-weak-base"
                      disabled={store.inviting === user.id || store.invited.has(user.id)}
                      onClick={() => void invite(user)}
                    >
                      <Show when={store.inviting === user.id} fallback={<Icon name="plus-small" size="small" />}>
                        <span class="text-xs">{language.t("store.loading")}</span>
                      </Show>
                    </Button>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </Dialog>
  )
}
