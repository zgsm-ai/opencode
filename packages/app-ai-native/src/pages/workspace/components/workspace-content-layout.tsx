import { createMemo, createSignal, For, Match, onMount, Show, Switch, createEffect, on, onCleanup, untrack } from "solid-js"
import { useParams, useSearchParams } from "@solidjs/router"
import { Toast } from "@opencode-ai/ui/toast"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { Tabs } from "@opencode-ai/ui/tabs"
import { Collapsible } from "@opencode-ai/ui/collapsible"
import { useLanguage } from "@/context/language"
import { useFile } from "@/context/file"
import { useDeviceProject } from "@/context/device-project"
import { useDeviceSDK } from "@/context/device-sdk"
import { useDeviceWorkspace } from "@/context/device-workspace"
import { DeviceSessionProvider } from "@/context/device-session"
import { DeviceSessionTab } from "./device-session-tab"
import { TerminalTab } from "./terminal-tab"
import { useDeviceTerminal } from "@/context/device-terminal"
import { ContentTabContext, useContentTabs, type ContentTab } from "@/context/content-tabs"
import { useDeviceLayout } from "./device-interface"
import { FilePreviewTab } from "./file-preview-tab"
import { DiffPreviewTab } from "./diff-preview-tab"
import { workspaceKey } from "@/pages/layout/helpers"
import { shouldRestore, activeSession } from "./workspace-content-layout-sync"
import FileTree from "@/components/file-tree"
import type { FileNode } from "@opencode-ai/sdk/v2"
import type { DiffFileEntry } from "@/client/device-client"
import type { Session } from "@opencode-ai/sdk/v2/client"
import { getDirectory, getFilename } from "@opencode-ai/util/path"
import { useWorkspace } from "../context"
import { filePreviewConfig } from "../lib/file-preview-config"

let newSessionCounter = 0

let newTerminalCounter = 0

function TabIcon(props: { tab: ContentTab }) {
  return <Icon name={props.tab.icon as any ?? "file-tree"} size="small" class="shrink-0 text-text-weak" />
}

function TabContent(props: { tab: ContentTab }) {
  return (
    <Switch>
      <Match when={props.tab.kind === "file"}>
        <FilePreviewTab tab={props.tab} />
      </Match>
      <Match when={props.tab.kind === "diff"}>
        <DiffPreviewTab tab={props.tab} />
      </Match>
      <Match when={props.tab.kind === "session"}>
        <DeviceSessionProvider sessionID={(props.tab.meta as any)?.sessionID}>
          <DeviceSessionTab tabId={props.tab.id} />
        </DeviceSessionProvider>
      </Match>
      <Match when={props.tab.kind === "terminal"}>
        <TerminalTab tab={props.tab} />
      </Match>
    </Switch>
  )
}

