import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Modal } from "@/components/modal"

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
    <Modal
      title={props.title}
      maxWidth="440px"
      maxHeight="340px"
      footer={
        <>
          <button
            class="modal-btn modal-btn-ghost"
            type="button"
            onClick={() => dialog.close()}
            disabled={state.loading}
          >
            {language.t("common.cancel")}
          </button>
          <button
            class={`modal-btn ${danger() ? "modal-btn-danger" : "modal-btn-primary"}`}
            type="button"
            onClick={handle}
            disabled={state.loading}
          >
            {state.loading ? language.t("common.loading") : (props.confirm ?? language.t("common.delete"))}
          </button>
        </>
      }
    >
      <div class="modal-section">
        <div style={{ display: "flex", "align-items": "center", gap: "0.75rem" }}>
          <Show when={danger()}>
            <div style={{
              display: "flex",
              width: "2.5rem",
              height: "2.5rem",
              "flex-shrink": "0",
              "align-items": "center",
              "justify-content": "center",
              "border-radius": "9999px",
              background: "color-mix(in srgb, #dc2626 15%, transparent)",
            }}>
              <Icon name="warning" style={{ width: "1.25rem", height: "1.25rem", color: "#dc2626" }} />
            </div>
          </Show>
          <div class="modal-section-desc" style={{ margin: "0" }}>
            {props.description}
          </div>
        </div>
      </div>
    </Modal>
  )
}
