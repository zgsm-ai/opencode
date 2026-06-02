import { createResource, For, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { Icon } from "@opencode-ai/ui/icon"
import { itemApi, distributionApi } from "../../store/lib/api"

const STAT_CARDS = [
  { key: "capabilities", labelKey: "store.admin.stats.capabilities", icon: "package", color: "#3B82F6", api: "myCapabilities" },
  { key: "favorites", labelKey: "store.admin.stats.favorites", icon: "star", color: "#F59E0B", api: "favorites" },
  { key: "received", labelKey: "store.admin.stats.received", icon: "inbox", color: "#10B981", api: "received" },
  { key: "sent", labelKey: "store.admin.stats.sent", icon: "share", color: "#8B5CF6", api: "sent" },
] as const

function formatCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export default function Dashboard() {
  const language = useLanguage()
  const navigate = useNavigate()

  const [myCapabilities] = createResource(() => itemApi.listMy({ page: 1, pageSize: 1 }))
  const [favorites] = createResource(() => itemApi.list({ favorited: true, page: 1, pageSize: 1 }))
  const [received] = createResource(() => distributionApi.listMyReceived())
  const [sent] = createResource(() => distributionApi.listMySent())

  const stats = () => ({
    capabilities: myCapabilities()?.total ?? 0,
    favorites: favorites()?.total ?? 0,
    received: received()?.receipts?.length ?? 0,
    sent: sent()?.distributions?.length ?? 0,
  })

  const recentActivity = () => {
    const activities: { type: string; title: string; date: string }[] = []
    const receipts = received()?.receipts ?? []
    receipts.slice(0, 5).forEach((r) => {
      activities.push({
        type: "received",
        title: `Received "${r.distribution.item?.name ?? "Unknown"}" from ${r.distribution.distributorId}`,
        date: r.distribution.createdAt,
      })
    })
    return activities
  }

  return (
    <div class="h-full overflow-y-auto p-6">
      <h1 class="mb-6 text-2xl font-bold text-[var(--native-foreground)]">
        {language.t("store.admin.dashboardTitle")}
      </h1>

      {/* Stats Cards */}
      <div class="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <For each={STAT_CARDS}>
          {(card) => (
            <button
              type="button"
              onClick={() => {
                const pathMap: Record<string, string> = {
                  capabilities: "/store-admin/capabilities",
                  favorites: "/store-admin/favorites",
                  received: "/store-admin/received",
                  sent: "/store-admin/sent",
                }
                navigate(pathMap[card.key])
              }}
              class="group flex items-center gap-4 rounded-xl border border-[var(--native-border)] bg-[var(--native-panel)] p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div
                class="flex size-12 items-center justify-center rounded-lg"
                style={{
                  "background-color": `color-mix(in srgb, ${card.color} 12%, var(--native-panel))`,
                  color: card.color,
                }}
              >
                <Icon name={card.icon as any} class="size-6" />
              </div>
              <div>
                <div class="text-2xl font-bold text-[var(--native-foreground)]">
                  {formatCompact(stats()[card.key as keyof ReturnType<typeof stats>])}
                </div>
                <div class="text-sm text-[var(--native-muted)]">
                  {language.t(card.labelKey)}
                </div>
              </div>
            </button>
          )}
        </For>
      </div>

      {/* Recent Activity */}
      <div class="rounded-xl border border-[var(--native-border)] bg-[var(--native-panel)] p-4">
        <h2 class="mb-4 text-lg font-semibold text-[var(--native-foreground)]">
          {language.t("store.admin.recentActivity")}
        </h2>
        <Show
          when={recentActivity().length > 0}
          fallback={
            <div class="py-8 text-center text-sm text-[var(--native-muted)]">
              {language.t("store.admin.noActivity")}
            </div>
          }
        >
          <div class="space-y-3">
            <For each={recentActivity()}>
              {(activity) => (
                <div class="flex items-center gap-3 rounded-lg bg-[var(--native-surface)] px-4 py-3">
                  <div class="flex size-8 items-center justify-center rounded-full bg-[var(--native-bg)]">
                    <Icon
                      name={activity.type === "received" ? "inbox" : "share"}
                      class="size-4 text-[var(--native-muted)]"
                    />
                  </div>
                  <div class="flex-1">
                    <p class="text-sm text-[var(--native-foreground)]">{activity.title}</p>
                    <p class="text-xs text-[var(--native-muted)]">
                      {new Date(activity.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}
