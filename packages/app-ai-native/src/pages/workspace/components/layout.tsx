import type { ParentProps } from "solid-js"
import { createSignal, createMemo, Show, createEffect, untrack, onCleanup, For, on } from "solid-js"
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
import { WorkspaceContentLayout } from "./workspace-content-layout"
import { getProxyUrl } from "../lib/url"
import { ActiveWorkspaceProvider, useActiveWorkspace } from "../active-workspace"
import { useLanguage } from "@/context/language"
import { drawer } from "../drawer"
import { usePlatform } from "@/context/platform"
import { createSdkForServer } from "@/utils/server"
import { DeviceClientContext } from "@/context/device-client"
import { DeviceSDKContext } from "@/context/device-sdk"
import { DeviceInitGate } from "@/context/device-init"
import { WorkspaceInitGate } from "@/context/workspace-init-gate"
import { DeviceFileProvider } from "@/context/device-file"
import { DeviceTerminalProvider } from "@/context/device-terminal"
import { DeviceWorkspaceProvider } from "@/context/device-workspace"
import { DeviceLocalProvider } from "@/context/device-local"
import { DirectoryContext } from "@/context/directory"
import { LayoutContext } from "@/context/layout"
import { useDeviceLayout } from "./device-interface"
import { ContentTabContext, createContentTabStore } from "@/context/content-tabs"

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
  const [visitedIds, setVisitedIds] = createSignal<string[]>([])
  const [sidebarOpened, setSidebarOpened] = createSignal(true)
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
    const next = enabledIds().filter((x) => x !== id)
    setEnabledIds(next)
    setVisitedIds((prev) => prev.filter((x) => x !== id))
    if (selectedWorkspaceId() === id) {
      setSelectedWorkspaceId(undefined)
    }
    if (params.workspaceID === id) {
      if (next.length > 0) {
        navigate(`/workspace/${next[0]}`)
      } else {
        navigate("/workspace")
      }
    }
  }

  const refreshWorkspaces = async () => {
    try {
      const res = await workspaceApi.list()
      setWorkspaces(reconcile(res.workspaces, { key: "id", merge: false }))
    } catch (err) {
      console.error("Failed to refresh workspaces:", err)
    }
  }

  const handleCreateWorkspace = async (deviceId: string, directory: string, name: string) => {
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
    sidebarOpened,
    selectWorkspace: handleSelectWorkspace,
    enableWorkspace: handleEnableWorkspace,
    disableWorkspace: handleDisableWorkspace,
    createWorkspace: handleCreateWorkspace,
    deleteWorkspace: handleDeleteWorkspace,
    renameWorkspace: handleRenameWorkspace,
    removeVisited: (id: string) => setVisitedIds((prev) => prev.filter((x) => x !== id)),
    openSidebar: () => setSidebarOpened(true),
    closeSidebar: () => setSidebarOpened(false),
    toggleSidebar: () => setSidebarOpened((v) => !v),
  }

  return (
    <WorkspaceProvider value={contextValue}>
      <ActiveWorkspaceProvider>
        <WorkspaceServerProvider>
          <WorkspaceActivation>
            <WorkspaceShell>
              <WorkspaceContent>{props.children}</WorkspaceContent>
            </WorkspaceShell>
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

function WorkspaceShell(props: ParentProps) {
  const language = useLanguage()
  const work = useWorkspace()
  createEffect(() => setNav(drawer.opened()))
  onCleanup(() => { drawer.hide(); setNav(false) })
  return (
    <div class="flex h-full w-full min-h-0 overflow-x-hidden">
      <div
        class="hidden h-full shrink-0 overflow-hidden transition-[width] duration-200 md:block"
        style={{ width: work.sidebarOpened() ? "var(--native-sidebar-width)" : "0px" }}
      >
        <WorkspaceSidebar />
      </div>
      <div class="md:hidden">
        <div
          classList={{
            "fixed inset-x-0 top-0 bottom-0 z-40 transition-opacity duration-200": true,
            "opacity-100 pointer-events-auto": drawer.opened(),
            "opacity-0 pointer-events-none": !drawer.opened(),
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) drawer.hide()
          }}
        />
        <aside
          aria-label={language.t("workspace.page.title")}
          classList={{
            "fixed top-0 bottom-0 left-0 z-50 w-[var(--native-sidebar-width)] max-w-[calc(100vw-2rem)] border-r border-sidebar-border bg-sidebar transition-transform duration-200 ease-out": true,
            "translate-x-0": drawer.opened(),
            "-translate-x-full": !drawer.opened(),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <WorkspaceSidebar hide={drawer.hide} />
        </aside>
      </div>
      <div
        class="flex h-full min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-hidden bg-background-base"
        classList={{
          "md:rounded-l-[var(--native-radius-lg)]": work.sidebarOpened(),
          "md:border-l": work.sidebarOpened(),
          "md:border-l-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)]": work.sidebarOpened(),
        }}
      >
        {props.children}
      </div>
    </div>
  )
}

function WorkspaceContentInstance(props: { workspaceId: string; directory: string; serverUrl: string }) {
  const dl = useDeviceLayout()
  const tabStore = createContentTabStore()

  return (
    <DirectDeviceProviders serverUrl={props.serverUrl} directory={props.directory}>
      <DeviceInitGate>
        <DeviceLayoutProvider deviceLayout={dl}>
          <DirectoryContext.Provider value={() => props.directory}>
            <WorkspaceInitGate>
              <DeviceWorkspaceProvider workspaceId={props.workspaceId}>
                <DeviceFileProvider>
                  <DeviceTerminalProvider>
                    <DeviceLocalProvider workspaceId={props.workspaceId}>
                      <ContentTabContext.Provider value={tabStore}>
                        <WorkspaceContentLayout workspaceId={props.workspaceId} directory={props.directory} />
                      </ContentTabContext.Provider>
                    </DeviceLocalProvider>
                  </DeviceTerminalProvider>
                </DeviceFileProvider>
            </DeviceWorkspaceProvider>
            </WorkspaceInitGate>
          </DirectoryContext.Provider>
        </DeviceLayoutProvider>
      </DeviceInitGate>
    </DirectDeviceProviders>
  )
}

function DirectDeviceProviders(props: ParentProps<{ serverUrl: string; directory: string }>) {
  const platform = usePlatform()
  const conn = createMemo(() => ({
    type: "http" as const,
    http: { url: props.serverUrl },
  }))

  const clientValue = createMemo(() => {
    const c = conn()
    const client = createSdkForServer({ server: c.http, fetch: platform.fetch, throwOnError: true })
    return {
      client,
      url: c.http.url,
      createClient(opts: { directory: string; throwOnError?: boolean }) {
        return createSdkForServer({ server: c.http, fetch: platform.fetch, ...opts })
      },
    }
  })

  const sdkValue = createMemo(() => {
    const c = conn()
    const dirClient = createSdkForServer({ server: c.http, fetch: platform.fetch, directory: props.directory, throwOnError: true })
    return {
      client: dirClient,
      directory: props.directory,
      url: c.http.url,
      createClient(opts: { directory: string; throwOnError?: boolean }) {
        return createSdkForServer({ server: c.http, fetch: platform.fetch, ...opts })
      },
    }
  })

  return (
    <DeviceClientContext.Provider value={clientValue()}>
      <DeviceSDKContext.Provider value={sdkValue()}>
        {props.children}
      </DeviceSDKContext.Provider>
    </DeviceClientContext.Provider>
  )
}

const DEFAULT_PANEL_WIDTH = 280

function DeviceLayoutProvider(props: ParentProps<{ deviceLayout: ReturnType<typeof useDeviceLayout> }>) {
  const dl = props.deviceLayout
  const value = {
    ready: () => true,
    deviceMode: true as boolean,
    handoff: { tabs: () => undefined, setTabs() {}, clearTabs() {} },
    projects: { list: () => [], open() {}, close() {}, expand() {}, collapse() {}, move() {} },
    sidebar: { opened: () => false, open() {}, close() {}, toggle() {}, width: () => 280, resize() {}, workspaces: () => () => false, setWorkspaces() {}, toggleWorkspaces() {} },
    terminal: { height: () => 200, width: dl.terminal.width, resize: dl.terminal.resize },
    review: { diffStyle: dl.diffStyle, setDiffStyle: dl.setDiffStyle },
    fileTree: { opened: dl.fileTree.opened, width: dl.fileTree.width, tab: () => "all" as const, setTab() {}, open: dl.fileTree.open, close: dl.fileTree.close, toggle: dl.fileTree.toggle, resize: dl.fileTree.resize },
    session: { width: () => 400, resize() {} },
    mobileSidebar: { opened: () => false, show() {}, hide() {}, toggle() {} },
    pendingMessage: { set() {}, consume() { return undefined } },
    view() {
      return {
        scroll: () => ({ x: 0, y: 0 }),
        setScroll() {},
        terminal: { opened: dl.terminal.opened, open: dl.terminal.open, close: dl.terminal.close, toggle: dl.terminal.toggle },
        reviewPanel: { opened: () => false, open() {}, close() {}, toggle() {} },
        review: { open: () => undefined, setOpen() {} },
      }
    },
    tabs() { return { tabs: () => ({ all: [], active: undefined }), active: () => undefined, all: () => [], setActive() {}, setAll() {}, async open() {}, close() {}, move() {} } },
  }
  return <LayoutContext.Provider value={value}>{props.children}</LayoutContext.Provider>
}

function WorkspaceContent(props: ParentProps) {
  const params = useParams()
  const workspace = useWorkspace()

  createEffect(() => {
    const id = params.workspaceID
    if (!id) return
    if (workspace.closedWorkspaceIds().includes(id)) return
    if (!workspace.enabledWorkspaceIds().includes(id)) workspace.enableWorkspace(id)
  })

  const [transitionState, setTransitionState] = createSignal<{
    direction: "up" | "down"
    leavingId: string
    enteringId: string
  } | null>(null)
  let animationTimer: ReturnType<typeof setTimeout> | undefined

  createEffect(
    on(
      () => params.workspaceID,
      (next, prev) => {
        if (!prev || !next || prev === next) return
        const enabled = new Set(workspace.enabledWorkspaceIds())
        const ids = workspace.workspaces().filter((w) => enabled.has(w.id)).map((w) => w.id)
        const prevIdx = ids.indexOf(prev)
        const nextIdx = ids.indexOf(next)
        if (prevIdx < 0 || nextIdx < 0) return
        if (animationTimer) clearTimeout(animationTimer)
        setTransitionState({
          direction: nextIdx > prevIdx ? "down" : "up",
          leavingId: prev,
          enteringId: next,
        })
        animationTimer = setTimeout(() => {
          setTransitionState(null)
          animationTimer = undefined
        }, 380)
      },
    ),
  )

  onCleanup(() => {
    if (animationTimer) clearTimeout(animationTimer)
  })

  return (
    <div class="flex-1 min-w-0 h-full overflow-hidden flex flex-col relative">
      <Show when={!params.workspaceID}>
        {props.children}
        <Toast.Region />
      </Show>
      <For each={workspace.enabledWorkspaceIds()}>
        {(id) => {
          const ws = createMemo(() => workspace.workspaces().find((w) => w.id === id))
          const dir = createMemo(() => {
            const w = ws()
            if (!w) return ""
            const primary = w.directories?.find((d) => d.isDefault) || w.directories?.[0]
            return primary?.path ?? ""
          })
          const serverUrl = createMemo(() => ws()?.deviceUniqueId ? getProxyUrl(ws()!.deviceUniqueId!) : "")
          const isActive = createMemo(() => params.workspaceID === id)

          const animClass = createMemo(() => {
            const ts = transitionState()
            if (!ts) return ""
            if (id === ts.enteringId) {
              return ts.direction === "down"
                ? "ws-enter ws-enter-from-bottom"
                : "ws-enter ws-enter-from-top"
            }
            if (id === ts.leavingId) {
              return ts.direction === "down"
                ? "ws-leave ws-leave-to-top"
                : "ws-leave ws-leave-to-bottom"
            }
            return ""
          })

          const visible = createMemo(() => isActive() || transitionState()?.leavingId === id)

          return (
            <Show when={dir() && serverUrl()}>
              <div
                class={`absolute inset-0 flex flex-col ${animClass()}`}
                style={{ display: visible() ? "flex" : "none" }}
              >
                <WorkspaceContentInstance
                  workspaceId={id}
                  directory={dir()!}
                  serverUrl={serverUrl()!}
                />
              </div>
            </Show>
          )
        }}
      </For>
    </div>
  )
}
