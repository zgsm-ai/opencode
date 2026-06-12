import { Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { TYPE_COLORS } from "../lib/constants"

interface FromPluginBadgeProps {
  /** Parent plugin display name; badge renders only when present. */
  name?: string
  /** Optional extra classes for the badge root. */
  class?: string
}

const PLUGIN_ACCENT = TYPE_COLORS.plugin

/**
 * Inline icon badge marking a capability as belonging to a plugin.
 * Mirrors the "user uploaded" badge style in store-capability-table.tsx.
 */
export default function FromPluginBadge(props: FromPluginBadgeProps) {
  const language = useLanguage()
  return (
    <Show when={props.name}>
      {(name) => (
        <span
          class={`inline-flex shrink-0 items-center rounded-md px-1 py-0.5 ${props.class ?? ""}`.trim()}
          style={{
            color: PLUGIN_ACCENT,
            "background-color": `color-mix(in oklab, ${PLUGIN_ACCENT} 18%, transparent)`,
          }}
          title={language.t("store.item.fromPlugin", { name: name() })}
        >
          <Icon name="configuration" size="small" />
        </span>
      )}
    </Show>
  )
}
