// src/pages/store/components/capability-card.tsx
import { Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { LocalIcon } from "@/components/local-icon"
import { useLanguage } from "@/context/language"
import type { CapabilityItem } from "../lib/api"
import SecurityTag from "./security-tag"

const TYPE_META: Record<string, { icon: string; color: string }> = {
  skill: { icon: "sparkles", color: "#F59E0B" },
  subagent: { icon: "brain", color: "#3B82F6" },
  command: { icon: "console", color: "#10B981" },
  mcp: { icon: "mcp", color: "#8B5CF6" },
  plugin: { icon: "configuration", color: "#EC4899" },
}

function formatCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export default function CapabilityCard(props: {
  item: CapabilityItem
  onClick?: () => void
}) {
  const language = useLanguage()
  const meta = () => TYPE_META[props.item.itemType] ?? TYPE_META.skill
  const description = () => {
    const desc = props.item.descriptions?.[language.locale()] ?? props.item.description
    return desc || ""
  }

  return (
    <button
      type="button"
      onClick={props.onClick}
      class="group flex h-60 w-full flex-col rounded-xl border border-[var(--native-border)] bg-[var(--native-panel)] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[color:var(--type-color)] hover:shadow-lg"
      style={{ "--type-color": meta().color }}
    >
      {/* Header */}
      <div class="flex items-start gap-3">
        <div
          class="flex size-10 shrink-0 items-center justify-center rounded-lg"
          style={{
            "background-color": `color-mix(in srgb, ${meta().color} 12%, var(--native-panel))`,
            color: meta().color,
          }}
        >
          <Icon name={meta().icon as any} class="size-5" />
        </div>
        <div class="min-w-0 flex-1">
          <h3 class="truncate text-base font-black" style={{ color: '#000000' }}>
            {props.item.name}
          </h3>
          <p class="text-xs text-gray-500">
            {props.item.itemType} · by {props.item.createdBy}
          </p>
        </div>
      </div>

      {/* Description */}
      <p class="mt-3 line-clamp-2 text-sm text-gray-500">
        {description()}
      </p>

      {/* Tags */}
      <Show when={props.item.tags && props.item.tags.length > 0}>
        <div class="mt-3 flex flex-wrap gap-1.5">
          {props.item.tags?.slice(0, 2).map((tag) => (
            <span class="rounded-full bg-[var(--native-surface)] px-2 py-0.5 text-xs text-gray-500">
              #{tag.slug}
            </span>
          ))}
          <Show when={(props.item.tags?.length ?? 0) > 2}>
            <span class="text-xs text-gray-500">
              +{(props.item.tags?.length ?? 0) - 2}
            </span>
          </Show>
        </div>
      </Show>

      {/* Footer stats */}
      <div class="mt-auto flex items-center justify-between pt-3 text-xs text-gray-500">
        <div class="flex items-center gap-3">
          <span class="flex items-center gap-1">
            <LocalIcon name="star" size="small" />
            {formatCompact(props.item.favoriteCount ?? 0)}
          </span>
          <span class="flex items-center gap-1">
            <LocalIcon name="download" size="small" />
            {formatCompact(props.item.installCount ?? 0)}
          </span>
          <span class="flex items-center gap-1">
            <LocalIcon name="view" size="small" />
            {formatCompact(props.item.previewCount ?? 0)}
          </span>
        </div>
        <SecurityTag status={props.item.securityStatus} />
      </div>
    </button>
  )
}
