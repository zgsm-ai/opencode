import { createEffect, Show, type ParentProps } from "solid-js"
import { useLocation } from "@solidjs/router"
import { useAuth } from "@/context/auth"
import { getLoginUrl } from "@/pages/store/lib/auth"

export default function AuthGuard(props: ParentProps) {
  const auth = useAuth()
  const location = useLocation()

  createEffect(() => {
    if (auth.loading()) return
    if (!auth.user()) window.location.href = getLoginUrl(location.pathname + location.search + location.hash)
  })

  return <Show when={!auth.loading() && auth.user()}>{props.children}</Show>
}
