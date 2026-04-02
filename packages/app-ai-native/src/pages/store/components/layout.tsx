import type { ParentProps } from "solid-js"
import { Toast } from "@opencode-ai/ui/toast"
import { RepoFilterProvider } from "../context/repo-filter"
import { stitchTheme } from "@/theme/stitch-theme"
import "../store.css"

const c = stitchTheme.colors

/** CSS custom properties that power store.css hover / transition rules */
const themeVars: Record<string, string> = {
  "--st-primary": c.primary,
  "--st-primary-container": c.primaryContainer,
  "--st-on-primary": c.onPrimary,
  "--st-on-primary-fixed-variant": c.onPrimaryFixedVariant,
  "--st-secondary-container": c.secondaryContainer,
  "--st-secondary-fixed": c.secondaryFixed,
  "--st-secondary-fixed-dim": c.secondaryFixedDim,
  "--st-on-secondary-fixed-variant": c.onSecondaryFixedVariant,
  "--st-surface": c.surface,
  "--st-surface-container-lowest": c.surfaceContainerLowest,
  "--st-surface-container-low": c.surfaceContainerLow,
  "--st-surface-container": c.surfaceContainer,
  "--st-surface-container-high": c.surfaceContainerHigh,
  "--st-surface-container-highest": c.surfaceContainerHighest,
  "--st-on-surface": c.onSurface,
  "--st-on-surface-variant": c.onSurfaceVariant,
  "--st-outline": c.outline,
  "--st-outline-variant": c.outlineVariant,
  "--st-on-primary-fixed": c.onPrimaryFixed,
  "--st-error": c.error,
}

export default function StoreLayout(props: ParentProps) {
  return (
    <RepoFilterProvider>
      <div class="store-main custom-scrollbar h-full w-full min-h-0 overflow-y-auto" style={themeVars}>
        {props.children}
      </div>
      <Toast.Region />
    </RepoFilterProvider>
  )
}
