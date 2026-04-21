import { A, useLocation } from "@solidjs/router"
import { createResource, For, Show } from "solid-js"
import { Icon, type IconProps } from "@opencode-ai/ui/icon"
import { LocalIcon, type LocalIconName } from "@/components/local-icon"
import { useLanguage } from "@/context/language"
import { appPath } from "@/lib/router"
import { deviceManagementService } from "./lib/device-management-service"
import { notificationChannelService } from "./lib/notification-channel-service"

type Count = "devices" | "channels"
type Nav = {
  href: string
  labelKey: string
  icon?: IconProps["name"]
  localIcon?: LocalIconName
  badge?: Count
  exact?: boolean
}

const NAV: readonly Nav[] = [
  // { href: "/console", labelKey: "store.dashboard.nav.repositories", localIcon: "repo" as LocalIconName, exact: true },
  { href: "/console/capabilities", labelKey: "store.dashboard.nav.capabilities", icon: "sparkles" as IconProps["name"] },
  { href: "/console/devices", labelKey: "store.dashboard.nav.devices", icon: "server" as IconProps["name"], badge: "devices" as Count },
  // { href: "/console/notifications", labelKey: "store.dashboard.nav.notifications", localIcon: "bell" as LocalIconName, badge: "channels" as Count },
] as const

export default function ConsoleSidebar() {
  const location = useLocation()
  const language = useLanguage()
  const path = () => appPath(location.pathname)

  const [devices] = createResource(async () => deviceManagementService.list())
  const [channels] = createResource(async () => notificationChannelService.listWecom())

  const total = (kind: Count) =>
    kind === "devices"
      ? devices()?.filter((item) => item.status === "online").length ?? 0
      : channels()?.filter((item) => item.enabled).length ?? 0

  const done = (kind: Count) => (kind === "devices" ? !devices.loading : !channels.loading)

  const active = (href: string, exact?: boolean) => {
    const p = path()
    if (exact) return p === href || p === href + "/"
    return p === href || p.startsWith(href + "/")
  }

  return (
    <aside class="flex w-[var(--native-sidebar-width)] shrink-0 flex-col overflow-hidden bg-[linear-gradient(180deg,color-mix(in_oklab,var(--native-panel)_90%,var(--native-bg-subtle)),var(--native-panel))]">
      <div class="px-4 pt-4 pb-3">
        <div class="flex items-center gap-2">
          <span class="font-[var(--native-font-display)] text-[1rem] font-semibold tracking-[-0.035em] text-[var(--native-foreground)]">{language.t("store.dashboard.title")}</span>
        </div>
      </div>

      <nav class="thin-scrollbar flex flex-1 flex-col gap-5 overflow-y-auto px-2 py-2.5">
        <div>
          <div class="flex flex-col gap-px">
            <For each={NAV}>
              {(item) => {
                const on = () => active(item.href, item.exact)
                return (
                  <A
                    href={item.href}
                    class={[
                      "flex w-full items-center gap-2.5 rounded-[var(--native-radius-md)] px-2.5 py-[0.5rem] text-left text-[0.8125rem] transition-all duration-150",
                      on()
                        ? "bg-[color:color-mix(in_oklab,var(--native-primary)_8%,var(--native-panel))] text-[var(--native-foreground)] shadow-[var(--native-shadow-sm)]"
                        : "bg-transparent text-[var(--native-muted)] hover:bg-[color:color-mix(in_oklab,var(--native-surface)_62%,transparent)] hover:text-[var(--native-foreground)]",
                    ].join(" ")}
                  >
                    <span
                      class={[
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--native-radius-sm)] transition-all [&_[data-slot=icon-svg]]:h-[15px] [&_[data-slot=icon-svg]]:w-[15px] [&_[data-component=icon]]:h-[15px] [&_[data-component=icon]]:w-[15px]",
                        on()
                          ? "text-[var(--native-foreground)]"
                          : "text-[var(--native-muted)]",
                      ].join(" ")}
                    >
                      {item.localIcon
                        ? <LocalIcon name={item.localIcon} size="small" />
                        : <Icon name={item.icon!} size="small" />}
                    </span>
                    <span class="font-medium">{language.t(item.labelKey)}</span>
                    <Show when={item.badge}>
                      {(badge) => (
                        <Show when={done(badge())}>
                          <span class="ml-auto rounded-[var(--native-radius-full)] bg-[color:color-mix(in_oklab,var(--native-surface)_64%,var(--native-panel))] px-[0.5rem] text-[11px] font-medium leading-[1.65] text-[var(--native-muted)]">
                            {total(badge())}
                          </span>
                        </Show>
                      )}
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
