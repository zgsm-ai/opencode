import { createSignal, createMemo, For, Show } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
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
import { WorkspaceCard, getPrimaryDirectory } from "./workspace-card"

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
  } = work

  const params = useParams()
  const navigate = useNavigate()
  const { navigateToNewSession } = useWorkspaceNavigate()

  const isEnabled = (workspace: Workspace) => enabledWorkspaceIds().includes(workspace.id)

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

  const onlineDevices = createMemo(() => devices().filter((d) => d.status === "online"))

  const handleCreateWorkspace = (device: Device) => {
    dialog.show(() => (
      <CreateWorkspaceDialogContent
        device={device}
        workspaceNames={workspaces().map((workspace) => workspace.name)}
        onCreate={async (directory: string, name: string) => {
          await createWorkspace(device.id, directory, name)
        }}
      />
    ))
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
        <div class="flex items-center gap-1">
          <div class="flex h-8 flex-1 items-center rounded-[var(--native-radius-sm)] border border-sidebar-border bg-[color:color-mix(in_oklab,var(--native-panel)_82%,var(--native-bg-subtle))] shadow-[var(--native-shadow-sm)] transition-all duration-200 focus-within:border-sidebar-ring focus-within:ring-1 focus-within:ring-sidebar-ring">
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
          <DropdownMenu>
            <DropdownMenu.Trigger
              as={IconButton}
              icon="plus-small"
              variant="ghost"
              class="size-8 shrink-0 rounded-[var(--native-radius-sm)] border border-sidebar-border cursor-pointer text-sidebar-foreground/70 hover:text-sidebar-foreground"
              aria-label={t("workspace.createFromDevice")}
            />
            <DropdownMenu.Portal>
              <DropdownMenu.Content class="w-56 bg-sidebar shadow-md">
                <DropdownMenu.Group>
                  <DropdownMenu.GroupLabel>{t("workspace.createFromDevice")}</DropdownMenu.GroupLabel>
                  <Show
                    when={onlineDevices().length > 0}
                    fallback={
                      <div class="flex flex-col items-center gap-1 px-2 py-4 text-center">
                        <Icon name="server" class="size-6 text-sidebar-foreground/30" />
                        <span class="text-xs text-sidebar-foreground/50">{t("workspace.createFromDevice.empty")}</span>
                      </div>
                    }
                  >
                    <DropdownMenu.Separator class="bg-sidebar-border" />
                    <For each={onlineDevices()}>
                      {(device) => (
                        <DropdownMenu.Item class="hover:bg-sidebar-accent" onSelect={() => handleCreateWorkspace(device)}>
                          <Icon name="server" size="small" class="size-4 shrink-0 text-sidebar-foreground/70" />
                          <DropdownMenu.ItemLabel class="truncate">{device.displayName}</DropdownMenu.ItemLabel>
                        </DropdownMenu.Item>
                      )}
                    </For>
                  </Show>
                </DropdownMenu.Group>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu>
        </div>
      </div>

      <div class="thin-scrollbar min-h-0 overflow-y-auto py-1 pr-1" classList={{ "flex-1": isDeviceListCollapsed(), "flex-[3]": !isDeviceListCollapsed() }}>
        <Show when={runningIds().length > 0}>
          <div class="mb-3 px-2">
            <div class="mb-1 flex items-center gap-1.5 px-2.5 py-1.5">
              <span class="text-[11px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/70">{t("workspace.running")}</span>
              <span class="ml-auto rounded-[var(--native-radius-full)] bg-[color:color-mix(in_oklab,var(--native-primary)_8%,transparent)] px-2 py-0.5 text-[11px] font-medium text-[var(--native-primary)]">{runningIds().length}</span>
              <Tooltip value={t("workspace.closeAllRunning")} placement="bottom">
                <IconButton
                  icon="close"
                  variant="ghost"
                  iconSize="small"
                  class="size-7 rounded-lg cursor-pointer text-sidebar-foreground/70 hover:text-sidebar-foreground"
                  onClick={() => {
                    const ids = runningIds()
                    for (const id of ids) {
                      disableWorkspace(id)
                    }
                    if (active.id && ids.includes(active.id)) active.clear()
                    navigate("/workspace")
                  }}
                  aria-label={t("workspace.closeAllRunning")}
                />
              </Tooltip>
            </div>
            <div class="flex flex-col gap-1">
              <For each={runningIds()}>{(id) => <WorkspaceCard id={id} isRunning={true} onOpen={handleOpenWorkspace} onClose={handleCloseWorkspace} />}</For>
            </div>
          </div>
        </Show>

        <div class="px-2">
          <div class="mb-1 flex items-center gap-1.5 px-2.5 py-1.5">
            <span class="text-[11px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/70">{t("workspace.idle")}</span>
            <span class="ml-auto rounded-[var(--native-radius-full)] bg-[color:color-mix(in_oklab,var(--native-panel)_82%,var(--native-bg-subtle))] px-2 py-0.5 text-[11px] font-medium text-sidebar-foreground/55">{idleIds().length}</span>
          </div>
          <div class="flex flex-col gap-1.5">
            <For each={idleIds()}>{(id) => <WorkspaceCard id={id} isRunning={false} onOpen={handleOpenWorkspace} onClose={handleCloseWorkspace} />}</For>
            <Show when={filteredWorkspaces().length === 0}>
              <div class="flex flex-col items-center justify-center rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--native-surface)_72%,var(--native-panel))] py-8 text-sidebar-foreground/50">
                <Icon name="folder" class="mb-2 size-8 opacity-30" />
                <span class="text-xs font-medium text-sidebar-foreground/65">{t("workspace.empty")}</span>
                <span class="mt-1 text-[11px] leading-[1.5] text-sidebar-foreground/40">{t("workspace.emptyHint")}</span>
              </div>
            </Show>
          </div>
        </div>
      </div>

      <div class="thin-scrollbar min-h-0 overflow-y-auto pt-1" classList={{ "shrink-0": isDeviceListCollapsed(), "flex-[2]": !isDeviceListCollapsed() }}>
        <DeviceList
          devices={devices}
          onCreateWorkspace={handleCreateWorkspace}
          searchQuery={deviceSearchQuery}
          onSearchChange={setDeviceSearchQuery}
          isCollapsed={isDeviceListCollapsed}
          onToggleCollapse={() => setIsDeviceListCollapsed((v) => !v)}
          onUpgradeCompleted={work.refreshDevices}
          onRefresh={work.refreshDevices}
        />
      </div>
    </aside>
  )
}
