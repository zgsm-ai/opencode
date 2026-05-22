import { createResource, Show, For } from "solid-js"
import { useLanguage } from "@/context/language"
import { listSpaces, type Space } from "@/services/collaboration"

export default function ProjectsPage() {
  const language = useLanguage()
  const [spaces] = createResource(() => listSpaces())

  return (
    <div class="flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <h1 class="text-20-semibold text-text-strong">{language.t("collaboration.projects.title")}</h1>
      </div>
      <Show when={spaces.loading}>
        <div class="text-text-weak">{language.t("common.loading")}</div>
      </Show>
      <Show when={spaces.error}>
        <div class="text-red-500">{language.t("common.error")}</div>
      </Show>
      <Show when={spaces()}>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <For each={spaces()}>
            {(space: Space) => (
              <div class="flex flex-col gap-2 rounded-lg border border-border-subtle p-4 bg-surface-base hover:bg-surface-hover transition-colors cursor-pointer">
                <h3 class="text-16-semibold text-text-strong truncate">{space.name}</h3>
                <p class="text-13-regular text-text-weak line-clamp-2">{space.description || language.t("collaboration.projects.noDescription")}</p>
                <span class="text-11-regular text-text-ghost mt-1">{space.slug}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
