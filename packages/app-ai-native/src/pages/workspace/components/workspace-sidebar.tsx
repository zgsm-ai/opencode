import { createSignal, createMemo, createEffect, on, For, Show, onCleanup } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { Spinner } from "@opencode-ai/ui/spinner"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import type { Session } from "@opencode-ai/sdk/v2/client"
import type { Device, DeviceStatus, Workspace, WorkspaceDirectory } from "../types"
import { DeviceList } from "./device-list"
import { CreateWorkspaceDialogContent } from "./create-workspace-dialog"
import { useWorkspace } from "../context"
import { getProxyUrl } from "../lib/url"
import { useWorkspaceNavigate } from "@/hooks/use-workspace-navigate"
import { useActiveWorkspace } from "../active-workspace"
import { useLanguage } from "@/context/language"

export function WorkspaceSidebar(props: { hide?: () => void } = {}) {
  const language = useLanguage()
  const t = language.t
  const dialog = useDialog()
  const hide = () => props.hide?.()
  const active = useActiveWorkspace()!
  const {
    workspaces,
    devices,
    enabledWorkspaceIds,
    enableWorkspace,
    disableWorkspace,
    createWorkspace,
    deleteWorkspace,
    renameWorkspace,
  } = useWorkspace()

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
    if (params.workspaceID !== workspace.id) return
    rawNavigate("/workspace")
    hide()
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
                class="group/workspace flex items-center rounded-[var(--native-radius-md)] transition-all duration-150 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                classList={{
                  "bg-[color:color-mix(in_oklab,var(--native-primary)_8%,var(--native-panel))] text-sidebar-foreground shadow-[var(--native-shadow-sm)]": params.workspaceID === cardProps.id,
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
                    class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-[var(--native-radius-md)] px-2.5 py-2 text-left text-sm transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                    classList={{
                      "text-sidebar-foreground font-medium": params.workspaceID === cardProps.id,
                      "text-sidebar-foreground/75": params.workspaceID !== cardProps.id,
                    }}
                    onClick={toggle}
                  >
                    <div class="relative size-2 shrink-0">
                      <div
                        classList={{
                          "size-2 rounded-full group-hover/workspace:opacity-0 group-focus-within/workspace:opacity-0": true,
                          "bg-icon-success-base": dot().online,
                          "bg-icon-critical-base": dot().offline,
                          "bg-sidebar-border": !dot().online && !dot().offline,
                        }}
                      />
                      <Icon
                        name={open() ? "chevron-down" : "chevron-right"}
                        size="small"
                        class="absolute -left-1 -top-1 size-4 text-sidebar-foreground/50 opacity-0 group-hover/workspace:opacity-100 group-focus-within/workspace:opacity-100"
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
                <div class="ml-auto flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity duration-150 group-hover/workspace:opacity-100 group-focus-within/workspace:opacity-100">
                  <Tooltip placement="top" value={t("workspace.newSession")}>
                    <IconButton
                      icon="plus-small"
                      variant="ghost"
                      class="size-7 rounded-md cursor-pointer text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                      aria-label={t("workspace.newSession")}
                      onClick={(event: MouseEvent) => {
                        event.stopPropagation()
                        if (!mounted()) setMounted(true)
                        if (!open()) setOpen(true)
                        const dir = primaryDir()
                        const dirSlug = dir ? encodeDirectory(dir.path) : "default"
                        navigateToNewSession({ workspaceId: cardProps.id, dir: dirSlug })
                        hide()
                      }}
                    />
                  </Tooltip>
                  {menu()}
                </div>
              </div>
              <Show when={mounted()}>
                <div classList={{ hidden: !open() }}>
                  <WorkspaceSessions id={cardProps.id} hide={hide} />
                </div>
              </Show>
            </div>
          )}
        </Show>
      )
    }

    // Idle card: same nav-item style, click to start
    return (
      <Show when={workspace()}>
        {(ws) => (
          <div
            class="group/workspace flex items-center rounded-[var(--native-radius-md)] transition-all duration-150 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            classList={{
              "bg-[color:color-mix(in_oklab,var(--native-primary)_8%,var(--native-panel))] text-sidebar-foreground shadow-[var(--native-shadow-sm)]": params.workspaceID === cardProps.id,
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
                class="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--native-radius-md)] px-2.5 py-2 text-left text-sm transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                classList={{
                  "text-sidebar-foreground font-medium": params.workspaceID === cardProps.id,
                  "text-sidebar-foreground/70": params.workspaceID !== cardProps.id && !dot().offline,
                  "text-sidebar-foreground/40 cursor-not-allowed": dot().offline,
                  "cursor-pointer": !dot().offline,
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
      {/* Header */}
      <div class="flex h-[41px] shrink-0 items-center px-3">
        <div class="flex items-center gap-2.5">
          <span class="font-[var(--native-font-display)] text-[1rem] font-semibold tracking-[-0.035em] text-sidebar-foreground">{t("workspace.page.title")}</span>
        </div>
      </div>

      {/* Search */}
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

      {/* Workspace list — 60% */}
      <div class="custom-scrollbar flex-[3] min-h-0 overflow-y-auto py-1 pr-1">
        {/* Running workspaces */}
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

        {/* Idle workspaces */}
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

      {/* Device list — 40% */}
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

const PAGE_SIZE = 10

type SessionData = Pick<Session, "id" | "title" | "directory" | "time" | "parentID">

/**
 * Loads and displays sessions for a workspace.
 * Accepts a stable `id` prop instead of a workspace object to avoid
 * SolidJS <For> reference-reuse bugs.
 */
function WorkspaceSessions(props: { id: string; hide?: () => void }) {
  const language = useLanguage()
  const t = language.t
  const hide = () => props.hide?.()
  const { workspaces } = useWorkspace()
  const { navigateToSession, encodeDirectory: encodeDir } = useWorkspaceNavigate()
  const params = useParams()
  const [loading, setLoading] = createSignal(false)
  const [statusMap, setStatusMap] = createSignal<Record<string, { type: string }>>({})
  const [pending, setPending] = createSignal<SessionData[]>([])
  const [sessions, setSessions] = createSignal<SessionData[]>([])
  const [more, setMore] = createSignal(false)
  const [limit, setLimit] = createSignal(PAGE_SIZE)

  // Always derive workspace from the stable id
  const workspace = createMemo(() => workspaces().find((w) => w.id === props.id))
  const dirs = createMemo(() => workspace()?.directories ?? [])
  const device = createMemo(() => workspace()?.deviceUniqueId)

  const isWorking = (sessionId: string) => {
    const s = statusMap()[sessionId]
    return s?.type === "busy" || s?.type === "retry"
  }

  const merged = createMemo(() => {
    const seen = new Set<string>()
    const extra = pending().filter((s) => {
      if (seen.has(s.id)) return false
      seen.add(s.id)
      return true
    })
    const list = sessions().filter((s) => {
      if (seen.has(s.id)) return false
      seen.add(s.id)
      return true
    })
    return [...extra, ...list]
  })

  const load = async (cap: number) => {
    const uid = device()
    if (!uid) return
    const directories = dirs()
    if (directories.length === 0) return
    setLoading(true)
    try {
      const url = getProxyUrl(uid)
      const all: SessionData[] = []
      for (const dir of directories) {
        const qs = new URLSearchParams({ directory: dir.path, archived: "false", roots: "true", limit: String(cap) })
        const res = await fetch(`${url}/session?${qs}`, { credentials: "include" }).catch(() => null)
        if (!res?.ok) continue
        const body = await res.json().catch(() => [])
        const items = (Array.isArray(body) ? body : (body.data ?? [])) as SessionData[]
        for (const s of items) {
          if (s.time?.archived || s.parentID || all.some((x) => x.id === s.id)) continue
          all.push(s)
        }
      }
      all.sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
      setMore(all.length >= cap)
      setSessions(all)
    } finally {
      setLoading(false)
    }
  }

  createEffect(
    on([device, dirs], ([uid, directories]) => {
      if (!uid || directories.length === 0) return
      const base = getProxyUrl(uid)
      const connections = directories.map((dir) => {
        const qs = new URLSearchParams({ directory: dir.path })
        const es = new EventSource(`${base}/event?${qs}`, { withCredentials: true })
        es.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data) as { type: string; properties?: unknown }
            if (msg.type !== "session.status") return
            const props = msg.properties as { sessionID: string; status: { type: string } }
            if (props.status.type === "idle") {
              setStatusMap((prev) => {
                const next = { ...prev }
                delete next[props.sessionID]
                return next
              })
            } else {
              setStatusMap((prev) => ({ ...prev, [props.sessionID]: props.status }))
            }
          } catch {}
        }
        return es
      })
      onCleanup(() => connections.forEach((es) => es.close()))
    }),
  )

  // Track whether initial load has been done
  let loaded = false

  // Reload when the workspace's directories or device changes
  createEffect(
    on([dirs, device], ([newDirs, newDevice], prev) => {
      if (!loaded) {
        loaded = true
        void load(PAGE_SIZE)
        return
      }
      if (!prev || newDirs !== prev[0] || newDevice !== prev[1]) {
        setPending([])
        setSessions([])
        setLimit(PAGE_SIZE)
        void load(PAGE_SIZE)
      }
    }),
  )

  const loadMore = () => {
    const next = limit() + PAGE_SIZE
    setLimit(next)
    void load(next)
  }

  // Watch current session ID: insert placeholder if not in list
  createEffect(
    on(
      () => params.id,
      (id) => {
        if (params.workspaceID !== props.id) return
        // Insert placeholder for new session not yet in list
        if (id && !merged().some((s) => s.id === id)) {
          const primary = dirs()[0]
          if (primary) {
            const now = Date.now()
            setPending((list) => [
              {
                id,
                title: "",
                directory: primary.path,
                time: { created: now, updated: now },
              },
              ...list.filter((s) => s.id !== id),
            ])
          }
          return
        }
        if (!id) return
        setPending((list) => list.filter((s) => s.id !== id))
      },
    ),
  )

  createEffect(() => {
    const ids = new Set(sessions().map((s) => s.id))
    setPending((list) => list.filter((s) => !ids.has(s.id) || !s.title))
  })

  const click = (session: SessionData) => {
    navigateToSession(session.id, { workspaceId: props.id, dir: encodeDir(session.directory) })
    hide()
  }

  const archive = async (session: SessionData) => {
    const uid = device()
    if (!uid) return
    const url = getProxyUrl(uid)
    await fetch(`${url}/session/${session.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ time: { archived: Date.now() } }),
    }).catch(() => null)
    setPending((prev) => prev.filter((s) => s.id !== session.id))
    setSessions((prev) => prev.filter((s) => s.id !== session.id))
    if (params.id !== session.id) return
    navigateToSession("", { workspaceId: props.id, dir: encodeDir(session.directory) })
    hide()
  }

  return (
    <div class="px-2 py-1.5">
      <Show when={merged().length > 0}>
        <nav class="flex flex-col gap-1">
          <For each={merged()}>
            {(session) => {
              const active = () => params.id === session.id
              return (
                <div class="group/session relative">
                  <button
                    class="flex w-full items-center gap-2 rounded-[var(--native-radius-md)] px-2.5 py-2 text-left text-sm transition-all duration-150 group-hover/session:pr-9 group-focus-within/session:pr-9 focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                    classList={{
                      "bg-[color:color-mix(in_oklab,var(--native-primary)_8%,var(--native-panel))] text-sidebar-foreground font-medium shadow-[var(--native-shadow-sm)]": active(),
                      "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground": !active(),
                    }}
                    onClick={() => click(session)}
                  >
                    <Show
                      when={isWorking(session.id)}
                      fallback={
                        <Icon
                          name="dash"
                          class="size-3 shrink-0"
                          size="small"
                          classList={{ "text-sidebar-foreground/40": true }}
                        />
                      }
                    >
                      <Spinner class="size-3.5 shrink-0" style={{ color: "hsl(var(--sidebar-primary))" }} />
                    </Show>
                    <span class="truncate text-[0.8125rem] leading-[1.45] flex-1">{session.title || t("workspace.session.new")}</span>
                  </button>
                  <div class="pointer-events-none absolute right-0.5 top-1 flex items-center opacity-0 transition-opacity duration-150 group-hover/session:pointer-events-auto group-hover/session:opacity-100 group-focus-within/session:pointer-events-auto group-focus-within/session:opacity-100">
                    <Tooltip value={t("common.archive")} placement="top">
                      <IconButton
                        icon="archive"
                        variant="ghost"
                        class="size-7 rounded-md text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
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
              class="flex h-9 w-full items-center justify-center rounded-[var(--native-radius-md)] bg-[color:color-mix(in_oklab,var(--native-panel)_86%,var(--native-bg-subtle))] text-xs font-medium text-sidebar-foreground/70 transition-all duration-150 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
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
      <Show when={loading() && merged().length === 0}>
        <div class="flex items-center gap-2 rounded-[var(--native-radius-md)] px-2.5 py-3 text-sidebar-foreground/50">
          <Spinner class="size-3.5" />
          <span class="text-xs text-sidebar-foreground/50">{t("workspace.loadingSessions")}</span>
        </div>
      </Show>
      <Show when={!loading() && merged().length === 0}>
        <div class="native-panel-soft flex items-center gap-2 px-2.5 py-3 text-sidebar-foreground/50">
          <Icon name="bubble-5" class="size-4 opacity-40" />
          <span class="text-xs leading-[1.5] text-sidebar-foreground/50">{t("workspace.emptySessions")}</span>
        </div>
      </Show>
    </div>
  )
}
