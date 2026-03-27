import { createContext, useContext, type Accessor } from "solid-js"
import type { Device, Workspace } from "./types"

type WorkspaceContextValue = {
  workspaces: Accessor<Workspace[]>
  devices: Accessor<Device[]>
  selectedWorkspaceId: Accessor<string | undefined>
  selectedDeviceId: Accessor<string | undefined>
  enabledWorkspaceIds: Accessor<string[]>
  closedWorkspaceIds: Accessor<string[]>
  isLoading: Accessor<boolean>
  selectWorkspace: (id: string) => void
  selectDevice: (id: string) => void
  enableWorkspace: (id: string) => void
  disableWorkspace: (id: string) => void
  createWorkspace: (deviceId: string, directory: string) => Promise<void>
  deleteWorkspace: (workspaceId: string) => void
  renameWorkspace: (workspaceId: string, name: string) => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextValue>()

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider")
  return ctx
}

export function WorkspaceProvider(props: { value: WorkspaceContextValue; children: any }) {
  return <WorkspaceContext.Provider value={props.value}>{props.children}</WorkspaceContext.Provider>
}

export type { WorkspaceContextValue }
