import { createSignal, createEffect } from "solid-js"
import { itemApi, type CapabilityItem, type Organization } from "../lib/api"

const API_BASE = import.meta.env.VITE_API_URL ?? ""

async function getOrgRegistry(orgId: string): Promise<{ id: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/organizations/${orgId}/registry`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export function useOrgItems(selectedOrg: () => Organization | null, itemType: string) {
  const [items, setItems] = createSignal<CapabilityItem[]>([])
  const [loading, setLoading] = createSignal(false)

  createEffect(() => {
    const org = selectedOrg()
    if (!org) {
      setItems([])
      return
    }
    setLoading(true)
    getOrgRegistry(org.id)
      .then((registry) => {
        if (!registry) {
          setItems([])
          setLoading(false)
          return
        }
        return itemApi.list({ type: itemType, registryId: registry.id, limit: 100 })
      })
      .then((res) => {
        setItems(res?.items ?? [])
      })
      .catch(() => {
        setItems([])
      })
      .finally(() => {
        setLoading(false)
      })
  })

  return { items, loading }
}
