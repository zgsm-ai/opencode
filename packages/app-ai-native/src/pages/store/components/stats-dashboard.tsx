import { createResource, For } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { Icon, type IconProps } from "@opencode-ai/ui/icon"
import { itemApi } from "../lib/api"

const STORE_TYPES = [
  { value: "", labelKey: "store.browse.type.all", icon: "dot-grid" as IconProps["name"], color: "#64748B" },
  { value: "skill", labelKey: "store.browse.type.skills", icon: "sparkles" as IconProps["name"], color: "#F59E0B" },
  { value: "subagent", labelKey: "store.browse.type.subagents", icon: "brain" as IconProps["name"], color: "#3B82F6" },
  { value: "command", labelKey: "store.browse.type.commands", icon: "console" as IconProps["name"], color: "#10B981" },
  { value: "mcp", labelKey: "store.browse.type.mcp", icon: "mcp" as IconProps["name"], color: "#8B5CF6" },
  { value: "plugin", labelKey: "store.browse.type.plugins", icon: "configuration" as IconProps["name"], color: "#EC4899" },
] as const

function formatCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export default function StatsDashboard() {
  const language = useLanguage()
  const navigate = useNavigate()

  const [stats] = createResource(async () => {
    const counts = await Promise.all(
      STORE_TYPES.map(async (type) => {
        const result = await itemApi.list({
          type: type.value || undefined,
          page: 1,
          pageSize: 1,
        })
        return { value: type.value, total: result.total }
      })
    )
    return Object.fromEntries(counts.map((c) => [c.value, c.total]))
  })

  const handleClick = (typeValue: string) => {
    if (typeValue) {
      navigate(`/store/search?type=${typeValue}`)
    } else {
      navigate("/store/search")
    }
  }

  return (
    <div class="grid grid-cols-2 gap-3 px-6 py-4 sm:grid-cols-3 lg:grid-cols-6">
      <For each={STORE_TYPES}>
        {(type) => {
          const total = () => stats()?.[type.value] ?? 0
          return (
            <button
              type="button"
              onClick={() => handleClick(type.value)}
              class="group flex flex-col items-center gap-2 rounded-xl border border-[var(--native-border)] bg-[var(--native-panel)] p-4 text-center transition-all hover:-translate-y-0.5 hover:border-[color:var(--type-color)] hover:shadow-md"
              style={{ "--type-color": type.color }}
            >
              <div
                class="flex size-10 items-center justify-center rounded-lg"
                style={{
                  "background-color": `color-mix(in srgb, ${type.color} 12%, var(--native-panel))`,
                  color: type.color,
                }}
              >
                <Icon name={type.icon} class="size-5" />
              </div>
              <div class="text-lg font-bold text-[var(--native-foreground)]">
                {formatCompact(total())}
              </div>
              <div class="text-xs font-medium text-[var(--native-muted)]">
                {language.t(type.labelKey)}
              </div>
            </button>
          )
        }}
      </For>
    </div>
  )
}
