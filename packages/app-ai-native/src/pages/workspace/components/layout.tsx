import type { ParentProps } from "solid-js"
import { createSignal, createMemo, onMount, Show, createEffect, untrack, onCleanup } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { useNavigate, useParams } from "@solidjs/router"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { showToast, Toast } from "@opencode-ai/ui/toast"
import type { Device, Workspace, CreateWorkspaceRequest } from "../types"
import { workspaceApi, deviceApi } from "../lib/api"
import { WorkspaceSidebar } from "./workspace-sidebar"
import { WorkspaceProvider, useWorkspace, type WorkspaceContextValue } from "../context"
import { ServerConnection, ServerProvider, useServer } from "@/context/server"
import { useAuth } from "@/context/auth"
import { AppInterface } from "@/app-interface"
import { getProxyUrl } from "../lib/url"
import { ActiveWorkspaceProvider, useActiveWorkspace } from "../active-workspace"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"

const setNav = (hidden: boolean) => {
  if (typeof document === "undefined") return
  const nav = document.querySelector<HTMLElement>('[data-component="root-layout-nav"]')
  if (!nav) return
  nav.style.opacity = hidden ? "0" : "1"
  nav.style.pointerEvents = hidden ? "none" : ""
}


let inWorkspace = false

export default function WorkspaceLayout(props: ParentProps) {
  const language = useLanguage()
  const t = language.t
  const [workspaces, setWorkspaces] = createStore<Workspace[]>([])
  const [devices, setDevices] = createStore<Device[]>([])
  const [isLoading, setIsLoading] = createSignal(false)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = createSignal<string | undefined>(undefined)
  const [enabledIds, setEnabledIds] = createSignal<string[]>([])
  const closed = new Set<string>()
  const auth = useAuth()
  const navigate = useNavigate()
  const active = useActiveWorkspace()
  const params = useParams()

  let loaded = false
  createEffect(() => {
    const user = auth.user()
    if (!user) return
    if (loaded) return
    loaded = true
    untrack(async () => {
      setIsLoading(true)
      try {
        const [workspacesRes, devicesRes] = await Promise.all([
          workspaceApi.list().catch(() => ({ workspaces: [] })),
          deviceApi.list().catch(() => ({ devices: [] })),
        ])
        setWorkspaces(reconcile(workspacesRes.workspaces, { key: "id", merge: false }))
        setDevices(reconcile(devicesRes.devices, { key: "id", merge: false }))
      } catch (err) {
        showToast({
          title: t("workspace.loading.failed"),
          description: t("workspace.loading.dataFailed"),
        })
      } finally {
        setIsLoading(false)
      }
    })
  })

  const DISABLE_DELAY_MS = 1_500
  const pending = new Map<string, ReturnType<typeof setTimeout>>()

  const deferDisable = (id: string) => {
    if (pending.has(id)) return
    showToast({
      variant: "error",
      title: t("workspace.device.offline"),
      description: t("workspace.error.disconnected"),
    })
    pending.set(
      id,
      setTimeout(() => {
        pending.delete(id)
        if (params.workspaceID === id) navigate("/workspace")
        if (active?.id === id) active.clear()
        handleDisableWorkspace(id)
      }, DISABLE_DELAY_MS),
    )
  }

  let loading = false
  const loadDevices = async () => {
    if (!auth.user()) return
    if (document.visibilityState !== "visible") return
    if (!inWorkspace) return
    if (loading) return
    loading = true
    try {
      const prevStatuses = devices.map((d) => ({ id: d.id, status: d.status }))
      const res = await deviceApi.list().catch(() => ({ devices: [] }))
      setDevices(reconcile(res.devices, { key: "id", merge: false }))
      const changed = res.devices.some((d) => prevStatuses.find((p) => p.id === d.id)?.status !== d.status)
      if (!changed) return
      const prevOnlineIds = new Set(workspaces.filter((w) => w.deviceStatus === "online").map((w) => w.id))
      const wsRes = await workspaceApi.list().catch(() => ({ workspaces: [] as Workspace[] }))
      setWorkspaces(reconcile(wsRes.workspaces, { key: "id", merge: false }))
      const enabled = enabledIds()
      wsRes.workspaces
        .filter((w) => prevOnlineIds.has(w.id) && w.deviceStatus !== "online" && enabled.includes(w.id))
        .forEach((w) => deferDisable(w.id))
    } finally {
      loading = false
    }
  }

  const timer = setInterval(loadDevices, 30_000)
  document.addEventListener("visibilitychange", loadDevices)
  inWorkspace = true
  onCleanup(() => {
    inWorkspace = false
    clearInterval(timer)
    document.removeEventListener("visibilitychange", loadDevices)
    for (const t of pending.values()) clearTimeout(t)
    pending.clear()
  })

  const handleSelectWorkspace = (workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId)
  }

  const handleEnableWorkspace = (id: string) => {
    closed.delete(id)
    setEnabledIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }

  const handleDisableWorkspace = (id: string) => {
    closed.add(id)
    setEnabledIds((prev) => prev.filter((x) => x !== id))
    if (selectedWorkspaceId() === id) setSelectedWorkspaceId(undefined)
  }

  const refreshWorkspaces = async () => {
    try {
      const res = await workspaceApi.list()
      setWorkspaces(reconcile(res.workspaces, { key: "id", merge: false }))
    } catch (err) {
      console.error("Failed to refresh workspaces:", err)
    }
  }

  const handleCreateWorkspace = async (deviceId: string, directory: string) => {
    const device = devices.find((d) => d.id === deviceId)
    if (!device) {
      showToast({ title: t("workspace.create.failed"), description: t("workspace.create.deviceNotFound") })
      return
    }
    if (device.status === "offline") {
      showToast({ title: t("workspace.create.failed"), description: t("workspace.create.deviceOffline") })
      return
    }
    try {
      const name = directory.split("/").pop() || "New Workspace"
      const request: CreateWorkspaceRequest = {
        name,
        deviceId,
        directories: [{ name: "default", path: directory, isDefault: true }],
      }
      const response = await workspaceApi.create(request)
      const newWorkspace = response.workspace
      setWorkspaces((prev) => [...prev, newWorkspace])
      setSelectedWorkspaceId(newWorkspace.id)
      await refreshWorkspaces()
      showToast({
        title: t("workspace.create.success"),
        description: t("workspace.create.successDetail", { name: newWorkspace.name, device: device.displayName }),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      showToast({ title: t("workspace.create.failedTitle"), description: msg })
      throw err
    }
  }

  const handleDeleteWorkspace = async (workspaceId: string) => {
    const workspace = workspaces.find((w) => w.id === workspaceId)
    if (!workspace) return
    try {
      await workspaceApi.delete(workspaceId)
      handleDisableWorkspace(workspaceId)
      setWorkspaces(
        reconcile(
          workspaces.filter((w) => w.id !== workspaceId),
          { key: "id", merge: false },
        ),
      )
      showToast({ title: t("workspace.delete.success"), description: workspace.name })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      showToast({ title: t("workspace.delete.failedTitle"), description: msg })
    }
  }

  const handleRenameWorkspace = async (workspaceId: string, name: string) => {
    try {
      const res = await workspaceApi.update(workspaceId, { name })
      setWorkspaces(
        reconcile(
          workspaces.map((w) => (w.id === workspaceId ? res.workspace : w)),
          { key: "id", merge: false },
        ),
      )
      showToast({ title: t("workspace.rename.success"), description: name })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      showToast({ title: t("workspace.rename.failedTitle"), description: msg })
      throw err
    }
  }

  const contextValue: WorkspaceContextValue = {
    workspaces: () => [...workspaces],
    devices: () => [...devices],
    selectedWorkspaceId,
    enabledWorkspaceIds: enabledIds,
    closedWorkspaceIds: () => Array.from(closed),
    isLoading,
    selectWorkspace: handleSelectWorkspace,
    enableWorkspace: handleEnableWorkspace,
    disableWorkspace: handleDisableWorkspace,
    createWorkspace: handleCreateWorkspace,
    deleteWorkspace: handleDeleteWorkspace,
    renameWorkspace: handleRenameWorkspace,
  }

  return (
    <WorkspaceProvider value={contextValue}>
      <ActiveWorkspaceProvider>
        <WorkspaceServerProvider>
          <WorkspaceActivation>
            <WorkspaceContent>{props.children}</WorkspaceContent>
          </WorkspaceActivation>
        </WorkspaceServerProvider>
      </ActiveWorkspaceProvider>
    </WorkspaceProvider>
  )
}

function WorkspaceServerProvider(props: ParentProps) {
  const workspace = useWorkspace()

  const enabledWorkspaces = createMemo(() => {
    const ids = workspace.enabledWorkspaceIds()
    const all = workspace.workspaces()
    return ids
      .map((id) => all.find((w) => w.id === id))
      .filter((w): w is Workspace => !!w?.deviceUniqueId)
      .sort((a, b) => (a.isDefault ? -1 : b.isDefault ? 1 : 0))
  })

  const servers = createMemo<ServerConnection.Http[]>(() =>
    enabledWorkspaces().map((w) => ({
      type: "http" as const,
      http: { url: getProxyUrl(w.deviceUniqueId!) },
    })),
  )

  const defaultServer = createMemo<ServerConnection.Key>(() => {
    const first = enabledWorkspaces()[0]
    return first ? ServerConnection.Key.make(getProxyUrl(first.deviceUniqueId!)) : ("" as ServerConnection.Key)
  })

  return (
    <ServerProvider defaultServer={defaultServer()} servers={servers()}>
      {props.children}
    </ServerProvider>
  )
}

function WorkspaceActivation(props: ParentProps) {
  const params = useParams()
  const server = useServer()
  const workspace = useWorkspace()

  createEffect(() => {
    const id = params.workspaceID
    if (!id) return

    const all = workspace.workspaces()
    const target = all.find((w: Workspace) => w.id === id)
    if (!target?.deviceUniqueId) return

    untrack(() => {
      const key = ServerConnection.Key.make(getProxyUrl(target.deviceUniqueId!))
      const isClosed = workspace.closedWorkspaceIds().includes(id)
      const enabled = workspace.enabledWorkspaceIds().includes(id)
      if (!isClosed && !enabled) workspace.enableWorkspace(id)
      if (workspace.selectedWorkspaceId() !== id) workspace.selectWorkspace(id)
      if (server.key !== key) server.setActive(key)
    })
  })

  return props.children
}

function WorkspaceShell(props: ParentProps<{ hide?: () => void; open?: () => boolean; mobile?: boolean; offset?: boolean }>) {
  const language = useLanguage()
  const t = language.t
  const hide = () => props.hide?.()
  const open = () => props.open?.() ?? false
  return (
    <div class="flex h-full w-full min-h-0">
      <div class="hidden md:block shrink-0 w-[280px] h-full">
        <WorkspaceSidebar />
      </div>
      <Show when={props.mobile}>
        <div class="md:hidden">
          <div
            classList={{
              "fixed inset-x-0 bottom-0 z-40 transition-opacity duration-200": true,
              "top-0": !props.offset,
              "top-10": !!props.offset,
              "opacity-100 pointer-events-auto": open(),
              "opacity-0 pointer-events-none": !open(),
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) hide()
            }}
          />
          <aside
            aria-label={t("workspace.page.title")}
            classList={{
              "fixed bottom-0 left-0 z-50 w-[280px] max-w-[calc(100vw-2rem)] border-r border-sidebar-border bg-sidebar transition-transform duration-200 ease-out": true,
              "top-0": !props.offset,
              "top-10": !!props.offset,
              "translate-x-0": open(),
              "-translate-x-full": !open(),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <WorkspaceSidebar hide={hide} />
          </aside>
        </div>
      </Show>
      <div class="flex-1 min-w-0 h-full overflow-hidden flex flex-col">{props.children}</div>
    </div>
  )
}

function WorkspaceReady(props: ParentProps) {
  const layout = useLayout()
  createEffect(() => setNav(layout.mobileSidebar.opened()))
  onCleanup(() => setNav(false))
  return (
    <WorkspaceShell mobile hide={layout.mobileSidebar.hide} open={layout.mobileSidebar.opened}>
      {props.children}
    </WorkspaceShell>
  )
}


function WorkspaceLanding(props: ParentProps) {
  const language = useLanguage()
  const t = language.t
  const [open, setOpen] = createSignal(false)
  createEffect(() => setNav(open()))
  onCleanup(() => setNav(false))
  return (
    <WorkspaceShell mobile offset hide={() => setOpen(false)} open={open}>
      <div class="md:hidden fixed top-0 left-[56px] z-50 flex h-[41px] items-center justify-center">
        <IconButton
          icon="menu"
          variant="ghost"
          class="titlebar-icon rounded-md"
          onClick={() => setOpen((v) => !v)}
          aria-label={t("workspace.page.title")}
          aria-expanded={open()}
        />
      </div>
      {props.children}
      <Toast.Region />
    </WorkspaceShell>
  )
}


function WorkspaceContent(props: ParentProps) {
  const params = useParams()
  const server = useServer()
  const ready = createMemo(() => !!params.workspaceID && !!server.key)
  return (
    <Show
      when={ready()}
      fallback={
        <Show when={!params.workspaceID} fallback={<div class="size-full" />}>
          <WorkspaceLanding>{props.children}</WorkspaceLanding>
        </Show>
      }
    >
      <AppInterface>
        <WorkspaceReady>{props.children}</WorkspaceReady>
      </AppInterface>
    </Show>
  )
}
