import { createResource, For } from "solid-js"
import { useLanguage } from "@/context/language"
import { categoryApi, itemFilterApi } from "../lib/api"

const TYPES = [
  { value: "", labelKey: "store.browse.filter.all" },
  { value: "skill", labelKey: "store.browse.type.skills" },
  { value: "subagent", labelKey: "store.browse.type.subagents" },
  { value: "command", labelKey: "store.browse.type.commands" },
  { value: "mcp", labelKey: "store.browse.type.mcp" },
  { value: "plugin", labelKey: "store.browse.type.plugins" },
] as const

export default function SearchFilters(props: {
  selectedType?: string
  selectedCategories?: string[]
  selectedSecurityStatuses?: string[]
  onTypeChange?: (type: string) => void
  onCategoryChange?: (categories: string[]) => void
  onSecurityChange?: (statuses: string[]) => void
}) {
  const language = useLanguage()

  const [categories] = createResource(() => categoryApi.list())
  const [filterOptions] = createResource(() => itemFilterApi.list())

  const toggleCategory = (slug: string) => {
    const current = props.selectedCategories ?? []
    const next = current.includes(slug)
      ? current.filter((c) => c !== slug)
      : [...current, slug]
    props.onCategoryChange?.(next)
  }

  const toggleSecurity = (status: string) => {
    const current = props.selectedSecurityStatuses ?? []
    const next = current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status]
    props.onSecurityChange?.(next)
  }

  return (
    <aside class="w-60 shrink-0 space-y-6 border-r border-[var(--native-border)] bg-[var(--native-panel)] p-4">
      {/* Type filter */}
      <div>
        <h3 class="mb-2 text-sm font-semibold text-[var(--native-foreground)]">
          {language.t("store.browse.filter.type")}
        </h3>
        <div class="space-y-1">
          <For each={TYPES}>
            {(type) => (
              <label class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[var(--native-surface)]">
                <input
                  type="radio"
                  name="type"
                  checked={props.selectedType === type.value}
                  onChange={() => props.onTypeChange?.(type.value)}
                  class="accent-[var(--native-primary)]"
                />
                <span class="text-[var(--native-muted)]">
                  {language.t(type.labelKey)}
                </span>
              </label>
            )}
          </For>
        </div>
      </div>

      {/* Category filter */}
      <div>
        <h3 class="mb-2 text-sm font-semibold text-[var(--native-foreground)]">
          {language.t("store.browse.filter.category")}
        </h3>
        <div class="space-y-1">
          <For each={categories()}>
            {(cat) => (
              <label class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[var(--native-surface)]">
                <input
                  type="checkbox"
                  checked={props.selectedCategories?.includes(cat.slug)}
                  onChange={() => toggleCategory(cat.slug)}
                  class="accent-[var(--native-primary)]"
                />
                <span class="text-[var(--native-muted)]">
                  {cat.names?.[language.locale()] ?? cat.slug}
                </span>
              </label>
            )}
          </For>
        </div>
      </div>

      {/* Security filter */}
      <div>
        <h3 class="mb-2 text-sm font-semibold text-[var(--native-foreground)]">
          {language.t("store.browse.filter.security")}
        </h3>
        <div class="space-y-1">
          <For each={filterOptions()?.securityStatuses ?? []}>
            {(status) => (
              <label class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[var(--native-surface)]">
                <input
                  type="checkbox"
                  checked={props.selectedSecurityStatuses?.includes(status.value)}
                  onChange={() => toggleSecurity(status.value)}
                  class="accent-[var(--native-primary)]"
                />
                <span class="text-[var(--native-muted)]">
                  {status.names?.[language.locale()] ?? status.value}
                </span>
              </label>
            )}
          </For>
        </div>
      </div>
    </aside>
  )
}
