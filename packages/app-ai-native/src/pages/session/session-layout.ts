import { createMemo } from "solid-js"
import { useParams } from "@solidjs/router"
import { useLayout } from "@/context/layout"

export function useSessionKey() {
  const params = useParams<{ dir?: string; id?: string }>()
  const sessionKey = createMemo(() => `${params.dir ?? ""}${params.id ? `/${params.id}` : ""}`)
  return {
    params,
    sessionKey,
  }
}

export function useSessionLayout() {
  const layout = useLayout()
  const route = useSessionKey()
  return {
    ...route,
    tabs: createMemo(() => layout.tabs(route.sessionKey)),
    view: createMemo(() => layout.view(route.sessionKey)),
  }
}