function ContentTabPanel() {
  const tabStore = useContentTabs()
  const terminal = useDeviceTerminal()
  const language = useLanguage()

  const closeTab = (id: string) => {
    const tab = tabStore.tabs().find((t) => t.id === id)
    if (tab?.kind === "terminal") {
      const sessionId = (tab.meta as any)?.sessionId as string | undefined
      if (sessionId) terminal.close(sessionId)
    }
    tabStore.close(id)
  }

  return (
    <div class="flex-1 min-w-0 h-full flex flex-col">
      <Show
        when={tabStore.tabs().length > 0}
        fallback={
          <div class="flex-1 h-full flex items-center justify-center text-text-weak text-14-regular">
            {language.t("workspace.content.selectFileOrSession")}
          </div>
        }
      >
        <Tabs
          value={tabStore.activeId()}
          onChange={tabStore.activate}
          class="h-full flex flex-col"
        >
          <div class="h-[41px] shrink-0 flex items-center  border-b pr-2">
            <Tabs.List class="flex-1 min-w-0 h-full [&::after]:border-b-0 overflow-x-auto scrollbar-none" onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY }}>
              <For each={tabStore.tabs()}>
                {(tab) => (
                  <Tabs.Trigger
                    value={tab.id}
                    class="group h-full min-w-[100px] max-w-[180px] !bg-background-weak !border-b-0 has-[[data-selected]]:!bg-background-base has-[[data-selected]]:!border-b has-[[data-selected]]:before:absolute has-[[data-selected]]:before:top-0 has-[[data-selected]]:before:left-0 has-[[data-selected]]:before:right-0 has-[[data-selected]]:before:h-[2px] has-[[data-selected]]:before:bg-icon-strong-base [&>[data-slot=tabs-trigger]]:h-full [&>[data-slot=tabs-trigger]]:w-full [&>[data-slot=tabs-trigger]]:px-2 [&>[data-slot=tabs-trigger]]:gap-1.5 flex items-center gap-1.5 text-13-regular text-text-weak hover:text-text-base has-[[data-selected]]:text-text-base transition-colors relative"
                  >
                    <TabIcon tab={tab} />
                    <span class="truncate flex-1 min-w-0">{tab.title}</span>
                    <button
                      class="flex items-center justify-center h-full w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation()
                        closeTab(tab.id)
                      }}
                    >
                      <Icon name={"close-small" as any} size="small" class="text-text-weak" />
                    </button>
                  </Tabs.Trigger>
                )}
              </For>
            </Tabs.List>
            <div class="shrink-0 flex items-center px-1">
              <Tooltip value={language.t("workspace.content.closeAll")} placement="bottom">
                <IconButton
                  icon="trash"
                  variant="ghost"
                  iconSize="small"
                  onClick={() => {
                    for (const t of tabStore.tabs()) {
                      if (t.kind === "terminal") {
                        const sid = t.meta?.sessionId as string | undefined
                        if (sid) terminal.close(sid)
                      }
                    }
                    tabStore.closeAll()
                  }}
                  aria-label={language.t("workspace.content.closeAll")}
                />
              </Tooltip>
            </div>
          </div>
          <For each={tabStore.tabs()}>
            {(tab) => (
              <Show when={tabStore.activeId() === tab.id}>
                <Tabs.Content value={tab.id} class="flex-1 min-h-0">
                  <TabContent tab={tab} />
                </Tabs.Content>
              </Show>
            )}
          </For>
        </Tabs>
      </Show>
    </div>
  )
}

function FileTreeWithTabs(props: { path: string }) {
  const tabStore = useContentTabs()
  const file = useFile()

  const handleFileClick = (node: FileNode) => {
    if (node.type === "directory") return
    const path = node.path ?? node.absolute
    if (!path) return
    tabStore.open({
      kind: "file",
      key: path,
      title: node.name,
      icon: "file-tree",
      meta: { path },
    })
    void file.load(path, { limit: filePreviewConfig.initialPreviewLines })
  }

  return <FileTree path={props.path} onFileClick={handleFileClick} />
}

type SidebarSection = "sessions" | "files" | "diffs"

const SECTION_MIN_HEIGHT = 120
const SECTION_HEADER_HEIGHT = 32

