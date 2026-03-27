import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { Show } from "solid-js"
import { createStore } from "solid-js/store"

type ConfirmDialogProps = {
  title: string
  description: string
  confirm?: string
  variant?: "danger" | "normal"
  onConfirm: () => Promise<void> | void
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const dialog = useDialog()
  const language = useLanguage()
  const [state, setState] = createStore({ loading: false })
  const danger = () => (props.variant ?? "danger") === "danger"

  async function handle() {
    setState("loading", true)
    try {
      await props.onConfirm()
      dialog.close()
    } catch {
      setState("loading", false)
    }
  }

  return (
    <Dialog title={props.title} class="mx-auto w-full max-w-[440px]" fit>
      <div class="flex flex-col gap-6 px-6 pb-6 pt-2">
        <div class="flex items-center gap-3">
          <Show when={danger()}>
            <div class="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-critical-base/15">
              <Icon name="warning" class="size-5 text-icon-critical-base" />
            </div>
          </Show>
          <p class="text-sm text-text-weak leading-relaxed">{props.description}</p>
        </div>
        <div class="flex items-center justify-end gap-3 border-t border-border-weak-base pt-4">
          <Button variant="ghost" onClick={() => dialog.close()} disabled={state.loading}>
            {language.t("common.cancel")}
          </Button>
          <Button
            onClick={handle}
            disabled={state.loading}
            class={
              danger()
                ? "border-border-critical-base bg-surface-critical-strong text-white shadow-none hover:opacity-90 disabled:opacity-50"
                : ""
            }
          >
            {state.loading ? language.t("common.loading") : (props.confirm ?? language.t("common.delete"))}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
