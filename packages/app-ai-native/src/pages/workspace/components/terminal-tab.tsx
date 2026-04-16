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
  )
}
