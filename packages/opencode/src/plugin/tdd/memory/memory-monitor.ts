import { Logger } from "../utils/logger"
import { Global } from "@/global"
import { GlobalBus } from "@/bus/global"
import { heapStats } from "bun:jsc"
import * as v8 from "node:v8"
import path from "path"
import fs from "fs/promises"
import { Event } from "@/server/event"
import { Bus } from "@/bus"

const log = Logger.clone().tag("scope", "memory")

/**
 * 内存监控配置
 *
 * 监控机制说明：
 * - RSS 内存：进程总占用内存，超过阈值时仅记录日志告警
 * - Heap 内存：JavaScript 堆内存，超过阈值时记录日志并生成快照
 *
 * 只有 Heap 内存超过阈值时才会触发快照生成，因为 Heap 快照更能反映内存泄漏问题
 */

function isMemoryMonitorEnabled(): boolean {
  const envValue = process.env.COSTRICT_MEMORY_MONITOR_ENABLED
  if (envValue === undefined || envValue === "") return true
  return envValue !== "false" && envValue !== "0"
}

export interface MemoryMonitorConfig {
  /** 检查间隔（毫秒） */
  checkInterval: number
  /** 保留的快照数量 */
  snapshotRetainCount: number
  /** 内存阈值（GB），RSS 和 Heap 共用同一套阈值 */
  thresholds: number[]
  /** 重启阈值（GB），超过此阈值时触发重启，为 0 时不触发重启 */
  restartThreshold: number
}

export interface MemorySnapshotData {
  timestamp: string
  heapUsedMB: number
  heapThresholdMB: number
  snapshotPath: string
}

export interface MemorySnapshotMetadata {
  filename: string
  path: string
  size: number
  createdAt: string
}

const DEFAULT_CONFIG: MemoryMonitorConfig = {
  checkInterval: 60000,
  snapshotRetainCount: 5,
  thresholds: [4, 6, 10, 15],
  restartThreshold: 2,
}

export class MemoryMonitor {
  private config: MemoryMonitorConfig
  private timer?: ReturnType<typeof setInterval>
  private lastTriggeredHeapThreshold = new Set<number>()
  private lastTriggeredRssThreshold = new Set<number>()
  private lastMemoryLogAt = 0
  private lastMemoryMb = 0
  private _shouldRestart = false
  private restartSuggestionEmitted = false

  constructor(config: Partial<MemoryMonitorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  shouldRestart(): boolean {
    return this._shouldRestart
  }

  clearRestartFlag(): void {
    this._shouldRestart = false
    this.restartSuggestionEmitted = false
  }

  start() {
    if (this.timer) {
      log.error("Memory monitor already started")
      return
    }

    if (!isMemoryMonitorEnabled()) {
      log.info("Memory monitor disabled via COSTRICT_MEMORY_MONITOR_ENABLED")
      return
    }

    log.info("Starting memory monitor", {
      checkInterval: this.config.checkInterval,
      thresholds: this.config.thresholds,
    })

    this.timer = setInterval(() => {
      this.checkMemory().catch((err) => {
        log.error("Memory check failed", { error: err.message })
      })
    }, this.config.checkInterval)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
      log.info("Memory monitor stopped")
    }
  }

