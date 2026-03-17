import { A, useLocation, useNavigate } from "@solidjs/router"
import { createSignal, createEffect, For, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { Popover } from "@opencode-ai/ui/popover"
import { Button } from "@opencode-ai/ui/button"
import { orgApi, type Organization } from "../lib/api"
import { useOrgFilter } from "../context/org-filter"
import { useAuth } from "../hooks/use-auth"
import { getLoginUrl } from "../lib/auth"

function IconBuilding2(props: { class?: string }) {
  return (
    <svg
      class={props.class}
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4M10 10h4M10 14h4M10 18h4" />
    </svg>
  )
}

function IconGlobe(props: { class?: string }) {
  return (
    <svg
      class={props.class}
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  )
}

function IconUser(props: { class?: string }) {
  return (
    <svg
      class={props.class}
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

const NAV_ITEMS: Array<{
  href: string
  label: string
  icon: "sparkles" | "models" | "console" | "server"
}> = [
  { href: "/store/skills", label: "Skills", icon: "sparkles" },
  { href: "/store/subagents", label: "Subagents", icon: "models" },
  { href: "/store/commands", label: "Commands", icon: "console" },
  { href: "/store/mcp-servers", label: "MCP Servers", icon: "server" },
]

function NavItem(props: {
  href: string
  label: string
  icon: "sparkles" | "models" | "console" | "server"
  active: boolean
  indent?: boolean
}) {
  return (
    <A
      href={props.href}
      class={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${props.indent ? "ml-3" : ""} ${
        props.active
          ? "bg-surface-base text-text-strong font-medium"
          : "text-text-weak hover:text-text-strong hover:bg-surface-base"
      }`}
    >
      <Icon name={props.icon} size="small" />
      <span class="truncate">{props.label}</span>
    </A>
  )
}

function UserMenu() {
  const { user, logout } = useAuth()

  return (
    <Popover
      placement="top"
      trigger={
        <button class="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-text-weak hover:text-text-strong hover:bg-surface-base">
          <Show when={user()?.picture} fallback={<IconUser class="h-4 w-4 shrink-0" />}>
            <img src={user()?.picture} alt="" class="h-4 w-4 rounded-full shrink-0" />
          </Show>
          <span class="truncate flex-1 text-left">
            {user()?.preferred_username || user()?.name || user()?.email || "Sign In"}
          </span>
        </button>
      }
    >
      <div class="flex flex-col gap-2 p-2 min-w-48">
        <Show
          when={user()}
          fallback={
            <a href={getLoginUrl()}>
              <Button size="small" variant="primary" class="w-full">
                Sign In
              </Button>
            </a>
          }
        >
          <div class="flex items-center gap-2 px-2 py-1">
            <Show
              when={user()?.picture}
              fallback={
                <div class="w-8 h-8 rounded-full bg-bg-muted flex items-center justify-center shrink-0">
                  <span class="text-xs text-text-weak">{user()?.name?.[0] || user()?.email?.[0] || "?"}</span>
                </div>
              }
            >
              <img src={user()?.picture} alt="" class="w-8 h-8 rounded-full shrink-0" />
            </Show>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-medium text-text-strong truncate">
                {user()?.preferred_username || user()?.name || user()?.email}
              </p>
              <Show when={user()?.email && user()?.name}>
                <p class="text-[10px] text-text-weak truncate">{user()?.email}</p>
              </Show>
            </div>
          </div>
          <div class="border-t border-border-weak-base pt-2">
            <Button
              size="small"
              variant="ghost"
              onClick={logout}
              class="w-full justify-start text-text-weak hover:text-text-strong"
            >
              <Icon name="arrow-left" size="small" />
              <span>Sign Out</span>
            </Button>
          </div>
        </Show>
      </div>
    </Popover>
  )
}

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { selectedOrg, setSelectedOrg } = useOrgFilter()
  const { user } = useAuth()
  const [orgs, setOrgs] = createSignal<Organization[]>([])
  const [orgsExpanded, setOrgsExpanded] = createSignal(true)

  createEffect(() => {
    const u = user()
    if (u?.sub) {
      orgApi
        .listMy(u.sub)
        .then((res) => setOrgs(res.organizations ?? []))
        .catch(() => {})
    } else {
      setOrgs([])
    }
  })

  function selectOrg(org: Organization | null) {
    setSelectedOrg(org)
    if (org) {
      const current = NAV_ITEMS.find((n) => location.pathname.startsWith(n.href))
      navigate(current ? current.href : "/store/skills")
    }
  }

  const activeNav = (href: string) => !selectedOrg() && location.pathname === href

  return (
    <aside class="flex w-60 flex-col border-r border-border-weak-base shrink-0 h-full">
      <div class="flex h-12 items-center px-4 gap-2 border-b border-border-weak-base shrink-0">
        <button onClick={() => navigate("/")} class="p-1 hover:bg-surface-base rounded-md transition-colors">
          <Icon name="arrow-left" size="small" />
        </button>
        <span class="font-semibold text-text-strong text-sm">Store</span>
      </div>
      <div class="flex flex-col flex-1 overflow-y-auto py-3 gap-1 px-2">
        <div class="mb-1">
          <p class="px-3 py-1 text-xs font-medium text-text-weak uppercase tracking-wider">Explore</p>
          <For each={NAV_ITEMS}>
            {(item) => <NavItem href={item.href} label={item.label} icon={item.icon} active={activeNav(item.href)} />}
          </For>
        </div>

        <Show when={user()}>
          <div class="mt-2">
            <button
              onClick={() => setOrgsExpanded((v) => !v)}
              class="w-full flex items-center justify-between px-3 py-1 text-xs font-medium text-text-weak uppercase tracking-wider hover:text-text-strong transition-colors"
            >
              <span>Organizations</span>
              <Show when={orgsExpanded()} fallback={<Icon name="chevron-right" size="small" />}>
                <Icon name="chevron-down" size="small" />
              </Show>
            </button>

            <Show when={orgsExpanded()}>
              <div class="mt-0.5 space-y-0.5">
                <button
                  onClick={() => selectOrg(null)}
                  class={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left ${
                    !selectedOrg()
                      ? "bg-surface-base text-text-strong font-medium"
                      : "text-text-weak hover:text-text-strong hover:bg-surface-base"
                  }`}
                >
                  <IconGlobe class="h-4 w-4 shrink-0" />
                  <span class="truncate">All Public</span>
                </button>

                <For each={orgs()}>
                  {(org) => (
                    <div>
                      <button
                        onClick={() => selectOrg(org)}
                        class={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left ${
                          selectedOrg()?.id === org.id
                            ? "bg-surface-base text-text-strong font-medium"
                            : "text-text-weak hover:text-text-strong hover:bg-surface-base"
                        }`}
                      >
                        <IconBuilding2 class="h-4 w-4 shrink-0" />
                        <span class="truncate flex-1">{org.displayName || org.name}</span>
                      </button>

                      <Show when={selectedOrg()?.id === org.id}>
                        <div class="mt-0.5 space-y-0.5">
                          <For each={NAV_ITEMS}>
                            {(item) => (
                              <NavItem
                                href={item.href}
                                label={item.label}
                                icon={item.icon}
                                active={location.pathname === item.href}
                                indent
                              />
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                  )}
                </For>

                <Show when={orgs().length === 0}>
                  <p class="px-3 py-2 text-xs text-text-weak">No organizations</p>
                </Show>
              </div>
            </Show>
          </div>
        </Show>
      </div>
      <div class="shrink-0 w-full pt-3 pb-4 px-4 border-t border-border-weak-base">
        <UserMenu />
      </div>
    </aside>
  )
}
