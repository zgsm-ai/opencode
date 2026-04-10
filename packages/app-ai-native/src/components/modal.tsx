import type { JSX, ParentProps } from "solid-js"
import { Dialog as Kobalte } from "@kobalte/core/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import "../styles/modal.css"

type Props = ParentProps<{
  title: string
  footer?: JSX.Element
  maxWidth?: string
  maxHeight?: string
}>

export function Modal(props: Props) {
  const dialog = useDialog()

  return (
    <div class="modal-wrap">
      <Kobalte.Content
        class="modal-box"
        style={{
          ...(props.maxWidth ? { width: `min(calc(100vw - 32px), ${props.maxWidth})` } : {}),
          ...(props.maxHeight ? { "max-height": `min(calc(100vh - 32px), ${props.maxHeight})` } : {}),
        }}
        onOpenAutoFocus={(e) => {
          const target = e.currentTarget as HTMLElement | null
          const autofocusEl = target?.querySelector("[autofocus]") as HTMLElement | null
          if (autofocusEl) {
            e.preventDefault()
            autofocusEl.focus()
          }
        }}
      >
        <div class="modal-hdr">
          <span class="modal-title">{props.title}</span>
          <button class="modal-close" type="button" onClick={() => dialog.close()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <div class="modal-body">
          {props.children}
        </div>
        {props.footer && (
          <div class="modal-foot">
            {props.footer}
          </div>
        )}
      </Kobalte.Content>
    </div>
  )
}
