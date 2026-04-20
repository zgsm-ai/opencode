import { createSignal, createMemo, For, Show } from "solid-js"
import { useParams } from "@solidjs/router"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import type { Device, DeviceStatus, Workspace, WorkspaceDirectory } from "../types"
import { DeviceList } from "./device-list"
import { CreateWorkspaceDialogContent } from "./create-workspace-dialog"
import { useWorkspace } from "../context"
import { useWorkspaceNavigate } from "@/hooks/use-workspace-navigate"
import { useActiveWorkspace } from "../active-workspace"
import { useLanguage } from "@/context/language"

export function WorkspaceSidebar(props: { hide?: () => void } = {}) {
  const language = useLanguage()
  const t = language.t
  const dialog = useDialog()
  const hide = () => props.hide?.()
  const active = useActiveWorkspace()!
  const work = useWorkspace()
  const collapse = () => {
    if (props.hide) {
      props.hide()
      return
    }
    work.closeSidebar()
  }
  const {
    workspaces,
    devices,
    enabledWorkspaceIds,
    enableWorkspace,
    disableWorkspace,
    createWorkspace,
    deleteWorkspace,
    renameWorkspace,
  } = work

  const params = useParams()
  const { navigateToNewSession } = useWorkspaceNavigate()

  const isEnabled = (workspace: Workspace) => enabledWorkspaceIds().includes(workspace.id)

  const getPrimaryDirectory = (workspace: Workspace): WorkspaceDirectory | undefined => {
    if (!workspace.directories || workspace.directories.length === 0) return undefined
    return workspace.directories.find((d) => d.isDefault) || workspace.directories[0]
  }

  const handleOpenWorkspace = (workspace: Workspace) => {
    if (!workspace.deviceUniqueId) return
    enableWorkspace(workspace.id)
    navigateToNewSession({ workspaceId: workspace.id })
    hide()
  }

  const handleCloseWorkspace = (workspace: Workspace) => {
    disableWorkspace(workspace.id)
    if (active.id === workspace.id) active.clear()
  }

  const [workspaceSearchQuery, setWorkspaceSearchQuery] = createSignal("")
  const [deviceSearchQuery, setDeviceSearchQuery] = createSignal("")
  const [isDeviceListCollapsed, setIsDeviceListCollapsed] = createSignal(false)

  const getDeviceStatusDot = (status?: DeviceStatus) => {
    switch (status) {
      case "online":
        return { online: true, offline: false, text: t("workspace.device.online") }
      case "offline":
        return { online: false, offline: true, text: t("workspace.device.offline") }
      default:
        return { online: false, offline: false, text: t("workspace.device.unbound") }
    }
  }

  const filteredWorkspaces = createMemo(() => {
    const query = workspaceSearchQuery().toLowerCase()
    const all = workspaces()
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
      .filter((w) => isEnabled(w))
      .map((w) => w.id),
  )
  const idleIds = createMemo(() =>
    filteredWorkspaces()
      .filter((w) => !isEnabled(w))
      .map((w) => w.id),
  )

  const findWorkspace = (id: string) => workspaces().find((w) => w.id === id)

  const handleCreateWorkspace = (device: Device) => {
    dialog.show(() => (
      <CreateWorkspaceDialogContent
        device={device}
        onCreate={async (directory: string) => {
          await createWorkspace(device.id, directory)
        }}
      />
    ))
  }

  const WorkspaceCard = (cardProps: { id: string; isRunning: boolean }) => {
    const workspace = createMemo(() => findWorkspace(cardProps.id))
    const primaryDir = createMemo(() => {
      const ws = workspace()
      return ws ? getPrimaryDirectory(ws) : undefined
    })
    const dot = createMemo(() => getDeviceStatusDot(workspace()?.deviceStatus))
    const device = createMemo(() => {
      const ws = workspace()
      if (!ws?.deviceId) return undefined
      return devices().find((d) => d.id === ws.deviceId)
    })
    const [renaming, setRenaming] = createSignal(false)
    const [renameValue, setRenameValue] = createSignal("")

    const menu = () => (
      <DropdownMenu>
        <DropdownMenu.Trigger
          as={IconButton}
          icon="dot-grid"
          variant="ghost"
          class="size-7 rounded-lg cursor-pointer text-sidebar-foreground/70 hover:text-sidebar-foreground"
          aria-label={t("workspace.more")}
        />
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            class="min-w-36 bg-sidebar shadow-md"
          >
            <Show when={cardProps.isRunning}>
              <DropdownMenu.Item class="hover:bg-sidebar-accent" onSelect={() => handleCloseWorkspace(workspace()!)}>
                <Icon name="stop" size="small" class="size-4 text-sidebar-foreground/70" />
                <DropdownMenu.ItemLabel>{t("workspace.close")}</DropdownMenu.ItemLabel>
              </DropdownMenu.Item>
            </Show>
            <Show when={!cardProps.isRunning && !dot().offline}>
              <DropdownMenu.Item class="hover:bg-sidebar-accent" onSelect={() => handleOpenWorkspace(workspace()!)}>
                <Icon name="enter" size="small" class="size-4 text-sidebar-foreground/70" />
                <DropdownMenu.ItemLabel>{t("workspace.run")}</DropdownMenu.ItemLabel>
              </DropdownMenu.Item>
            </Show>
            <DropdownMenu.Item class="hover:bg-sidebar-accent" onSelect={startRename}>
              <Icon name="edit" size="small" class="size-4 text-sidebar-foreground/70" />
              <DropdownMenu.ItemLabel>{t("workspace.rename")}</DropdownMenu.ItemLabel>
            </DropdownMenu.Item>
            <Show when={!cardProps.isRunning}>
              <DropdownMenu.Separator class="bg-sidebar-border" />
              <DropdownMenu.Item class="hover:bg-sidebar-accent" onSelect={() => deleteWorkspace(cardProps.id)}>
                <Icon name="trash" size="small" class="size-4 text-destructive" />
                <DropdownMenu.ItemLabel>{t("workspace.delete")}</DropdownMenu.ItemLabel>
              </DropdownMenu.Item>
            </Show>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>
    )

    const startRename = () => {
      setRenameValue(workspace()?.name ?? "")
      setRenaming(true)
    }

    let committing = false
    const commitRename = async () => {
      if (committing) return
      committing = true
      setRenaming(false)
      const val = renameValue().trim()
      if (val && val !== workspace()?.name) {
        await renameWorkspace(cardProps.id, val).catch(() => null)
      }
      committing = false
    }

    const handleRenameKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") commitRename()
      if (e.key === "Escape") {
        committing = true
        setRenaming(false)
        committing = false
      }
    }

    const renameInput = () => (
      <input
        class="flex-1 min-w-0 rounded-[var(--native-radius-sm)] bg-[color:color-mix(in_oklab,var(--native-panel)_80%,var(--native-bg-subtle))] px-2 py-1 text-sm font-medium text-sidebar-foreground shadow-[var(--native-shadow-sm)] focus:outline-none focus:ring-1 focus:ring-sidebar-ring"
        value={renameValue()}
        placeholder={t("workspace.rename.placeholder")}
        onInput={(e: Event) => setRenameValue((e.target as HTMLInputElement).value)}
        onBlur={commitRename}
        onKeyDown={handleRenameKey}
        ref={(el) => setTimeout(() => el?.focus(), 0)}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      />
    )

    const detail = () => {
      const parts = [device()?.displayName, primaryDir()?.path].filter(Boolean)
      if (workspace()?.isDefault) parts.push(t("common.default"))
      return parts.join(" · ") || t("workspace.device.unbound")
    }

    const isActive = createMemo(() => params.workspaceID === cardProps.id)

    return (
      <Show when={workspace()}>
        {(ws) => (
          <div
            class="group/workspace flex items-center rounded-md transition-all duration-150 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            classList={{
              "bg-[color:color-mix(in_oklab,var(--native-primary)_8%,var(--native-panel))] text-sidebar-foreground shadow-[var(--native-shadow-sm)]": isActive(),
            }}
          >
            <Tooltip
              placement="bottom-end"
              value={detail()}
              class="flex-1 min-w-0"
              contentStyle={{
                background: "hsl(var(--sidebar-accent))",
                color: "hsl(var(--sidebar-accent-foreground))",
                "box-shadow": "var(--shadow-xs)",
              }}
            >
              <button
                class="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                classList={{
                  "text-sidebar-foreground font-medium cursor-pointer": isActive(),
                  "text-sidebar-foreground/75 cursor-pointer": !isActive() && !dot().offline,
                  "text-sidebar-foreground/40 cursor-not-allowed": dot().offline,
                }}
                onClick={() => {
                  if (!dot().offline) handleOpenWorkspace(ws())
                }}
              >
                <div
                  classList={{
                    "size-2 rounded-full shrink-0": true,
                    "bg-icon-success-base": dot().online,
                    "bg-icon-critical-base": dot().offline,
                    "bg-sidebar-border": !dot().online && !dot().offline,
                  }}
                />
                <Show
                  when={renaming()}
                  fallback={
                    <span
                      class="text-sm truncate flex-1"
                      onDblClick={(e: MouseEvent) => {
                        e.stopPropagation()
                        startRename()
                      }}
                    >
                      {workspace()?.name}
                    </span>
                  }
                >
                  {renameInput()}
                </Show>
              </button>
            </Tooltip>
            <div class="ml-auto flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity duration-150 group-hover/workspace:opacity-100 group-focus-within/workspace:opacity-100">
              {menu()}
            </div>
          </div>
        )}
      </Show>
    )
  }

  return (
    <aside class="flex h-full w-full flex-col bg-[linear-gradient(180deg,color-mix(in_oklab,var(--native-panel)_88%,var(--native-bg-subtle)),var(--native-panel))] text-sidebar-foreground">
      <div class="flex h-[41px] shrink-0 items-center gap-2 px-3">
        <span class="min-w-0 flex-1 font-[var(--native-font-display)] text-[1rem] font-semibold tracking-[-0.035em] text-sidebar-foreground">{t("workspace.page.title")}</span>
        <Show when={params.workspaceID}>
          <Tooltip value={t("workspace.sidebar.collapse")} placement="bottom">
            <IconButton
              icon="chevron-left"
              variant="ghost"
              iconSize="small"
              onClick={collapse}
              aria-label={t("workspace.sidebar.collapse")}
            />
          </Tooltip>
        </Show>
      </div>

      <div class="shrink-0 px-3 py-2.5">
        <div class="flex h-8 w-full items-center rounded-[var(--native-radius-sm)] border border-sidebar-border bg-[color:color-mix(in_oklab,var(--native-panel)_82%,var(--native-bg-subtle))] shadow-[var(--native-shadow-sm)] transition-all duration-200 focus-within:border-sidebar-ring focus-within:ring-1 focus-within:ring-sidebar-ring">
          <Icon name="magnifying-glass" class="size-4 text-sidebar-foreground/50 shrink-0 ml-3" />
          <input
            type="text"
            placeholder={t("workspace.search.placeholder")}
            value={workspaceSearchQuery()}
            onInput={(e: Event) => setWorkspaceSearchQuery((e.target as HTMLInputElement).value)}
            class="flex-1 min-w-0 h-full px-2 text-sm bg-transparent text-sidebar-foreground placeholder:text-sidebar-foreground/50 focus:outline-none"
          />
          <Show when={workspaceSearchQuery()}>
            <button
              type="button"
              onClick={() => setWorkspaceSearchQuery("")}
              class="flex items-center justify-center size-6 rounded-full text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer mr-1"
            >
              <Icon name="close" class="size-3.5" />
            </button>
          </Show>
        </div>
      </div>

      <div class="custom-scrollbar flex-[3] min-h-0 overflow-y-auto py-1 pr-1">
        <Show when={runningIds().length > 0}>
          <div class="mb-3 px-2">
            <div class="mb-1 flex items-center gap-1.5 px-2.5 py-1.5">
              <span class="text-[11px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/70">{t("workspace.running")}</span>
              <span class="ml-auto rounded-[var(--native-radius-full)] bg-[color:color-mix(in_oklab,var(--native-primary)_8%,transparent)] px-2 py-0.5 text-[11px] font-medium text-[var(--native-primary)]">{runningIds().length}</span>
            </div>
            <div class="flex flex-col gap-1">
              <For each={runningIds()}>{(id) => <WorkspaceCard id={id} isRunning={true} />}</For>
            </div>
          </div>
        </Show>

        <div class="px-2">
          <div class="mb-1 flex items-center gap-1.5 px-2.5 py-1.5">
            <span class="text-[11px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/70">{t("workspace.idle")}</span>
            <span class="ml-auto rounded-[var(--native-radius-full)] bg-[color:color-mix(in_oklab,var(--native-panel)_82%,var(--native-bg-subtle))] px-2 py-0.5 text-[11px] font-medium text-sidebar-foreground/55">{idleIds().length}</span>
          </div>
          <div class="flex flex-col gap-1.5">
            <For each={idleIds()}>{(id) => <WorkspaceCard id={id} isRunning={false} />}</For>
            <Show when={filteredWorkspaces().length === 0}>
              <div class="native-panel-soft flex flex-col items-center justify-center py-8 text-sidebar-foreground/50">
                <Icon name="folder" class="mb-2 size-8 opacity-30" />
                <span class="text-xs font-medium text-sidebar-foreground/65">{t("workspace.empty")}</span>
                <span class="mt-1 text-[11px] leading-[1.5] text-sidebar-foreground/40">{t("workspace.emptyHint")}</span>
              </div>
            </Show>
          </div>
        </div>
      </div>

      <div class="custom-scrollbar flex-[2] min-h-0 overflow-y-auto pt-1">
        <DeviceList
          devices={devices}
          onCreateWorkspace={handleCreateWorkspace}
          searchQuery={deviceSearchQuery}
          onSearchChange={setDeviceSearchQuery}
          isCollapsed={isDeviceListCollapsed}
          onToggleCollapse={() => setIsDeviceListCollapsed((v) => !v)}
        />
      </div>
    </aside>
  )
}
