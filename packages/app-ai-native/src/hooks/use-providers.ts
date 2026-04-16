import { useGlobalSync } from "@/context/global-sync"
import type { ProviderCapabilitiesResponse } from "@/context/global-sync/types"
import { decode64 } from "@/utils/base64"
import { useParams } from "@solidjs/router"
import { createMemo, useContext } from "solid-js"
import { DeviceWorkspaceContext } from "@/context/device-workspace"

const EMPTY: ProviderCapabilitiesResponse = { connected: [] }

export function useProviders() {
  const workspace = useContext(DeviceWorkspaceContext)

  if (workspace) {
    const connected = createMemo(() => workspace.data.provider.connected)
    const paid = createMemo(() =>
      connected().filter((p: any) => p.id !== "opencode" || Object.values(p.models).find((m: any) => m.cost?.input)),
    )
    return { connected, paid }
  }

  const globalSync = useGlobalSync()
  const params = useParams()
  const currentDirectory = createMemo(() => {
    const value = decode64(params.dir)
    if (!value?.trim()) return ""
    return value
  })
  const providers = createMemo(() => {
    const dir = currentDirectory()
    const [projectStore] = globalSync.child(dir || "")
    return projectStore.provider
  })
  const connected = createMemo(() => providers().connected)
  const paid = createMemo(() =>
    connected().filter((p) => p.id !== "opencode" || Object.values(p.models).find((m) => m.cost?.input)),
  )
  return {
    connected,
    paid,
  }
}
