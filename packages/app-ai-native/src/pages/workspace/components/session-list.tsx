import { createEffect, createMemo, createSignal, For, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { useLanguage } from "@/context/language"
import { useDeviceWorkspace } from "@/context/device-workspace"
import { useContentTabs, type ContentTab } from "@/context/content-tabs"
import { sessionTreeIDs } from "@/pages/session/composer/session-request-tree"
import type { Session } from "@opencode-ai/sdk/v2/client"

const SESSION_TAB_ICON = "bubble-5"

function hasPendingInteraction(
  sessions: { id: string; parentID?: string }[],
  questions: Record<string, unknown[]>,
  permissions: Record<string, unknown[]>,
  sessionID?: string,
): boolean {
  if (!sessionID) return false
  const treeIds = sessionTreeIDs(sessions as any, sessionID)
  return treeIds.some((id) => (questions[id]?.length ?? 0) > 0 || (permissions[id]?.length ?? 0) > 0)
}

export function sessionGroup(session: { time: { updated?: number; created: number } }) {
  const now = Date.now()
  const startOfDay = new Date(now).setHours(0, 0, 0, 0)
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
  const t = session.time.updated ?? session.time.created
  return t >= startOfDay ? "today" : t >= sevenDaysAgo ? "thisWeek" : "older"
}

function PendingInteractionIcon() {
  return (
    <div class="shrink-0 flex items-center justify-center w-4 h-4 animate-bell" style={{ "transform-origin": "top center" }}>
      <Icon name="bell" size="small" style={{ color: "#ffa000" }} />
    </div>
  )
}

function WorkingIcon(props: { class?: string; classList?: Record<string, boolean>; title?: string }) {
  return (
    <div class="shrink-0 flex items-center justify-center w-4 h-4">
      <div
        class="size-3 rounded-full border border-t-transparent animate-spin"
        classList={props.classList}
        title={props.title}
      />
    </div>
  )
}

export function SessionListPanel() {
  const language = useLanguage()
  const dw = useDeviceWorkspace()
  const tabStore = useContentTabs()
  const [groups, setGroups] = createSignal<Record<string, boolean>>({ older: true })

  const sortedSessions = createMemo(() => {
    const sessions = dw.data.session
    return sessions
      .filter((s) => !s.parentID)
      .slice()
      .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
  })

  type SessionGroup = { key: string; label: string; sessions: Session[] }

  const sessionGroups = createMemo<SessionGroup[]>(() => {
    const groups: SessionGroup[] = [
      { key: "today", label: language.t("workspace.session.group.today"), sessions: [] },
      { key: "thisWeek", label: language.t("workspace.session.group.thisWeek"), sessions: [] },
      { key: "older", label: language.t("workspace.session.group.older"), sessions: [] },
    ]
    for (const s of sortedSessions()) {
      const key = sessionGroup(s)
      if (key === "today") groups[0].sessions.push(s)
      else if (key === "thisWeek") groups[1].sessions.push(s)
      else groups[2].sessions.push(s)
    }
    return groups.filter((g) => g.sessions.length > 0)
  })

  const isWorking = (id: string) => {
    const s = dw.data.sessionStatus[id]
    return s?.type === "busy" || s?.type === "retry"
  }

  const openSession = (session: Session) => {
    dw.session.clearUnread(session.id)
    const existing = tabStore.tabs().find((t) => t.kind === "session" && t.meta?.sessionID === session.id)
    if (existing) {
      tabStore.activate(existing.id)
      return
    }
    tabStore.open({
      kind: "session",
      key: session.id,
      title: session.title || language.t("command.session.new"),
      icon: SESSION_TAB_ICON,
      meta: { sessionID: session.id },
    })
  }

  const deleteSession = async (session: Session) => {
    await dw.session.remove(session.id)
  }

  createEffect(() => {
    if (dw.data.status !== "ready") return
    const live = new Set(dw.data.session.map((s) => s.id))
    for (const sid of live) {
      tabStore.confirmSession(sid)
    }
    const ids = tabStore
      .tabs()
      .filter((tab) => tab.kind === "session" && tab.meta?.sessionID && !live.has(tab.meta.sessionID) && !tabStore.isPendingSession(tab.meta.sessionID))
      .map((tab) => tab.id)
    if (ids.length === 0) return
    ids.forEach(tabStore.close)
  })

  return (
    <div class="flex flex-col h-full">
      <div class="flex-1 min-h-0 overflow-y-auto">
        <Show
          when={dw.data.status === "loading"}
          fallback={
            <Show
              when={sessionGroups().length > 0}
              fallback={
                <div class="px-3 py-2 text-12-regular text-text-weak">
                  {language.t("workspace.emptySessions")}
                </div>
              }
            >
              <div class="px-1.5 py-1">
                <For each={sessionGroups()}>
                  {(group) => {
                    const collapsed = createMemo(() => !!groups()[group.key])
                    return (
                      <>
                        <button
                          class="flex items-center gap-1 w-full px-1.5 pt-1.5 pb-0.5 text-[12px] font-[600] text-native-muted tracking-wide uppercase cursor-pointer hover:text-native-foreground transition-colors"
                          onClick={() => setGroups((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
                        >
                          <Icon name={collapsed() ? "chevron-right" : "chevron-down"} size="small" class="shrink-0" />
                          <span class="truncate">{group.label}</span>
                        </button>
                        <Show when={!collapsed()}>
                          <For each={group.sessions}>
                            {(session) => {
                              const isActive = createMemo(() => {
                                const current = tabStore.active()
                                return current?.kind === "session" && current?.meta?.sessionID === session.id
                              })
                              return (
                                <div
                                  class="group/s flex items-center gap-1.5 h-9 px-1.5 text-12-regular rounded-md cursor-pointer transition-colors duration-150"
                                  classList={{
                                    "bg-native-primary-soft text-native-foreground": isActive(),
                                    "text-native-muted hover:bg-native-hover hover:text-native-foreground": !isActive(),
                                  }}
                                  onClick={() => openSession(session)}
                                >
                                  <Show when={hasPendingInteraction(dw.data.session, dw.data.questions, dw.data.permissions, session.id)}>
                                    <PendingInteractionIcon />
                                  </Show>
                                  <Show when={!hasPendingInteraction(dw.data.session, dw.data.questions, dw.data.permissions, session.id) && isWorking(session.id)}>
                                    <WorkingIcon
                                      classList={{
                                        "border-native-primary": isActive(),
                                        "border-native-dim": !isActive(),
                                      }}
                                    />
                                  </Show>
                                  <Show when={!hasPendingInteraction(dw.data.session, dw.data.questions, dw.data.permissions, session.id) && !isWorking(session.id) && !!dw.data.unread[session.id]}>
                                    <span class="shrink-0 w-2 h-2 rounded-full bg-native-primary" />
                                  </Show>
                                  <span class="truncate flex-1 min-w-0">{session.title || language.t("command.session.new")}</span>
                                  <button
                                    class="shrink-0 size-5 flex items-center justify-center rounded opacity-0 group-hover/s:opacity-100 transition-[width,opacity] duration-150 w-0 overflow-hidden group-hover/s:w-5 hover:bg-native-active"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      deleteSession(session)
                                    }}
                                  >
                                    <Icon name="trash" size="small" class="text-native-dim" />
                                  </button>
                                </div>
                              )
                            }}
                          </For>
                        </Show>
                      </>
                    )
                  }}
                </For>
              </div>
            </Show>
          }
        >
          <div class="px-3 py-2 text-12-regular text-text-weak">
            {language.t("common.loading")}{language.t("common.loading.ellipsis")}
          </div>
        </Show>
      </div>
      <div class="shrink-0 h-8 flex items-center gap-1 px-3 border-t text-12-medium text-native-dim overflow-hidden">
        <Show when={dw.data.agentInfo}>
          <span class="truncate">Powered by {dw.data.agentInfo!.name}</span>
          <Show when={dw.data.agentInfo!.version}>
            <span class="text-native-muted">{dw.data.agentInfo!.version}</span>
          </Show>
        </Show>
        <Show when={dw.restarting().active}>
          <span class="ml-auto text-12-medium text-text-warning animate-pulse">{(dw.restarting() as any).message}</span>
        </Show>
        <div class="ml-auto">
          <DropdownMenu>
            <DropdownMenu.Trigger
              as={IconButton}
              icon="dot-grid"
              size="small"
              variant="ghost"
              disabled={dw.restarting().active}
              class="!size-5 rounded cursor-pointer text-sidebar-foreground/70 hover:text-sidebar-foreground"
            />
            <DropdownMenu.Portal>
              <DropdownMenu.Content class="min-w-36 bg-sidebar shadow-md">
                <Show when={!dw.restarting().active && dw.data.agentInfo?.version} fallback={
                  <Tooltip value={dw.restarting().active ? "" : language.t("workspace.agent.upgradeRequired")} placement="left">
                    <DropdownMenu.Item class="opacity-40 cursor-not-allowed" onSelect={() => {}}>
                      <Icon name="reset" size="small" class="size-4 text-sidebar-foreground/70" />
                      <DropdownMenu.ItemLabel>{language.t("workspace.agent.restart")}</DropdownMenu.ItemLabel>
                    </DropdownMenu.Item>
                  </Tooltip>
                }>
                  <DropdownMenu.Item class="hover:bg-sidebar-accent" onSelect={() => dw.restartAgent()}>
                    <Icon name="reset" size="small" class="size-4 text-sidebar-foreground/70" />
                    <DropdownMenu.ItemLabel>{language.t("workspace.agent.restart")}</DropdownMenu.ItemLabel>
                  </DropdownMenu.Item>
                </Show>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
