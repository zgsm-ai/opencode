import { createEffect, createMemo, on, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import type { PermissionRequest, QuestionRequest, Todo } from "@opencode-ai/sdk/v2"
import { showToast } from "@opencode-ai/ui/toast"
import { useDeviceSDK } from "@/context/device-sdk"
import { useDeviceWorkspace } from "@/context/device-workspace"
import { useDeviceSession } from "@/context/device-session"
import { useLanguage } from "@/context/language"
import { sessionPermissionRequest, sessionQuestionRequest } from "./session-request-tree"

export function createDeviceSessionComposerState(options?: { closeMs?: number | (() => number) }) {
  const device = useDeviceSDK()
  const workspace = useDeviceWorkspace()
  const session = useDeviceSession()
  const language = useLanguage()

  const todos = createMemo((): Todo[] => session.data.todos)

  const questionRequest = createMemo((): QuestionRequest | undefined => {
    const sid = session.sessionID()
    return sessionQuestionRequest(workspace.data.session, session.data.questions, sid)
  })

  const permissionRequest = createMemo((): PermissionRequest | undefined => {
    const sid = session.sessionID()
    return sessionPermissionRequest(workspace.data.session, session.data.permissions, sid, (item) => {
      return !session.permission.isAutoAccepting()
    })
  })

  const blocked = createMemo(() => {
    const sid = session.sessionID()
    if (!sid) return false
    return !!permissionRequest() || !!questionRequest()
  })

  const [store, setStore] = createStore({
    responding: undefined as string | undefined,
    dock: todos().length > 0,
    closing: false,
    opening: false,
  })

  const permissionResponding = createMemo(() => {
    const perm = permissionRequest()
    if (!perm) return false
    return store.responding === perm.id
  })

  const decide = (response: "once" | "always" | "reject") => {
    const perm = permissionRequest()
    if (!perm) return
    if (store.responding === perm.id) return

    setStore("responding", perm.id)
    device.client.permission
      .respond(perm.id, {
        decision: response,
      })
      .catch((err: unknown) => {
        const description = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description })
      })
      .finally(() => {
        setStore("responding", (id) => (id === perm.id ? undefined : id))
      })
  }

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
    blocked,
    questionRequest,
    permissionRequest,
    permissionResponding,
    decide,
    todos,
    dock: () => store.dock,
    closing: () => store.closing,
    opening: () => store.opening,
  }
}

export type DeviceSessionComposerState = ReturnType<typeof createDeviceSessionComposerState>
