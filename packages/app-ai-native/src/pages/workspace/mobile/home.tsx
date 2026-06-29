import { createSignal, createMemo, For, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { Icon } from "@opencode-ai/ui/icon"
import { useWorkspace } from "../context"
import { useActiveWorkspace } from "../active-workspace"
import { useLanguage } from "@/context/language"
import { WorkspaceCard, getPrimaryDirectory, getDeviceStatusDot } from "../components/workspace-card"
import type { Workspace } from "../types"
import WorkspaceHome from "../pages/home"

export function MobileWorkspaceHome() {
  const preview = import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview")
  if (preview) return <WorkspaceHome />

  const language = useLanguage()
  const t = language.t
  const navigate = useNavigate()
  const work = useWorkspace()
  const active = useActiveWorkspace()
  const [searchQuery, setSearchQuery] = createSignal("")

  const filteredWorkspaces = createMemo(() => {
    const query = searchQuery().toLowerCase()
    const all = work.workspaces()
    if (!query) return all
    return all.filter(
      (workspace) =>
        workspace.name.toLowerCase().includes(query) ||
        workspace.description?.toLowerCase().includes(query) ||
        getPrimaryDirectory(workspace)?.path.toLowerCase().includes(query),
    )
  })

  const runningIds = createMemo(() =>
    filteredWorkspaces()
      .filter((w) => work.enabledWorkspaceIds().includes(w.id))
      .map((w) => w.id),
  )

  const idleIds = createMemo(() =>
    filteredWorkspaces()
      .filter((w) => !work.enabledWorkspaceIds().includes(w.id))
      .map((w) => w.id),
  )

  const handleOpenWorkspace = (workspace: Workspace) => {
    if (!workspace.deviceUniqueId) return
    work.enableWorkspace(workspace.id)
    navigate(`/m/workspace/${workspace.id}`)
  }

  const handleCloseWorkspace = (workspace: Workspace) => {
    work.disableWorkspace(workspace.id)
    if (active?.id === workspace.id) active.clear()
  }

  return (
    <div class="flex flex-col h-full min-h-0">
      {/* Search */}
      <div class="shrink-0 px-4 py-3">
        <div class="flex h-10 w-full items-center rounded-[var(--native-radius-md)] border border-border bg-[var(--native-surface)] shadow-[var(--native-shadow-sm)] transition-all duration-200 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
          <Icon name="magnifying-glass" class="size-4 text-text-weak shrink-0 ml-3" />
          <input
            type="text"
            placeholder={t("workspace.search.placeholder")}
            value={searchQuery()}
            onInput={(e: Event) => setSearchQuery((e.target as HTMLInputElement).value)}
            class="flex-1 min-w-0 h-full px-2 text-sm bg-transparent text-text-base placeholder:text-text-weak focus:outline-none"
          />
          <Show when={searchQuery()}>
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              class="flex items-center justify-center size-7 rounded-full text-text-weak hover:text-text-base hover:bg-[var(--surface-base-hover)] transition-colors cursor-pointer mr-1"
            >
              <Icon name="close" class="size-3.5" />
            </button>
          </Show>
        </div>
      </div>

      {/* Workspace List */}
      <div class="flex-1 min-h-0 overflow-y-auto thin-scrollbar px-3 pb-4">
        <Show when={runningIds().length > 0}>
          <div class="mb-4">
            <div class="mb-2 flex items-center gap-1.5 px-2 py-1.5">
              <span class="text-[12px] font-semibold uppercase tracking-[0.12em] text-text-weak">{t("workspace.running")}</span>
              <span class="ml-auto rounded-full bg-[color:color-mix(in_oklab,var(--native-primary)_8%,transparent)] px-2 py-0.5 text-[11px] font-medium text-[var(--native-primary)]">
                {runningIds().length}
              </span>
            </div>
            <div class="flex flex-col gap-2">
              <For each={runningIds()}>
                {(id) => <WorkspaceCard id={id} isRunning={true} onOpen={handleOpenWorkspace} onClose={handleCloseWorkspace} />}
              </For>
            </div>
          </div>
        </Show>

        <div>
          <div class="mb-2 flex items-center gap-1.5 px-2 py-1.5">
            <span class="text-[12px] font-semibold uppercase tracking-[0.12em] text-text-weak">{t("workspace.idle")}</span>
            <span class="ml-auto rounded-full bg-[color:color-mix(in_oklab,var(--native-panel)_82%,var(--native-bg-subtle))] px-2 py-0.5 text-[11px] font-medium text-text-weak">
              {idleIds().length}
            </span>
          </div>
          <div class="flex flex-col gap-2">
            <For each={idleIds()}>
              {(id) => <WorkspaceCard id={id} isRunning={false} onOpen={handleOpenWorkspace} onClose={handleCloseWorkspace} />}
            </For>
            <Show when={filteredWorkspaces().length === 0}>
              <div class="flex flex-col items-center justify-center rounded-[var(--native-radius-lg)] border border-border bg-[var(--native-surface)] py-10 text-text-weak">
                <Icon name="folder" class="mb-2 size-8 opacity-30" />
                <span class="text-sm font-medium text-text-weak">{t("workspace.empty")}</span>
                <span class="mt-1 text-xs leading-[1.5] text-text-weak/60">{t("workspace.emptyHint")}</span>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  )
}
