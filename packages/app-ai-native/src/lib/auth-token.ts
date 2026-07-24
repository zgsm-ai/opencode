// Shared helpers for attaching the user session token to cross-origin requests
// against a device's clusterAPIURL proxy.
//
// The session token lives in the `zgsmAdminToken` cookie, which the auth
// callback sets with HttpOnly=false specifically so the frontend can read it
// (see server/internal/handlers/handlers.go). SameSite defaults to Lax, so the
// browser does NOT send that cookie on cross-origin fetch / EventSource /
// WebSocket handshakes -- which is why cross-cluster terminal access 401s when
// relying on credentials:"include" alone. These helpers attach the token
// explicitly instead: as an Authorization header for fetch, and as a ?token=
// query parameter for the browser-native WebSocket / EventSource APIs that
// cannot set headers.

const AUTH_TOKEN_COOKIE = "zgsmAdminToken"

/** Reads the session JWT from the auth cookie. Returns "" when unavailable
 *  (not logged in, or running outside the browser). */
export function getAuthToken(): string {
  if (typeof document === "undefined") return ""
  const match = document.cookie.match(/(?:^|;\s*)zgsmAdminToken=([^;]+)/)
  return match?.[1] ?? ""
}

/** Headers carrying the session token, for fetch() calls. Empty when no token. */
export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Appends ?token= (or &token=) to a URL for WebSocket / EventSource handshakes.
 *  Returns the URL unchanged when no token is available so same-origin callers
 *  keep relying on cookies. */
export function withTokenQuery(url: string): string {
  const token = getAuthToken()
  if (!token) return url
  const parsed = new URL(url)
  parsed.searchParams.set("token", token)
  return parsed.toString()
}
