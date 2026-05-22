import { createResource, Show, For, createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { InlineInput } from "@opencode-ai/ui/inline-input"
import { useLanguage } from "@/context/language"
import { listSquads, createSquad, type Squad } from "@/services/collaboration"

function CreateSquadDialog(props: { onCreate: (name: string, description: string) => void }) {
  const language = useLanguage()
  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")

  const handleSubmit = (e: Event) => {
    e.preventDefault()
    const n = name().trim()
    if (!n) return
    props.onCreate(n, description().trim())
  }

  return (
    <Dialog title={language.t("collaboration.squads.createTitle")}>
      <form onSubmit={handleSubmit} class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label class="text-13-medium text-text-strong">{language.t("collaboration.squads.name")}</label>
          <InlineInput
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder={language.t("collaboration.squads.namePlaceholder")}
            class="rounded-md border border-border-subtle bg-surface-base px-3 py-2 text-14-regular text-text-strong outline-none focus:border-primary"
            autofocus
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-13-medium text-text-strong">{language.t("collaboration.squads.description")}</label>
          <textarea
            value={description()}
            onInput={(e) => setDescription(e.currentTarget.value)}
            placeholder={language.t("collaboration.squads.descriptionPlaceholder")}
            class="rounded-md border border-border-subtle bg-surface-base px-3 py-2 text-14-regular text-text-strong outline-none focus:border-primary min-h-[80px] resize-none"
          />
        </div>
        <div class="flex justify-end gap-2 mt-1">
          <Button type="button" variant="ghost" onClick={() => { /* dialog closed by overlay */ }}>
            {language.t("common.cancel")}
          </Button>
          <Button type="submit" disabled={!name().trim()}>
            {language.t("common.create")}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function SquadsPage() {
  const language = useLanguage()
  const dialog = useDialog()
  const [squads, { refetch }] = createResource(() => listSquads())
  const [creating, setCreating] = createSignal(false)

  const openCreateDialog = () => {
    dialog.show(() => (
      <CreateSquadDialog
        onCreate={async (name, description) => {
          dialog.close()
          setCreating(true)
          try {
            await createSquad({ name, description })
            refetch()
          } catch (e) {
            console.error(e)
          } finally {
            setCreating(false)
          }
        }}
      />
    ))
  }

  return (
    <div class="flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <h1 class="text-20-semibold text-text-strong">{language.t("collaboration.squads.title")}</h1>
        <Button onClick={openCreateDialog} loading={creating()} icon="plus">
          {language.t("collaboration.squads.create")}
        </Button>
      </div>

      <Show when={squads.loading}>
        <div class="text-text-weak">{language.t("common.loading")}</div>
      </Show>

      <Show when={squads.error}>
        <div class="text-red-500">{language.t("common.error")}</div>
      </Show>

      <Show when={squads() && squads()!.length === 0}>
        <div class="flex flex-col items-center gap-4 rounded-lg border border-border-subtle bg-surface-base px-6 py-10">
          <p class="text-14-regular text-text-weak">{language.t("collaboration.squads.emptyHint")}</p>
          <Button onClick={openCreateDialog} loading={creating()}>
            {language.t("collaboration.squads.create")}
          </Button>
        </div>
      </Show>

      <Show when={squads() && squads()!.length > 0}>
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
