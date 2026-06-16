import { Show, createMemo } from "solid-js"
import { Terminal } from "@/components/terminal"
import { useDeviceTerminal, type LocalPTY } from "@/context/device-terminal"
import { useLanguage } from "@/context/language"
import type { ContentTab } from "@/context/content-tabs"

export function TerminalTab(props: { tab: ContentTab }) {
  const terminal = useDeviceTerminal()
  const language = useLanguage()
  const sessionId = (props.tab.meta as any)?.sessionId as string | undefined

  const pty = createMemo<LocalPTY | undefined>(() => {
    if (!sessionId) return undefined
    return terminal.get(sessionId)
  })

  return (
    <Show
      when={terminal.disabled()}
      fallback={
        <Show
          when={pty()}
          keyed
          fallback={
            <div class="flex-1 h-full flex items-center justify-center text-text-weak text-14-regular">
              {language.t("common.loading")}{language.t("common.loading.ellipsis")}
            </div>
          }
        >
          {(p) => (
            <Terminal
              pty={p}
              forceDark
              onCleanup={terminal.update}
              onConnectError={() => terminal.clone(p.id)}
            />
          )}
        </Show>
      }
    >
      <div class="flex-1 h-full flex flex-col items-center justify-center gap-3 text-text-weak">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <div class="text-14-medium">{language.t("workspace.terminal.disabled")}</div>
      </div>
    </Show>
  )
}
