import { createSignal, onCleanup, type ParentProps, Show } from "solid-js"
import { useDeviceClient } from "@/context/device-client"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"

export function DeviceInitGate(props: ParentProps) {
  const device = useDeviceClient()
  const language = useLanguage()
  const [ready, setReady] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>()

  const RETRY_MS = 3_000
  let timer: ReturnType<typeof setTimeout> | undefined

  const check = async () => {
    try {
      const result = await device.client.runtime.health()
      if (result.healthy) {
        setReady(true)
        setError(undefined)
        return
      }
    } catch {}

    setError(language.t("workspace.device.offline"))
    timer = setTimeout(check, RETRY_MS)
  }

  void check()

  onCleanup(() => {
    if (timer) clearTimeout(timer)
  })

  return (
    <Show
      when={ready()}
      fallback={
        <div class="flex h-full w-full min-h-0 items-center justify-center">
          <Show when={error()} fallback={<div class="h-5 w-5 rounded-full border-2 border-border-base border-t-text-dimmed animate-spin" />}>
            <span class="text-12-regular text-text-weak">{error()}</span>
          </Show>
        </div>
      }
    >
      {props.children}
    </Show>
  )
}
