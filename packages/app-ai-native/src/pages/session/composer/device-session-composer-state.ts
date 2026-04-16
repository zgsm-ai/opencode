import { createEffect, createMemo, on, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import type { PermissionRequest, QuestionRequest, Todo } from "@opencode-ai/sdk/v2"
import { showToast } from "@opencode-ai/ui/toast"
import { useDeviceSDK } from "@/context/device-sdk"
import { useDeviceWorkspace } from "@/context/device-workspace"
import { useDeviceSession } from "@/context/device-session"
import { useLanguage } from "@/context/language"

export function createDeviceSessionComposerState(options?: { closeMs?: number | (() => number) }) {
  const device = useDeviceSDK()
  const workspace = useDeviceWorkspace()
  const session = useDeviceSession()
  const language = useLanguage()

  const todos = createMemo((): Todo[] => session.data.todos)

  const [store, setStore] = createStore({
    responding: undefined as string | undefined,
    dock: todos().length > 0,
    closing: false,
    opening: false,
  })

  const done = createMemo(
    () => todos().length > 0 && todos().every((todo) => todo.status === "completed" || todo.status === "cancelled"),
  )

  let timer: number | undefined
  let raf: number | undefined

  const closeMs = () => {
    const value = options?.closeMs
    if (typeof value === "function") return Math.max(0, value())
    if (typeof value === "number") return Math.max(0, value)
    return 400
  }

  const scheduleClose = () => {
    if (timer) window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      setStore({ dock: false, closing: false })
      timer = undefined
    }, closeMs())
  }

  createEffect(
    on(
      () => [todos().length, done()] as const,
      ([count, complete], prev) => {
        if (raf) cancelAnimationFrame(raf)
        raf = undefined

        if (count === 0) {
          if (timer) window.clearTimeout(timer)
          timer = undefined
          setStore({ dock: false, closing: false, opening: false })
          return
        }

        if (!complete) {
          if (timer) window.clearTimeout(timer)
          timer = undefined
          const hidden = !store.dock || store.closing
          setStore({ dock: true, closing: false })
          if (hidden) {
            setStore("opening", true)
            raf = requestAnimationFrame(() => {
              setStore("opening", false)
              raf = undefined
            })
            return
          }
          setStore("opening", false)
          return
        }

        if (prev && prev[1]) {
          if (store.closing && !timer) scheduleClose()
          return
        }

        setStore({ dock: true, opening: false, closing: true })
        scheduleClose()
      },
    ),
  )

  onCleanup(() => {
    if (!timer) return
    window.clearTimeout(timer)
  })

  onCleanup(() => {
    if (!raf) return
    cancelAnimationFrame(raf)
  })

  return {
    blocked: () => false,
    questionRequest: () => undefined,
    permissionRequest: () => undefined,
    permissionResponding: () => false,
    decide: (_response: "once" | "always" | "reject") => {},
    todos,
    dock: () => store.dock,
    closing: () => store.closing,
    opening: () => store.opening,
  }
}

export type DeviceSessionComposerState = ReturnType<typeof createDeviceSessionComposerState>
