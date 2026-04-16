import { createContext, useContext, type ParentProps } from "solid-js"
import { createResource } from "solid-js"
import { useDeviceSDK } from "./device-sdk"
import type { VcsInfo } from "@opencode-ai/sdk/v2/client"

type DeviceProjectValue = {
  worktree: string
  directory: string
  vcs: VcsInfo | undefined
  vcsLoading: boolean
  reloadVcs: () => void
}

const DeviceProjectContext = createContext<DeviceProjectValue>()

export function useDeviceProject() {
  const ctx = useContext(DeviceProjectContext)
  if (!ctx) throw new Error("useDeviceProject must be used within DeviceProjectProvider")
  return ctx
}

export { DeviceProjectContext }

export function DeviceProjectProvider(props: ParentProps) {
  const device = useDeviceSDK()

  const [vcs, { refetch: reloadVcs }] = createResource(async () => {
    try {
      const result = await device.client.runtime.vcs()
      return result as VcsInfo | undefined
    } catch {
      return undefined
    }
  })

  const value: DeviceProjectValue = {
    get worktree() {
      return device.directory
    },
    get directory() {
      return device.directory
    },
    get vcs() {
      return vcs()
    },
    get vcsLoading() {
      return vcs.loading
    },
    reloadVcs,
  }

  return <DeviceProjectContext.Provider value={value}>{props.children}</DeviceProjectContext.Provider>
}
