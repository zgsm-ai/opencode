import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { createEffect, createMemo, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useAuth } from "../hooks/use-auth"
import { getLoginUrl } from "../lib/auth"
import { repoApi, syncApi, type Repository, type SyncStatus } from "../lib/api"
import { ConfirmDialog } from "../components/confirm-dialog"
import { CreateRepoDialog } from "../components/create-repo-dialog"
import { EditRepoDialog } from "../components/edit-repo-dialog"
import { InviteDialog } from "../components/invite-dialog"
import { RepoSyncTab } from "../components/repo-sync-tab"

export default function DashboardRepositories() {
  const dialog = useDialog()
  const language = useLanguage()
  const { user, loading } = useAuth()
  const [state, setState] = createStore({
    repos: [] as Repository[],
    loadingRepos: false,
    expandedSyncRepo: null as string | null,
    syncingRepoId: null as string | null,
    syncStatuses: {} as Record<string, SyncStatus | undefined>,
  })

  const userId = createMemo(() => user()?.sub ?? "")

  const loadRepos = async () => {
    if (!userId()) return
    setState("loadingRepos", true)
    try {
      const res = await repoApi.listMy(userId())
      setState("repos", res.repositories ?? [])
    } finally {
      setState("loadingRepos", false)
    }
  }

  let loaded = false
  createEffect(() => {
    if (!userId() || loaded) return
    loaded = true
    void loadRepos()
  })

  let statusTimer: ReturnType<typeof setInterval> | undefined
  const loadSyncStatuses = async () => {
    const syncRepoIds = state.repos.filter((r) => r.repoType === "sync").map((r) => r.id)
    if (syncRepoIds.length === 0) return
    const results = await Promise.allSettled(
      syncRepoIds.map((id) => syncApi.getRepoSyncStatus(id).then((r) => ("registries" in r ? r.registries : [r]))),
    )
    const map: Record<string, SyncStatus> = {}
    syncRepoIds.forEach((id, i) => {
      const res = results[i]
      if (res.status === "fulfilled" && res.value.length > 0) {
        const reg = res.value[0]
        map[id] = {
          syncStatus: reg.syncStatus ?? "idle",
          lastSyncedAt: "lastSyncedAt" in reg ? reg.lastSyncedAt : undefined,
          lastSyncSha: reg.lastSyncSha ?? "",
          pendingJobs: reg.pendingJobs ?? 0,
        }
      }
    })
    setState("syncStatuses", map)
  }

  createEffect(() => {
    if (state.repos.length === 0) return
    void loadSyncStatuses()
    statusTimer = setInterval(() => void loadSyncStatuses(), 15000)
    onCleanup(() => clearInterval(statusTimer))
  })

  const openCreateRepo = () => {
    if (!userId()) return
    dialog.show(() => (
      <CreateRepoDialog
        userId={userId()}
        onCreated={(repo) => {
          setState("repos", (prev) => [repo, ...prev])
          void loadRepos()
        }}
      />
    ))
  }

  const openEditRepo = (repo: Repository) => {
    dialog.show(() => (
      <EditRepoDialog
        repo={repo}
        onSaved={(updated) => {
          setState("repos", (prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
        }}
      />
    ))
  }

  const openInvite = (repo: Repository) => {
    dialog.show(() => <InviteDialog repoId={repo.id} currentUserId={userId()} />)
  }

  const handleDeleteRepo = (id: string) => {
    dialog.show(() => (
      <ConfirmDialog
        title={language.t("store.console.repositories.delete")}
        description={language.t("store.console.confirmDeleteRepository")}
        confirm={language.t("common.delete")}
        onConfirm={async () => {
          await repoApi.delete(id)
          setState("repos", (prev) => prev.filter((item) => item.id !== id))
          showToast({ title: language.t("store.console.repositories.toast.deleteSuccess") })
        }}
      />
    ))
  }

  const syncNow = async (id: string) => {
    if (state.syncingRepoId) return
    setState("syncingRepoId", id)
    try {
      await syncApi.triggerRepoSync(id)
      showToast({ title: language.t("store.sync.toast.started") })
    } catch (err) {
      showToast({
        title: language.t("store.sync.toast.startFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setState("syncingRepoId", null)
    }
  }

  const visibilityLabel = (visibility?: string | null) => {
    if (!visibility || visibility === "public") return language.t("store.capabilityDialog.visibility.public")
    if (visibility === "private") return language.t("store.capabilityDialog.visibility.private")
    if (visibility === "repo") return language.t("store.capabilityDialog.visibility.repository")
    return visibility
  }

  const visColor = (vis?: string | null) => {
    if (vis === "public") return { bg: "color-mix(in srgb, #22c55e 12%, transparent)", c: "#22c55e" }
    if (vis === "private") return { bg: "color-mix(in srgb, #f59e0b 12%, transparent)", c: "#f59e0b" }
    return { bg: "rgba(156,163,175,0.12)", c: "var(--st-text-secondary)" }
  }

  const syncStatusLabel = (status?: string) => {
    if (!status || status === "idle") return language.t("store.sync.status.idle")
    if (status === "running" || status === "pending") return language.t("store.sync.status.running")
    if (status === "success") return language.t("store.sync.status.success")
    if (status === "failed") return language.t("store.sync.status.failed")
    return status
  }

  const syncStatusColor = (status?: string) => {
    if (!status || status === "idle") return "var(--st-text-secondary)"
    if (status === "running" || status === "pending") return "#3b82f6"
    if (status === "success") return "#22c55e"
    if (status === "failed") return "#ef4444"
    return "var(--st-text-secondary)"
  }

  return (
    <Show
      when={!loading()}
      fallback={<div class="store-dash-empty">{language.t("store.loading")}</div>}
    >
      <Show
        when={user()}
        fallback={
          <div class="store-dash-empty" style={{ "min-height": "40vh", display: "flex", "align-items": "center", "justify-content": "center" }}>
            <div style={{ "text-align": "center" }}>
              <h1 class="store-tbar-title">{language.t("store.console")}</h1>
              <p class="store-tbar-sub" style={{ "margin-bottom": "0.75rem" }}>{language.t("store.console.authDescription")}</p>
              <button
                class="store-fbtn store-fbtn-primary"
                onClick={() => { window.location.href = getLoginUrl("/store/dashboard/repositories") }}
              >
                {language.t("store.console.login")}
              </button>
            </div>
          </div>
        }
      >
        <section class="store-cshell">
          <div class="store-tbar">
            <div>
              <h2 class="store-tbar-title">{language.t("store.console.repositories.title")}</h2>
              <p class="store-tbar-sub">{language.t("store.console.repositories.description")}</p>
            </div>
            <button class="store-fbtn store-fbtn-primary" onClick={openCreateRepo}>
              <Icon name="plus" size="small" />
              {language.t("store.console.newRepository")}
            </button>
          </div>

          <Show
            when={!state.loadingRepos}
            fallback={<div class="store-dash-empty">{language.t("store.console.repositories.loading")}</div>}
          >
            <Show
              when={state.repos.length > 0}
              fallback={
                <div class="store-dash-empty">
                  {language.t("store.console.repositories.empty")}
                </div>
              }
            >
              <div class="store-dash-grid">
                <For each={state.repos}>
                  {(repo) => {
                    const vc = () => visColor(repo.visibility)
                    return (
                      <div class="store-dash-card">
                        <div class="store-dash-card-head">
                          <span class="store-dash-card-name" title={repo.displayName || repo.name}>
                            {repo.displayName || repo.name}
                          </span>
                          <span
                            class="store-dash-pill"
                            style={{ background: vc().bg, color: vc().c }}
                          >
                            {visibilityLabel(repo.visibility)}
                          </span>
                        </div>
                        <div class="store-dash-card-slug">{repo.name}</div>
                        <p class="store-dash-card-desc">{repo.description || ""}</p>

                        <Show when={repo.repoType === "sync"}>
                          {(() => {
                            const s = state.syncStatuses[repo.id]
                            const status = s?.syncStatus
                            const isRunning = status === "running" || status === "pending"
                            return (
                              <div
                                class="store-dash-card-status"
                                style={{ color: syncStatusColor(status) }}
                              >
                                <span
                                  class={`store-dash-card-status-dot${isRunning ? " store-dash-card-status-dot-pulse" : ""}`}
                                  style={{ background: syncStatusColor(status) }}
                                />
                                {syncStatusLabel(status)}
                                <Show when={s?.lastSyncedAt}>
                                  <span style={{ color: "var(--st-text-secondary)", "margin-left": "0.25rem" }}>
                                    · {new Date(s!.lastSyncedAt!).toLocaleString()}
                                  </span>
                                </Show>
                              </div>
                            )
                          })()}
                        </Show>

                        <div class="store-dash-card-foot">
                          <Show when={repo.repoType === "sync"}>
                            <button
                              class="store-abtn"
                              title={language.t("store.sync.syncNow")}
                              disabled={state.syncingRepoId === repo.id}
                              onClick={() => void syncNow(repo.id)}
                            >
                              <Icon name="reset" size="small" />
                            </button>
                            <button
                              class="store-abtn"
                              title={
                                state.expandedSyncRepo === repo.id
                                  ? language.t("store.console.repositories.hideSync")
                                  : language.t("store.console.repositories.syncSettings")
                              }
                              onClick={() =>
                                setState("expandedSyncRepo", state.expandedSyncRepo === repo.id ? null : repo.id)
                              }
                            >
                              <Icon name="settings-gear" size="small" />
                            </button>
                          </Show>
                          <button
                            class="store-abtn"
                            title={language.t("store.console.repositories.invite")}
                            onClick={() => openInvite(repo)}
                          >
                            <Icon name="plus-small" size="small" />
                          </button>
                          <button
                            class="store-abtn"
                            title={language.t("store.console.repositories.edit")}
                            onClick={() => openEditRepo(repo)}
                          >
                            <Icon name="edit" size="small" />
                          </button>
                          <button
                            class="store-abtn"
                            title={language.t("store.console.repositories.delete")}
                            onClick={() => handleDeleteRepo(repo.id)}
                          >
                            <Icon name="trash" size="small" />
                          </button>
                        </div>

                        <Show when={repo.repoType === "sync" && state.expandedSyncRepo === repo.id}>
                          <div style={{ "margin-top": "0.75rem", "border-top": "1px solid color-mix(in srgb, var(--st-border-subtle) 8%, transparent)", "padding-top": "0.75rem" }}>
                            <RepoSyncTab repoId={repo.id} />
                          </div>
                        </Show>
                      </div>
                    )
                  }}
                </For>
              </div>
            </Show>
          </Show>
        </section>
      </Show>
    </Show>
  )
}
