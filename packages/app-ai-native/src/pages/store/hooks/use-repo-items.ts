import { createSignal, createEffect } from "solid-js"
import { env } from "@/lib/env"
import { itemApi, type CapabilityItem, type Repository } from "../lib/api"

const API_BASE = env.API_URL

async function getRepoRegistry(repoId: string): Promise<{ id: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/repositories/${repoId}/registry`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export function useRepoItems(selectedRepo: () => Repository | null, itemType: string) {
  const [items, setItems] = createSignal<CapabilityItem[]>([])
  const [loading, setLoading] = createSignal(false)

  createEffect(() => {
    const repo = selectedRepo()
    if (!repo) {
      setItems([])
      return
    }
    setLoading(true)
    getRepoRegistry(repo.id)
      .then((registry) => {
        if (!registry) {
          setItems([])
          setLoading(false)
          return
        }
        return itemApi.list({ type: itemType, registryId: registry.id, pageSize: 100 })
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
