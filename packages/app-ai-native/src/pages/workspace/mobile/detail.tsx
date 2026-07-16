import { type ParentProps, createMemo, createSignal, Show, createEffect, untrack, For } from "solid-js"
import { useParams, useSearchParams } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
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
import { ContentTabContext, createContentTabStore, useContentTabs } from "@/context/content-tabs"
import { DeviceSessionStoreProvider } from "@/context/device-session"
import { PromptProvider } from "@/context/prompt"
import { SessionComposerRegistryProvider } from "@/context/session-composer-registry"
import { SessionTabProvider, useSessionTab } from "@/context/session-tab"
import { DeviceSessionView } from "../components/device-session-view"
import { DeviceSessionViewHeader } from "../components/device-session-view-header"
import { DeviceSessionChatProvider } from "@/context/device-session-chat"
import { useDeviceWorkspace } from "@/context/device-workspace"
import { createSdkForServer } from "@/utils/server"
import { useDeviceLayout } from "../components/device-interface"
import { getProxyUrl } from "../lib/url"
import { SessionListPanel } from "../components/session-list"
import { workspaceKey } from "@/lib/workspace-key"
import { shouldRestore, activeSession } from "../components/workspace-content-layout-sync"
import { useWorkspace } from "../context"
import { Toast } from "@opencode-ai/ui/toast"
import { newSessionTrigger } from "./layout"

let newSessionCounter = 0

const SESSION_TAB_ICON = "bubble-5"

