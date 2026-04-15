import { A, useLocation, useSearchParams } from "@solidjs/router"
import { createResource, For, Show } from "solid-js"
import { Icon, type IconProps } from "@opencode-ai/ui/icon"
import { LocalIcon, type LocalIconName } from "@/components/local-icon"
import { useLanguage } from "@/context/language"
import { appPath } from "@/lib/router"
import { itemApi } from "../lib/api"

const BROWSE_NAV = [
  { href: "/store", labelKey: "store.sidebar.nav.home", localIcon: "home" as LocalIconName, exact: true },
  { href: "/store?type=skill", labelKey: "store.sidebar.nav.skills", icon: "sparkles" as IconProps["name"], statKey: "skill" },
  { href: "/store?type=subagent", labelKey: "store.sidebar.nav.subagents", icon: "brain" as IconProps["name"], statKey: "subagent" },
  { href: "/store?type=command", labelKey: "store.sidebar.nav.commands", icon: "console" as IconProps["name"], statKey: "command" },
  { href: "/store?type=mcp", labelKey: "store.sidebar.nav.mcpServers", icon: "mcp" as IconProps["name"], statKey: "mcp" },
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
    <aside class="flex w-[var(--native-sidebar-width)] shrink-0 flex-col overflow-hidden bg-[linear-gradient(180deg,color-mix(in_oklab,var(--native-panel)_90%,var(--native-bg-subtle)),var(--native-panel))]">
      <div class="px-4 pt-4 pb-3">
        <div class="flex items-center gap-2">
          <span class="font-[var(--native-font-display)] text-[1rem] font-semibold tracking-[-0.035em] text-[var(--native-foreground)]">{language.t("store.sidebar.storeName")}</span>
        </div>
      </div>

      <nav class="custom-scrollbar flex flex-1 flex-col gap-5 overflow-y-auto px-2 py-2.5">
        <div>
          {/* <div class="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--native-dim)]">{language.t("store.sidebar.browse")}</div> */}
          <div class="flex flex-col gap-px">
            <For each={BROWSE_NAV}>
              {(item) => {
                const active = () => isActive(item.href, "exact" in item ? item.exact : false)
                return (
                  <A
                    href={item.href}
                    class={[
                      "relative flex w-full items-center gap-2.5 rounded-[var(--native-radius-md)] px-2.5 py-[0.5rem] text-left text-[0.8125rem] transition-all duration-150",
                      active()
                        ? "bg-[color:color-mix(in_oklab,var(--native-primary)_8%,var(--native-panel))] text-[var(--native-foreground)] shadow-[var(--native-shadow-sm)]"
                        : "bg-transparent text-[var(--native-muted)] hover:bg-[color:color-mix(in_oklab,var(--native-surface)_62%,transparent)] hover:text-[var(--native-foreground)]",
                    ].join(" ")}
                  >
                    <span
                      class="flex h-7 w-7 shrink-0 items-center justify-center transition-all [&_[data-component=icon]]:h-[15px] [&_[data-component=icon]]:w-[15px] [&_[data-slot=icon-svg]]:h-[15px] [&_[data-slot=icon-svg]]:w-[15px]"
                      style={{ color: active() ? "var(--native-foreground)" : "var(--native-muted)" }}
                    >
                      {"localIcon" in item
                        ? <LocalIcon name={item.localIcon} size="small" />
                        : <Icon name={item.icon} size="small" />}
                    </span>
                    <span class="font-medium">{language.t(item.labelKey)}</span>
                    <Show when={"statKey" in item && stats()?.[item.statKey!]}>
                      {(count) => <span class="ml-auto rounded-[var(--native-radius-full)] bg-[color:color-mix(in_oklab,var(--native-surface)_64%,var(--native-panel))] px-[0.5rem] text-[11px] font-medium leading-[1.65] text-[var(--native-muted)]">{count()}</span>}
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
