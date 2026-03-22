import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { createEffect, createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useAuth } from "../hooks/use-auth"
import { getLoginUrl } from "../lib/auth"
import {
  itemApi,
  repoApi,
  registryApi,
  notificationChannelApi,
  type CapabilityItem,
  type CapabilityRegistry,
  type Repository,
  type NotificationChannel,
} from "../lib/api"
import { CreateRepoDialog } from "../components/create-repo-dialog"
import { CreateCapabilityDialog } from "../components/create-capability-dialog"
import { EditCapabilityDialog } from "../components/edit-capability-dialog"
import { EditRepoDialog } from "../components/edit-repo-dialog"
import { MoveCapabilityDialog } from "../components/move-capability-dialog"
import { RepoSyncTab } from "../components/repo-sync-tab"
import { NotificationChannelCard } from "../components/notification-channel-card"
import { NotificationChannelDialog } from "../components/notification-channel-dialog"
import { typeKey, categoryKey } from "../lib/constants"

const ITEM_TYPE_COLORS: Record<string, string> = {
  skill: "bg-surface-info-base/20 text-text-info-base",
  subagent: "bg-surface-warning-base/20 text-text-warning-base",
  command: "bg-surface-success-base/20 text-text-success-base",
  mcp: "bg-surface-selected-base/40 text-text-strong",
}

