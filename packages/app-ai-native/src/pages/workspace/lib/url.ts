import { env } from "@/lib/env"

// deviceId -> 设备归属集群的 Server 公网 API 地址。
// 由设备列表/详情接口响应（normalizeDevice）填充；无记录时视为本集群设备。
const clusterCache = new Map<string, string>()

/** 记录/清除设备归属集群的 API 地址（url 为空时清除记录）。 */
export function setDeviceClusterAPIURL(deviceId: string, url: string | null | undefined) {
    if (url) clusterCache.set(deviceId, url)
    else clusterCache.delete(deviceId)
}

export function getProxyUrl(deviceId: string) {
    const base = clusterCache.get(deviceId) || env.APP_URL
    return `${base}/cloud/device/${deviceId}/proxy`
}
