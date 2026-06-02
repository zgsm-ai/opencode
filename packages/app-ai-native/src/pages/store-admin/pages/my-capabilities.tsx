import { createResource, createSignal, For, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { Icon } from "@opencode-ai/ui/icon"
import { LocalIcon } from "@/components/local-icon"
import { itemApi, type CapabilityItem } from "../../store/lib/api"
import SecurityTag from "../../store/components/security-tag"

const TYPE_META: Record<string, { icon: string; color: string }> = {
  skill: { icon: "sparkles", color: "#F59E0B" },
  subagent: { icon: "brain", color: "#3B82F6" },
  command: { icon: "console", color: "#10B981" },
  mcp: { icon: "mcp", color: "#8B5CF6" },
  plugin: { icon: "configuration", color: "#EC4899" },
}

function formatDate(iso?: string) {
  if (!iso) return ""
  const date = new Date(iso)
  return date.toLocaleDateString()
}

export default function MyCapabilities() {
  const language = useLanguage()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = createSignal("")

  const [data] = createResource(
    () => ({ query: searchQuery() }),
    async (params) => {
      const result = await itemApi.listMy({
        search: params.query || undefined,
        page: 1,
        pageSize: 50,
      })
      return result
    }
  )

  const items = () => data()?.items ?? []

  return (
    <div class="h-full overflow-y-auto p-6">
      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-bold text-[var(--native-foreground)]">
          {language.t("store.admin.myCapabilitiesTitle")}
        </h1>
        <button
          type="button"
          onClick={() => navigate("/capabilities/new")}
          class="flex items-center gap-2 rounded-lg bg-[var(--native-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--native-primary-hover)]"
        >
          <Icon name="plus" class="size-4" />
          <span>{language.t("store.admin.createCapability")}</span>
        </button>
      </div>

      {/* Search */}
      <div class="mb-4">
        <div class="relative max-w-md">
          <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--native-muted)]">
            <Icon name="magnifying-glass" class="size-4" />
          </div>
          <input
            type="text"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            placeholder={language.t("store.admin.searchCapabilities")}
            class="h-10 w-full rounded-lg border border-[var(--native-border)] bg-[var(--native-panel)] pl-10 pr-4 text-sm text-[var(--native-foreground)] placeholder:text-[var(--native-muted)] focus:border-[var(--native-primary)] focus:outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div class="rounded-xl border border-[var(--native-border)] bg-[var(--native-panel)]">
        <Show
          when={items().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center py-16 text-[var(--native-muted)]">
              <Icon name="inbox" class="mb-4 size-12 opacity-30" />
              <p class="text-sm">{language.t("store.admin.noCapabilities")}</p>
            </div>
          }
        >
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="border-b border-[var(--native-border)] bg-[var(--native-surface)]">
                <tr>
                  <th class="px-4 py-3 font-medium text-[var(--native-muted)]">{language.t("store.admin.table.name")}</th>
                  <th class="px-4 py-3 font-medium text-[var(--native-muted)]">{language.t("store.admin.table.type")}</th>
                  <th class="px-4 py-3 font-medium text-[var(--native-muted)]">{language.t("store.admin.table.category")}</th>
                  <th class="px-4 py-3 font-medium text-[var(--native-muted)]">{language.t("store.admin.table.installs")}</th>
                  <th class="px-4 py-3 font-medium text-[var(--native-muted)]">{language.t("store.admin.table.favorites")}</th>
                  <th class="px-4 py-3 font-medium text-[var(--native-muted)]">{language.t("store.admin.table.security")}</th>
                  <th class="px-4 py-3 font-medium text-[var(--native-muted)]">{language.t("store.admin.table.updated")}</th>
                  <th class="px-4 py-3 font-medium text-[var(--native-muted)]">{language.t("store.admin.table.actions")}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[var(--native-border)]">
                <For each={items()}>
                  {(item) => {
                    const meta = TYPE_META[item.itemType] ?? TYPE_META.skill
                    return (
                      <tr class="group transition-colors hover:bg-[var(--native-surface)]">
                        <td class="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => navigate(`/store/${item.slug}`)}
                            class="flex items-center gap-2 text-left"
                          >
                            <div
                              class="flex size-8 shrink-0 items-center justify-center rounded-lg"
                              style={{
                                "background-color": `color-mix(in srgb, ${meta.color} 12%, var(--native-panel))`,
                                color: meta.color,
                              }}
                            >
                              <Icon name={meta.icon as any} class="size-4" />
                            </div>
                            <span class="font-medium text-[var(--native-foreground)]">{item.name}</span>
                          </button>
                        </td>
                        <td class="px-4 py-3 text-[var(--native-muted)] capitalize">{item.itemType}</td>
                        <td class="px-4 py-3 text-[var(--native-muted)]">{item.category}</td>
                        <td class="px-4 py-3 text-[var(--native-muted)]">{item.installCount ?? 0}</td>
                        <td class="px-4 py-3 text-[var(--native-muted)]">{item.favoriteCount ?? 0}</td>
                        <td class="px-4 py-3">
                          <SecurityTag status={item.securityStatus} />
                        </td>
                        <td class="px-4 py-3 text-[var(--native-muted)]">{formatDate(item.updatedAt)}</td>
                        <td class="px-4 py-3">
                          <div class="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => navigate(`/store/${item.slug}`)}
                              class="rounded p-1 text-[var(--native-muted)] hover:bg-[var(--native-surface)] hover:text-[var(--native-foreground)]"
                              title={language.t("store.admin.action.view")}
                            >
                              <LocalIcon name="view" class="size-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  }}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </div>
    </div>
  )
}
