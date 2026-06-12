import { createContext, useContext } from "solid-js"

export type PermissionRespondFn = (input: {
  sessionID: string
  permissionID: string
  response: "once" | "always" | "reject"
  directory?: string
}) => void

export type PermissionValue = {
  ready: () => boolean
  respond: PermissionRespondFn
  autoResponds: (permission?: any) => boolean
  isAutoAccepting: () => boolean
  toggleAutoAccept: () => void
  enableAutoAccept: () => void
  disableAutoAccept: () => void
  permissionsEnabled: () => boolean
}

export const PermissionContext = createContext<PermissionValue>()

export function usePermission() {
  return useContext(PermissionContext)
}