  private async checkMemory() {
    const memoryUsage = process.memoryUsage()
    const rssMB = memoryUsage.rss / 1024 / 1024
    const stats = heapStats()
    const heapMB = stats.heapSize / 1024 / 1024

    const now = Date.now()
    const timeSinceLastLog = now - this.lastMemoryLogAt
    const delta = rssMB - this.lastMemoryMb
    const plusSign = delta > 0 ? "+" : ""

    if (timeSinceLastLog > 0) {
      log.info(
        `MemUse ${rssMB.toFixed(2)} mb (${plusSign}${delta.toFixed(2)} mb)` +
          ` | heap ${heapMB.toFixed(2)} mb` +
          ` | heapCap ${(stats.heapCapacity / 1024 / 1024).toFixed(2)} mb` +
          ` | extMem ${(stats.extraMemorySize / 1024 / 1024).toFixed(2)} mb` +
          ` | objs ${(stats.objectCount / 1000).toFixed(1)}k`,
      )
      this.lastMemoryLogAt = now
      this.lastMemoryMb = rssMB
    }

    // 检查重启阈值
    if (this.config.restartThreshold > 0 && !this.restartSuggestionEmitted) {
      const restartThresholdMB = this.config.restartThreshold * 1024
      if (rssMB >= restartThresholdMB || heapMB >= restartThresholdMB) {
        log.info("Restart threshold reached, flagging for restart", {
          rssMB: rssMB.toFixed(2),
          heapMB: heapMB.toFixed(2),
          threshold: this.config.restartThreshold,
        })
        this._shouldRestart = true
        this.restartSuggestionEmitted = true
        Bus.publish(Event.WorkerRestartSuggested, {
          reason: "memory" as const,
          rssMB: rssMB.toFixed(2),
          heapMB: heapMB.toFixed(2),
          threshold: this.config.restartThreshold,
        })
        return
      }
    }

    // 检查阈值
    for (const threshold of this.config.thresholds) {
      const thresholdMB = threshold * 1024

      // RSS 内存告警（仅记录日志）
      if (rssMB >= thresholdMB && !this.lastTriggeredRssThreshold.has(threshold)) {
        log.warn("RSS memory threshold reached", {
          rssMB: rssMB.toFixed(2),
          threshold,
          heapMB: heapMB.toFixed(2),
        })
        this.lastTriggeredRssThreshold.add(threshold)
      }

      // Heap 内存告警（记录日志 + 生成快照）
      if (heapMB >= thresholdMB && !this.lastTriggeredHeapThreshold.has(threshold)) {
        log.warn("Heap memory threshold reached, creating snapshot", {
          heapMB: heapMB.toFixed(2),
          threshold,
          rssMB: rssMB.toFixed(2),
          heapCapacity: (stats.heapCapacity / 1024 / 1024).toFixed(2),
        })

        await this.triggerSnapshot(threshold, heapMB)
        this.lastTriggeredHeapThreshold.add(threshold)
      }
    }
  }

  private async triggerSnapshot(threshold: number, heapUsedMB: number) {
    try {
      const snapshotPath = await this.createSnapshot(threshold, heapUsedMB)

      await this.logSnapshotInfo(threshold, heapUsedMB, snapshotPath)

      await this.cleanupOldSnapshots()

      log.info("Heap memory snapshot completed", {
        threshold,
        heapUsedMB: heapUsedMB.toFixed(2),
        snapshotPath,
      })
    } catch (err) {
      log.error("Failed to create heap snapshot", {
        threshold,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private async logSnapshotInfo(threshold: number, heapUsedMB: number, snapshotPath: string) {
    const heapUsedGB = parseFloat((heapUsedMB / 1024).toFixed(2))

    log.info("Heap snapshot created", {
      threshold,
      heapUsedGB,
      snapshotPath,
    })
  }

  private async createSnapshot(threshold: number, heapUsedMB: number): Promise<string> {
    const snapshotDir = path.join(Global.Path.data, "memory-snapshots")
    await fs.mkdir(snapshotDir, { recursive: true })

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const filename = `heap-${(heapUsedMB / 1024).toFixed(2)}GB-threshold-${threshold}GB-${timestamp}.heapsnapshot`

    const snapshotPath = path.join(snapshotDir, filename)

    const snapshotResult = v8.writeHeapSnapshot(snapshotPath)

    // 添加超时机制防止promise永久挂起
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        if (snapshotResult && typeof snapshotResult === "object" && "on" in snapshotResult) {
          const stream = snapshotResult as { on(event: string, listener: () => void): void }
          stream.on("finish", () => resolve())
          stream.on("error", reject)
        } else {
          resolve()
        }
      }),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Snapshot creation timeout after 30s")), 30000),
      ),
    ])

    log.info("Heap snapshot created", { snapshotPath })
    return snapshotPath
  }

  private async cleanupOldSnapshots() {
    const snapshotDir = path.join(Global.Path.data, "memory-snapshots")

    try {
      const entries = await fs.readdir(snapshotDir, { withFileTypes: true })
      const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => ({
          name: entry.name,
          path: path.join(snapshotDir, entry.name),
        }))

      if (files.length <= this.config.snapshotRetainCount) {
        return
      }

      const fileStats = await Promise.all(
        files.map(async (file) => ({
          ...file,
          stat: await fs.stat(file.path),
        })),
      )

      const sortedFiles = fileStats.sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs)

      const filesToDelete = sortedFiles.slice(0, -this.config.snapshotRetainCount)

      await Promise.all(
        filesToDelete.map(async (file) => {
          await fs.unlink(file.path)
          log.debug("Deleted old snapshot", { path: file.path })
        }),
      )

      log.info("Cleaned up old snapshots", {
        deleted: filesToDelete.length,
        retained: files.length - filesToDelete.length,
      })
    } catch (err) {
      log.error("Failed to cleanup old snapshots", {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  getConfig(): MemoryMonitorConfig {
    return { ...this.config }
  }
}

export { isMemoryMonitorEnabled }
