import { createContext, useContext, type ParentProps } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { createMemo, createRoot, onCleanup, batch } from "solid-js"
import { useServer } from "@/context/server"
import { useDeviceSDK } from "@/context/device-sdk"
import { Persist, persisted, removePersisted } from "@/utils/persist"
import { CloudTerminalApi } from "@/lib/cloud-terminal-api"

export type LocalPTY = {
  id: string
  title: string
  titleNumber: number
  rows?: number
  cols?: number
  buffer?: string
  scrollY?: number
  cursor?: number
}

const MAX_TERMINAL_SESSIONS = 20

const numberFromTitle = (title: string) => {
  const match = title.match(/^Terminal (\d+)$/)
  if (!match) return
  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) return
  return value
}

function createDeviceTerminalSession(deviceId: string, directory: string, server: ReturnType<typeof useServer>) {
  const persistTarget = Persist.device(deviceId, `terminal:${directory}`)

  const [store, setStore, _, ready] = persisted(
    persistTarget,
    createStore<{
      active?: string
      all: LocalPTY[]
    }>({
      all: [],
    }),
  )

  const pickNextTerminalNumber = () => {
    const existingTitleNumbers = new Set(
      store.all.flatMap((pty) => {
        const direct = Number.isFinite(pty.titleNumber) && pty.titleNumber > 0 ? pty.titleNumber : undefined
        if (direct !== undefined) return [direct]
        const parsed = numberFromTitle(pty.title)
        if (parsed === undefined) return []
        return [parsed]
      }),
    )

    return (
      Array.from({ length: existingTitleNumbers.size + 1 }, (_, index) => index + 1).find(
        (number) => !existingTitleNumbers.has(number),
      ) ?? 1
    )
  }

  const cloudApi = (): CloudTerminalApi | null => {
    const s = server.current
    if (!s) return null
    return new CloudTerminalApi({ server: s, deviceId })
  }

  return {
    ready,
    all: createMemo(() => store.all),
    active: createMemo(() => store.active),
    clear() {
      batch(() => {
        setStore("active", undefined)
        setStore("all", [])
      })
    },
    new(): Promise<string | undefined> {
      const nextNumber = pickNextTerminalNumber()
      const api = cloudApi()
      if (!api) return Promise.resolve(undefined)

      return api.create(directory, 24, 80)
        .then((session) => {
          const id = session.sessionId
          setStore("all", store.all.length, {
            id,
            title: `Terminal ${nextNumber}`,
            titleNumber: nextNumber,
          })
          return id
        })
        .catch((error: unknown) => {
          console.error("Failed to create cloud terminal", error)
          return undefined
        })
    },
    update(pty: Partial<LocalPTY> & { id: string }) {
      const index = store.all.findIndex((x) => x.id === pty.id)
      if (index >= 0) {
        setStore("all", index, (item) => ({ ...item, ...pty }))
      }
      const api = cloudApi()
      if (api && pty.cols && pty.rows) {
        api.resize(pty.id, pty.rows, pty.cols).catch((error: unknown) => {
          console.error("Failed to update cloud terminal", error)
        })
      }
    },
    async clone(id: string) {
      const index = store.all.findIndex((x) => x.id === id)
      const pty = store.all[index]
      if (!pty) return
      const api = cloudApi()
      if (!api) return

      const session = await api.restart(id, directory).catch((error: unknown) => {
        console.error("Failed to clone cloud terminal", error)
        return null
      })
      if (!session) return

      const active = store.active === pty.id
      batch(() => {
        setStore("all", index, {
          id: session.sessionId,
          title: pty.title,
          titleNumber: pty.titleNumber,
          buffer: undefined,
          cursor: undefined,
          scrollY: undefined,
          rows: undefined,
          cols: undefined,
        })
        if (active) {
          setStore("active", session.sessionId)
        }
      })
    },
    open(id: string) {
      setStore("active", id)
    },
    next() {
      const index = store.all.findIndex((x) => x.id === store.active)
      if (index === -1) return
      const nextIndex = (index + 1) % store.all.length
      setStore("active", store.all[nextIndex]?.id)
    },
    previous() {
      const index = store.all.findIndex((x) => x.id === store.active)
      if (index === -1) return
      const prevIndex = index === 0 ? store.all.length - 1 : index - 1
      setStore("active", store.all[prevIndex]?.id)
    },
    async close(id: string) {
      const index = store.all.findIndex((f) => f.id === id)
      if (index !== -1) {
        batch(() => {
          if (store.active === id) {
            const next = index > 0 ? store.all[index - 1]?.id : store.all[1]?.id
            setStore("active", next)
          }
          setStore(
            "all",
            produce((all) => {
              all.splice(index, 1)
            }),
          )
        })
      }

      const api = cloudApi()
      if (api) {
        await api.kill(id).catch((error: unknown) => {
          console.error("Failed to close cloud terminal", error)
        })
      }
    },
    move(id: string, to: number) {
      const index = store.all.findIndex((f) => f.id === id)
      if (index === -1) return
      setStore(
        "all",
        produce((all) => {
          all.splice(to, 0, all.splice(index, 1)[0])
        }),
      )
    },
  }
}

