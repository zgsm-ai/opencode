import { createEffect, createMemo, on, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import type { PermissionRequest, QuestionRequest, Todo } from "@opencode-ai/sdk/v2"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import type { SessionChatBackend } from "@/context/session-chat"
import { useSessionComposerRegistry, type SessionComposerRegistryValue } from "@/context/session-composer-registry"
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
  const registry: SessionComposerRegistryValue = useSessionComposerRegistry()

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

  createEffect(() => {
    const sid = deps.sessionID()
    const initialDock = deps.todos().length > 0 && !done()
    registry.ensure(sid, { dock: initialDock, closing: false, opening: false })
  })

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
    const targetSid = deps.sessionID()
    timer = window.setTimeout(() => {
      registry.set(targetSid, { dock: false, closing: false })
      timer = undefined
    }, closeMs())
  }

  createEffect(
    on(
      () => [deps.todos().length, done()] as const,
      ([count, complete], prev) => {
        if (raf) cancelAnimationFrame(raf)
        raf = undefined

        const sid = deps.sessionID()
        const ui = registry.get(sid)

        if (count === 0) {
          if (timer) window.clearTimeout(timer)
          timer = undefined
          registry.set(sid, { dock: false, closing: false, opening: false })
          return
        }

        if (!complete) {
          if (timer) window.clearTimeout(timer)
          timer = undefined
          const hidden = !ui.dock || ui.closing
          registry.set(sid, { dock: true, closing: false })
          if (hidden) {
            registry.set(sid, { opening: true })
            raf = requestAnimationFrame(() => {
              registry.set(sid, { opening: false })
              raf = undefined
            })
            return
          }
          registry.set(sid, { opening: false })
          return
        }

        if (prev && prev[1]) {
          if (ui.closing && !timer) scheduleClose()
          return
        }

        if (ui.dock && !ui.closing) {
          registry.set(sid, { dock: true, opening: false, closing: true })
          scheduleClose()
        } else {
          registry.set(sid, { dock: false, closing: false, opening: false })
        }
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
    dock: () => registry.get(deps.sessionID()).dock,
    closing: () => registry.get(deps.sessionID()).closing,
    opening: () => registry.get(deps.sessionID()).opening,
  }
}

export type DeviceSessionComposerState = ReturnType<typeof createDeviceSessionComposerState>
