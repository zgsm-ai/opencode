import { Log } from "../../util/log"
import { autoEnableCloudFavorites, type EnablePendingSummary } from "./favorite"

const log = Log.create({ service: "cloud-favorite-sync" })

/** 与 csc 端保持一致的基准间隔。 */
const DEFAULT_INTERVAL_MS = 300_000

/** 列表接口顺带触发同步的最小间隔，避免频繁刷新 /hub 反复打云端。 */
const LIST_TRIGGER_THROTTLE_MS = 10_000

let timer: ReturnType<typeof setInterval> | undefined
let inFlight = false
let lastSyncAt = 0

/**
 * 跑一轮订阅即启用。
 *
 * 防重入：网络慢时上一轮可能尚未结束，若放任叠加，多个 enablePendingFavorites
 * 会并发读-改-写同一份 state.json，last-write-wins 会丢记录和水位线。
 */
async function runOnce(): Promise<EnablePendingSummary | undefined> {
  if (inFlight) return undefined
  inFlight = true
  try {
    const summary = await autoEnableCloudFavorites()
    if (!summary) return undefined
    if (summary.enabled.length > 0 || summary.reactivated.length > 0) {
      log.info("auto-enabled cloud favorites", {
        enabled: summary.enabled.length,
        reactivated: summary.reactivated.length,
      })
    }
    if (summary.errors.length > 0) {
      log.warn("cloud favorites auto-enable reported errors", {
        count: summary.errors.length,
        first: summary.errors[0]?.message,
      })
    }
    return summary
  } finally {
    lastSyncAt = Date.now()
    inFlight = false
  }
}

/**
 * 启动后台周期同步。未登录或云端不可达时 autoEnableCloudFavorites 静默返回
 * undefined，因此这里无需额外的鉴权判断。
 */
export function startCloudFavoritesSync(opts: { intervalMs?: number } = {}): () => void {
  stopCloudFavoritesSync()
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS
  // 立即跑一次：用户在 web 上订阅后不必等满一个周期才生效。
  void runOnce()
  timer = setInterval(() => void runOnce(), intervalMs)
  // 不要让这个定时器拖住进程退出。
  ;(timer as { unref?: () => void }).unref?.()
  return stopCloudFavoritesSync
}

export function stopCloudFavoritesSync(): void {
  if (timer) {
    clearInterval(timer)
    timer = undefined
  }
}

/**
 * 供 /hub 打开时立即触发一轮，不必等下一个周期。
 * 与后台循环共用同一把 inFlight 锁，不会与之并发写 state.json。
 */
export async function syncCloudFavoritesNow(): Promise<EnablePendingSummary | undefined> {
  return runOnce()
}

/**
 * 收藏列表接口顺带触发的同步。
 *
 * workspace 的 /hub 面板经 cs-cloud 转发到 GET /global/favorite/skills，
 * 在这里同步一次，用户打开面板即可看到与 csc 一致的启用状态，无需等待后台
 * 周期。节流到 {@link LIST_TRIGGER_THROTTLE_MS}，避免反复刷新面板时空转；
 * 静默失败，未登录或云端不可达都不应让列表接口跟着失败。
 */
export async function syncCloudFavoritesForList(): Promise<void> {
  if (Date.now() - lastSyncAt < LIST_TRIGGER_THROTTLE_MS) return
  try {
    await runOnce()
  } catch {
    // 列表本身仍应正常返回
  }
}
