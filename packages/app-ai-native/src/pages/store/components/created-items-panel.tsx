import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { For, Show, createMemo } from "solid-js"
import { useLanguage } from "@/context/language"
import type { CapabilityItem } from "../lib/api"
import ItemCard from "./item-card"

type CreatedItemsPanelProps = {
  items: CapabilityItem[]
  loading?: boolean
  onFilterChange?: (type: string) => void
  selectedType?: string
}

const TYPE_ORDER = ["skill", "mcp", "subagent", "command"] as const

const TYPE_LABEL: Record<string, string> = {
  skill: "store.sidebar.nav.skills",
  mcp: "store.sidebar.nav.mcpServers",
  subagent: "store.sidebar.nav.subagents",
  command: "store.sidebar.nav.commands",
}

const TYPE_ICON: Record<string, "sparkles" | "server" | "models" | "console"> = {
  skill: "sparkles",
  mcp: "server",
  subagent: "models",
  command: "console",
}

export function CreatedItemsPanel(props: CreatedItemsPanelProps) {
  const language = useLanguage()
  const counts = createMemo(() => {
    const map = new Map<string, number>()
    for (const item of props.items) map.set(item.itemType, (map.get(item.itemType) || 0) + 1)
    return map
  })

  const availableTypes = createMemo(() => TYPE_ORDER.filter((type) => (counts().get(type) || 0) > 0))

  const visibleTypes = createMemo(() => {
    if (props.selectedType && props.selectedType !== "all")
      return availableTypes().filter((type) => type === props.selectedType)
    return availableTypes()
  })

  const itemsByType = (type: string) => props.items.filter((item) => item.itemType === type)

  return (
    <section class="mt-10">
      <div class="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 class="text-lg font-semibold text-text-strong">{language.t("store.createdItems.title")}</h2>
          <p class="mt-1 text-sm text-text-weak">{language.t("store.createdItems.description")}</p>
        </div>
        <div class="rounded-xl border border-border-weak-base bg-surface-raised-base px-4 py-3 text-right">
          <div class="text-12-medium text-text-weak">{language.t("store.createdItems.total")}</div>
          <div class="mt-1 text-2xl font-semibold text-text-strong">{props.items.length}</div>
        </div>
      </div>

      <Show when={props.items.length > 0}>
        <div class="mb-4 flex flex-wrap gap-2">
          <Button
            size="small"
            variant={props.selectedType === "all" ? "primary" : "ghost"}
            onClick={() => props.onFilterChange?.("all")}
          >
            {language.t("store.console.filters.all")}
          </Button>
          <For each={availableTypes()}>
            {(type) => (
              <Button
                size="small"
                variant={props.selectedType === type ? "primary" : "ghost"}
                onClick={() => props.onFilterChange?.(type)}
              >
                {language.t(TYPE_LABEL[type])} ({counts().get(type) || 0})
              </Button>
            )}
          </For>
        </div>
      </Show>

      <div class="rounded-xl border border-border-weak-base bg-surface-raised-base">
        <Show
          when={!props.loading}
          fallback={<div class="px-4 py-8 text-sm text-text-weak">{language.t("store.createdItems.loading")}</div>}
        >
          <Show
            when={props.items.length > 0}
            fallback={<div class="px-4 py-8 text-sm text-text-weak">{language.t("store.createdItems.empty")}</div>}
          >
            <div class="divide-y divide-border-weak-base">
              <For each={visibleTypes()}>
                {(type) => (
                  <div class="px-4 py-4">
                    <div class="mb-4 flex items-center gap-2">
                      <Icon name={TYPE_ICON[type]} class="size-4 text-text-strong" />
                      <h3 class="text-14-medium text-text-strong">{language.t(TYPE_LABEL[type])}</h3>
                      <span class="text-12-regular text-text-weak">{itemsByType(type).length}</span>
                    </div>
                    <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <For each={itemsByType(type)}>{(item) => <ItemCard item={item} />}</For>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </section>
  )
}