type TerminalSession = ReturnType<typeof createDeviceTerminalSession>

type TerminalCacheEntry = {
  value: TerminalSession
  dispose: VoidFunction
}

const caches = new Set<Map<string, TerminalCacheEntry>>()

export function clearDeviceTerminals(deviceId: string, directory: string, sessionIDs?: string[], platform?: any) {
  const key = `${deviceId}:${directory}`
  for (const cache of caches) {
    const entry = cache.get(key)
    entry?.value.clear()
  }

  const target = Persist.device(deviceId, `terminal:${directory}`)
  removePersisted(target, platform)
}

type DeviceTerminalValue = {
  ready: () => boolean
  all: () => LocalPTY[]
  active: () => string | undefined
  get: (id: string) => LocalPTY | undefined
  clear: () => void
  "new": () => Promise<string | undefined>
  update: (pty: Partial<LocalPTY> & { id: string }) => void
  clone: (id: string) => Promise<void>
  open: (id: string) => void
  close: (id: string) => Promise<void>
  move: (id: string, to: number) => void
  next: () => void
  previous: () => void
}

const DeviceTerminalContext = createContext<DeviceTerminalValue>()

export function DeviceTerminalProvider(props: ParentProps) {
  const server = useServer()
  const device = useDeviceSDK()

  const cache = new Map<string, TerminalCacheEntry>()
  caches.add(cache)
  onCleanup(() => caches.delete(cache))

  const disposeAll = () => {
    for (const entry of cache.values()) {
      entry.dispose()
    }
    cache.clear()
  }

  onCleanup(disposeAll)

  const prune = () => {
    while (cache.size > MAX_TERMINAL_SESSIONS) {
      const first = cache.keys().next().value
      if (!first) return
      const entry = cache.get(first)
      entry?.dispose()
      cache.delete(first)
    }
  }

  const deviceId = createMemo(() => {
    const current = server.current
    if (!current) return ""
    const url = current.http.url
    const match = url.match(/\/cloud\/device\/([^/]+)\/proxy/)
    return match ? match[1] : ""
  })

  const loadSession = (dir: string) => {
    const key = `${deviceId()}:${dir}`
    const existing = cache.get(key)
    if (existing) {
      cache.delete(key)
      cache.set(key, existing)
      return existing.value
    }

    const entry = createRoot((dispose) => ({
      value: createDeviceTerminalSession(deviceId(), dir, server),
      dispose,
    }))

    cache.set(key, entry)
    prune()
    return entry.value
  }

  const terminal = createMemo(() => loadSession(device.directory))

  const value = {
    ready: () => terminal().ready(),
    all: () => terminal().all(),
    active: () => terminal().active(),
    get: (id: string) => terminal().all().find((p) => p.id === id),
    clear: () => terminal().clear(),
    "new": () => terminal().new() as Promise<string | undefined>,
    update: (pty: Partial<LocalPTY> & { id: string }) => terminal().update(pty),
    clone: (id: string) => terminal().clone(id),
    open: (id: string) => terminal().open(id),
    close: (id: string) => terminal().close(id),
    move: (id: string, to: number) => terminal().move(id, to),
    next: () => terminal().next(),
    previous: () => terminal().previous(),
  }

  return (
    <DeviceTerminalContext.Provider value={value}>
      {props.children}
    </DeviceTerminalContext.Provider>
  )
}

export function useDeviceTerminal() {
  const ctx = useContext(DeviceTerminalContext)
  if (!ctx) throw new Error("useDeviceTerminal must be used within DeviceTerminalProvider")
  return ctx
}