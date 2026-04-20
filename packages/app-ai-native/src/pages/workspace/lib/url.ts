import { env } from "@/lib/env"

export function getProxyUrl(deviceId: string) {
  const prefix = (env.API_PREFIX || "").replace(/\/+$/, "")
  return `${prefix}/cloud/device/${deviceId}/proxy`
}
