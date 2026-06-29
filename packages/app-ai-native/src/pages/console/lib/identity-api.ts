import { apiFetch } from "@/pages/store/lib/api"
import { env } from "@/lib/env"

export interface AuthIdentity {
  provider: string
  displayName: string | null
  email: string | null
  phone: string | null
  isPrimary: boolean
  lastLoginAt: string | null
}

export async function listIdentities(): Promise<AuthIdentity[]> {
  const res = await apiFetch<{ identities: AuthIdentity[] }>("/api/auth/identities")
  return res.identities ?? []
}

export async function startBind(provider: string, redirectTo?: string): Promise<string> {
  const prefix = env.API_PREFIX
  const basePath = env.BASE_PATH || "/"

  const res = await apiFetch<{ authUrl: string }>("/api/auth/bind/start", {
    method: "POST",
    body: JSON.stringify({
      provider,
      redirectTo: redirectTo ?? new URL((basePath === "/" ? "" : basePath) + "/console/identity", window.location.origin).href,
      callbackUrl: new URL(prefix + "/api/auth/callback", window.location.origin).href,
    }),
  })
  return res.authUrl
}

export async function unbindIdentity(provider: string): Promise<{ requireRelogin: boolean }> {
  return apiFetch<{ requireRelogin: boolean }>(`/api/auth/identities/${provider}/unbind`, {
    method: "POST",
  })
}

export async function confirmMerge(mergeToken: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/api/auth/bind/confirm-merge", {
    method: "POST",
    body: JSON.stringify({ merge_token: mergeToken }),
  })
}

export async function cancelMerge(mergeToken: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/api/auth/bind/cancel-merge", {
    method: "POST",
    body: JSON.stringify({ merge_token: mergeToken }),
  })
}
