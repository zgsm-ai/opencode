import { createResource, Show, For, createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { InlineInput } from "@opencode-ai/ui/inline-input"
import { useLanguage } from "@/context/language"
import { listIssues, createIssue, listSpaces, createSpace, type Issue } from "@/services/collaboration"

function CreateIssueDialog(props: { onCreate: (title: string, priority: string) => void }) {
  const language = useLanguage()
  const [title, setTitle] = createSignal("")
  const [priority, setPriority] = createSignal("medium")

  const priorities = [
    { value: "urgent", label: language.t("collaboration.issues.priority.urgent"), color: "text-red-500" },
    { value: "high", label: language.t("collaboration.issues.priority.high"), color: "text-orange-500" },
    { value: "medium", label: language.t("collaboration.issues.priority.medium"), color: "text-yellow-500" },
    { value: "low", label: language.t("collaboration.issues.priority.low"), color: "text-blue-500" },
  ]

  const handleSubmit = (e: Event) => {
    e.preventDefault()
    const t = title().trim()
    if (!t) return
    props.onCreate(t, priority())
  }

  return (
    <Dialog title={language.t("collaboration.issues.createTitle")}>
      <form onSubmit={handleSubmit} class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label class="text-13-medium text-text-strong">{language.t("collaboration.issues.titleLabel")}</label>
          <InlineInput
            value={title()}
            onInput={(e) => setTitle(e.currentTarget.value)}
            placeholder={language.t("collaboration.issues.titlePlaceholder")}
            class="rounded-md border border-border-subtle bg-surface-base px-3 py-2 text-14-regular text-text-strong outline-none focus:border-primary"
            autofocus
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-13-medium text-text-strong">{language.t("collaboration.issues.priorityLabel")}</label>
          <div class="flex gap-2">
            <For each={priorities}>
              {(p) => (
                <button
                  type="button"
                  onClick={() => setPriority(p.value)}
                  class={[
                    "rounded-full px-3 py-1 text-12-medium border transition-colors",
                    priority() === p.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border-subtle bg-surface-base text-text-weak hover:bg-surface-hover",
                  ].join(" ")}
                >
                  {p.label}
                </button>
              )}
            </For>
          </div>
        </div>
        <div class="flex justify-end gap-2 mt-1">
          <Button type="button" variant="ghost" onClick={() => { /* dialog closed by overlay */ }}>
            {language.t("common.cancel")}
          </Button>
          <Button type="submit" disabled={!title().trim()}>
            {language.t("common.create")}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function IssuesPage() {
  const language = useLanguage()
  const dialog = useDialog()
  const [issues, { refetch }] = createResource(() => listIssues())
  const [spaces] = createResource(() => listSpaces())
  const [creatingSpace, setCreatingSpace] = createSignal(false)
  const [creatingIssue, setCreatingIssue] = createSignal(false)

  const handleCreateSpace = async () => {
    setCreatingSpace(true)
    try {
      await createSpace({ name: "My Space", slug: `my-space-${Date.now()}` })
      window.location.reload()
    } catch (e) {
      console.error(e)
    } finally {
      setCreatingSpace(false)
    }
  }

  const openCreateDialog = () => {
    dialog.show(() => (
      <CreateIssueDialog
        onCreate={async (title, priority) => {
          dialog.close()
          setCreatingIssue(true)
          try {
            await createIssue({ title, priority })
            refetch()
          } catch (e) {
            console.error(e)
          } finally {
            setCreatingIssue(false)
          }
        }}
      />
    ))
  }

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      backlog: language.t("collaboration.issues.status.backlog") || "Backlog",
      todo: language.t("collaboration.issues.status.todo") || "Todo",
      in_progress: language.t("collaboration.issues.status.in_progress") || "In Progress",
      in_review: language.t("collaboration.issues.status.in_review") || "In Review",
      done: language.t("collaboration.issues.status.done") || "Done",
      blocked: language.t("collaboration.issues.status.blocked") || "Blocked",
      cancelled: language.t("collaboration.issues.status.cancelled") || "Cancelled",
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
        <Show when={spaces() && spaces()!.length > 0}>
          <Button onClick={openCreateDialog} loading={creatingIssue()} icon="plus">
            {language.t("collaboration.issues.create")}
          </Button>
        </Show>
      </div>

      <Show when={spaces() && spaces()!.length === 0}>
        <div class="flex flex-col items-center gap-4 rounded-lg border border-border-subtle bg-surface-base px-6 py-10">
          <p class="text-14-regular text-text-weak">{language.t("collaboration.noSpaceHint")}</p>
          <Button onClick={handleCreateSpace} loading={creatingSpace()}>
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

      <Show when={issues() && issues()!.length === 0}>
        <div class="flex flex-col items-center gap-4 rounded-lg border border-border-subtle bg-surface-base px-6 py-10">
          <p class="text-14-regular text-text-weak">{language.t("collaboration.issues.emptyHint")}</p>
          <Button onClick={openCreateDialog} loading={creatingIssue()}>
            {language.t("collaboration.issues.create")}
          </Button>
        </div>
      </Show>

      <Show when={issues() && issues()!.length > 0}>
        <div class="flex flex-col gap-2">
          <For each={issues()}>
            {(issue: Issue) => (
              <div class="flex items-center gap-3 rounded-lg border border-border-subtle px-4 py-3 bg-surface-base hover:bg-surface-hover transition-colors cursor-pointer">
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
