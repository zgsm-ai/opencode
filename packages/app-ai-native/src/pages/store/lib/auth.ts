import { env } from "@/lib/env"

export interface CasdoorUser {
  sub: string
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
  const basePath = env.BASE_PATH ?? ""
  const origin = window.location.origin

  const params = new URLSearchParams()
  // Full redirect target after login completes (origin + basePath + route path)
  params.set("redirect_to", origin + basePath + (redirectTo || "/"))
  // Callback URL on the frontend host so Set-Cookie lands on the correct domain.
  // Casdoor will redirect here; Vite proxy (dev) or nginx (prod) forwards to the backend.
  params.set("callback_url", origin + prefix + "/api/auth/callback")
  return `${prefix}/api/auth/login?${params.toString()}`
}
