const STALE_ROUTE_RE = /device not connected/i

/** 重新拉取设备详情，normalizeDevice 会顺带刷新 cluster 缓存。 */
export async function refreshClusterAPIURL(deviceId: string): Promise<void> {
  // 动态引入避免测试/服务端加载 api.ts 时触发客户端依赖（solid-js/router）。
  const { deviceApi } = await import("./api")
  await deviceApi.get(deviceId)
}

/**
 * 设备路由失效重试：fn 因"device not connected"失败时，
 * 刷新该设备的 clusterAPIURL 缓存后重试一次（覆盖设备换集群场景）。
 */
export async function withClusterRetry<T>(
  deviceId: string,
  fn: () => Promise<T>,
  refresh: (deviceId: string) => Promise<void> = refreshClusterAPIURL,
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (!(err instanceof Error) || !STALE_ROUTE_RE.test(err.message)) throw err
    await refresh(deviceId).catch(() => {})
    return await fn()
  }
}
