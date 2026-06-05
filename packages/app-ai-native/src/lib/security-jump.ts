import { env } from "@/lib/env"

/**
 * Build the security platform URL with from_opencode flag.
 * security-frontend will detect this flag and auto-initiate Casdoor OAuth.
 * Since both apps use the same Casdoor instance on the same domain,
 * the SSO session will auto-authenticate the user.
 */
export function buildSecurityUrl(): string {
  const base = env.SECURITY_FRONTEND_URL
  return `${base}/?from_opencode=1`
}
