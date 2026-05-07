import { createSignal, onCleanup, type ParentProps, Show } from "solid-js"
import { useDeviceSDK } from "./device-sdk"
import { useLanguage } from "@/context/language"
import type { InitStatusData } from "@/client/device-client"

type InitPhase = "checking" | "initializing" | "ready" | "error"

export function WorkspaceInitGate(props: ParentProps) {
  const device = useDeviceSDK()
  const language = useLanguage()
  const [phase, setPhase] = createSignal<InitPhase>("checking")
  const [status, setStatus] = createSignal<InitStatusData | undefined>()
  const [progress, setProgress] = createSignal(0)

  const POLL_MS = 3_000
  const PROGRESS_INTERVAL = 100
  const PROGRESS_INCREMENT_FAST = 0.6
  const PROGRESS_INCREMENT_SLOW = 0.15
  let timer: ReturnType<typeof setTimeout> | undefined
  let progressTimer: ReturnType<typeof setInterval> | undefined

  const tickProgress = () => {
    setProgress((p) => {
      if (p >= 90) return p + PROGRESS_INCREMENT_SLOW
      return p + PROGRESS_INCREMENT_FAST
    })
  }

  const startProgress = () => {
    if (progressTimer) return
    setProgress(0)
    progressTimer = setInterval(tickProgress, PROGRESS_INTERVAL)
  }

  const stopProgress = () => {
    if (progressTimer) {
      clearInterval(progressTimer)
      progressTimer = undefined
    }
  }

  const finishProgress = () => {
    stopProgress()
    setProgress(100)
  }

  const check = async () => {
    try {
      const result = await device.client.runtime.initStatus()
      if (result?.ready && result.prewarm?.status === "completed") {
        finishProgress()
        setPhase("ready")
        setStatus(result)
        return
      }
      setStatus(result)
      if (phase() === "checking") startProgress()
      setPhase("initializing")
    } catch {
      if (phase() === "checking") startProgress()
      setPhase("error")
    }
    timer = setTimeout(check, POLL_MS)
  }

  void check()

  onCleanup(() => {
    if (timer) clearTimeout(timer)
    stopProgress()
  })

  return (
    <Show
      when={phase() === "ready"}
      fallback={
        <div class="flex h-full w-full min-h-0 items-center justify-center">
          <div class="flex flex-col items-center gap-4 w-72">
            <FakeProgressBar value={progress()} />
            <Show when={phase() === "initializing"}>
              <span class="text-13-medium text-text-base">
                {language.t("workspace.init.initializing")}
              </span>
              <InitStatusDetail status={status()} />
            </Show>
            <Show when={phase() === "checking"}>
              <span class="text-12-regular text-text-weak">
                {language.t("workspace.init.checking")}
              </span>
            </Show>
            <Show when={phase() === "error"}>
              <span class="text-12-regular text-text-weak">
                {language.t("workspace.init.error")}
              </span>
            </Show>
          </div>
        </div>
      }
    >
      {props.children}
    </Show>
  )
}

function InitStatusDetail(props: { status?: InitStatusData }) {
  const language = useLanguage()

  return (
    <Show when={props.status}>
      {(s) => {
        const agentLabel = () => {
          const state = s().agent?.state
          if (state === "idle" || state === "none") return language.t("workspace.init.agent.waiting")
          if (state === "connecting") return language.t("workspace.init.agent.connecting")
          if (state === "connected" || state === "session_active") return language.t("workspace.init.agent.connected")
          if (state === "disconnected") return language.t("workspace.init.agent.disconnected")
          if (state === "error") return language.t("workspace.init.agent.error")
          return language.t("workspace.init.agent.waiting")
        }

        const prewarmLabel = () => {
          const p = s().prewarm?.status
          if (p === "in_progress") return language.t("workspace.init.prewarm.progress")
          if (p === "completed") return language.t("workspace.init.prewarm.done")
          if (p === "failed") return language.t("workspace.init.prewarm.failed")
          return undefined
        }

        return (
          <div class="flex flex-col gap-1 text-12-regular text-text-weak w-full">
            <div class="flex items-center gap-2">
              <StatusDot active={!s().agent?.healthy} />
              <span>{agentLabel()}</span>
            </div>
            <Show when={prewarmLabel()}>
              {(label) => (
                <div class="flex items-center gap-2">
                  <StatusDot active={s().prewarm?.status !== "completed"} />
                  <span>{label()}</span>
                </div>
              )}
            </Show>
            <Show when={s().prewarm?.error}>
              {(err) => (
                <span class="text-text-danger text-11-regular mt-1 break-all">{err()}</span>
              )}
            </Show>
          </div>
        )
      }}
    </Show>
  )
}

function StatusDot(props: { active: boolean }) {
  return (
    <div
      class={`w-1.5 h-1.5 rounded-full shrink-0 ${
        props.active ? "bg-text-dimmed animate-pulse" : "bg-text-weak"
      }`}
    />
  )
}

function FakeProgressBar(props: { value: number }) {
  return (
    <div class="w-full h-1 rounded-full bg-border-base overflow-hidden">
      <div
        class="h-full rounded-full bg-accent transition-[width] duration-200 ease-linear"
        style={{ width: `${Math.min(props.value, 100)}%` }}
      />
    </div>
  )
}
