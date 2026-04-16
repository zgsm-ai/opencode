import { createContext, useContext } from "solid-js"
import type { DeviceClient } from "@/client/device-client"

type DeviceClientValue = {
  client: DeviceClient
  url: string
  createClient: (opts: { directory: string; throwOnError?: boolean }) => DeviceClient
}

const DeviceClientContext = createContext<DeviceClientValue>()

export function useDeviceClient() {
  const ctx = useContext(DeviceClientContext)
  if (!ctx) throw new Error("useDeviceClient must be used within DeviceClientProvider")
  return ctx
}

export { DeviceClientContext }
