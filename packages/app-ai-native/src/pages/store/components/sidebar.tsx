import { A, useLocation, useNavigate } from "@solidjs/router"
import { createSignal, For, Show } from "solid-js"
import { Popover as Kobalte } from "@kobalte/core/popover"
import { Icon } from "@opencode-ai/ui/icon"
import type { Repository } from "../lib/api"
import { useRepoFilter } from "../context/repo-filter"
import { useLanguage } from "@/context/language"
import { navItemsForRepo } from "./sidebar-helpers"

function NavItem(props: {
  href: string
  label: string
  icon: "sparkles" | "brain" | "console" | "mcp"
  color: string
  active: boolean
}) {
  return (
    <A
      href={props.href}
      class="group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 cursor-pointer"
      activeClass="bg-surface-base text-text-strong font-medium shadow-xs-border-base/30"
      inactiveClass="text-text-weak hover:text-text-strong hover:bg-surface-base/60"
    >
      <span
        class="flex items-center justify-center size-8 rounded-lg shrink-0"
        style={{
          "background-color": `color-mix(in srgb, ${props.color} ${props.active ? "15%" : "8%"}, transparent)`,
          color: props.active ? props.color : undefined,
        }}
        classList={{
          "text-icon-weak-base group-hover:text-icon-base": !props.active,
        }}
      >
        <Icon name={props.icon} size="normal" />
      </span>
      <span class="truncate">{props.label}</span>
    </A>
  )
}

function RepoItem(props: {
  icon: "sparkles" | "store"
  label: string
  selected: boolean
  sync?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      class={`group flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-all duration-150 cursor-pointer outline-none ${
        props.selected
          ? "bg-surface-base text-text-strong font-medium"
          : "text-text-weak hover:text-text-strong hover:bg-surface-base/60"
      }`}
      onClick={props.onClick}
    >
      <Icon
        name={props.icon}
        size="small"
        class={`shrink-0 transition-colors ${props.selected ? "text-icon-strong-base" : "text-icon-weak-base group-hover:text-icon-base"}`}
      />
      <span class="flex-1 truncate text-left">{props.label}</span>
      <Show when={props.sync}>
        <span class="rounded-full bg-surface-info-base/15 px-1.5 py-px text-[10px] font-medium text-text-info-base shrink-0">
          sync
        </span>
      </Show>
      <Show when={props.selected}>
        <Icon name="check-small" size="small" class="text-icon-strong-base shrink-0" />
      </Show>
    </button>
  )
}

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { selectedRepo, setSelectedRepo, repos } = useRepoFilter()
  const [open, setOpen] = createSignal(false)
  const language = useLanguage()

  function select(repo: Repository | null) {
    setSelectedRepo(repo)
    navigate("/store")
    setOpen(false)
  }

  const name = () => selectedRepo()?.displayName || selectedRepo()?.name || language.t("store.allPublic")

  const itemDetailNav = () => {
    if (!location.pathname.startsWith("/store/items/")) return undefined
    const type = new URLSearchParams(location.search).get("type")
    if (type === "skill") return "/store/skills"
    if (type === "subagent") return "/store/subagents"
    if (type === "command") return "/store/commands"
    if (type === "mcp") return "/store/mcp-servers"
    return undefined
  }

  const active = (href: string) => {
    if (location.pathname === href) return true
    if (location.pathname.startsWith(`${href}/`)) return true
    return itemDetailNav() === href
  }

  return (
    <aside class="flex w-72 flex-col border-r border-border-weak-base bg-surface-base shrink-0 h-full">
      {/* Source selector */}
      <div class="shrink-0 px-3 py-3 border-b border-border-weak-base">
        <Kobalte open={open()} onOpenChange={setOpen} placement="bottom-start" gutter={6} modal={false}>
          <Kobalte.Trigger class="group flex items-center gap-2.5 w-full min-w-0 rounded-lg px-2.5 py-2 hover:bg-surface-base-hover transition-colors cursor-pointer">
            <Icon name="store" size="normal" class="text-icon-strong-base shrink-0" />
            <div class="flex flex-col min-w-0 flex-1">
              <span class="text-sm font-semibold text-text-strong truncate">{name()}</span>
              <span class="text-[11px] text-text-weak">{language.t("store.sidebar.title")}</span>
            </div>
            <Icon
              name="chevron-down"
              size="small"
              class={`shrink-0 transition-all duration-150 ${open() ? "text-icon-base rotate-180" : "text-icon-weak-base group-hover:text-icon-base"}`}
            />
          </Kobalte.Trigger>
          <Kobalte.Portal>
            <Kobalte.Content
              class="w-[var(--kb-popper-anchor-width)] rounded-xl border border-border-weak-base bg-background-base shadow-lg p-1.5 z-50 outline-none"
              style={{
                "transform-origin": "var(--kb-popover-content-transform-origin)",
              }}
            >
              <Kobalte.Title class="sr-only">{language.t("store.sidebar.source")}</Kobalte.Title>
              <p class="text-[11px] text-text-weak uppercase tracking-wider px-3 pt-1 pb-1.5">
                {language.t("store.sidebar.source")}
              </p>
              <div class="flex flex-col gap-0.5">
                <RepoItem
                  icon="store"
                  label={language.t("store.allPublic")}
                  selected={!selectedRepo()}
                  onClick={() => select(null)}
                />
                <Show when={repos().length > 0}>
                  <div class="mx-2 my-1 border-t border-border-weak-base" />
                  <For each={repos()}>
                    {(repo) => (
                      <RepoItem
                        icon="store"
                        label={repo.displayName || repo.name}
                        selected={selectedRepo()?.id === repo.id}
                        sync={repo.repoType === "sync"}
                        onClick={() => select(repo)}
                      />
                    )}
                  </For>
                </Show>
              </div>
            </Kobalte.Content>
          </Kobalte.Portal>
        </Kobalte>
      </div>

      {/* Nav items */}
      <nav class="flex flex-col flex-1 overflow-y-auto px-2 py-3 gap-1">
        <For each={navItemsForRepo(selectedRepo())}>
          {(item) => (
            <NavItem
              href={item.href}
              label={language.t(item.label)}
              icon={item.icon}
              color={item.color}
              active={active(item.href)}
            />
          )}
        </For>
      </nav>
    </aside>
  )
}
