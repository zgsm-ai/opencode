import { createContext, useContext } from "solid-js"

type GlobalSyncValue = {
  data: {
    ready: boolean
    error: string | undefined
    session_todo: Record<string, any[]>
    [key: string]: any
  }
  set: (...args: any[]) => void
  ready: boolean
  error: string | undefined
  child: (dir?: string, options?: { bootstrap?: boolean }) => readonly [any, (...args: any[]) => void]
  bootstrap: () => Promise<void>
  project: {
    loadSessions: () => Promise<void>
    meta: (...args: any[]) => any
    icon: (...args: any[]) => any
  }
  todo: { set: () => void }
}

const globalSyncStub: GlobalSyncValue = {
  data: { ready: true, error: undefined, session_todo: {} },
  set: () => {},
  get ready() {
    return true
  },
  get error() {
    return undefined
  },
  child: () => [{ path: {} } as any, () => {}] as const,
  bootstrap: async () => {},
  project: {
    loadSessions: async () => {},
    meta: () => {},
    icon: () => {},
  },
  todo: { set: () => {} },
}

export const GlobalSyncContext = createContext<GlobalSyncValue>(globalSyncStub)

export function useGlobalSync() {
  return useContext(GlobalSyncContext)
}
