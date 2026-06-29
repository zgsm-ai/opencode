import { createEffect, createMemo, on, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import type { PermissionRequest, QuestionRequest, Todo } from "@opencode-ai/sdk/v2"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import type { SessionChatBackend } from "@/context/session-chat"
import { sessionPermissionRequest, sessionQuestionRequest } from "./session-request-tree"

type ComposerDeps = {
  chat: SessionChatBackend
  sessionID: () => string | undefined
  todos: () => Todo[]
  isAutoAccepting: () => boolean
  enableAutoAccept: () => void
}

export function createDeviceSessionComposerState(deps: ComposerDeps, options?: { closeMs?: number | (() => number) }) {
  const language = useLanguage()

  const questionRequest = createMemo((): QuestionRequest | undefined => {
    const sid = deps.sessionID()
    return sessionQuestionRequest(deps.chat.sessions(), deps.chat.questions(), sid)
  })

  const permissionRequest = createMemo((): PermissionRequest | undefined => {
    const sid = deps.sessionID()
    const perms = deps.chat.permissions()
    const sessions = deps.chat.sessions()
    const include = () => !deps.isAutoAccepting()

    return sessionPermissionRequest(sessions, perms, sid, include)
  })

  const blocked = createMemo(() => {
    const sid = deps.sessionID()
    if (!sid) return false
    return !!permissionRequest() || !!questionRequest()
  })

  const [store, setStore] = createStore({
    responding: undefined as string | undefined,
    dock: deps.todos().length > 0,
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

    const sid = deps.sessionID()
    setStore("responding", perm.id)
    deps.chat.permissionRespond(perm.id, response)
      .catch((err: unknown) => {
        const description = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description })
        if (perm.sessionID) deps.chat.removePermission(perm.sessionID, perm.id)
      })
      .finally(() => {
        setStore("responding", (id) => (id === perm.id ? undefined : id))
      })
  }

  const autoAccept = () => {
    deps.enableAutoAccept()

    const perms = deps.chat.permissions()
    for (const [sessionID, list] of Object.entries(perms)) {
      if (!Array.isArray(list)) continue
      for (const perm of list) {
        deps.chat.permissionRespond(perm.id, "once")
          .catch(() => {})
          .finally(() => {
            deps.chat.removePermission(sessionID, perm.id)
          })
      }
    }
  }

  const dismissQuestion = () => {
    const q = questionRequest()
    if (!q) return
    deps.chat.removeQuestion(q.sessionID, q.id)
  }

  const done = createMemo(
    () => deps.todos().length > 0 && deps.todos().every((todo) => todo.status === "completed" || todo.status === "cancelled"),
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
      () => [deps.todos().length, done()] as const,
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
    autoAccept,
    dismissQuestion,
    todos: deps.todos,
    dock: () => store.dock,
    closing: () => store.closing,
    opening: () => store.opening,
  }
}

export type DeviceSessionComposerState = ReturnType<typeof createDeviceSessionComposerState>