export default function Dashboard() {
  const dialog = useDialog()
  const language = useLanguage()
  const { user, loading } = useAuth()
  const [state, setState] = createStore({
    repos: [] as Repository[],
    items: [] as CapabilityItem[],
    personalRegistry: null as CapabilityRegistry | null,
    loadingRepos: false,
    loadingItems: false,
    itemTypeFilter: "all",
    expandedSyncRepo: null as string | null,
    notificationChannels: [] as NotificationChannel[],
    loadingChannels: false,
    editingChannel: null as NotificationChannel | null,
  })

  const userId = createMemo(() => user()?.sub ?? "")
  const username = createMemo(() => user()?.preferred_username || user()?.name || "")

  const loadRepos = async () => {
    if (!userId()) return
    setState("loadingRepos", true)
    try {
      const res = await repoApi.listMy(userId())
      setState("repos", res.repositories ?? [])
    } catch (error) {
      showToast({
        title: language.t("store.console.repositories.toast.loadFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setState("loadingRepos", false)
    }
  }

  const loadItems = async () => {
    if (!userId()) return
    setState("loadingItems", true)
    try {
      const res = await itemApi.listMy(userId())
      setState("items", res.items ?? [])
    } catch (error) {
      showToast({
        title: language.t("store.console.capabilities.toast.loadFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setState("loadingItems", false)
    }
  }

  const ensureRegistry = async () => {
    if (!userId()) return
    try {
      const registry = await registryApi.ensurePersonal(userId(), username())
      setState("personalRegistry", registry)
    } catch {}
  }

  const loadChannels = async () => {
    setState("loadingChannels", true)
    try {
      const res = await notificationChannelApi.list()
      setState("notificationChannels", res.channels ?? [])
    } catch (error) {
      showToast({
        title: language.t("store.notificationChannel.toast.loadFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setState("loadingChannels", false)
    }
  }

  createEffect(() => {
    if (!userId()) return
    void loadRepos()
    void loadItems()
    void ensureRegistry()
    void loadChannels()
  })

  const filteredItems = createMemo(() =>
    state.itemTypeFilter === "all" ? state.items : state.items.filter((item) => item.itemType === state.itemTypeFilter),
  )

  const openCreateRepo = () => {
    if (!userId()) return
    dialog.show(() => (
      <CreateRepoDialog userId={userId()} onCreated={(repo) => setState("repos", (items) => [repo, ...items])} />
    ))
  }

  const openCreateCapability = () => {
    if (!userId()) return
    dialog.show(() => (
      <CreateCapabilityDialog
        userId={userId()}
        username={username()}
        repositories={state.repos}
        onCreated={(item) => setState("items", (items) => [item, ...items])}
      />
    ))
  }

  const openEditRepo = (repo: Repository) => {
    dialog.show(() => (
      <EditRepoDialog
        repo={repo}
        onSaved={(updated) =>
          setState("repos", (items) => items.map((item) => (item.id === updated.id ? updated : item)))
        }
      />
    ))
  }

  const openEditCapability = (item: CapabilityItem) => {
    dialog.show(() => (
      <EditCapabilityDialog
        item={item}
        onSaved={(updated) =>
          setState("items", (items) => items.map((current) => (current.id === updated.id ? updated : current)))
        }
      />
    ))
  }

  const openMoveCapability = (item: CapabilityItem) => {
    if (!userId()) return
    dialog.show(() => (
      <MoveCapabilityDialog
        item={item}
        userId={userId()}
        username={username()}
        repositories={state.repos}
        onMoved={(updated) =>
          setState("items", (items) => items.map((current) => (current.id === updated.id ? updated : current)))
        }
      />
    ))
  }

  const handleDeleteRepo = async (id: string) => {
    if (!window.confirm(language.t("store.console.confirmDeleteRepository"))) return
    try {
      await repoApi.delete(id)
      setState("repos", (items) => items.filter((item) => item.id !== id))
      showToast({ title: language.t("store.console.repositories.toast.deleteSuccess") })
    } catch (error) {
      showToast({
        title: language.t("store.console.repositories.toast.deleteFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const handleDeleteItem = async (id: string) => {
    if (!window.confirm(language.t("store.console.confirmDeleteCapability"))) return
    try {
      await itemApi.delete(id)
      setState("items", (items) => items.filter((item) => item.id !== id))
      showToast({ title: language.t("store.console.capabilities.toast.deleteSuccess") })
    } catch (error) {
      showToast({
        title: language.t("store.console.capabilities.toast.deleteFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Notification Channel handlers
  const openCreateChannel = () => {
    setState("editingChannel", null)
    dialog.show(() => (
      <NotificationChannelDialog
        mode="create"
        onCreated={(channel) => setState("notificationChannels", (channels) => [...channels, channel])}
      />
    ))
  }

  const openEditChannel = (channel: NotificationChannel) => {
    setState("editingChannel", channel)
    dialog.show(() => (
      <NotificationChannelDialog
        mode="edit"
        channel={channel}
        onUpdated={(updated) =>
          setState("notificationChannels", (channels) =>
            channels.map((c) => (c.id === updated.id ? updated : c)),
          )
        }
      />
    ))
  }

  const handleToggleChannel = async (channel: NotificationChannel) => {
    try {
      const updated = await notificationChannelApi.toggle(channel.id, !channel.enabled)
      setState("notificationChannels", (channels) =>
        channels.map((c) => (c.id === updated.id ? updated : c)),
      )
      showToast({
        title: language.t(
          updated.enabled ? "store.notificationChannel.toast.enabled" : "store.notificationChannel.toast.disabled",
        ),
      })
    } catch (error) {
      showToast({
        title: language.t("store.notificationChannel.toast.toggleFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const handleDeleteChannel = async (channel: NotificationChannel) => {
    if (!window.confirm(language.t("store.notificationChannel.confirmDelete"))) return
    try {
      await notificationChannelApi.delete(channel.id)
      setState("notificationChannels", (channels) => channels.filter((c) => c.id !== channel.id))
      showToast({ title: language.t("store.notificationChannel.toast.deleteSuccess") })
    } catch (error) {
      showToast({
        title: language.t("store.notificationChannel.toast.deleteFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const typeLabel = (type: string) => language.t(typeKey(type))

  const categoryLabel = (category?: string | null) => {
    if (!category) return "—"
    return language.t(categoryKey(category))
  }

  const visibilityLabel = (visibility?: string | null) => {
    if (!visibility || visibility === "public") return language.t("store.capabilityDialog.visibility.public")
    if (visibility === "private") return language.t("store.capabilityDialog.visibility.private")
    if (visibility === "repo") return language.t("store.capabilityDialog.visibility.repository")
    return visibility
  }

  return (
    <div class="min-h-full px-6 py-6">
      <Show
        when={!loading()}
        fallback={<div class="flex justify-center py-16 text-text-weak">{language.t("store.loading")}</div>}
      >
        <Show
          when={user()}
          fallback={
            <div class="flex min-h-[60vh] items-center justify-center">
              <div class="rounded-xl border border-border-weak-base bg-surface-raised-base px-8 py-10 text-center">
                <div class="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-surface-info-base/20 text-text-strong">
                  <Icon name="console" />
                </div>
                <h1 class="text-lg font-semibold text-text-strong">{language.t("store.console")}</h1>
                <p class="mt-2 text-sm text-text-weak">{language.t("store.console.authDescription")}</p>
                <a href={getLoginUrl("/store/dashboard")}>
                  <Button class="mt-4">{language.t("store.console.login")}</Button>
                </a>
              </div>
            </div>
          }
        >
          <div class="flex flex-col gap-6">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h1 class="text-2xl font-semibold text-text-strong">{language.t("store.console")}</h1>
                {/* <p class="mt-1 text-sm text-text-weak">{language.t("store.console.manageDescription")}</p> */}
              </div>
            </div>

            <div class="flex flex-col gap-6">
              <section class="rounded-2xl border border-border-weak-base bg-surface-raised-base p-5">
                <div class="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h2 class="text-lg font-semibold text-text-strong">
                      {language.t("store.console.repositories.title")}
                    </h2>
                    <p class="mt-1 text-sm text-text-weak">{language.t("store.console.repositories.description")}</p>
                  </div>
                  <Button size="small" variant="ghost" class="border border-border-weak-base" onClick={openCreateRepo}>
                    <Icon name="plus" class="size-4" />
                    {language.t("store.console.new")}
                  </Button>
                </div>

                <Show
                  when={!state.loadingRepos}
                  fallback={
                    <div class="text-sm text-text-weak">{language.t("store.console.repositories.loading")}</div>
                  }
                >
                  <Show
                    when={state.repos.length > 0}
                    fallback={
                      <div class="rounded-xl border border-dashed border-border-weak-base px-8 py-10 text-center text-sm text-text-weak">
                        {language.t("store.console.repositories.empty")}
                      </div>
                    }
                  >
                    <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      <For each={state.repos}>
                        {(repo) => (
                          <div class="group rounded-md border border-border-weak-base bg-background-base px-4 py-3 transition-all duration-150 hover:-translate-y-px hover:shadow-xs-border-base">
                            <div class="mb-3 flex items-start justify-between gap-3">
                              <div class="min-w-0">
                                <div class="flex items-center gap-2">
                                  <div class="truncate text-sm font-medium text-text-strong transition-colors group-hover:text-text-strong">
                                    {repo.displayName || repo.name}
                                  </div>
                                  <span
                                    class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-11-medium"
                                    classList={{
                                      "bg-surface-success-base/15 text-text-success-base": repo.visibility === "public",
                                      "bg-surface-warning-base/15 text-text-warning-base":
                                        repo.visibility === "private",
                                      "bg-surface-selected-base text-text-weak":
                                        repo.visibility !== "public" && repo.visibility !== "private",
                                    }}
                                  >
                                    <Icon name={repo.visibility === "private" ? "eye" : "sparkles"} size="small" />
                                    {visibilityLabel(repo.visibility)}
                                  </span>
                                  <Show when={repo.repoType === "sync"}>
                                    <span class="rounded-full bg-surface-info-base/20 px-2 py-0.5 text-11-medium text-text-strong">
                                      {language.t("store.console.repositories.sync")}
                                    </span>
                                  </Show>
                                </div>
                                <div class="mt-1 truncate text-xs text-text-weak">{repo.name}</div>
                              </div>
                              <div class="flex items-center gap-1">
                                <Button
                                  size="small"
                                  variant="ghost"
                                  class="h-8 w-8 p-0"
                                  onClick={() => openEditRepo(repo)}
                                  title={language.t("store.console.repositories.edit")}
                                >
                                  <Icon name="edit" size="small" />
                                </Button>
                                <Button
                                  size="small"
                                  variant="ghost"
                                  class="h-8 w-8 p-0"
                                  onClick={() => void handleDeleteRepo(repo.id)}
                                  title={language.t("store.console.repositories.delete")}
                                >
                                  <Icon name="trash" size="small" />
                                </Button>
                              </div>
                            </div>

                            <p class="mb-4 text-xs text-text-weak line-clamp-2 min-h-10">{repo.description || ""}</p>

                            <div class="mt-auto flex items-center gap-2 border-t border-border-weak-base pt-3">
                              <Show when={repo.repoType === "sync"}>
                                <Button
                                  size="small"
                                  variant="ghost"
                                  class="px-2 py-1 text-xs"
                                  onClick={() =>
                                    setState("expandedSyncRepo", state.expandedSyncRepo === repo.id ? null : repo.id)
                                  }
                                >
                                  {state.expandedSyncRepo === repo.id
                                    ? language.t("store.console.repositories.hideSync")
                                    : language.t("store.console.repositories.syncSettings")}
                                </Button>
                              </Show>
                            </div>

                            <Show when={repo.repoType === "sync" && state.expandedSyncRepo === repo.id}>
                              <div class="mt-4 border-t border-border-weak-base pt-4">
                                <RepoSyncTab repoId={repo.id} />
                              </div>
                            </Show>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </Show>
              </section>

              <section class="rounded-2xl border border-border-weak-base bg-surface-raised-base p-5">
                <div class="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h2 class="text-lg font-semibold text-text-strong">
                      {language.t("store.console.capabilities.title")}
                    </h2>
                    <p class="mt-1 text-sm text-text-weak">{language.t("store.console.capabilities.description")}</p>
                  </div>
                  <Button
                    size="small"
                    variant="ghost"
                    class="border border-border-weak-base"
                    onClick={openCreateCapability}
                  >
                    <Icon name="plus" class="size-4" />
                    {language.t("store.console.new")}
                  </Button>
                </div>

                <Show when={state.items.length > 0}>
                  <div class="mb-4 flex flex-wrap gap-2">
                    <For each={["all", "skill", "subagent", "command", "mcp"]}>
                      {(type) => (
                        <button
                          class="rounded-md border px-3 py-1.5 text-sm transition-colors"
                          classList={{
                            "border-border-strong bg-surface-info-base/20 text-text-strong":
                              state.itemTypeFilter === type,
                            "border-border-weak-base text-text-weak hover:text-text-strong":
                              state.itemTypeFilter !== type,
                          }}
                          onClick={() => setState("itemTypeFilter", type)}
                        >
                          {type === "all" ? language.t("store.console.filters.all") : typeLabel(type)}
                        </button>
                      )}
                    </For>
                  </div>
                </Show>

                <Show
                  when={!state.loadingItems}
                  fallback={
                    <div class="text-sm text-text-weak">{language.t("store.console.capabilities.loading")}</div>
                  }
                >
                  <Show
                    when={filteredItems().length > 0}
                    fallback={
                      <div class="rounded-xl border border-dashed border-border-weak-base px-8 py-10 text-center text-sm text-text-weak">
                        {language.t("store.console.capabilities.empty")}
                      </div>
                    }
                  >
                    <div class="overflow-hidden rounded-xl border border-border-weak-base bg-surface-base">
                      <table class="w-full text-sm">
                        <thead>
                          <tr class="border-b border-border-weak-base bg-surface-base">
                            <th class="px-4 py-3 text-left text-12-medium text-text-weak">
                              {language.t("store.console.capabilities.name")}
                            </th>
                            <th class="px-4 py-3 text-left text-12-medium text-text-weak">
                              {language.t("store.console.capabilities.type")}
                            </th>
                            <th class="px-4 py-3 text-left text-12-medium text-text-weak">
                              {language.t("store.console.capabilities.category")}
                            </th>
                            <th class="px-4 py-3 text-left text-12-medium text-text-weak">
                              {language.t("store.console.capabilities.visibility")}
                            </th>
                            <th class="px-4 py-3 text-left text-12-medium text-text-weak">
                              {language.t("store.console.capabilities.source")}
                            </th>
                            <th class="px-4 py-3" />
                          </tr>
                        </thead>
                        <tbody>
                          <For each={filteredItems()}>
                            {(item) => (
                              <tr class="border-b border-border-weak-base last:border-0">
                                <td class="px-4 py-3">
                                  <div class="text-13-medium text-text-strong">{item.name}</div>
                                  <div class="mt-1 text-12-regular text-text-weak">{item.slug}</div>
                                </td>
                                <td class="px-4 py-3">
                                  <span
                                    class={`rounded-full px-2 py-1 text-11-medium ${ITEM_TYPE_COLORS[item.itemType] ?? "bg-surface-selected-base text-text-strong"}`}
                                  >
                                    {typeLabel(item.itemType)}
                                  </span>
                                </td>
                                <td class="px-4 py-3 text-12-regular text-text-weak">{categoryLabel(item.category)}</td>
                                <td class="px-4 py-3">
                                  <span
                                    class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-11-medium"
                                    classList={{
                                      "bg-surface-success-base/15 text-text-success-base":
                                        (item.visibility || "public") === "public",
                                      "bg-surface-warning-base/15 text-text-warning-base":
                                        item.visibility === "private",
                                      "bg-surface-selected-base text-text-weak":
                                        item.visibility !== "public" &&
                                        item.visibility !== "private" &&
                                        item.visibility !== undefined,
                                    }}
                                  >
                                    <Icon name={item.visibility === "private" ? "eye" : "sparkles"} size="small" />
                                    {visibilityLabel(item.visibility || "public")}
                                  </span>
                                </td>
                                <td class="px-4 py-3 text-12-regular text-text-weak">
                                  {(() => {
                                    const repo = state.repos.find((r) => r.id === item.registry?.repoId)
                                    const name =
                                      repo?.displayName || repo?.name || item.registry?.name || item.registry?.orgId
                                    if (!name) return "—"
                                    if (!item.registry?.externalUrl) return <span>{name}</span>
                                    return (
                                      <a
                                        href={item.registry.externalUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="inline-flex items-center gap-1 text-text-info-base hover:underline"
                                      >
                                        {name}
                                        <Icon name="link" size="small" />
                                      </a>
                                    )
                                  })()}
                                </td>
                                <td class="px-4 py-3">
                                  <div class="flex items-center justify-end gap-1">
                                    <Button
                                      size="small"
                                      variant="ghost"
                                      class="h-8 w-8 p-0"
                                      onClick={() => openMoveCapability(item)}
                                      title={language.t("store.console.capabilities.move")}
                                    >
                                      <Icon name="folder" size="small" />
                                    </Button>
                                    <Button
                                      size="small"
                                      variant="ghost"
                                      class="h-8 w-8 p-0"
                                      onClick={() => openEditCapability(item)}
                                      title={language.t("store.console.capabilities.edit")}
                                    >
                                      <Icon name="edit" size="small" />
                                    </Button>
                                    <Button
                                      size="small"
                                      variant="ghost"
                                      class="h-8 w-8 p-0"
                                      onClick={() => void handleDeleteItem(item.id)}
                                      title={language.t("store.console.capabilities.delete")}
                                    >
                                      <Icon name="trash" size="small" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </For>
                        </tbody>
                      </table>
                    </div>
                  </Show>
                </Show>
              </section>

              <section class="rounded-2xl border border-border-weak-base bg-surface-raised-base p-5">
                <div class="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h2 class="text-lg font-semibold text-text-strong">
                      {language.t("store.notificationChannel.title")}
                    </h2>
                    <p class="mt-1 text-sm text-text-weak">{language.t("store.notificationChannel.description")}</p>
                  </div>
                  <Button size="small" variant="ghost" class="border border-border-weak-base" onClick={openCreateChannel}>
                    <Icon name="plus" class="size-4" />
                    {language.t("store.console.new")}
                  </Button>
                </div>

                <Show
                  when={!state.loadingChannels}
                  fallback={<div class="text-sm text-text-weak">{language.t("store.loading")}</div>}
                >
                  <Show
                    when={state.notificationChannels.length > 0}
                    fallback={
                      <div class="rounded-xl border border-dashed border-border-weak-base px-8 py-10 text-center text-sm text-text-weak">
                        {language.t("store.notificationChannel.empty")}
                      </div>
                    }
                  >
                    <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                      <For each={state.notificationChannels}>
                        {(channel) => (
                          <NotificationChannelCard
                            channel={channel}
                            onEdit={openEditChannel}
                            onDelete={handleDeleteChannel}
                            onToggle={handleToggleChannel}
                          />
                        )}
                      </For>
                    </div>
                  </Show>
                </Show>
              </section>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  )
}
