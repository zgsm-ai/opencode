import { A, useLocation } from "@solidjs/router"
import { createResource, For, Show } from "solid-js"
import { Icon, type IconProps } from "@opencode-ai/ui/icon"
import { LocalIcon, type LocalIconName } from "@/components/local-icon"
import { useLanguage } from "@/context/language"
import { appPath } from "@/lib/router"
import { deviceManagementService } from "./lib/device-management-service"
import { notificationChannelService } from "./lib/notification-channel-service"
import "./console-sidebar.css"

const NAV = [
  { href: "/console", labelKey: "store.dashboard.nav.repositories", localIcon: "repo" as LocalIconName, color: "#2E6CC4", exact: true },
  { href: "/console/capabilities", labelKey: "store.dashboard.nav.capabilities", icon: "sparkles" as IconProps["name"], color: "#F59E0B" },
  { href: "/console/devices", labelKey: "store.dashboard.nav.devices", icon: "server" as IconProps["name"], color: "#22c55e", badge: "devices" as const },
  { href: "/console/notifications", labelKey: "store.dashboard.nav.notifications", localIcon: "bell" as LocalIconName, color: "#a855f7", badge: "channels" as const },
] as const

export default function ConsoleSidebar() {
  const location = useLocation()
  const language = useLanguage()
  const path = () => appPath(location.pathname)

  const [devices] = createResource(async () => deviceManagementService.list())
  const [channels] = createResource(async () => notificationChannelService.listWecom())

  const counts = () => ({
    devices: devices()?.length ?? 0,
    channels: channels()?.length ?? 0,
  })

  const active = (href: string, exact?: boolean) => {
    const p = path()
    if (exact) return p === href || p === href + "/"
    return p === href || p.startsWith(href + "/")
  }

  return (
    <aside class="console-sidebar">
      <div class="console-sidebar-head">
        <div class="console-sidebar-brand">
          <span class="console-sidebar-brand-text">{language.t("store.dashboard.title")}</span>
        </div>
      </div>

      <nav class="console-sidebar-nav">
        <div>
          <div class="console-sidebar-nav-group">
            <For each={NAV}>
              {(item) => {
                const on = () => active(item.href, "exact" in item ? item.exact : false)
                return (
                  <A
                    href={item.href}
                    class={`console-sidebar-nav-item ${on() ? "console-sidebar-nav-item-active" : ""}`}
                    style={{ "--_nav-color": item.color }}
                  >
                    <span class="console-sidebar-nav-icon">
                      {"localIcon" in item
                        ? <LocalIcon name={item.localIcon} size="small" />
                        : <Icon name={item.icon} size="small" />}
                    </span>
                    {language.t(item.labelKey)}
                    <Show when={"badge" in item && !devices.loading && !channels.loading}>
                      <span class="console-sidebar-nav-badge">
                        {counts()[(item as any).badge]}
                      </span>
                    </Show>
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
