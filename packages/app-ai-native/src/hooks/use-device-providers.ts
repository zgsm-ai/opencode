import { useDeviceWorkspace } from "@/context/device-workspace"
import { useDeviceSDK } from "@/context/device-sdk"
import type { ProviderCapabilitiesResponse } from "@/context/global-sync/types"
import { createMemo } from "solid-js"
import { createResource } from "solid-js"

const EMPTY: ProviderCapabilitiesResponse = { connected: [] }

export function useDeviceProviders() {
  const workspace = useDeviceWorkspace()
  const device = useDeviceSDK()

  const [providers] = createResource(async () => {
    if (!workspace.agentAvailable()) return EMPTY
    try {
      const result = await device.client.agent.models()
      return (result as any)?.data ?? EMPTY
    } catch {
      return EMPTY
    }
  })

  const connected = createMemo(() => providers()?.connected ?? [])
  const paid = createMemo(() =>
    connected().filter((p: any) => p.id !== "opencode" || Object.values(p.models).find((m: any) => m.cost?.input)),
  )

  return {
    connected,
    paid,
  }
}