function ContentSidebar(props: { directory: string }) {
  const language = useLanguage()
  const dl = useDeviceLayout()
  const tabStore = useContentTabs()
  const terminal = useDeviceTerminal()
  const sdk = useDeviceSDK()
  const dw = useDeviceWorkspace()
  const work = useWorkspace()
  const [expanded, setExpanded] = createSignal<Record<SidebarSection, boolean>>({
    sessions: true,
    files: false,
    diffs: false,
  })
  const [heights, setHeights] = createSignal<Record<SidebarSection, number>>({
    sessions: SECTION_MIN_HEIGHT,
    files: 300,
    diffs: SECTION_MIN_HEIGHT,
  })
  const [stagedFiles, setStagedFiles] = createSignal<DiffFileEntry[]>([])
  const [unstagedFiles, setUnstagedFiles] = createSignal<DiffFileEntry[]>([])
  const [diffBranch, setDiffBranch] = createSignal<string>("")
  const [diffLoading, setDiffLoading] = createSignal(false)
  const [statusMap, setStatusMap] = createSignal<Record<string, { type: string }>>({})
  const [diffGroupsCollapsed, setDiffGroupsCollapsed] = createSignal<Record<string, boolean>>({})

  const sortedSessions = createMemo(() => {
    const sessions = dw.data.session
    return sessions
      .filter((s) => !s.parentID && !s.time.archived)
      .slice()
      .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
  })

  type SessionGroup = { key: string; label: string; sessions: Session[] }

  const sessionGroups = createMemo<SessionGroup[]>(() => {
    const now = Date.now()
    const startOfDay = new Date(now).setHours(0, 0, 0, 0)
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
    const groups: SessionGroup[] = [
      { key: "today", label: language.t("workspace.session.group.today"), sessions: [] },
      { key: "thisWeek", label: language.t("workspace.session.group.thisWeek"), sessions: [] },
      { key: "older", label: language.t("workspace.session.group.older"), sessions: [] },
    ]
    for (const s of sortedSessions()) {
      const t = s.time.updated ?? s.time.created
      if (t >= startOfDay) groups[0].sessions.push(s)
      else if (t >= sevenDaysAgo) groups[1].sessions.push(s)
      else groups[2].sessions.push(s)
    }
    return groups.filter((g) => g.sessions.length > 0)
  })

  const isWorking = (id: string) => {
    const s = statusMap()[id]
    return s?.type === "busy" || s?.type === "retry"
  }

  const openSession = (session: Session) => {
    tabStore.open({
      kind: "session",
      key: session.id,
      title: session.title || language.t("command.session.new"),
      icon: "bubble-5",
      meta: { sessionID: session.id },
    })
  }

  const archiveSession = async (session: Session) => {
    await dw.session.archive(session.id)
  }

  createEffect(() => {
    if (dw.data.status !== "ready") return
    const live = new Set(dw.data.session.map((s) => s.id))
    const ids = tabStore.tabs()
      .filter((tab) => tab.kind === "session" && tab.meta?.sessionID && !live.has(tab.meta.sessionID))
      .map((tab) => tab.id)
    if (ids.length === 0) return
    ids.forEach(tabStore.close)
  })

  createEffect(() => {
    const unsub = dw.subscribe((payload) => {
      if (payload.type === "session.status") {
        const props = payload.properties as { sessionID: string; status: { type: string } }
        if (!props?.sessionID) return
        if (props.status.type === "idle") {
          setStatusMap((prev) => {
            const next = { ...prev }
            delete next[props.sessionID]
            return next
          })
        } else {
          setStatusMap((prev) => ({ ...prev, [props.sessionID]: props.status }))
        }
      }
    })
    onCleanup(unsub)
  })

  const loadDiff = async () => {
    if (diffLoading()) return
    setDiffLoading(true)
    try {
      const result = await sdk.client.runtime.diff()
      if (result) {
        setStagedFiles(result.stagedFiles ?? [])
        setUnstagedFiles(result.unstagedFiles ?? [])
        setDiffBranch(result.branch ?? "")
      }
    } catch {
      setStagedFiles([])
      setUnstagedFiles([])
    } finally {
      setDiffLoading(false)
    }
  }

  createEffect(() => {
    if (expanded().diffs) untrack(() => loadDiff())
  })

  const statusColor = (status: string) => {
    switch (status) {
      case "modified": return "text-warning"
      case "deleted": return "text-danger"
      case "renamed": return "text-info"
      default: return "text-text-weak"
    }
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case "modified": return "pencil-line"
      case "deleted": return "trash"
      case "renamed": return "arrow-right"
      default: return "file-tree"
    }
  }

  const toggle = (section: SidebarSection) => {
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const expandedCount = createMemo(() =>
    Object.values(expanded()).filter(Boolean).length,
  )

  const sections = createMemo<{ key: SidebarSection; icon: string; label: string; badge?: number }[]>(() => [
    { key: "sessions", icon: "message" as any, label: language.t("workspace.content.section.sessions") },
    { key: "files", icon: "file-tree", label: language.t("workspace.content.section.files") },
    { key: "diffs", icon: "branch" as any, label: language.t("workspace.content.section.changes") },
  ])

  return (
    <div class="flex flex-col h-full border-r">
      <div class="h-[41px] shrink-0 flex items-center gap-1 px-2 border-b">
        <Show when={!work.sidebarOpened()}>
          <Tooltip value={language.t("workspace.sidebar.expand")} placement="bottom">
            <IconButton
              icon="chevron-right"
              variant="ghost"
              iconSize="small"
              onClick={work.openSidebar}
              aria-label={language.t("workspace.sidebar.expand")}
            />
          </Tooltip>
        </Show>
        <Tooltip value={language.t("workspace.content.newSession")} placement="bottom">
          <IconButton
            icon="plus-small"
            variant="ghost"
            iconSize="small"
            onClick={() => {
              newSessionCounter++
              tabStore.open({
                kind: "session",
                key: `new-${newSessionCounter}`,
                title: language.t("command.session.new"),
                icon: "bubble-5",
                meta: { sessionID: undefined },
              })
            }}
            aria-label={language.t("workspace.content.newSession")}
          />
        </Tooltip>
        <Tooltip value={language.t("command.terminal.new")} placement="bottom">
          <IconButton
            icon="terminal"
            variant="ghost"
            iconSize="small"
            onClick={() => {
              newTerminalCounter++
              const pendingKey = `pending-${newTerminalCounter}`
              tabStore.open({
                kind: "terminal",
                key: pendingKey,
                title: language.t("command.terminal.new"),
                icon: "terminal",
                meta: { sessionId: undefined },
              })
              terminal.new().then((sessionId) => {
                if (!sessionId) {
                  tabStore.close(tabStore.makeTabId("terminal", pendingKey))
                  return
                }
                tabStore.replace(tabStore.makeTabId("terminal", pendingKey), {
                  kind: "terminal",
                  key: sessionId,
                  title: `Terminal`,
                  icon: "terminal",
                  meta: { sessionId },
                })
              })
            }}
            aria-label={language.t("command.terminal.new")}
          />
        </Tooltip>
        <div class="flex-1" />
      </div>

      <div class="flex-1 min-h-0 flex flex-col">
        <For each={sections()}>
          {(section, idx) => {
            const isOpen = createMemo(() => expanded()[section.key])
            const isFirstExpanded = createMemo(() => {
              if (!isOpen()) return false
              const keys: SidebarSection[] = ["sessions", "files", "diffs"]
              for (const k of keys) {
                if (expanded()[k]) return k === section.key
              }
              return false
            })

            return (
              <div
                class="flex flex-col min-h-0 relative"
                classList={{
                  "flex-1": isFirstExpanded(),
                  "shrink-0": isOpen() && !isFirstExpanded(),
                }}
                style={{
                  height: isOpen() && !isFirstExpanded() ? `${heights()[section.key]}px` : undefined,
                }}
              >
                <Show when={isOpen() && !isFirstExpanded()}>
                  <ResizeHandle
                    direction="vertical"
                    size={heights()[section.key]}
                    min={SECTION_MIN_HEIGHT}
                    max={800}
                    onResize={(h: number) => setHeights((prev) => ({ ...prev, [section.key]: h }))}
                  />
                </Show>
                <button
                  class="shrink-0 flex items-center gap-1.5 w-full px-2 text-12-regular text-text-weak hover:text-text-base hover:bg-background-stronger transition-colors cursor-pointer border-b"
                  style={{ height: `${SECTION_HEADER_HEIGHT}px` }}
                  onClick={() => toggle(section.key)}
                >
                  <Icon
                    name={isOpen() ? "chevron-down" : "chevron-right"}
                    size="small"
                    class="shrink-0"
                  />
                  <span class="truncate">{section.label}</span>
                  <Show when={section.badge !== undefined}>
                    <span class="ml-auto text-11-regular text-text-weak tabular-nums">{section.badge}</span>
                  </Show>
                </button>
                <Show when={isOpen()}>
                  <div class="flex-1 min-h-0 overflow-y-auto">
                    <Show when={section.key === "sessions"}>
                      <Show when={dw.data.status === "loading"} fallback={
                        <Show when={sessionGroups().length > 0} fallback={
                          <div class="px-3 py-2 text-12-regular text-text-weak">
                            {language.t("workspace.emptySessions")}
                          </div>
                        }>
                          <div class="px-1.5 py-1">
                            <For each={sessionGroups()}>
                              {(group) => (
                                <>
                                  <div class="px-1.5 pt-1.5 pb-0.5 text-[12px] font-[600] text-native-muted tracking-wide uppercase">{group.label}</div>
                                  <For each={group.sessions}>
                                    {(session) => {
                                      const isActive = createMemo(() => {
                                        const active = tabStore.active()
                                        return active?.kind === "session" && active?.meta?.sessionID === session.id
                                      })
                                      return (
                                        <div
                                          class="group/s flex items-center gap-2 h-10 px-1.5 text-12-regular rounded-md cursor-pointer transition-colors duration-150"
                                          classList={{
                                            "bg-native-primary-soft text-native-foreground": isActive(),
                                            "text-native-muted hover:bg-native-hover hover:text-native-foreground": !isActive(),
                                          }}
                                          onClick={() => openSession(session)}
                                        >
                                          <Show
                                            when={isWorking(session.id)}
                                          >
                                            <div
                                              class="size-3 shrink-0 rounded-full border border-t-transparent animate-spin"
                                              classList={{
                                                "border-native-primary": isActive(),
                                                "border-native-dim": !isActive(),
                                              }}
                                            />
                                          </Show>
                                          <span class="truncate flex-1 min-w-0">{session.title || language.t("command.session.new")}</span>
                                          <button
                                            class="shrink-0 size-5 flex items-center justify-center rounded opacity-0 group-hover/s:opacity-100 transition-opacity duration-150 hover:bg-native-active"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              archiveSession(session)
                                            }}
                                          >
                                            <Icon name="archive" size="small" class="text-native-dim" />
                                          </button>
                                        </div>
                                      )
                                    }}
                                  </For>
                                </>
                              )}
                            </For>
                          </div>
                        </Show>
                      }>
                        <div class="px-3 py-2 text-12-regular text-text-weak">
                          {language.t("common.loading")}{language.t("common.loading.ellipsis")}
                        </div>
                      </Show>
                    </Show>
                    <Show when={section.key === "files"}>
                      <div class="p-2">
                        <FileTreeWithTabs path={props.directory} />
                      </div>
                    </Show>
                    <Show when={section.key === "diffs"}>
                      <Show when={!diffLoading()} fallback={
                        <div class="px-3 py-2 text-12-regular text-text-weak">
                          {language.t("common.loading")}{language.t("common.loading.ellipsis")}
                        </div>
                      }>
                        <Show when={stagedFiles().length > 0 || unstagedFiles().length > 0} fallback={
                          <div class="px-3 py-2 text-12-regular text-text-weak">
                            {language.t("session.review.noChanges")}
                          </div>
                        }>
                          <div class="px-2 py-1">
                            <Show when={diffBranch()}>
                              <div class="px-1 pb-1 text-11-regular text-text-weak flex items-center gap-1">
                                <Icon name="branch" size="small" class="shrink-0" />
                                <span class="truncate">{diffBranch()}</span>
                              </div>
                            </Show>
                            <Show when={stagedFiles().length > 0}>
                              <div
                                class="px-1.5 pt-1.5 pb-0.5 flex items-center gap-1 text-[11px] font-[600] text-native-muted tracking-wide uppercase cursor-pointer hover:text-native-foreground transition-colors"
                                onClick={() => setDiffGroupsCollapsed((prev) => ({ ...prev, staged: !prev.staged }))}
                              >
                                <Icon name={diffGroupsCollapsed().staged ? "chevron-right" : "chevron-down"} size="small" class="shrink-0" />
                                {language.t("workspace.content.diff.staged")}
                                <span class="ml-auto text-11-regular tabular-nums">{stagedFiles().length}</span>
                              </div>
                              <Show when={!diffGroupsCollapsed().staged}>
                                <For each={stagedFiles()}>
                                  {(file) => (
                                    <div class="flex items-center gap-1.5 h-10 px-1.5 text-12-regular hover:bg-native-hover rounded-md cursor-pointer transition-colors duration-150 group/diff"
                                      onClick={() => {
                                        tabStore.open({
                                          kind: "diff",
                                          key: `staged:${file.path}`,
                                          title: getFilename(file.path),
                                          icon: statusIcon(file.status) as string,
                                          meta: { path: file.path, status: file.status, staged: true },
                                        })
                                      }}
                                    >
                                      <Icon name={statusIcon(file.status) as any} size="small" class={`shrink-0 ${statusColor(file.status)}`} />
                                      <span class="truncate flex-1 min-w-0">{file.path}</span>
                                      <Show when={file.additions > 0 || file.deletions > 0}>
                                        <span class="shrink-0 text-11-regular tabular-nums flex items-center gap-0.5">
                                          <Show when={file.additions > 0}>
                                            <span class="text-success">+{file.additions}</span>
                                          </Show>
                                          <Show when={file.deletions > 0}>
                                            <span class="text-danger">-{file.deletions}</span>
                                          </Show>
                                        </span>
                                      </Show>
                                    </div>
                                  )}
                                </For>
                              </Show>
                            </Show>
                            <Show when={unstagedFiles().length > 0}>
                              <div
                                class="px-1.5 pt-1.5 pb-0.5 flex items-center gap-1 text-[11px] font-[600] text-native-muted tracking-wide uppercase cursor-pointer hover:text-native-foreground transition-colors"
                                onClick={() => setDiffGroupsCollapsed((prev) => ({ ...prev, unstaged: !prev.unstaged }))}
                              >
                                <Icon name={diffGroupsCollapsed().unstaged ? "chevron-right" : "chevron-down"} size="small" class="shrink-0" />
                                {language.t("workspace.content.diff.unstaged")}
                                <span class="ml-auto text-11-regular tabular-nums">{unstagedFiles().length}</span>
                              </div>
                              <Show when={!diffGroupsCollapsed().unstaged}>
                                <For each={unstagedFiles()}>
                                  {(file) => (
                                    <div class="flex items-center gap-1.5 h-10 px-1.5 text-12-regular hover:bg-native-hover rounded-md cursor-pointer transition-colors duration-150 group/diff"
                                      onClick={() => {
                                        tabStore.open({
                                          kind: "diff",
                                          key: `unstaged:${file.path}`,
                                          title: getFilename(file.path),
                                          icon: statusIcon(file.status) as string,
                                          meta: { path: file.path, status: file.status, staged: false },
                                        })
                                      }}
                                    >
                                      <Icon name={statusIcon(file.status) as any} size="small" class={`shrink-0 ${statusColor(file.status)}`} />
                                      <span class="truncate flex-1 min-w-0">{file.path}</span>
                                      <Show when={file.additions > 0 || file.deletions > 0}>
                                        <span class="shrink-0 text-11-regular tabular-nums flex items-center gap-0.5">
                                          <Show when={file.additions > 0}>
                                            <span class="text-success">+{file.additions}</span>
                                          </Show>
                                          <Show when={file.deletions > 0}>
                                            <span class="text-danger">-{file.deletions}</span>
                                          </Show>
                                        </span>
                                      </Show>
                                    </div>
                                  )}
                                </For>
                              </Show>
                            </Show>
                          </div>
                        </Show>
                      </Show>
                    </Show>
                  </div>
                </Show>
              </div>
            )
          }}
        </For>
      </div>
    </div>
  )
}


