import { createResource, For, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { Icon } from "@opencode-ai/ui/icon"
import { distributionApi } from "../../store/lib/api"

function formatDate(iso?: string) {
  if (!iso) return ""
  const date = new Date(iso)
  return date.toLocaleDateString()
}

export default function Received() {
  const language = useLanguage()
  const navigate = useNavigate()

  const [data, { refetch }] = createResource(() => distributionApi.listMyReceived())

  const receipts = () => data()?.receipts ?? []

  const handleFork = async (receiptId: string) => {
    try {
      await distributionApi.fork(receiptId)
      refetch()
    } catch (e) {
      console.error("Failed to fork:", e)
    }
  }

  const handleDismiss = async (receiptId: string) => {
    try {
      await distributionApi.dismiss(receiptId)
      refetch()
    } catch (e) {
      console.error("Failed to dismiss:", e)
    }
  }

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      accepted: "bg-green-500/10 text-green-600",
      pending: "bg-yellow-500/10 text-yellow-600",
      dismissed: "bg-red-500/10 text-red-600",
    }
    return styles[status] ?? "bg-[var(--native-surface)] text-[var(--native-muted)]"
  }

  return (
    <div class="h-full overflow-y-auto p-6">
      <h1 class="mb-6 text-2xl font-bold text-[var(--native-foreground)]">
        {language.t("store.admin.receivedTitle")}
      </h1>

      <div class="rounded-xl border border-[var(--native-border)] bg-[var(--native-panel)]">
        <Show
          when={receipts().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center py-16 text-[var(--native-muted)]">
              <Icon name="inbox" class="mb-4 size-12 opacity-30" />
              <p class="text-sm">{language.t("store.admin.noReceived")}</p>
            </div>
          }
        >
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="border-b border-[var(--native-border)] bg-[var(--native-surface)]">
                <tr>
                  <th class="px-4 py-3 font-medium text-[var(--native-muted)]">{language.t("store.admin.table.item")}</th>
                  <th class="px-4 py-3 font-medium text-[var(--native-muted)]">{language.t("store.admin.table.from")}</th>
                  <th class="px-4 py-3 font-medium text-[var(--native-muted)]">{language.t("store.admin.table.message")}</th>
                  <th class="px-4 py-3 font-medium text-[var(--native-muted)]">{language.t("store.admin.table.status")}</th>
                  <th class="px-4 py-3 font-medium text-[var(--native-muted)]">{language.t("store.admin.table.date")}</th>
                  <th class="px-4 py-3 font-medium text-[var(--native-muted)]">{language.t("store.admin.table.actions")}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[var(--native-border)]">
                <For each={receipts()}>
                  {(receipt) => (
                    <tr class="group transition-colors hover:bg-[var(--native-surface)]">
                      <td class="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => {
                            const slug = receipt.distribution.item?.slug
                            if (slug) navigate(`/store/${slug}`)
                          }}
                          class="text-left font-medium text-[var(--native-foreground)] hover:text-[var(--native-primary)]"
                        >
                          {receipt.distribution.item?.name ?? "Unknown"}
                        </button>
                      </td>
                      <td class="px-4 py-3 text-[var(--native-muted)]">{receipt.distribution.distributorId}</td>
                      <td class="px-4 py-3 text-[var(--native-muted)]">{receipt.distribution.message || "-"}</td>
                      <td class="px-4 py-3">
                        <span class={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(receipt.receiptStatus)}`}>
                          {receipt.receiptStatus}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-[var(--native-muted)]">{formatDate(receipt.distribution.createdAt)}</td>
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-1">
                          <Show when={receipt.receiptStatus === "pending"}>
                            <button
                              type="button"
                              onClick={() => handleFork(receipt.id)}
                              class="rounded p-1 text-[var(--native-muted)] hover:bg-[var(--native-surface)] hover:text-[var(--native-primary)]"
                              title={language.t("store.admin.action.fork")}
                            >
                              <Icon name="fork" class="size-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDismiss(receipt.id)}
                              class="rounded p-1 text-[var(--native-muted)] hover:bg-[var(--native-surface)] hover:text-red-500"
                              title={language.t("store.admin.action.dismiss")}
                            >
                              <Icon name="close-small" class="size-4" />
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
