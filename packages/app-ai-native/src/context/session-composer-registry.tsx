import { createContext, useContext, type ParentProps } from "solid-js"
import { createStore, produce } from "solid-js/store"

export type ComposerUIState = {
  queued: string[]
  dock: boolean
  closing: boolean
  opening: boolean
}

const DEFAULT: ComposerUIState = {
  queued: [],
  dock: false,
  closing: false,
  opening: false,
}

const NEW_SESSION_KEY = "__new__"
const MAX_ENTRIES = 50

export type SessionComposerRegistryValue = {
  get: (sessionID: string | undefined) => ComposerUIState
  ensure: (sessionID: string | undefined, init?: Partial<ComposerUIState>) => void
  set: (sessionID: string | undefined, patch: Partial<ComposerUIState>) => void
  remove: (sessionID: string) => void
}

const SessionComposerRegistryContext = createContext<SessionComposerRegistryValue>()

export function useSessionComposerRegistry() {
  const ctx = useContext(SessionComposerRegistryContext)
  if (!ctx) throw new Error("useSessionComposerRegistry must be used within SessionComposerRegistryProvider")
  return ctx
}

const keyOf = (sid: string | undefined) => sid ?? NEW_SESSION_KEY

export function SessionComposerRegistryProvider(props: ParentProps) {
  const [state, setState] = createStore<Record<string, ComposerUIState>>({})

  const prune = () => {
    const keys = Object.keys(state)
    if (keys.length <= MAX_ENTRIES) return
    const drop = keys.slice(0, keys.length - MAX_ENTRIES)
    setState(
      produce((s) => {
        for (const k of drop) delete s[k]
      }),
    )
  }

  const ensure: SessionComposerRegistryValue["ensure"] = (sid, init) => {
    const key = keyOf(sid)
    if (state[key]) return
    setState(key, { ...DEFAULT, ...init })
    prune()
  }

  const get: SessionComposerRegistryValue["get"] = (sid) => {
    const key = keyOf(sid)
    return state[key] ?? DEFAULT
  }

  const set: SessionComposerRegistryValue["set"] = (sid, patch) => {
    const key = keyOf(sid)
    if (!state[key]) {
      setState(key, { ...DEFAULT, ...patch })
      prune()
      return
    }
    setState(key, patch)
  }

  const remove: SessionComposerRegistryValue["remove"] = (sid) => {
    const key = keyOf(sid)
    setState(
      produce((s) => {
        delete s[key]
      }),
    )
  }

  const value: SessionComposerRegistryValue = { get, ensure, set, remove }

  return <SessionComposerRegistryContext.Provider value={value}>{props.children}</SessionComposerRegistryContext.Provider>
}
