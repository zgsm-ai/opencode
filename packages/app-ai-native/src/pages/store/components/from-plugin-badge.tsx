import { Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"

interface FromPluginBadgeProps {
  /** Parent plugin display name; badge renders only when present. */
  name?: string
  /** Optional extra classes for the badge root. */
  class?: string
}

/**
 * Inline pill marking a capability as belonging to a plugin: a white-background, 1px-bordered
 * rounded pill reading "来自插件 {name}" with a small plugin icon. Uses --native-* tokens so it
 * stays legible in both themes. Note Tailwind v4 doesn't emit `bg-white`, hence `bg-[var(--native-panel)]`.
 */
export default function FromPluginBadge(props: FromPluginBadgeProps) {
  const language = useLanguage()
  return (
    <Show when={props.name}>
      {(name) => (
        <span
          class={`inline-flex max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[color:color-mix(in_oklab,var(--native-border)_60%,transparent)] bg-[var(--native-panel)] px-2 py-0.5 text-[11.5px] font-medium leading-4 text-[var(--native-muted)] ${props.class ?? ""}`.trim()}
          title={language.t("store.item.fromPlugin", { name: name() })}
        >
          <Icon name="configuration" size="small" class="shrink-0 opacity-70" />
          {/* Fixed prefix never truncates; only the plugin name truncates (single-line ellipsis)
              so a long name renders as "来自插件 astronomer-…" instead of wrapping the pill. */}
          <span class="shrink-0">{language.t("store.item.fromPluginLabel")}</span>
          <span class="inline-block max-w-[7rem] truncate align-bottom">{name()}</span>
        </span>
      )}
    </Show>
  )
}
