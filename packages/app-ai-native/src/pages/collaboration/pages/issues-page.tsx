import { createResource, Show, For, createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { useLanguage } from "@/context/language"
import { listIssues, listSpaces, createSpace, type Issue } from "@/services/collaboration"

export default function IssuesPage() {
  const language = useLanguage()
  const [issues, { refetch }] = createResource(() => listIssues())
  const [spaces] = createResource(() => listSpaces())
  const [creating, setCreating] = createSignal(false)

  const handleCreateSpace = async () => {
    setCreating(true)
    try {
      await createSpace({ name: "My Space", slug: `my-space-${Date.now()}` })
      window.location.reload()
    } catch (e) {
      console.error(e)
    } finally {
      setCreating(false)
    }
  }

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      backlog: "Backlog",
      todo: "Todo",
      in_progress: "In Progress",
      in_review: "In Review",
      done: "Done",
      blocked: "Blocked",
      cancelled: "Cancelled",
    }
    return map[status] || status
  }

  const priorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "text-red-500"
      case "high": return "text-orange-500"
      case "medium": return "text-yellow-500"
      case "low": return "text-blue-500"
      default: return "text-gray-400"
    }
  }

  return (
    <div class="flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <h1 class="text-20-semibold text-text-strong">{language.t("collaboration.issues.title")}</h1>
      </div>

      <Show when={spaces() && spaces()!.length === 0}>
        <div class="flex flex-col items-center gap-4 rounded-lg border border-border-subtle bg-surface-base px-6 py-10">
          <p class="text-14-regular text-text-weak">{language.t("collaboration.noSpaceHint")}</p>
          <Button onClick={handleCreateSpace} loading={creating()}>
            {language.t("collaboration.createSpace")}
          </Button>
        </div>
      </Show>

      <Show when={issues.loading}>
        <div class="text-text-weak">{language.t("common.loading")}</div>
      </Show>

      <Show when={issues.error}>
        <div class="text-red-500">{language.t("common.error")}</div>
      </Show>

      <Show when={issues()}>
        <div class="flex flex-col gap-2">
          <For each={issues()}>
            {(issue: Issue) => (
              <div class="flex items-center gap-3 rounded-lg border border-border-subtle px-4 py-3 bg-surface-base hover:bg-surface-hover transition-colors">
                <span class={`text-11-medium shrink-0 ${priorityColor(issue.priority)}`}>{issue.priority}</span>
                <span class="text-12-regular text-text-weak shrink-0">#{issue.number}</span>
                <span class="text-14-medium text-text-strong flex-1 truncate">{issue.title}</span>
                <span class="text-11-regular text-text-weak shrink-0 rounded-full bg-surface-subtle px-2 py-0.5">{statusLabel(issue.status)}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
