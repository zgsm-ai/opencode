import { createResource, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { Icon } from "@opencode-ai/ui/icon"
import { distributionApi } from "../../store/lib/api"

function formatDate(iso?: string) {
  if (!iso) return ""
  const date = new Date(iso)
  return date.toLocaleDateString()
}

export default function Sent() {
  const language = useLanguage()

  const [data, { refetch }] = createResource(() => distributionApi.listMySent())

  const distributions = () => data()?.distributions ?? []

  const handleRevoke = async (id: string) => {
    try {
      await distributionApi.revoke(id)
      refetch()
    } catch (e) {
      console.error("Failed to revoke:", e)
    }
  }

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: "bg-green-500/10 text-green-600",
      revoked: "bg-red-500/10 text-red-600",
      expired: "bg-[var(--native-surface)] text-[var(--native-muted)]",
    }
    return styles[status] ?? "bg-[var(--native-surface)] text-[var(--native-muted)]"
  }

  return (
    <div class="h-full overflow-y-auto p-6">
      <h1 class="mb-6 text-2xl font-bold text-[var(--native-foreground)]">
        {language.t("store.admin.sentTitle")}
      </h1>

      <div class="rounded-xl border border-[var(--native-border)] bg-[var(--native-panel)]">
        <Show
          when={distributions().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center py-16 text-[var(--native-muted)]">
              <Icon name="share" class="mb-4 size-12 opacity-30" />
              <p class="text-sm">{language.t("store.admin.noSent")}</p>
            </div>
          }
        >
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="border-b border-[var(--native-border)] bg-[var(--native-surface)]">
                <tr>
                  <th class="px-4 py-3 font-medium text-[var(--native-muted)]">{language.t("store.admin.table.item")}</th>
                  <th class="px-4 py-3 font-medium text-[var(--native-muted)]">{language.t("store.admin.table.to")}</th>
                  <th class="px-4 py-3 font-medium text-[var(--native-muted)]">{language.t("store.admin.table.message")}</th>
                  <th class="px-4 py-3 font-medium text-[var(--native-muted)]">{language.t("store.admin.table.status")}</th>
                  <th class="px-4 py-3 font-medium text-[var(--native-muted)]">{language.t("store.admin.table.date")}</th>
                  <th class="px-4 py-3 font-medium text-[var(--native-muted)]">{language.t("store.admin.table.actions")}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[var(--native-border)]">
                <For each={distributions()}>
                  {(dist) => (
                    <tr class="group transition-colors hover:bg-[var(--native-surface)]">
                      <td class="px-4 py-3 font-medium text-[var(--native-foreground)]">
                        {dist.item?.name ?? "Unknown"}
                      </td>
                      <td class="px-4 py-3 text-[var(--native-muted)]">{dist.targetId}</td>
                      <td class="px-4 py-3 text-[var(--native-muted)]">{dist.message || "-"}</td>
                      <td class="px-4 py-3">
                        <span class={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(dist.status)}`}>
                          {dist.status}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-[var(--native-muted)]">{formatDate(dist.createdAt)}</td>
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-1">
                          <Show when={dist.status === "active"}>
                            <button
                              type="button"
                              onClick={() => handleRevoke(dist.id)}
                              class="rounded p-1 text-[var(--native-muted)] hover:bg-[var(--native-surface)] hover:text-red-500"
                              title={language.t("store.admin.action.revoke")}
                            >
                              <Icon name="circle-ban-sign" class="size-4" />
                            </button>
                          </Show>
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </div>
    </div>
  )
}
