import { createResource, Show, For } from "solid-js"
import { useLanguage } from "@/context/language"
import { listSquads, type Squad } from "@/services/collaboration"

export default function SquadsPage() {
  const language = useLanguage()
  const [squads] = createResource(() => listSquads())

  return (
    <div class="flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <h1 class="text-20-semibold text-text-strong">{language.t("collaboration.squads.title")}</h1>
      </div>
      <Show when={squads.loading}>
        <div class="text-text-weak">{language.t("common.loading")}</div>
      </Show>
      <Show when={squads.error}>
        <div class="text-red-500">{language.t("common.error")}</div>
      </Show>
      <Show when={squads()}>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <For each={squads()}>
            {(squad: Squad) => (
              <div class="flex flex-col gap-2 rounded-lg border border-border-subtle p-4 bg-surface-base hover:bg-surface-hover transition-colors cursor-pointer">
                <h3 class="text-16-semibold text-text-strong truncate">{squad.name}</h3>
                <p class="text-13-regular text-text-weak line-clamp-2">{squad.description || language.t("collaboration.squads.noDescription")}</p>
                <Show when={squad.archivedAt}>
                  <span class="text-11-medium text-red-400">{language.t("collaboration.squads.archived")}</span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
