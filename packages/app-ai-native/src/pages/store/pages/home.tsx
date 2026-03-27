import { createResource, createMemo, For, Show } from "solid-js"
import { A } from "@solidjs/router"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { itemApi } from "../lib/api"
import { useRepoFilter } from "../context/repo-filter"
import { useRepoItems } from "../hooks/use-repo-items"
import ItemCard from "../components/item-card"

export default function Home() {
  const language = useLanguage()
  const { selectedRepo } = useRepoFilter()

  const repo = () => (selectedRepo() ? { ...selectedRepo()! } : null)

  // Global mode: only fetch when no repo is selected
  const global = () => !selectedRepo() || undefined
  const [skills] = createResource(global, () => itemApi.list({ type: "skill", pageSize: 8 }))
  const [subagents] = createResource(global, () => itemApi.list({ type: "subagent", pageSize: 8 }))
  const [commands] = createResource(global, () => itemApi.list({ type: "command", pageSize: 8 }))
  const [mcps] = createResource(global, () => itemApi.list({ type: "mcp", pageSize: 8 }))

  // Repo mode
  const { items: repoSkills, loading: repoSkillsLoading } = useRepoItems(repo, "skill")
  const { items: repoSubagents, loading: repoSubagentsLoading } = useRepoItems(repo, "subagent")
  const { items: repoCommands, loading: repoCommandsLoading } = useRepoItems(repo, "command")
  const { items: repoMcps, loading: repoMcpsLoading } = useRepoItems(repo, "mcp")

  const categories = createMemo(() => {
    const isRepo = !!selectedRepo()
    return [
      {
        href: "/store/skills",
        label: "store.sidebar.nav.skills" as const,
        icon: "sparkles" as const,
        color: "text-yellow-500",
        items: () => (isRepo ? repoSkills().slice(0, 8) : (skills()?.items ?? [])),
        total: () => (isRepo ? repoSkills().length : (skills()?.total ?? 0)),
        loading: () => (isRepo ? repoSkillsLoading() : skills.loading),
      },
      {
        href: "/store/subagents",
        label: "store.sidebar.nav.subagents" as const,
        icon: "models" as const,
        color: "text-blue-500",
        items: () => (isRepo ? repoSubagents().slice(0, 8) : (subagents()?.items ?? [])),
        total: () => (isRepo ? repoSubagents().length : (subagents()?.total ?? 0)),
        loading: () => (isRepo ? repoSubagentsLoading() : subagents.loading),
      },
      {
        href: "/store/commands",
        label: "store.sidebar.nav.commands" as const,
        icon: "console" as const,
        color: "text-green-500",
        items: () => (isRepo ? repoCommands().slice(0, 8) : (commands()?.items ?? [])),
        total: () => (isRepo ? repoCommands().length : (commands()?.total ?? 0)),
        loading: () => (isRepo ? repoCommandsLoading() : commands.loading),
      },
      {
        href: "/store/mcp-servers",
        label: "store.sidebar.nav.mcpServers" as const,
        icon: "server" as const,
        color: "text-purple-500",
        items: () => (isRepo ? repoMcps().slice(0, 8) : (mcps()?.items ?? [])),
        total: () => (isRepo ? repoMcps().length : (mcps()?.total ?? 0)),
        loading: () => (isRepo ? repoMcpsLoading() : mcps.loading),
      },
    ]
  })

  return (
    <div class="min-h-full">
      {/* Browse by type */}
      <section class="py-12 px-8 border-border-weak-base">
        <p class="text-xs text-text-weak mb-6 uppercase tracking-wider">{language.t("store.home.browseByType")}</p>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl">
          <For each={categories()}>
            {(cat) => (
              <A
                href={cat.href}
                class="p-4 rounded-lg border border-border-weak-base text-center group cursor-pointer hover:border-border-weak-base hover:shadow-xs-border-base hover:-translate-y-px active:translate-y-0 transition-all duration-150"
              >
                <div class={`text-2xl mb-2 ${cat.color}`}>
                  <Icon name={cat.icon} />
                </div>
                <div class="text-lg font-semibold text-text-strong mb-1">{cat.total() ?? "—"}</div>
                <div class="text-xs text-text-weak group-hover:text-text-strong transition-colors">
                  {language.t(cat.label)}
                </div>
              </A>
            )}
          </For>
        </div>
      </section>

      {/* Featured sections */}
      <For each={categories()}>
        {(cat) => (
          <section class="py-12 px-8 border-t border-border-weak-base">
            <div class="flex items-center justify-between mb-6">
              <h2 class={`text-lg font-semibold flex items-center gap-2 ${cat.color}`}>
                <Icon name={cat.icon} /> {language.t(cat.label)}
              </h2>
              <A href={cat.href} class="text-xs text-text-weak hover:text-text-strong transition-colors">
                {language.t("store.home.viewAll")}
              </A>
            </div>
            <Show
              when={!cat.loading()}
              fallback={<div class="text-text-weak text-sm">{language.t("store.loading")}</div>}
            >
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                <For each={cat.items()}>{(item) => <ItemCard item={item} />}</For>
              </div>
            </Show>
          </section>
        )}
      </For>
    </div>
  )
}
