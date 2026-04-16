import { createContext, useContext } from "solid-js"
import type { DeviceClient } from "@/client/device-client"

type DeviceSDKValue = {
  client: DeviceClient
  directory: string
  url: string
  createClient: (opts: { directory: string; throwOnError?: boolean }) => DeviceClient
}

const DeviceSDKContext = createContext<DeviceSDKValue>()

export function useDeviceSDK() {
  const ctx = useContext(DeviceSDKContext)
  if (!ctx) throw new Error("useDeviceSDK must be used within DeviceSDKProvider")
  return ctx
}

export { DeviceSDKContext }
