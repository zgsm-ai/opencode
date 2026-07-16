import { Show, createEffect, createSignal, onCleanup } from "solid-js"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useLanguage } from "@/context/language"
import { useDeviceWorkspace } from "@/context/device-workspace"
import { isMobile } from "@/lib/mobile"

function formatElapsedTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

export function StatusDisplay(props: { working: boolean; busySince?: number }) {
  const language = useLanguage()
  const dw = useDeviceWorkspace()
  const [elapsed, setElapsed] = createSignal(0)

  createEffect(() => {
    if (!props.working) {
      setElapsed(0)
      return
    }

    const start = props.busySince ?? Date.now()
    setElapsed(Math.floor((Date.now() - start) / 1000))
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)

    onCleanup(() => clearInterval(timer))
  })

  return (
    <div class="flex items-center justify-between gap-2 px-3 py-1.5 text-12-regular text-text-weak min-h-7">
      <div class="flex items-center gap-2 min-w-0">
        <Show when={props.working}>
          <div class="size-3 rounded-full border border-t-transparent animate-spin border-text-weak" />
          <span>{language.t("session.status.processing")}</span>
          <span class="opacity-60">({formatElapsedTime(elapsed())})</span>
        </Show>
      </div>
      <Show when={!isMobile()}>
        <DropdownMenu>
          <DropdownMenu.Trigger
            class="flex items-center gap-1 max-w-[60%] px-2 py-0.5 rounded-md text-12-medium text-text-weak hover:text-text-base hover:bg-surface-base-hover active:bg-surface-base-active transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-border-base disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            disabled={dw.restarting().active}
          >
            <Show when={dw.data.agentInfo}>
              <span class="truncate">Powered by {dw.data.agentInfo!.name}</span>
              <Show when={dw.data.agentInfo!.version}>
                <span class="text-text-dimmed shrink-0">{dw.data.agentInfo!.version}</span>
              </Show>
            </Show>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content class="min-w-36 bg-sidebar shadow-md">
              <Show
                when={!dw.restarting().active && dw.data.agentInfo?.version}
                fallback={
                  <Tooltip value={dw.restarting().active ? "" : language.t("workspace.agent.upgradeRequired")} placement="top">
                    <DropdownMenu.Item class="opacity-40 cursor-not-allowed" onSelect={() => {}}>
                      <Icon name="reset" size="small" class="size-4 text-sidebar-foreground/70" />
                      <DropdownMenu.ItemLabel>{language.t("workspace.agent.restart")}</DropdownMenu.ItemLabel>
                    </DropdownMenu.Item>
                  </Tooltip>
                }
              >
                <DropdownMenu.Item class="hover:bg-sidebar-accent" onSelect={() => dw.restartAgent()}>
                  <Icon name="reset" size="small" class="size-4 text-sidebar-foreground/70" />
                  <DropdownMenu.ItemLabel>{language.t("workspace.agent.restart")}</DropdownMenu.ItemLabel>
                </DropdownMenu.Item>
              </Show>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu>
      </Show>
    </div>
  )
}
