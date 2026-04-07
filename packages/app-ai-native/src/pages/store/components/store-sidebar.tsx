import { A, useLocation, useSearchParams } from "@solidjs/router"
import { createResource, For, Show } from "solid-js"
import { Icon, type IconProps } from "@opencode-ai/ui/icon"
import { LocalIcon, type LocalIconName } from "@/components/local-icon"
import { useLanguage } from "@/context/language"
import { appPath } from "@/lib/router"
import { itemApi } from "../lib/api"
import "./store-sidebar.css"

const BROWSE_NAV = [
  { href: "/store", labelKey: "store.sidebar.nav.home", localIcon: "home" as LocalIconName, color: "#2E6CC4", exact: true },
  { href: "/store?type=skill", labelKey: "store.sidebar.nav.skills", icon: "sparkles" as IconProps["name"], color: "#F59E0B", statKey: "skill" },
  { href: "/store?type=subagent", labelKey: "store.sidebar.nav.subagents", icon: "brain" as IconProps["name"], color: "#2E6CC4", statKey: "subagent" },
  { href: "/store?type=command", labelKey: "store.sidebar.nav.commands", icon: "console" as IconProps["name"], color: "#10B981", statKey: "command" },
  { href: "/store?type=mcp", labelKey: "store.sidebar.nav.mcpServers", icon: "mcp" as IconProps["name"], color: "#8B5CF6", statKey: "mcp" },
] as const

const DASHBOARD_NAV = [
  { href: "/store/dashboard/repositories", labelKey: "store.dashboard.nav.repositories", icon: "folder" as IconProps["name"], color: "#3b82f6" },
  { href: "/store/dashboard/capabilities", labelKey: "store.dashboard.nav.capabilities", icon: "sparkles" as IconProps["name"], color: "#eab308" },
  { href: "/store/dashboard/devices", labelKey: "store.dashboard.nav.devices", icon: "server" as IconProps["name"], color: "#22c55e" },
  { href: "/store/dashboard/notifications", labelKey: "store.dashboard.nav.notifications", localIcon: "bell" as LocalIconName, color: "#a855f7" },
] as const

type StoreType = "skill" | "subagent" | "command" | "mcp"

export default function StoreSidebar() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const language = useLanguage()

  const appPathname = () => appPath(location.pathname)

  const [stats] = createResource(async () =>
    Object.fromEntries(
      await Promise.all(
        (["skill", "subagent", "command", "mcp"] as StoreType[]).map(
          async (type) => [type, (await itemApi.list({ type, page: 1, pageSize: 1 })).total] as const,
        ),
      ),
    ),
  )

  const isActive = (href: string, exact?: boolean) => {
    const path = appPathname()
    const [item] = href.split("?")
    const isStorePath = path === "/store" || path === "/store/"

    if (exact) {
      return isStorePath && !searchParams.type
    }

    const match = href.match(/[?&]type=([^&]+)/)
    if (match) {
      return isStorePath && searchParams.type === match[1]
    }

    if (!item) return false
    return path === item || path.startsWith(item + "/")
  }

  return (
    <aside class="store-sidebar">
      <div class="store-sidebar-head">
        <div class="store-sidebar-brand">
          <span class="store-sidebar-brand-text">{language.t("store.sidebar.storeName")}</span>
        </div>
      </div>

      <nav class="store-sidebar-nav">
        <div>
          <div class="store-sidebar-nav-label">{language.t("store.sidebar.browse")}</div>
          <div class="store-sidebar-nav-group">
            <For each={BROWSE_NAV}>
              {(item) => {
                const active = () => isActive(item.href, "exact" in item ? item.exact : false)
                return (
                  <A
                    href={item.href}
                    class={`store-sidebar-nav-item ${active() ? "store-sidebar-nav-item-active" : ""}`}
                    style={{ "--_nav-color": item.color }}
                  >
                    <span class="store-sidebar-nav-icon">
                      {"localIcon" in item
                        ? <LocalIcon name={item.localIcon} size="small" />
                        : <Icon name={item.icon} size="small" />}
                    </span>
                    {language.t(item.labelKey)}
                    <Show when={"statKey" in item && stats()?.[item.statKey!]}>
                      {(count) => <span class="store-sidebar-nav-badge">{count()}</span>}
                    </Show>
                  </A>
                )
              }}
            </For>
          </div>
        </div>

        <div>
          <div class="store-sidebar-nav-label">{language.t("store.sidebar.dashboard")}</div>
          <div class="store-sidebar-nav-group">
            <For each={DASHBOARD_NAV}>
              {(item) => {
                const active = () => isActive(item.href)
                return (
                  <A
                    href={item.href}
                    class={`store-sidebar-nav-item ${active() ? "store-sidebar-nav-item-active" : ""}`}
                    style={{ "--_nav-color": item.color }}
                  >
                    <span class="store-sidebar-nav-icon">
                      {"localIcon" in item
                        ? <LocalIcon name={item.localIcon} size="small" />
                        : <Icon name={item.icon} size="small" />}
                    </span>
                    {language.t(item.labelKey)}
                  </A>
                )
              }}
            </For>
          </div>
        </div>
      </nav>
    </aside>
  )
}
