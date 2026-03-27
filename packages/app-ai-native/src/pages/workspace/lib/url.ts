import { env } from "@/lib/env"

export function getProxyUrl(deviceId: string) {
    const appUrl = env.APP_URL
    return `${appUrl}/cloud/device/${deviceId}/proxy`
}