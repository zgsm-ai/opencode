import { env } from "@/lib/env"

export interface CasdoorUser {
  // Current backend-aligned fields
  id: string
  subjectId?: string
  username?: string
  avatarUrl?: string
  casdoorUniversalId?: string
  systemRoles?: string[]

  // Backward-compatible aliases still used by existing UI code
  sub?: string
  name?: string
  preferred_username?: string
  email?: string
  picture?: string
  owner?: string
}

/**
 * Returns the backend login URL that redirects to Casdoor OAuth.
 * The backend handles all OAuth details (client_id, endpoint, etc.),
 * the frontend provides the full redirect URL (including origin) so that
 * different developers on different local ports can all use the same backend.
 *
 * NOTE: The returned URL is a same-origin relative path. Callers must use
 * window.location.href (not <a href>) to navigate, otherwise SolidJS Router
 * will intercept the click and prevent the actual browser navigation.
 */
export function getLoginUrl(redirectTo?: string) {
  const prefix = env.API_PREFIX ?? ""
  const base = (env.BASE_PATH ?? "").replace(/\/+$/, "")
  const origin = window.location.origin
  const path = redirectTo ? (redirectTo.startsWith("/") ? redirectTo : `/${redirectTo}`) : "/"
  const route = base && (path === base || path.startsWith(`${base}/`)) ? path.slice(base.length) || "/" : path

  const params = new URLSearchParams()
  // Full redirect target after login completes (origin + base path + route path)
  params.set("redirect_to", origin + base + route)
  // Callback URL on the frontend host so Set-Cookie lands on the correct domain.
  // Casdoor will redirect here; Vite proxy (dev) or nginx (prod) forwards to the backend.
  params.set("callback_url", origin + prefix + "/api/auth/callback")
  return `${prefix}/api/auth/login?${params.toString()}`
}
