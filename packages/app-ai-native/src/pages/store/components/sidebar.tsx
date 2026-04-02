import { A, useLocation, useNavigate } from "@solidjs/router"
import { createSignal, For, Show } from "solid-js"
import { Popover as Kobalte } from "@kobalte/core/popover"
import type { Repository } from "../lib/api"
import { useRepoFilter } from "../context/repo-filter"
import { useLanguage } from "@/context/language"
import { navItemsForRepo } from "./sidebar-helpers"
import { stitchTheme } from "@/theme/stitch-theme"
import { Icon } from "@opencode-ai/ui/icon"

const c = stitchTheme.colors

/** Small trailing badge per nav type (matching design HTML) */
const TYPE_BADGE: Record<string, { text: string; cls: string }> = {
  sparkles: {
    text: "✦",
    cls: "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
  },
  brain: {
    text: "🤖",
    cls: "text-[10px] grayscale",
  },
  console: {
    text: ">",
    cls: "text-[10px] opacity-60 font-mono",
  },
  mcp: {
    text: "🖥",
    cls: "text-[10px] grayscale",
  },
}

function NavItem(props: {
  href: string
  label: string
  icon: "sparkles" | "brain" | "console" | "mcp"
  color: string
  active: boolean
}) {
  const badge = () => TYPE_BADGE[props.icon]

  return (
    <A
      href={props.href}
      class={`store-nav-item ${props.active ? "store-nav-item-active" : ""}`}
    >
      <div class="flex items-center gap-3">
        <Icon name={props.icon} />
        <span class="truncate">{props.label}</span>
      </div>
      <Show when={badge()}>
        {(b) => (
          <span
            class={b().cls}
            style={
              props.icon === "sparkles"
                ? {
                    "background-color": c.secondaryFixedDim,
                    color: c.onSecondaryFixedVariant,
                  }
                : undefined
            }
          >
            {b().text}
          </span>
        )}
      </Show>
    </A>
  )
}

function RepoItem(props: {
  label: string
  selected: boolean
  sync?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      class="group flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-all duration-150 cursor-pointer outline-none"
      style={{
        "background-color": props.selected ? c.surfaceContainer : undefined,
        color: props.selected ? c.onSurface : c.onSurfaceVariant,
        "font-weight": props.selected ? "600" : "400",
      }}
      onClick={props.onClick}
    >
      <Icon name="store" />
      <span class="flex-1 truncate text-left">{props.label}</span>
      <Show when={props.sync}>
        <span
          class="rounded-full px-1.5 py-px text-[10px] font-medium shrink-0"
          style={{
            "background-color": `color-mix(in srgb, ${c.primaryT40} 15%, transparent)`,
            color: c.primaryT40,
          }}
        >
          sync
        </span>
      </Show>
      <Show when={props.selected}>
        <span style={{ color: c.primaryContainer }}>
          <Icon name="check" />
        </span>
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

  const name = () =>
    selectedRepo()?.displayName || selectedRepo()?.name || language.t("store.allPublic")

  const active = (href: string) => {
    if (location.pathname === href) return true
    if (location.pathname.startsWith(`${href}/`)) return true
    return false
  }

  const isHome = () => location.pathname === "/store"

  return (
    <aside class="store-sidebar flex w-64 flex-col shrink-0 h-full">
      {/* Brand */}
      <div class="flex h-14 items-center px-6">
        <span class="store-sidebar-brand">OpenCode Store</span>
      </div>

      {/* Navigation */}
      <nav class="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {/* Home / Extensions */}
        <A
          href="/store"
          class={`store-nav-item ${isHome() ? "store-nav-item-active" : ""}`}
        >
          <div class="flex items-center gap-3">
            <Icon name="store" />
            <span class="truncate">{language.t("store.home.title") || "Extensions"}</span>
          </div>
        </A>

        {/* Type nav items */}
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

      {/* Repository selector */}
      <div
        class="p-4"
        style={{
          "border-top": `1px solid color-mix(in srgb, ${c.outlineVariant} 10%, transparent)`,
        }}
      >
        <Kobalte
          open={open()}
          onOpenChange={setOpen}
          placement="top-start"
          gutter={6}
          modal={false}
        >
          <Kobalte.Trigger class="store-repo-selector flex items-center justify-between w-full">
            <div class="flex flex-col">
              <span
                class="text-[10px] uppercase tracking-widest font-bold"
                style={{ color: c.onSurfaceVariant }}
              >
                {language.t("store.sidebar.source") || "Repository"}
              </span>
              <span class="text-xs font-semibold" style={{ color: c.onSurface }}>
                {name()}
              </span>
            </div>
            <span style={{ color: c.onSurfaceVariant }}>
              <Icon name="chevron-grabber-vertical" />
            </span>
          </Kobalte.Trigger>
          <Kobalte.Portal>
            <Kobalte.Content
              class="w-[var(--kb-popper-anchor-width)] rounded-xl border p-1.5 z-50 outline-none"
              style={{
                "background-color": c.surfaceContainerLowest,
                "border-color": `color-mix(in srgb, ${c.outlineVariant} 20%, transparent)`,
                "box-shadow": stitchTheme.shadows.ghost,
                "transform-origin": "var(--kb-popover-content-transform-origin)",
              }}
            >
              <Kobalte.Title class="sr-only">
                {language.t("store.sidebar.source")}
              </Kobalte.Title>
              <p
                class="text-[11px] uppercase tracking-wider px-3 pt-1 pb-1.5"
                style={{ color: c.onSurfaceVariant }}
              >
                {language.t("store.sidebar.source")}
              </p>
              <div class="flex flex-col gap-0.5">
                <RepoItem
                  label={language.t("store.allPublic")}
                  selected={!selectedRepo()}
                  onClick={() => select(null)}
                />
                <Show when={repos().length > 0}>
                  <div
                    class="mx-2 my-1"
                    style={{
                      "border-top": `1px solid color-mix(in srgb, ${c.outlineVariant} 20%, transparent)`,
                    }}
                  />
                  <For each={repos()}>
                    {(repo) => (
                      <RepoItem
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
    </aside>
  )
}
