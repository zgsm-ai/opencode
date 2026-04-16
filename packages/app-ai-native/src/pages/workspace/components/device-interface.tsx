import type { ParentProps } from "solid-js"
import { createMemo, createSignal, Show } from "solid-js"
import type { ReviewDiffStyle } from "@/context/layout"
import { useServer } from "@/context/server"
import { usePlatform } from "@/context/platform"
import { DeviceClientContext } from "@/context/device-client"
import { DeviceSDKContext } from "@/context/device-sdk"
import { DeviceInitGate } from "@/context/device-init"
import { DeviceFileProvider } from "@/context/device-file"
import { DeviceTerminalProvider } from "@/context/device-terminal"
import { DeviceProjectProvider } from "@/context/device-project"
import { DeviceWorkspaceProvider } from "@/context/device-workspace"
import { DeviceLocalProvider } from "@/context/device-local"
import { DirectoryContext } from "@/context/directory"
import { LayoutContext } from "@/context/layout"
import { createSdkForServer } from "@/utils/server"

const DEFAULT_PANEL_WIDTH = 280
const DEFAULT_TERMINAL_HEIGHT = 200

export function useDeviceLayout() {
  const [fileTreeOpened, setFileTreeOpened] = createSignal(true)
  const [fileTreeWidth, setFileTreeWidth] = createSignal(DEFAULT_PANEL_WIDTH)
  const [terminalOpened, setTerminalOpened] = createSignal(false)
  const [terminalWidth, setTerminalWidth] = createSignal(400)
  const [diffStyle, setDiffStyle] = createSignal<ReviewDiffStyle>("split")

  return {
    fileTree: {
      opened: fileTreeOpened,
      width: fileTreeWidth,
      toggle() { setFileTreeOpened((v) => !v) },
      open() { setFileTreeOpened(true) },
      close() { setFileTreeOpened(false) },
      resize(w: number) { setFileTreeWidth(w) },
    },
    terminal: {
      opened: terminalOpened,
      width: terminalWidth,
      toggle() { setTerminalOpened((v) => !v) },
      open() { setTerminalOpened(true) },
      close() { setTerminalOpened(false) },
      resize(w: number) { setTerminalWidth(w) },
    },
    diffStyle,
    setDiffStyle,
  }
}

function DeviceLayoutProvider(props: ParentProps<{ deviceLayout: ReturnType<typeof useDeviceLayout> }>) {
  const dl = props.deviceLayout

  const value = {
    ready: () => true,
    deviceMode: true as boolean,
    handoff: {
      tabs: () => undefined,
      setTabs() {},
      clearTabs() {},
    },
    projects: {
      list: () => [],
      open() {},
      close() {},
      expand() {},
      collapse() {},
      move() {},
    },
    sidebar: {
      opened: () => false,
      open() {},
      close() {},
      toggle() {},
      width: () => 280,
      resize() {},
      workspaces: () => () => false,
      setWorkspaces() {},
      toggleWorkspaces() {},
    },
    terminal: {
      height: () => DEFAULT_TERMINAL_HEIGHT,
      width: dl.terminal.width,
      resize: dl.terminal.resize,
    },
    review: {
      diffStyle: dl.diffStyle,
      setDiffStyle: dl.setDiffStyle,
    },
    fileTree: {
      opened: dl.fileTree.opened,
      width: dl.fileTree.width,
      tab: () => "all" as const,
      setTab() {},
      open: dl.fileTree.open,
      close: dl.fileTree.close,
      toggle: dl.fileTree.toggle,
      resize: dl.fileTree.resize,
    },
    session: {
      width: () => 400,
      resize() {},
    },
    mobileSidebar: {
      opened: () => false,
      show() {},
      hide() {},
      toggle() {},
    },
    pendingMessage: {
      set() {},
      consume() { return undefined },
    },
    view() {
      return {
        scroll: () => ({ x: 0, y: 0 }),
        setScroll() {},
        terminal: {
          opened: dl.terminal.opened,
          open: dl.terminal.open,
          close: dl.terminal.close,
          toggle: dl.terminal.toggle,
        },
        reviewPanel: {
          opened: () => false,
          open() {},
          close() {},
          toggle() {},
        },
        review: {
          open: () => undefined,
          setOpen() {},
        },
      }
    },
    tabs() {
      return {
        tabs: () => ({ all: [], active: undefined }),
        active: () => undefined,
        all: () => [],
        setActive() {},
        setAll() {},
        async open() {},
        close() {},
        move() {},
      }
    },
  }

  return <LayoutContext.Provider value={value}>{props.children}</LayoutContext.Provider>
}

function DeviceClientProvider(props: ParentProps) {
  const server = useServer()
  const platform = usePlatform()

  const value = createMemo(() => {
    const current = server.current
    if (!current) return null
    const client = createSdkForServer({
      server: current.http,
      fetch: platform.fetch,
      throwOnError: true,
    })
    return {
      client,
      url: current.http.url,
      createClient(opts: { directory: string; throwOnError?: boolean }) {
        const s = server.current ?? current
        return createSdkForServer({
          server: s.http,
          fetch: platform.fetch,
          ...opts,
        })
      },
    }
  })

  return (
    <Show when={value()} keyed>
      {(v) => (
        <DeviceClientContext.Provider value={v}>
          {props.children}
        </DeviceClientContext.Provider>
      )}
    </Show>
  )
}

function DeviceSDKProvider(props: ParentProps<{ directory: string }>) {
  const server = useServer()
  const platform = usePlatform()

  const value = createMemo(() => {
    const current = server.current
    if (!current) return null
    const dirClient = createSdkForServer({
      server: current.http,
      fetch: platform.fetch,
      directory: props.directory,
      throwOnError: true,
    })
    return {
      client: dirClient,
      directory: props.directory,
      url: current.http.url,
      createClient(opts: { directory: string; throwOnError?: boolean }) {
        const s = server.current ?? current
        return createSdkForServer({
          server: s.http,
          fetch: platform.fetch,
          ...opts,
        })
      },
    }
  })

  return (
    <Show when={value()} keyed>
      {(v) => (
        <DeviceSDKContext.Provider value={v}>
          {props.children}
        </DeviceSDKContext.Provider>
      )}
    </Show>
  )
}

export function DeviceInterface(props: ParentProps<{ directory: string; deviceLayout: ReturnType<typeof useDeviceLayout> }>) {
  return (
    <DeviceClientProvider>
      <DeviceInitGate>
        <DeviceLayoutProvider deviceLayout={props.deviceLayout}>
          <DirectoryContext.Provider value={() => props.directory}>
            <DeviceSDKProvider directory={props.directory}>
              <DeviceWorkspaceProvider>
                <DeviceProjectProvider>
                  <DeviceFileProvider>
                    <DeviceTerminalProvider>
                      <DeviceLocalProvider>
                        {props.children}
                      </DeviceLocalProvider>
                    </DeviceTerminalProvider>
                  </DeviceFileProvider>
                </DeviceProjectProvider>
              </DeviceWorkspaceProvider>
            </DeviceSDKProvider>
          </DirectoryContext.Provider>
        </DeviceLayoutProvider>
      </DeviceInitGate>
    </DeviceClientProvider>
  )
}