export function WorkspaceContentLayout(props: { workspaceId: string; directory: string }) {
  const params = useParams()
  const [searchParams, setSearchParams] = useSearchParams<{ session?: string }>()
  const language = useLanguage()
  const tabStore = useContentTabs()
  const dl = useDeviceLayout()
  const ws = useDeviceWorkspace()
  const active = createMemo(() => params.workspaceID === props.workspaceId)
  const [done, setDone] = createSignal<string | undefined>()

  const ready = createMemo(() => !!props.workspaceId && !!props.directory)
  const directory = createMemo(() => {
    if (!props.directory) return ""
    return workspaceKey(props.directory)
  })

  const syncUrlFromTab = (id: string | undefined) => {
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

  const restoreFromUrl = (sid: string, ws: ReturnType<typeof useDeviceWorkspace>) => {
    const existing = tabStore.tabs().find((t) => t.kind === "session" && t.meta?.sessionID === sid)
    if (existing) {
      tabStore.activate(existing.id)
      return
    }
    const session = ws.data.session.find((s) => s.id === sid)
    tabStore.open({
      kind: "session",
      key: sid,
      title: session?.title || language.t("command.session.new"),
      icon: "message",
      meta: { sessionID: sid },
    })
  }

  createEffect(() => {
    if (!active()) return
    const sid = searchParams.session
    if (!sid) {
      setDone(undefined)
      return
    }
    if (!shouldRestore(sid, done())) return
    if (ws.data.status === "loading") return
    restoreFromUrl(sid, ws)
    setDone(sid)
  })

  createEffect(() => {
    if (!active()) return
    if (shouldRestore(searchParams.session, done())) return
    syncUrlFromTab(tabStore.activeId())
  })

  return (
    <Show
      when={ready() && directory()}
      fallback={<div class="size-full" />}
    >
      <div class="flex h-full w-full min-h-0">
        <Show when={dl.fileTree.opened()}>
          <div
            class="shrink-0 h-full relative"
            style={{ width: `${dl.fileTree.width()}px` }}
          >
            <ContentSidebar directory={directory()!} />
            <ResizeHandle
              direction="horizontal"
              size={dl.fileTree.width()}
              min={160}
              max={500}
              collapseThreshold={100}
              onResize={dl.fileTree.resize}
              onCollapse={dl.fileTree.close}
            />
          </div>
        </Show>

        <div class="flex-1 min-w-0 h-full flex flex-col">
          <ContentTabPanel />
        </div>
      </div>
      <Toast.Region />
    </Show>
  )
}
