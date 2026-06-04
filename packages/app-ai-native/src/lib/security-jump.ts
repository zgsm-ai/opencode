import { env } from "@/lib/env"

const PREFIX = env.API_PREFIX

/**
 * Get Casdoor access token from cloud API for cross-app authentication.
 * The cloud API must expose GET /api/auth/casdoor-token.
 */
export async function getCasdoorToken(): Promise<string> {
  const res = await fetch(`${PREFIX}/api/auth/casdoor-token`, {
    credentials: "include",
  })
  if (!res.ok) {
    throw new Error(`Failed to get Casdoor token: ${res.status}`)
  }
  const data = await res.json()
  if (!data.access_token) {
    throw new Error("No access_token in response")
  }
  return data.access_token
}

/**
 * Build the security platform URL with Casdoor token for auto-login.
 * @param token - Casdoor access token
 * @returns Full URL to redirect to security-frontend
 */
export function buildSecurityUrl(token: string): string {
  const base = env.SECURITY_FRONTEND_URL
  return `${base}/?casdoor_token=${encodeURIComponent(token)}`
}
