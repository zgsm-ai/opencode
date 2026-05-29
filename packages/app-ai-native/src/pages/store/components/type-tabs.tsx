// src/pages/store/components/type-tabs.tsx
import { createResource, For } from "solid-js"
import { A } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { Icon } from "@opencode-ai/ui/icon"
import { itemApi } from "../lib/api"

const TYPES = [
  { value: "skill", labelKey: "store.browse.type.skills", icon: "sparkles", color: "#F59E0B" },
  { value: "subagent", labelKey: "store.browse.type.subagents", icon: "brain", color: "#3B82F6" },
  { value: "command", labelKey: "store.browse.type.commands", icon: "console", color: "#10B981" },
  { value: "mcp", labelKey: "store.browse.type.mcp", icon: "mcp", color: "#8B5CF6" },
  { value: "plugin", labelKey: "store.browse.type.plugins", icon: "configuration", color: "#EC4899" },
] as const

export default function TypeTabs() {
  const language = useLanguage()

  const [stats] = createResource(async () => {
    const counts = await Promise.all(
      TYPES.map(async (type) => {
        const result = await itemApi.list({ type: type.value, page: 1, pageSize: 1 })
        return [type.value, result.total] as const
      })
    )
    return Object.fromEntries(counts)
  })

  return (
    <div class="flex flex-wrap justify-center gap-3">
      <For each={TYPES}>
        {(type) => (
          <A
            href={`/store/search?type=${type.value}`}
            class="flex items-center gap-2 rounded-lg border border-[var(--native-border)] bg-[var(--native-panel)] px-4 py-2 text-sm font-medium text-[var(--native-foreground)] transition-all hover:border-[color:var(--type-color)] hover:shadow-md"
            style={{ "--type-color": type.color }}
          >
            <Icon name={type.icon as any} class="size-4" style={{ color: type.color }} />
            <span>{language.t(type.labelKey)}</span>
            {stats()?.[type.value] !== undefined && (
              <span class="rounded-full bg-[var(--native-surface)] px-2 py-0.5 text-xs text-[var(--native-muted)]">
                {stats()![type.value].toLocaleString()}
              </span>
            )}
          </A>
        )}
      </For>
    </div>
  )
}
