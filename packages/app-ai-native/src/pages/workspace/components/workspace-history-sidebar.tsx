import { createMemo, For, Show, createEffect, on, createSignal } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Button } from "@opencode-ai/ui/button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { DateTime } from "luxon"
import type { Workspace, WorkspaceDirectory } from "../types"
import { useGlobalSync } from "@/context/global-sync"
import { sortedRootSessions } from "@/pages/layout/helpers"
import type { Session } from "@opencode-ai/sdk/v2/client"
import { useWorkspaceNavigate } from "@/hooks/use-workspace-navigate"
import { useActiveWorkspace } from "../active-workspace"
import { useLanguage } from "@/context/language"

export type WorkspaceHistorySidebarProps = {
  workspace: Workspace | undefined
  onClose: () => void
}

export function WorkspaceHistorySidebar(props: WorkspaceHistorySidebarProps) {
  const language = useLanguage()
  const t = language.t
  const globalSync = useGlobalSync()
  const active = useActiveWorkspace()!
  const { navigateToSession, navigateToNewSession, encodeDirectory } = useWorkspaceNavigate()
  const [isLoading, setIsLoading] = createSignal(false)

  const directories = createMemo(() => props.workspace?.directories ?? [])

  const sessions = createMemo(() => {
    const dirs = directories()
    if (dirs.length === 0) return []

    const allSessions: Array<{ session: Session; directory: WorkspaceDirectory }> = []
    const now = Date.now()

    for (const dir of dirs) {
      const [store] = globalSync.child(dir.path, { bootstrap: false })
      const dirSessions = sortedRootSessions(store, now)
      for (const session of dirSessions) {
        allSessions.push({ session, directory: dir })
      }
    }

    return allSessions
      .sort(
        (a, b) =>
          (b.session.time.updated ?? b.session.time.created) - (a.session.time.updated ?? a.session.time.created),
      )
      .slice(0, 20)
  })

  createEffect(
    on(
      () => props.workspace?.id,
      async (workspaceId) => {
        if (!workspaceId) return

        setIsLoading(true)
        try {
          const dirs = directories()
          for (const dir of dirs) {
            await globalSync.project.loadSessions(dir.path)
          }
        } finally {
          setIsLoading(false)
        }
      },
    ),
  )

  const handleSessionClick = (session: Session) => {
    const workspaceId = props.workspace?.id ?? active.id
    if (!workspaceId) return
    navigateToSession(session.id, { workspaceId, dir: encodeDirectory(session.directory) })
  }

  const handleNewSession = () => {
    const workspaceId = props.workspace?.id ?? active.id
    if (!workspaceId) return
    const dirs = directories()
    const primary = dirs.find((d) => d.isDefault) ?? dirs[0]
    const dir = primary ? encodeDirectory(primary.path) : "default"
    navigateToNewSession({ workspaceId, dir })
  }

  return (
    <div class="flex flex-col h-full w-80 bg-surface-base border-l border-border-weak-base">
      <div class="shrink-0 flex items-center justify-between p-3 border-b border-border-weak-base">
        <div class="flex items-center gap-2">
          <Icon name="bubble-5" class="size-4 text-text-weak" />
          <span class="text-14-medium text-text-strong">{t("workspace.history.title")}</span>
        </div>
        <IconButton icon="close" variant="ghost" size="small" onClick={props.onClose} />
      </div>

      <Show when={props.workspace}>
        {(workspace) => (
          <>
            <div class="shrink-0 px-3 py-2 border-b border-border-weak-base">
              <div class="text-13-medium text-text-strong truncate">{workspace().name}</div>
              <Show when={workspace().description}>
                <div class="text-11-regular text-text-weak truncate mt-0.5">{workspace().description}</div>
              </Show>
            </div>

            <div class="shrink-0 p-2">
              <Button size="small" icon="plus-small" class="w-full" onClick={handleNewSession}>
                {t("workspace.history.createSession")}
              </Button>
            </div>

            <div class="flex-1 min-h-0 overflow-y-auto">
              <Show
                when={!isLoading()}
                fallback={
                  <div class="flex items-center justify-center py-8">
                    <Spinner class="size-5" />
                  </div>
                }
              >
                <Show
                  when={sessions().length > 0}
                  fallback={
                    <div class="flex flex-col items-center justify-center py-8 text-text-weak">
                      <Icon name="bubble-5" class="size-8 mb-2 opacity-30" />
                      <span class="text-12-regular">{t("workspace.history.empty")}</span>
                    </div>
                  }
                >
                  <nav class="flex flex-col gap-1 p-2">
                    <For each={sessions()}>
                      {({ session, directory }) => (
                        <button
                          class="group flex flex-col gap-1 p-2 rounded-md text-left hover:bg-surface-base-hover transition-colors"
                          onClick={() => handleSessionClick(session)}
                        >
                          <div class="flex items-center gap-2">
                            <Icon name="bubble-5" class="size-3.5 text-text-weak shrink-0" />
                            <span class="text-13-regular text-text-strong truncate flex-1">
                              {session.title || t("workspace.session.new")}
                            </span>
                          </div>
                          <div class="flex items-center gap-2 pl-5.5">
                            <span class="text-11-regular text-text-weak truncate">{directory.name}</span>
                            <span class="text-10-regular text-text-weaker">
                              {DateTime.fromMillis(session.time.updated ?? session.time.created).toRelative()}
                            </span>
                          </div>
                        </button>
                      )}
                    </For>
                  </nav>
                </Show>
              </Show>
            </div>
          </>
        )}
      </Show>
    </div>
  )
}
