import { createContext, useContext, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import type { Workspace } from "./types"

type Store = {
  id?: string
  workspace?: Workspace
}

function createActiveWorkspace() {
  const [store, set] = createStore<Store>({})

  return {
    get id() {
      return store.id
    },
    get workspace() {
      return store.workspace
    },
    setActive(id: string, workspace?: Workspace) {
      set("id", id)
      if (workspace) set("workspace", workspace)
    },
    clear() {
      set("id", undefined)
      set("workspace", undefined)
    },
  }
}

const Ctx = createContext<ReturnType<typeof createActiveWorkspace>>()

export function ActiveWorkspaceProvider(props: ParentProps) {
  return <Ctx.Provider value={createActiveWorkspace()}>{props.children}</Ctx.Provider>
}

export function useActiveWorkspace() {
  return useContext(Ctx)
}
