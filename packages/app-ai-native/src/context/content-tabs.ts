import { createContext, useContext } from "solid-js"
import { createStore, produce } from "solid-js/store"

type TabKind = "file" | "session" | "terminal" | "diff"

export type ContentTab = {
  id: string
  kind: TabKind
  title: string
  icon?: string
  meta: Record<string, any>
}

type TabStore = {
  tabs: ContentTab[]
  activeId: string | undefined
}

function makeTabId(kind: TabKind, key: string) {
  return `${kind}::${key}`
}

export function createContentTabStore() {
  const [store, setStore] = createStore<TabStore>({
    tabs: [],
    activeId: undefined,
  })

  let _openPending: string | undefined

  const open = (tab: Omit<ContentTab, "id"> & { key: string }) => {
    const id = makeTabId(tab.kind, tab.key)
    _openPending = id
    setStore(
      produce((draft) => {
        const exists = draft.tabs.some((t) => t.id === id)
        if (!exists) {
          draft.tabs.push({ ...tab, id })
        }
        draft.activeId = id
      }),
    )
    queueMicrotask(() => { _openPending = undefined })
  }

  const close = (id: string) => {
    setStore(
      produce((draft) => {
        const idx = draft.tabs.findIndex((t) => t.id === id)
        if (idx === -1) return
        draft.tabs.splice(idx, 1)
        if (draft.activeId === id) {
          const next = draft.tabs[Math.min(idx, draft.tabs.length - 1)]
          draft.activeId = next?.id
        }
      }),
    )
  }

  const activate = (id: string) => {
    if (_openPending && id !== _openPending) return
    const exists = store.tabs.some((t) => t.id === id)
    if (exists) setStore("activeId", id)
  }

  const reorder = (fromId: string, toId: string) => {
    setStore(
      produce((draft) => {
        const fromIdx = draft.tabs.findIndex((t) => t.id === fromId)
        const toIdx = draft.tabs.findIndex((t) => t.id === toId)
        if (fromIdx === -1 || toIdx === -1) return
        const [moved] = draft.tabs.splice(fromIdx, 1)
        draft.tabs.splice(toIdx, 0, moved)
      }),
    )
  }

  const replace = (oldId: string, tab: Omit<ContentTab, "id"> & { key: string }) => {
    const newId = makeTabId(tab.kind, tab.key)
    _openPending = newId
    setStore(
      produce((draft) => {
        const idx = draft.tabs.findIndex((t) => t.id === oldId)
        if (idx === -1) return
        draft.tabs[idx] = { ...tab, id: newId }
        if (draft.activeId === oldId) {
          draft.activeId = newId
        }
      }),
    )
    queueMicrotask(() => { _openPending = undefined })
  }

  const updateMeta = (id: string, meta: Record<string, any>) => {
    setStore(
      produce((draft) => {
        const tab = draft.tabs.find((t) => t.id === id)
        if (tab) Object.assign(tab.meta, meta)
      }),
    )
  }

  const setTitle = (id: string, title: string) => {
    setStore(
      produce((draft) => {
        const tab = draft.tabs.find((t) => t.id === id)
        if (tab) tab.title = title
      }),
    )
  }

  const closeAll = () => {
    setStore(
      produce((draft) => {
        draft.tabs = []
        draft.activeId = undefined
      }),
    )
  }

  return {
    tabs: () => store.tabs,
    activeId: () => store.activeId,
    active: () => store.tabs.find((t) => t.id === store.activeId),
    open,
    close,
    closeAll,
    activate,
    reorder,
    replace,
    updateMeta,
    setTitle,
    makeTabId,
  }
}

export type ContentTabStore = ReturnType<typeof createContentTabStore>

const ContentTabContext = createContext<ContentTabStore>()

export function useContentTabs() {
  const ctx = useContext(ContentTabContext)
  if (!ctx) throw new Error("useContentTabs must be used within ContentTabProvider")
  return ctx
}

export { ContentTabContext }