function MobileDirectDeviceProviders(props: ParentProps<{ serverUrl: string; directory: string }>) {
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

function MobileDeviceLayoutProvider(props: ParentProps<{ deviceLayout: ReturnType<typeof useDeviceLayout> }>) {
  const dl = props.deviceLayout
  const value = {
    ready: () => true,
    handoff: { tabs: () => undefined, setTabs() {}, clearTabs() {} },
    projects: { list: () => [], open() {}, close() {}, expand() {}, collapse() {}, move() {} },
    sidebar: { opened: () => false, open() {}, close() {}, toggle() {}, width: () => 280, resize() {}, workspaces: () => () => false, setWorkspaces() {}, toggleWorkspaces() {} },
    terminal: { height: () => 200, width: dl.terminal.width, resize: dl.terminal.resize },
    review: { diffStyle: dl.diffStyle, setDiffStyle: dl.setDiffStyle },
    fileTree: { opened: () => false, width: () => 280, tab: () => "all" as const, setTab() {}, open() {}, close() {}, toggle() {}, resize() {} },
    session: { width: () => 400, resize() {} },
    mobileSidebar: { opened: () => false, show() {}, hide() {}, toggle() {} },
    pendingMessage: { set() {}, consume() { return undefined } },
    view() {
      return {
        scroll: () => ({ x: 0, y: 0 }),
        setScroll() {},
        terminal: { opened: () => false, open() {}, close() {}, toggle() {} },
        reviewPanel: { opened: () => false, open() {}, close() {}, toggle() {} },
        review: { open: () => undefined, setOpen() {} },
      }
    },
    tabs() { return { tabs: () => ({ all: [], active: undefined }), active: () => undefined, all: () => [], setActive() {}, setAll() {}, async open() {}, close() {}, move() {} } },
  }
  return <LayoutContext.Provider value={value}>{props.children}</LayoutContext.Provider>
}

function MobileSessionAdapter(props: { tabId: string; sessionID?: string }) {
  const sessionTab = useSessionTab()
  const tabStore = useContentTabs()
  const title = createMemo(() => tabStore.tabs().find((t) => t.id === props.tabId)?.title)
  return (
    <DeviceSessionChatProvider>
      <DeviceSessionView
        sessionID={props.sessionID}
        createdSessionID={sessionTab.createdSessionID}
        title={title}
        onSessionCreated={sessionTab.replaceTab}
        onClose={() => tabStore.close(props.tabId)}
        header={(state) => <DeviceSessionViewHeader state={state} />}
      />
    </DeviceSessionChatProvider>
  )
}

function MobileContentTabPanel() {
  const tabStore = useContentTabs()

  return (
    <DeviceSessionStoreProvider>
      <PromptProvider>
        <SessionComposerRegistryProvider>
          <For each={tabStore.tabs()}>
          {(tab) => (
            <Show when={tabStore.activeId() === tab.id}>
              <div class="flex-1 min-h-0 h-full">
                <Show when={tab.kind === "session"}>
                  <SessionTabProvider tabId={tab.id} sessionID={(tab.meta as any)?.sessionID}>
                    <MobileSessionAdapter tabId={tab.id} sessionID={(tab.meta as any)?.sessionID} />
                  </SessionTabProvider>
                </Show>
              </div>
            </Show>
          )}
        </For>
        </SessionComposerRegistryProvider>
      </PromptProvider>
    </DeviceSessionStoreProvider>
  )
}

function MobileWorkspaceContentLayout(props: { workspaceId: string; directory: string; active: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams<{ session?: string }>()
  const language = useLanguage()
  const tabStore = useContentTabs()
  const dw = useDeviceWorkspace()
  const work = useWorkspace()

  const directory = createMemo(() => {
    if (!props.directory) return ""
    return workspaceKey(props.directory)
  })

  const [done, setDone] = createSignal<string | undefined>()

  const restoreFromUrl = (sid: string) => {
    dw.session.clearUnread(sid)
    const existing = tabStore.tabs().find((t) => t.kind === "session" && t.meta?.sessionID === sid)
    if (existing) {
      tabStore.activate(existing.id)
      return
    }
    const session = dw.data.session.find((s) => s.id === sid)
    tabStore.open({
      kind: "session",
      key: sid,
      title: session?.title || language.t("command.session.new"),
      icon: SESSION_TAB_ICON,
      meta: { sessionID: sid },
    })
  }

  createEffect(() => {
    if (!props.active) return
    const sid = searchParams.session
    if (!sid) {
      setDone(undefined)
      return
    }
    if (!shouldRestore(sid, done())) return
    if (dw.data.status === "loading") return
    restoreFromUrl(sid)
    setDone(sid)
  })

  const syncUrlFromTab = (id: string | undefined) => {
    if (!props.active) return
    if (!id) {
      setSearchParams({ session: undefined }, { replace: true })
      return
    }
    const sid = activeSession(tabStore.tabs(), id)
    if (sid) {
      setSearchParams({ session: sid }, { replace: true })
      return
    }
    setSearchParams({ session: undefined }, { replace: true })
  }

  createEffect(() => {
    if (!props.active) return
    if (shouldRestore(searchParams.session, done())) return
    syncUrlFromTab(tabStore.activeId())
  })

  createEffect(() => {
    const id = tabStore.activeId()
    if (!id) return
    const sid = activeSession(tabStore.tabs(), id)
    if (sid) {
      untrack(() => {
        dw.session.clearUnread(sid)
      })
    }
  })

  // Auto-close session sidebar when a session is selected
  let lastTabId: string | undefined
  createEffect(() => {
    const id = tabStore.activeId()
    if (lastTabId !== undefined && id !== lastTabId && work.sidebarOpened()) {
      work.closeSidebar()
    }
    lastTabId = id
  })

  const openNewSession = () => {
    newSessionCounter++
    tabStore.open({
      kind: "session",
      key: `new-${newSessionCounter}`,
      title: language.t("command.session.new"),
      icon: SESSION_TAB_ICON,
      meta: { sessionID: undefined },
    })
  }

  // Auto-create new session when no tabs exist
  createEffect(() => {
    if (!props.active) return
    if (dw.data.status !== "ready") return
    if (tabStore.tabs().length > 0) return
    openNewSession()
  })

  // Handle new session trigger from header
  createEffect(() => {
    if (!props.active) return
    const trigger = newSessionTrigger()
    if (trigger === 0) return
    openNewSession()
  })

  return (
    <Show when={directory()}>
      <div class="relative flex h-full">
        {/* Session sidebar overlay */}
        <div
          class="absolute inset-0 z-50 pointer-events-none"
        >
          <div
            class="absolute inset-0 transition-opacity duration-200 ease-in-out"
            classList={{
              "pointer-events-auto": work.sidebarOpened(),
            }}
            style={{
              opacity: work.sidebarOpened() ? 1 : 0,
              background: "rgba(0,0,0,0.3)",
            }}
            onClick={() => work.closeSidebar()}
          />
          <div
            class="absolute inset-y-0 left-0 w-[280px] bg-background-base border-r border-border overflow-y-auto thin-scrollbar transition-transform duration-200 ease-in-out pointer-events-auto"
            style={{ transform: work.sidebarOpened() ? "translateX(0)" : "translateX(-100%)" }}
          >
            <SessionListPanel />
          </div>
        </div>

        {/* Main content */}
        <div class="flex-1 min-w-0 flex flex-col">
          <MobileContentTabPanel />
        </div>
      </div>
      <Toast.Region />
    </Show>
  )
}

export function MobileWorkspaceDetail() {
  const params = useParams()
  const work = useWorkspace()
  const workspaceId = () => params.workspaceID ?? ""
  const dl = useDeviceLayout()

  createEffect(() => {
    const id = workspaceId()
    if (!id) return
    if (work.closedWorkspaceIds().includes(id)) return
    if (!work.enabledWorkspaceIds().includes(id)) {
      work.enableWorkspace(id)
    }
  })

  const validEnabledIds = createMemo(() => {
    const enabled = work.enabledWorkspaceIds()
    const all = work.workspaces()
    const validIds = new Set(all.map((w) => w.id))
    return Array.from(new Set(enabled.filter((id) => validIds.has(id))))
  })

  return (
    <div class="relative h-full w-full">
      <For each={validEnabledIds()}>
      {(id) => {
        const ws = createMemo(() => {
          const all = work.workspaces()
          const found = all.find((w) => w.id === id)
          return found
        })
        const dir = createMemo(() => {
          const w = ws()
          if (!w) return ""
          const primary = w.directories?.find((d) => d.isDefault) || w.directories?.[0]
          return primary?.path ?? ""
        })
        const serverUrl = createMemo(() => ws()?.deviceUniqueId ? getProxyUrl(ws()!.deviceUniqueId!) : "")
        const isActive = createMemo(() => workspaceId() === id)
        const tabStore = createContentTabStore()

        return (
          <Show when={dir() && serverUrl()}>
            <div
              class="absolute inset-0 flex flex-col"
              style={{ display: isActive() ? "flex" : "none" }}
            >
              <MobileDirectDeviceProviders serverUrl={serverUrl()!} directory={dir()!}>
                <DeviceInitGate>
                  <MobileDeviceLayoutProvider deviceLayout={dl}>
                    <DirectoryContext.Provider value={() => dir()!}>
                      <WorkspaceInitGate>
                        <DeviceWorkspaceProvider workspaceId={id}>
                          <DeviceFileProvider visible={isActive}>
                            <DeviceTerminalProvider>
                              <DeviceLocalProvider workspaceId={id}>
                                <ContentTabContext.Provider value={tabStore}>
                                  <MobileWorkspaceContentLayout
                                    workspaceId={id}
                                    directory={dir()!}
                                    active={isActive()}
                                  />
                                </ContentTabContext.Provider>
                              </DeviceLocalProvider>
                            </DeviceTerminalProvider>
                          </DeviceFileProvider>
                        </DeviceWorkspaceProvider>
                      </WorkspaceInitGate>
                    </DirectoryContext.Provider>
                  </MobileDeviceLayoutProvider>
                </DeviceInitGate>
              </MobileDirectDeviceProviders>
            </div>
          </Show>
        )
      }}
    </For>
    </div>
  )
}
