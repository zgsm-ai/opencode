import { createSignal, createMemo, createEffect, on, For, Show } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { Spinner } from "@opencode-ai/ui/spinner"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import type { Device, DeviceStatus, Workspace, WorkspaceDirectory } from "../types"
import { DeviceList } from "./device-list"
import { CreateWorkspaceDialogContent } from "./create-workspace-dialog"
import { useWorkspace } from "../context"
import { ServerConnection, useServer } from "@/context/server"
import { getProxyUrl } from "../lib/url"
import { useWorkspaceNavigate } from "@/hooks/use-workspace-navigate"
import { useActiveWorkspace } from "../active-workspace"
import { useLanguage } from "@/context/language"

export function WorkspaceSidebar() {
  const language = useLanguage()
  const t = language.t
  const dialog = useDialog()
  const active = useActiveWorkspace()!
  const {
    workspaces,
    devices,
    selectedDeviceId,
    enabledWorkspaceIds,
    selectWorkspace,
    selectDevice,
    enableWorkspace,
    disableWorkspace,
    createWorkspace,
    deleteWorkspace,
    renameWorkspace,
  } = useWorkspace()

  const server = useServer()
  const params = useParams()
  const rawNavigate = useNavigate()
  const { navigateToNewSession, encodeDirectory } = useWorkspaceNavigate()

  const isEnabled = (workspace: Workspace) => enabledWorkspaceIds().includes(workspace.id)

  const getPrimaryDirectory = (workspace: Workspace): WorkspaceDirectory | undefined => {
    if (!workspace.directories || workspace.directories.length === 0) return undefined
    return workspace.directories.find((d) => d.isDefault) || workspace.directories[0]
  }

  const handleOpenWorkspace = (workspace: Workspace) => {
    if (!workspace.deviceUniqueId) return
    enableWorkspace(workspace.id)
  }

  const handleCloseWorkspace = (workspace: Workspace) => {
    disableWorkspace(workspace.id)
    if (active.id === workspace.id) active.clear()
    if (params.workspaceID === workspace.id) rawNavigate("/workspace")
  }

  const handleSelectWorkspace = (workspace: Workspace) => {
    if (!workspace.deviceUniqueId) return
    selectWorkspace(workspace.id)
    active.setActive(workspace.id, { ...workspace })
    server.setActive(ServerConnection.Key.make(getProxyUrl(workspace.deviceUniqueId)))
    const primaryDir = getPrimaryDirectory(workspace)
    const dirSlug = primaryDir ? encodeDirectory(primaryDir.path) : "default"
    navigateToNewSession({ workspaceId: workspace.id, dir: dirSlug })
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

  // Use stable ID arrays so <For> tracks by string value equality, not object reference
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

  // Lookup helper: always reads from workspaces() to get latest data
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
    // Derive workspace reactively from the stable id
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
    const [open, setOpen] = createSignal(false)
    const [mounted, setMounted] = createSignal(false)
    const [renaming, setRenaming] = createSignal(false)
    const [renameValue, setRenameValue] = createSignal("")
    const toggle = () => {
      if (!mounted()) setMounted(true)
      setOpen((v) => !v)
    }

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
        class="flex-1 min-w-0 text-sm font-medium text-text-strong bg-surface-inset-base border border-border-strong-base rounded-lg px-2 py-0.5 focus:outline-none"
        value={renameValue()}
        placeholder={t("workspace.rename.placeholder")}
        onInput={(e: Event) => setRenameValue((e.target as HTMLInputElement).value)}
        onBlur={commitRename}
        onKeyDown={handleRenameKey}
        ref={(el) => setTimeout(() => el?.focus(), 0)}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      />
    )

    // Detail tooltip: device · path · default
    const detail = () => {
      const parts = [device()?.displayName, primaryDir()?.path].filter(Boolean)
      if (workspace()?.isDefault) parts.push(t("common.default"))
      return parts.join(" · ") || t("workspace.device.unbound")
    }

    if (cardProps.isRunning) {
      return (
        <Show when={workspace()}>
          {(ws) => (
            <div>
              <div
                class="group/workspace flex items-center rounded-lg transition-all duration-150 hover:bg-surface-base-hover"
                classList={{
                  "bg-surface-base-hover": params.workspaceID === cardProps.id,
                }}
              >
                <Tooltip
                  placement="bottom-end"
                  value={detail()}
                  class="flex-1 min-w-0"
                  contentStyle={{
                    background: "var(--surface-base-hover)",
                    color: "var(--text-base)",
                    border: "1px solid var(--border-weak-base)",
                    "box-shadow": "var(--shadow-xs)",
                  }}
                >
                  <button
                    class="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-150 cursor-pointer text-left"
                    classList={{
                      "text-text-strong font-medium": params.workspaceID === cardProps.id,
                      "text-text-strong": params.workspaceID !== cardProps.id,
                    }}
                    onClick={() => {
                      toggle()
                      if (params.workspaceID !== cardProps.id) {
                        const ws = workspace()
                        if (!ws?.deviceUniqueId) return
                        selectWorkspace(ws.id)
                        active.setActive(ws.id, { ...ws })
                        server.setActive(ServerConnection.Key.make(getProxyUrl(ws.deviceUniqueId)))
                        const dir = primaryDir()
                        const dirSlug = dir ? encodeDirectory(dir.path) : "default"
                        navigateToNewSession({ workspaceId: ws.id, dir: dirSlug })
                      }
                    }}
                  >
                    <div class="size-2 shrink-0 relative">
                      <div
                        classList={{
                          "size-2 rounded-full group-hover/workspace:opacity-0": true,
                          "bg-icon-success-base": dot().online,
                          "bg-icon-critical-base": dot().offline,
                          "bg-border-weak-base": !dot().online && !dot().offline,
                        }}
                      />
                      <Icon
                        name={open() ? "chevron-down" : "chevron-right"}
                        size="small"
                        class="size-4 text-icon-weak opacity-0 group-hover/workspace:opacity-100 absolute -left-1 -top-1"
                      />
                    </div>
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
                <div class="shrink-0 flex items-center gap-0.5 ml-auto opacity-0 group-hover/workspace:opacity-100 transition-opacity duration-150 pr-1">
                  <Tooltip placement="top" value={t("workspace.newSession")}>
                    <IconButton
                      icon="plus-small"
                      variant="ghost"
                      class="size-7 rounded-lg cursor-pointer"
                      aria-label={t("workspace.newSession")}
                      onClick={(event: MouseEvent) => {
                        event.stopPropagation()
                        if (!mounted()) setMounted(true)
                        if (!open()) setOpen(true)
                        const dir = primaryDir()
                        const dirSlug = dir ? encodeDirectory(dir.path) : "default"
                        navigateToNewSession({ workspaceId: cardProps.id, dir: dirSlug })
                      }}
                    />
                  </Tooltip>
                  <DropdownMenu>
                    <DropdownMenu.Trigger
                      as={IconButton}
                      icon="dot-grid"
                      variant="ghost"
                      class="size-7 rounded-lg cursor-pointer"
                      aria-label={t("workspace.more")}
                    />
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        class="min-w-36"
                        style={{
                          "background-color": "var(--surface-base)",
                          border: "none",
                          "box-shadow": "var(--shadow-xs-border)",
                          "--dropdown-item-hover": "var(--surface-base-hover)",
                        }}
                      >
                        <DropdownMenu.Item onSelect={() => handleCloseWorkspace(ws())}>
                          <Icon name="stop" size="small" class="size-4 text-icon-weak" />
                          <DropdownMenu.ItemLabel>{t("workspace.close")}</DropdownMenu.ItemLabel>
                        </DropdownMenu.Item>
                        <DropdownMenu.Item onSelect={startRename}>
                          <Icon name="edit" size="small" class="size-4 text-icon-weak" />
                          <DropdownMenu.ItemLabel>{t("workspace.rename")}</DropdownMenu.ItemLabel>
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator />
                        <DropdownMenu.Item onSelect={() => deleteWorkspace(cardProps.id)}>
                          <Icon name="trash" size="small" class="size-4 text-icon-critical-base" />
                          <DropdownMenu.ItemLabel>{t("workspace.delete")}</DropdownMenu.ItemLabel>
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu>
                </div>
              </div>
              <Show when={mounted()}>
                <div classList={{ hidden: !open() }}>
                  <WorkspaceSessions id={cardProps.id} />
                </div>
              </Show>
            </div>
          )}
        </Show>
      )
    }

    // Idle card: same nav-item style, click to launch
    return (
      <Show when={workspace()}>
        {(ws) => (
          <div
            class="group/workspace flex items-center rounded-lg transition-all duration-150 hover:bg-surface-base-hover"
            classList={{
              "bg-surface-base-hover": params.workspaceID === cardProps.id,
            }}
          >
            <Tooltip
              placement="bottom-end"
              value={detail()}
              class="flex-1 min-w-0"
              contentStyle={{
                background: "var(--surface-base-hover)",
                color: "var(--text-base)",
                border: "1px solid var(--border-weak-base)",
                "box-shadow": "var(--shadow-xs)",
              }}
            >
              <button
                class="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-150 text-left"
                classList={{
                  "text-text-strong font-medium": params.workspaceID === cardProps.id,
                  "text-text-weak": params.workspaceID !== cardProps.id && !dot().offline,
                  "text-text-weaker opacity-60 cursor-not-allowed": dot().offline,
                  "cursor-pointer": !dot().offline,
                }}
                onClick={() => {
                  if (!dot().offline) handleSelectWorkspace(ws())
                }}
              >
                <div
                  classList={{
                    "size-2 rounded-full shrink-0": true,
                    "bg-icon-success-base": dot().online,
                    "bg-icon-critical-base": dot().offline,
                    "bg-border-weak-base": !dot().online && !dot().offline,
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
            <div class="shrink-0 flex items-center gap-0.5 ml-auto opacity-0 group-hover/workspace:opacity-100 transition-opacity duration-150 pr-1">
              <DropdownMenu>
                <DropdownMenu.Trigger
                  as={IconButton}
                  icon="dot-grid"
                  variant="ghost"
                  class="size-7 rounded-lg cursor-pointer"
                  aria-label={t("workspace.more")}
                />
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    class="min-w-36"
                    style={{
                      "background-color": "var(--surface-base)",
                      border: "none",
                      "box-shadow": "var(--shadow-xs-border)",
                      "--dropdown-item-hover": "var(--surface-base-hover)",
                    }}
                  >
                    <Show when={!dot().offline}>
                      <DropdownMenu.Item onSelect={() => handleOpenWorkspace(ws())}>
                        <Icon name="enter" size="small" class="size-4 text-icon-weak" />
                        <DropdownMenu.ItemLabel>{t("workspace.run")}</DropdownMenu.ItemLabel>
                      </DropdownMenu.Item>
                    </Show>
                    <DropdownMenu.Item onSelect={startRename}>
                      <Icon name="edit" size="small" class="size-4 text-icon-weak" />
                      <DropdownMenu.ItemLabel>{t("workspace.rename")}</DropdownMenu.ItemLabel>
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item onSelect={() => deleteWorkspace(cardProps.id)}>
                      <Icon name="trash" size="small" class="size-4 text-icon-critical-base" />
                      <DropdownMenu.ItemLabel>{t("workspace.delete")}</DropdownMenu.ItemLabel>
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu>
            </div>
          </div>
        )}
      </Show>
    )
  }

  return (
    <aside class="flex flex-col h-full w-full bg-surface-base border-r border-border-weak-base">
      {/* Header */}
      <div class="shrink-0 h-[41px] px-3 border-b border-border-weak-base flex items-center">
        <div class="flex items-center gap-2.5">
          <span class="text-sm font-semibold text-text-strong">{t("workspace.page.title")}</span>
        </div>
      </div>

      {/* Search */}
      <div class="shrink-0 px-3 py-2.5">
        <div class="flex items-center h-9 w-full rounded-lg bg-surface-inset-base border border-border-weak-base focus-within:border-border-strong-base transition-all duration-200">
          <Icon name="magnifying-glass" class="size-4 text-text-weak shrink-0 ml-3" />
          <input
            type="text"
            placeholder={t("workspace.search.placeholder")}
            value={workspaceSearchQuery()}
            onInput={(e: Event) => setWorkspaceSearchQuery((e.target as HTMLInputElement).value)}
            class="flex-1 min-w-0 h-full px-2 text-sm bg-transparent placeholder:text-text-weak focus:outline-none"
          />
          <Show when={workspaceSearchQuery()}>
            <button
              type="button"
              onClick={() => setWorkspaceSearchQuery("")}
              class="flex items-center justify-center size-6 rounded-full text-icon-weak hover:text-icon-strong hover:bg-surface-inset-base transition-colors cursor-pointer mr-1"
            >
              <Icon name="close" class="size-3.5" />
            </button>
          </Show>
        </div>
      </div>

      {/* Workspace list — 60% */}
      <div class="flex-[3] min-h-0 overflow-y-auto thin-scrollbar py-1">
        {/* Running workspaces */}
        <Show when={runningIds().length > 0}>
          <div class="mb-2">
            <div class="flex items-center gap-1.5 px-3 py-1.5">
              <span class="text-xs font-medium text-text-weak uppercase tracking-wider">{t("workspace.running")}</span>
              <span class="text-[11px] text-text-weaker ml-auto">{runningIds().length}</span>
            </div>
            <div class="flex flex-col gap-0.5 px-2">
              <For each={runningIds()}>{(id) => <WorkspaceCard id={id} isRunning={true} />}</For>
            </div>
          </div>
        </Show>

        {/* Idle workspaces */}
        <div>
          <div class="flex items-center gap-1.5 px-3 py-1.5">
            <span class="text-xs font-medium text-text-weak uppercase tracking-wider">{t("workspace.idle")}</span>
            <span class="text-[11px] text-text-weaker ml-auto">{idleIds().length}</span>
          </div>
          <div class="flex flex-col gap-1.5 px-2">
            <For each={idleIds()}>{(id) => <WorkspaceCard id={id} isRunning={false} />}</For>
            <Show when={filteredWorkspaces().length === 0}>
              <div class="flex flex-col items-center justify-center py-8 text-text-weak">
                <Icon name="folder" class="size-8 mb-2 opacity-30" />
                <span class="text-xs">{t("workspace.empty")}</span>
                <span class="text-[11px] text-text-weaker mt-1">{t("workspace.emptyHint")}</span>
              </div>
            </Show>
          </div>
        </div>
      </div>

      {/* Device list — 40% */}
      <div class="flex-[2] min-h-0 overflow-y-auto thin-scrollbar border-t border-border-weak-base">
        <DeviceList
          devices={devices}
          selectedDeviceId={selectedDeviceId}
          onSelectDevice={selectDevice}
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

type SessionData = {
  id: string
  title: string
  directory: string
  time: { created: number; updated?: number }
  parentID?: string
}

const PAGE_SIZE = 10

/**
 * Loads and displays sessions for a workspace.
 * Accepts a stable `id` prop instead of a workspace object to avoid
 * SolidJS <For> reference-reuse bugs.
 */
function WorkspaceSessions(props: { id: string }) {
  const language = useLanguage()
  const t = language.t
  const { workspaces } = useWorkspace()
  const { navigateToSession, encodeDirectory: encodeDir } = useWorkspaceNavigate()
  const params = useParams()
  const [sessions, setSessions] = createSignal<SessionData[]>([])
  const [loading, setLoading] = createSignal(false)
  const [more, setMore] = createSignal(false)
  const [limit, setLimit] = createSignal(PAGE_SIZE)

  // Always derive workspace from the stable id
  const workspace = createMemo(() => workspaces().find((w) => w.id === props.id))
  const dirs = createMemo(() => workspace()?.directories ?? [])
  const device = createMemo(() => workspace()?.deviceUniqueId)

  const load = async (cap: number) => {
    const uid = device()
    if (!uid) return
    const directories = dirs()
    if (directories.length === 0) return
    // Capture id at call time for stale-check
    const target = props.id

    setLoading(true)
    try {
      const url = getProxyUrl(uid)
      const all: SessionData[] = []
      for (const dir of directories) {
        const qs = new URLSearchParams({ directory: dir.path, roots: "true", limit: String(cap) })
        const res = await fetch(`${url}/session?${qs}`, { credentials: "include" }).catch(() => null)
        if (!res?.ok) continue
        const body = await res.json().catch(() => [])
        const items = (Array.isArray(body) ? body : (body.data ?? [])) as SessionData[]
        for (const s of items) {
          if (!s.parentID && !all.some((x) => x.id === s.id)) all.push(s)
        }
      }
      // Stale guard: if the component's id changed while fetching, discard
      if (props.id !== target) return
      all.sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
      setMore(all.length >= cap)
      setSessions(all)
    } finally {
      setLoading(false)
    }
  }

  // Track whether initial load has been done
  let loaded = false

  // Reload when the workspace's directories or device changes
  createEffect(
    on([dirs, device], ([newDirs, newDevice], prev) => {
      if (!loaded) {
        loaded = true
        load(PAGE_SIZE)
        return
      }
      if (!prev || newDirs !== prev[0] || newDevice !== prev[1]) {
        setSessions([])
        setLimit(PAGE_SIZE)
        load(PAGE_SIZE)
      }
    }),
  )

  const loadMore = () => {
    const next = limit() + PAGE_SIZE
    setLimit(next)
    load(next)
  }

  // Watch current session ID: insert placeholder if not in list
  createEffect(
    on(
      () => params.id,
      (id) => {
        if (params.workspaceID !== props.id) return
        // Insert placeholder for new session not yet in list
        if (id && !sessions().some((s) => s.id === id)) {
          const primary = dirs()[0]
          if (primary) {
            setSessions((list) => [
              {
                id,
                title: "",
                directory: primary.path,
                time: { created: Date.now() },
              },
              ...list,
            ])
          }
        }
      },
    ),
  )

  // When the active session is a placeholder (no title), poll the list until title appears
  createEffect(
    on(
      () => {
        if (params.workspaceID !== props.id) return undefined
        const id = params.id
        if (!id) return undefined
        const s = sessions().find((x) => x.id === id)
        return s && !s.title ? id : undefined
      },
      (id) => {
        if (!id) return
        let stopped = false
        let attempts = 0
        const MAX_ATTEMPTS = 30

        const poll = async () => {
          while (!stopped) {
            await new Promise((r) => setTimeout(r, 2000))
            if (stopped) break
            if (++attempts > MAX_ATTEMPTS) break
            const uid = device()
            if (!uid) break
            const directories = dirs()
            if (directories.length === 0) break
            const url = getProxyUrl(uid)
            for (const dir of directories) {
              const qs = new URLSearchParams({ directory: dir.path, roots: "true", limit: String(PAGE_SIZE) })
              const res = await fetch(`${url}/session?${qs}`, { credentials: "include" }).catch(() => null)
              if (!res?.ok) continue
              const body = await res.json().catch(() => null)
              const items = (Array.isArray(body) ? body : (body.data ?? [])) as SessionData[]
              const found = items.find((s) => s.id === id)
              if (!found?.title) continue
              setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title: found.title } : s)))
              stopped = true
              break
            }
          }
        }

        void poll()
        return () => {
          stopped = true
        }
      },
    ),
  )

  const click = (session: SessionData) => {
    navigateToSession(session.id, { workspaceId: props.id, dir: encodeDir(session.directory) })
  }

  const archive = async (session: SessionData) => {
    const uid = device()
    if (!uid) return
    const url = getProxyUrl(uid)
    await fetch(`${url}/session`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: session.id, directory: session.directory, time: { archived: Date.now() } }),
    }).catch(() => null)
    setSessions((prev) => prev.filter((s) => s.id !== session.id))
    if (params.id === session.id) navigateToSession("", { workspaceId: props.id, dir: encodeDir(session.directory) })
  }

  return (
    <div class="pl-2 pr-1 py-1">
      <Show when={sessions().length > 0}>
        <nav class="flex flex-col gap-0.5">
          <For each={sessions()}>
            {(session) => {
              const active = () => params.id === session.id
              return (
                <div class="group/session relative">
                  <button
                    class="flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all duration-150 w-full group-hover/session:pr-8"
                    classList={{
                      "bg-surface-base text-text-strong font-medium": active(),
                      "text-text-weak hover:text-text-strong hover:bg-surface-base/60": !active(),
                    }}
                    onClick={() => click(session)}
                  >
                    <Show
                      when={active()}
                      fallback={
                        <Icon
                          name="dash"
                          class="size-3 shrink-0"
                          size="small"
                          classList={{ "text-text-weaker": true }}
                        />
                      }
                    >
                      <Spinner class="size-3.5 shrink-0" style={{ color: "var(--icon-interactive-base)" }} />
                    </Show>
                    <span class="text-xs truncate flex-1">{session.title || t("workspace.session.new")}</span>
                  </button>
                  <div class="absolute top-0.5 right-0.5 flex items-center opacity-0 pointer-events-none group-hover/session:opacity-100 group-hover/session:pointer-events-auto transition-opacity duration-150">
                    <Tooltip value={t("common.archive")} placement="top">
                      <IconButton
                        icon="archive"
                        variant="ghost"
                        class="size-7 rounded-lg"
                        aria-label={t("common.archive")}
                        onClick={(event: MouseEvent) => {
                          event.preventDefault()
                          event.stopPropagation()
                          archive(session)
                        }}
                      />
                    </Tooltip>
                  </div>
                </div>
              )
            }}
          </For>
          <Show when={more()}>
            <button
              class="flex items-center justify-center h-8 w-full rounded-lg text-xs text-text-weak hover:text-text-strong hover:bg-surface-base/60 transition-all duration-150"
              disabled={loading()}
              onClick={loadMore}
            >
              <Show when={loading()} fallback={t("workspace.loadMore")}>
                <Spinner class="size-3" />
              </Show>
            </button>
          </Show>
        </nav>
      </Show>
      <Show when={loading() && sessions().length === 0}>
        <div class="flex items-center gap-2 py-3 px-2">
          <Spinner class="size-3.5" />
          <span class="text-xs text-text-weaker">{t("workspace.loadingSessions")}</span>
        </div>
      </Show>
      <Show when={!loading() && sessions().length === 0}>
        <div class="flex items-center gap-2 py-3 px-2">
          <span class="text-xs text-text-weaker">{t("workspace.emptySessions")}</span>
        </div>
      </Show>
    </div>
  )
}
