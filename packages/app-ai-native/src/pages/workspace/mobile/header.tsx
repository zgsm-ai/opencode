import { createMemo, For, Show } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { Icon } from "@opencode-ai/ui/icon"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import AvatarDisplay from "@/components/avatar-display"
import { UserDropdown } from "@/components/user-menu"
import { useAuth } from "@/context/auth"
import { type Locale, useLanguage } from "@/context/language"
import { useWorkspace } from "../context"
import { getLoginUrl } from "@/pages/store/lib/auth"
import { triggerNewSession } from "./layout"

function UserMenu() {
  const { user } = useAuth()
  const language = useLanguage()
  const displayName = () => user()?.name || user()?.preferred_username || user()?.email || ""

  return (
    <Show
      when={user()}
      fallback={
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-text-weak hover:text-text-base hover:bg-[var(--surface-base-hover)] transition-colors outline-none"
          onClick={() => {
            window.location.href = getLoginUrl()
          }}
        >
          <AvatarDisplay class="size-5" />
          <span class="text-12-regular max-w-[60px] truncate">{language.t("sidebar.user.signIn")}</span>
        </button>
      }
    >
      <UserDropdown
        trigger={
          <DropdownMenu.Trigger class="flex items-center rounded-md p-1 hover:bg-[var(--surface-base-hover)] transition-colors outline-none">
            <AvatarDisplay avatarUrl={user()?.picture} username={displayName()} class="size-6" />
          </DropdownMenu.Trigger>
        }
      />
    </Show>
  )
}

function WorkspaceSelector(props: { bordered?: boolean }) {
  const params = useParams()
  const work = useWorkspace()
  const navigate = useNavigate()
  const language = useLanguage()
  const t = language.t

  const currentName = createMemo(() => {
    const ws = work.workspaces().find((w) => w.id === params.workspaceID)
    return ws?.name ?? t("workspace.page.title")
  })

  const runningWorkspaces = createMemo(() => {
    const enabled = new Set(work.enabledWorkspaceIds())
    const seen = new Set<string>()
    return work.workspaces().filter((w) => {
      if (!enabled.has(w.id) || seen.has(w.id)) return false
      seen.add(w.id)
      return true
    })
  })

  const idleWorkspaces = createMemo(() => {
    const enabled = new Set(work.enabledWorkspaceIds())
    const seen = new Set<string>()
    return work.workspaces().filter((w) => {
      if (enabled.has(w.id) || seen.has(w.id)) return false
      seen.add(w.id)
      return true
    })
  })

  return (
    <DropdownMenu placement="bottom">
      <DropdownMenu.Trigger class="grid grid-cols-[1fr_auto] items-center w-[200px] h-8 hover:bg-[var(--surface-base-hover)] transition-colors outline-none px-3" classList={{ "rounded-lg border border-border": !props.bordered }}>
        <span class="truncate text-[0.9375rem] font-semibold text-center">{currentName()}</span>
        <Icon name="chevron-down" size="small" class="shrink-0 text-text-weak" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content class="w-[280px] max-h-[60dvh] overflow-y-auto thin-scrollbar">
          <Show when={runningWorkspaces().length > 0}>
            <div class="px-3 pt-2 pb-0.5">
              <span class="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-weak">
                {t("workspace.running")}
              </span>
            </div>
            <For each={runningWorkspaces()}>
              {(ws) => (
                <DropdownMenu.Item
                  classList={{ "bg-[var(--surface-base-hover)]": params.workspaceID === ws.id }}
                  onSelect={() => {
                    if (ws.id !== params.workspaceID) navigate(`/m/workspace/${ws.id}`)
                  }}
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <div class="size-2 rounded-full shrink-0 bg-icon-success-base" />
                    <span class="truncate text-13-regular">{ws.name}</span>
                  </div>
                </DropdownMenu.Item>
              )}
            </For>
            <DropdownMenu.Separator />
          </Show>
          <div class="px-3 pt-2 pb-0.5">
            <span class="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-weak">
              {t("workspace.idle")}
            </span>
          </div>
          <For each={idleWorkspaces()}>
            {(ws) => {
              const dotColor = createMemo(() =>
                ws.deviceStatus === "online"
                  ? "bg-icon-success-base"
                  : ws.deviceStatus === "offline"
                    ? "bg-icon-critical-base"
                    : "bg-sidebar-border",
              )
              return (
                <DropdownMenu.Item
                  classList={{ "bg-[var(--surface-base-hover)]": params.workspaceID === ws.id }}
                  onSelect={() => {
                    if (ws.id !== params.workspaceID) navigate(`/m/workspace/${ws.id}`)
                  }}
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <div class="size-2 rounded-full shrink-0" classList={{ [dotColor()]: true }} />
                    <span class="truncate text-13-regular">{ws.name}</span>
                  </div>
                </DropdownMenu.Item>
              )
            }}
          </For>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu>
  )
}

export function MobileWorkspaceHeader() {
  const params = useParams()
  const work = useWorkspace()
  const language = useLanguage()
  const navigate = useNavigate()
  const t = language.t
  const hasWorkspace = createMemo(() => !!params.workspaceID)

  const handleCloseWorkspace = () => {
    const id = params.workspaceID
    if (!id) return
    work.disableWorkspace(id)
    const remaining = work.enabledWorkspaceIds().filter((x) => x !== id)
    if (remaining.length > 0) {
      navigate(`/m/workspace/${remaining[0]}`)
    } else {
      navigate("/m/workspace")
    }
  }

  return (
    <div class="shrink-0 flex items-center h-[48px] px-2 border-b border-border bg-background-base">
      {/* Left: Session sidebar toggle + new session */}
      <div class="shrink-0 flex items-center">
        <Show when={hasWorkspace()}>
          <div class="inline-flex rounded-md border border-border overflow-hidden">
            <button
              type="button"
              class="flex items-center justify-center size-8 hover:bg-[var(--surface-base-hover)] transition-colors"
              onClick={work.toggleSidebar}
              aria-label={t("workspace.toggleSessionList")}
            >
              <Icon name={work.sidebarOpened() ? "layout-left-full" : "layout-left"} class="text-text-weak" />
            </button>
            <button
              type="button"
              class="flex items-center justify-center size-8 border-l border-border hover:bg-[var(--surface-base-hover)] transition-colors"
              onClick={triggerNewSession}
              aria-label={t("workspace.content.newSession")}
            >
              <Icon name="plus-small" class="text-text-weak" />
            </button>
          </div>
        </Show>
      </div>

      {/* Center: Title or Workspace selector + close */}
      <div class="flex-1 min-w-0 flex justify-center">
        <Show
          when={hasWorkspace()}
          fallback={
            <span class="text-[0.9375rem] font-semibold truncate">
              {t("workspace.page.title")}
            </span>
          }
        >
          <div class="inline-flex h-8 rounded-md border border-border overflow-hidden">
            <WorkspaceSelector bordered />
            <button
              type="button"
              class="flex items-center justify-center w-8 border-l border-border hover:bg-[var(--surface-base-hover)] transition-colors"
              onClick={handleCloseWorkspace}
              aria-label={t("workspace.close")}
            >
              <Icon name="close" size="small" class="text-text-weak" />
            </button>
          </div>
        </Show>
      </div>

      {/* Right: User menu */}
      <div class="shrink-0 flex items-center">
        <UserMenu />
      </div>
    </div>
  )
}
