import { A, useLocation } from "@solidjs/router"
import { createResource, createSignal, For, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { useLanguage } from "@/context/language"
import { appPath } from "@/lib/router"
import { listSpaces, getSpaceSlug, setSpaceSlug, type Space } from "@/services/collaboration"
import { ALL_COLLABORATION_MENUS } from "./lib/menu-registry"

export default function CollaborationSidebar() {
  const location = useLocation()
  const language = useLanguage()
  const path = () => appPath(location.pathname)

  const [spaces] = createResource(async () => listSpaces())
  const [currentSlug, setCurrentSlug] = createSignal(getSpaceSlug())

  const currentSpace = () => {
    const slug = currentSlug()
    return spaces()?.find((s: Space) => s.slug === slug)
  }

  const selectSpace = (slug: string) => {
    setSpaceSlug(slug)
    setCurrentSlug(slug)
    window.location.reload()
  }

  const active = (href: string, exact?: boolean) => {
    const p = path()
    if (exact) return p === href || p === href + "/"
    return p === href || p.startsWith(href + "/")
  }

  return (
    <aside class="flex w-[var(--native-sidebar-width)] shrink-0 flex-col overflow-hidden bg-[linear-gradient(180deg,color-mix(in_oklab,var(--native-panel)_90%,var(--native-bg-subtle)),var(--native-panel))]">
      <div class="px-4 pt-4 pb-3">
        <div class="flex items-center gap-2">
          <span class="font-[var(--native-font-display)] text-[1rem] font-semibold tracking-[-0.035em] text-[var(--native-foreground)]">
            {language.t("collaboration.title")}
          </span>
        </div>

        <Show when={spaces() && spaces()!.length > 0}>
          <DropdownMenu placement="bottom-start">
            <DropdownMenu.Trigger class="mt-2 flex w-full items-center gap-2 rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_20%,transparent)] bg-[var(--native-panel)] px-2.5 py-1.5 text-left text-[0.8125rem] text-[var(--native-foreground)] hover:bg-[var(--native-surface)] transition-colors">
              <span class="flex-1 truncate">
                {currentSpace()?.name || language.t("collaboration.selectSpace")}
              </span>
              <Icon name="chevron-down" size="small" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content class="w-[200px]">
                <For each={spaces()}>
                  {(space: Space) => (
                    <DropdownMenu.Item onSelect={() => selectSpace(space.slug)}>
                      <DropdownMenu.ItemLabel>{space.name}</DropdownMenu.ItemLabel>
                    </DropdownMenu.Item>
                  )}
                </For>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu>
        </Show>
      </div>

      <nav class="thin-scrollbar flex flex-1 flex-col gap-5 overflow-y-auto px-2 py-2.5">
        <div>
          <div class="flex flex-col gap-px">
            <For each={ALL_COLLABORATION_MENUS}>
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
                        on() ? "text-[var(--native-foreground)]" : "text-[var(--native-muted)]",
                      ].join(" ")}
                    >
                      <Icon name={item.icon!} size="small" />
                    </span>
                    <span class="font-medium">{language.t(item.labelKey)}</span>
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
