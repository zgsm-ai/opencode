/**
 * 「订阅即启用」的裁决规则 —— 纯函数，无 I/O、无副作用 import。
 *
 * 单独成文件是为了让「用户意图 vs 管理员重推」这条规则能脱离文件系统、网络
 * 和 favorite.ts 的重依赖链被直接单测。favorite.ts 会 re-export 这里的内容，
 * 调用方无需感知这次拆分。
 */

/** planFavoriteEnable 需要的最小输入形状，FavoriteItemWithStatus 结构上满足。 */
export type PlannableFavorite = {
  id: string
  slug: string
  status: "Cloud" | "Downloaded" | "Active" | "Unloaded"
  /** 本客户端已应用过的最新一条 distribution 的 createdAt */
  lastAppliedDistributionAt?: string
}

export type FavoriteEnablePlan = {
  /** 从未激活过的项（Cloud/Downloaded） */
  toEnable: string[]
  /** 用户曾 unload，但管理员推来了更新分发的项 */
  toReactivate: string[]
  /** 启用成功后需要推进的水位线 */
  watermarks: Array<{ slug: string; at: string }>
}

/**
 * 返回比本客户端已应用水位线更新的 distribution.createdAt；没有未见过的分发
 * 则返回 undefined。
 */
export function newDistributionAtFor(
  item: PlannableFavorite,
  distMap: Map<string, string>,
): string | undefined {
  const recvAt = distMap.get(item.id)
  if (!recvAt) return undefined
  if (
    !item.lastAppliedDistributionAt ||
    new Date(recvAt).getTime() > new Date(item.lastAppliedDistributionAt).getTime()
  ) {
    return recvAt
  }
  return undefined
}

/**
 * 决定启用哪些、重启用哪些、推进哪些水位线。规则：
 *  - 从未激活过（非 Active 且非 Unloaded）→ 启用
 *  - 已被用户 unload，且收到比水位线更新的分发 → 穿透重启用
 *  - 已被用户 unload 且无更新分发 → 不动，尊重用户意图
 *  - 任何收到更新分发的项 → 推进水位线，使这条分发日后不再重复穿透
 *
 * 最后一条同样适用于当前已 Active 的项：否则用户之后手动关掉它，这条早已应用
 * 过的旧分发会在下一轮同步里把它重新打开。
 */
export function planFavoriteEnable(
  items: PlannableFavorite[],
  distMap: Map<string, string>,
): FavoriteEnablePlan {
  const toEnable = items.filter((item) => item.status !== "Active" && item.status !== "Unloaded").map((i) => i.slug)
  const toReactivate = items
    .filter((item) => item.status === "Unloaded" && newDistributionAtFor(item, distMap))
    .map((i) => i.slug)
  const watermarks: Array<{ slug: string; at: string }> = []
  for (const item of items) {
    const at = newDistributionAtFor(item, distMap)
    if (at) watermarks.push({ slug: item.slug, at })
  }
  return { toEnable, toReactivate, watermarks }
}
