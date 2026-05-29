// src/pages/store/components/capability-list-item.tsx
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

function formatDate(iso?: string) {
  if (!iso) return ""
  const date = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

export default function CapabilityListItem(props: {
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
      class="group flex w-full flex-col gap-2 rounded-lg border border-[var(--native-border)] bg-[var(--native-panel)] p-4 text-left transition-all hover:border-[color:var(--type-color)] hover:shadow-md"
      style={{ "--type-color": meta().color }}
    >
      {/* Header row */}
      <div class="flex items-start gap-3">
        <div
          class="flex size-8 shrink-0 items-center justify-center rounded-lg"
          style={{
            "background-color": `color-mix(in srgb, ${meta().color} 12%, var(--native-panel))`,
            color: meta().color,
          }}
        >
          <Icon name={meta().icon as any} class="size-4" />
        </div>
        <div class="min-w-0 flex-1">
          <h3 class="truncate text-base font-semibold text-[var(--native-foreground)]">
            {props.item.name}
          </h3>
          <p class="text-xs text-[var(--native-muted)]">
            {props.item.itemType} · {props.item.category} · by {props.item.createdBy}
          </p>
        </div>
        <SecurityTag status={props.item.securityStatus} />
      </div>

      {/* Description */}
      <p class="line-clamp-2 text-sm text-[var(--native-muted)]">
        {description()}
      </p>

      {/* Tags */}
      <Show when={props.item.tags && props.item.tags.length > 0}>
        <div class="flex flex-wrap gap-1.5">
          {props.item.tags?.slice(0, 3).map((tag) => (
            <span class="rounded-full bg-[var(--native-surface)] px-2 py-0.5 text-xs text-[var(--native-muted)]">
              #{tag.slug}
            </span>
          ))}
        </div>
      </Show>

      {/* Footer stats */}
      <div class="flex items-center justify-between text-xs text-[var(--native-muted)]">
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
        <span>Updated {formatDate(props.item.updatedAt)}</span>
      </div>
    </button>
  )
}
