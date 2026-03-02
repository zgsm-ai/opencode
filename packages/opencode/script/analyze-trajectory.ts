#!/usr/bin/env bun
/**
 * Agent 轨迹分析工具
 *
 * 分析 opencode 保存在 .history_message 中的轨迹 JSON，提供：
 * - 高频工具错误分析
 * - 简洁回放 agent 运行过程
 * - 开发优化洞察
 * - bash 等工具的命令/参数分析
 *
 * Usage:
 *   bun run script/analyze-trajectory.ts                    # 分析 .history_message 目录
 *   bun run script/analyze-trajectory.ts <path>             # 分析指定文件或目录
 *   bun run script/analyze-trajectory.ts <path> --replay    # 简洁回放模式
 *   bun run script/analyze-trajectory.ts <path> --top 10    # 显示 Top N
 *   bun run script/analyze-trajectory.ts <path> -o out.csv  # 导出 CSV
 */

import Table from "cli-table3"
import pc from "picocolors"
import stringWidth from "string-width"

function box(title: string, color: "cyan" | "green" | "yellow" = "cyan"): string {
  const fn = color === "cyan" ? pc.cyan : color === "green" ? pc.green : pc.yellow
  const titleW = stringWidth(title)
  const w = Math.max(24, Math.min(titleW + 4, 70))
  const pad = " ".repeat(Math.max(0, w - 2 - titleW))
  return fn(`\n┌${"─".repeat(w)}┐\n│  ${title}${pad}│\n└${"─".repeat(w)}┘\n`)
}
import path from "path"
import { readdir, readFile, stat } from "fs/promises"
import { existsSync } from "fs"

// 需要人工交互的工具（计算纯 Agent 耗时时排除，避免因用户等待被误判为工具卡住）
const HUMAN_INTERACTION_TOOLS = new Set([
  "question",
  "show_markdown_to_user",
])

function isHumanInteractionTool(name: string): boolean {
  return HUMAN_INTERACTION_TOOLS.has(name)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolCallInfo {
  name: string
  callId: string | null
  arguments: Record<string, unknown>
  success: boolean
  errorMessage: string | null
  resultSize: number | null
  estimatedDurationSeconds: number | null
}

interface StepAnalysis {
  stepNumber: number
  timestamp: string
  durationSeconds: number | null
  toolCalls: ToolCallInfo[]
  toolCallCount: number
  hasError: boolean
  errorMessage: string | null
}

interface TrajectoryFile {
  filePath: string
  sessionId: string
  fileTimestamp: Date
  agentType: string
  agentName: string
  analyses: StepAnalysis[]
}

interface OpenCodeMessage {
  role: string
  content?: Array<{
    type?: string
    toolCallId?: string
    name?: string
    arguments?: Record<string, unknown>
    toolName?: string
    output?: { type?: string; value?: string }
  }>
}

interface ToolExecution {
  callID?: string
  tool?: string
  status?: string
  startedAt?: number
  durationMs?: number
}

interface OpenCodeTrajectory {
  timestamp?: number
  sessionID?: string
  meta?: { agent?: string; agentMode?: string; modelID?: string; providerID?: string }
  actualRequest?: { messages?: OpenCodeMessage[] }
  toolExecutions?: ToolExecution[]
}

// ---------------------------------------------------------------------------
// Parser: OpenCode format (messages) -> StepAnalysis
// ---------------------------------------------------------------------------

function commandSummary(tc: ToolCallInfo): string | null {
  if (!tc.arguments || Object.keys(tc.arguments).length === 0) return null
  if (tc.name === "bash") {
    const cmd = tc.arguments.command
    return typeof cmd === "string" && cmd.trim() ? cmd.trim() : null
  }
  if (tc.name === "str_replace_based_edit_tool") {
    const cmd = tc.arguments.command
    const p = tc.arguments.path
    const viewRange = tc.arguments.view_range
    if (cmd === "view") {
      return viewRange ? `view ${p} range=${JSON.stringify(viewRange)}` : `view ${p}`
    }
    return cmd && p ? `${cmd} ${p}` : null
  }
  if (tc.name === "quick_explore") {
    const target = tc.arguments.exploration_target
    return typeof target === "string" ? target.slice(0, 80) + (target.length > 80 ? "..." : "") : null
  }
  return null
}

function parseOpenCodeTrajectory(data: OpenCodeTrajectory): StepAnalysis[] {
  const messages = data.actualRequest?.messages ?? []
  const analyses: StepAnalysis[] = []
  let stepNumber = 0

  const resultMap = new Map<string, { type: string; value: string }>()
  for (const msg of messages) {
    if (msg.role !== "tool" || !msg.content) continue
    for (const c of msg.content) {
      if (c.type !== "tool-result" || !c.toolCallId) continue
      const out = c.output
      const type = out?.type ?? "text"
      const value = typeof out?.value === "string" ? out.value : ""
      resultMap.set(c.toolCallId, { type, value })
    }
  }

  const durationMap = new Map<string, number>()
  for (const ex of data.toolExecutions ?? []) {
    const id = ex.callID
    const ms = ex.durationMs
    if (id != null && typeof ms === "number" && ms >= 0) {
      durationMap.set(id, ms / 1000)
    }
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (!msg || msg.role !== "assistant" || !msg.content) continue

    const toolCalls: ToolCallInfo[] = []
    for (const c of msg.content) {
      if (c.type !== "tool-call" || !c.name) continue

      const callId = c.toolCallId ?? null
      const args = c.arguments ?? {}
      const result = callId ? resultMap.get(callId) : null
      const durationSec = callId ? durationMap.get(callId) ?? null : null

      const isError = result?.type === "error-text" || (result?.value && result.value.startsWith("Error:"))
      const success = !isError
      const errorMessage = isError && result?.value ? result.value : null
      const resultSize = result?.value ? result.value.length : null

      toolCalls.push({
        name: c.name,
        callId,
        arguments: args,
        success,
        errorMessage,
        resultSize,
        estimatedDurationSeconds: durationSec,
      })
    }

    if (toolCalls.length === 0) continue

    stepNumber++
    const hasError = toolCalls.some((t) => !t.success)
    const errorMessage = toolCalls.find((t) => t.errorMessage)?.errorMessage ?? null
    const stepDuration = toolCalls.reduce((s, t) => s + (t.estimatedDurationSeconds ?? 0), 0) || null

    analyses.push({
      stepNumber,
      timestamp: "",
      durationSeconds: stepDuration,
      toolCalls,
      toolCallCount: toolCalls.length,
      hasError,
      errorMessage,
    })
  }

  return analyses
}

function parseTimestamp(text: string): Date | null {
  const clean = text.replace(/[-_]/g, "")
  if (!/^\d{14}$/.test(clean)) return null
  const ts = new Date(
    clean.slice(0, 4) +
      "-" +
      clean.slice(4, 6) +
      "-" +
      clean.slice(6, 8) +
      "T" +
      clean.slice(8, 10) +
      ":" +
      clean.slice(10, 12) +
      ":" +
      clean.slice(12, 14),
  )
  if (Number.isNaN(ts.getTime())) return null
  return ts
}

function parseFilename(filename: string): { agentType: string; agentName: string; timestamp: Date } | null {
  const current = filename.match(/^trajectory_(.+)_(\d{8}_\d{6})_([A-Za-z][A-Za-z0-9-]*)\.json$/)
  if (current?.[2] && current?.[3]) {
    const ts = parseTimestamp(current[2])
    if (!ts) return null
    const agent = current[3]
    return { agentType: agent, agentName: agent, timestamp: ts }
  }

  const legacy = filename.match(/^context-(.+?)-ses_[A-Za-z0-9]+-(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})\.json$/)
  const agentPart = legacy?.[1]
  const dateStr = legacy?.[2]
  if (!agentPart || !dateStr) return null
  const ts = parseTimestamp(dateStr)
  if (!ts) return null
  const agentName = agentPart.replace(/-/g, " ")
  const agentType = agentPart
  return { agentType, agentName, timestamp: ts }
}

async function loadTrajectory(filePath: string): Promise<TrajectoryFile | null> {
  const raw = await readFile(filePath, "utf-8").catch(() => null)
  if (!raw) return null

  let data: OpenCodeTrajectory
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }

  const analyses = parseOpenCodeTrajectory(data)
  if (analyses.length === 0) return null

  const parsed = parseFilename(path.basename(filePath))
  const sessionId = data.sessionID ?? "unknown"
  const agentType = data.meta?.agent ?? parsed?.agentType ?? "unknown"
  const agentName = parsed?.agentName ?? agentType
  const fileTimestamp = parsed?.timestamp ?? new Date(data.timestamp ?? 0)

  return {
    filePath,
    sessionId,
    fileTimestamp,
    agentType,
    agentName,
    analyses,
  }
}

// ---------------------------------------------------------------------------
// Bash analysis
// ---------------------------------------------------------------------------

function extractBashCommand(tc: ToolCallInfo): string | null {
  if (tc.name !== "bash") return null
  const cmd = tc.arguments.command
  if (typeof cmd !== "string") return null
  const normalized = cmd.trim().replace(/\s+/g, " ")
  return normalized || null
}

function bashCommandKey(cmd: string): string {
  const normalized = cmd.trim().replace(/\s+/g, " ")
  if (normalized.includes("&&")) {
    const parts = normalized.split("&&").map((p) => p.trim()).filter(Boolean)
    const first = parts[0]
    if (parts.length >= 2 && first?.startsWith("cd ")) return parts.slice(1).join(" && ")
  }
  return normalized
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (first == null || last == null) return 0
  if (p <= 0) return first
  if (p >= 100) return last
  const k = ((sorted.length - 1) * p) / 100
  const f = Math.floor(k)
  const c = Math.min(f + 1, sorted.length - 1)
  const vf = sorted[f]
  const vc = sorted[c]
  if (vf == null || vc == null) return first
  if (f === c) return vf
  return vf * (c - k) + vc * (k - f)
}

function normalizeWhitespace(s: string): string {
  return s.trim().replace(/\s+/g, " ")
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatSeconds(sec: number | null | undefined): string {
  if (sec == null || Number.isNaN(sec)) return "N/A"
  if (sec < 60) return `${sec.toFixed(2)}s`
  if (sec < 3600) return `${(sec / 60).toFixed(2)}m`
  return `${(sec / 3600).toFixed(2)}h`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 3) + "..."
}

// ---------------------------------------------------------------------------
// Output: Single file summary
// ---------------------------------------------------------------------------

function printSummary(traj: TrajectoryFile, topN: number = 5) {
  const analyses = traj.analyses
  if (analyses.length === 0) {
    console.log(pc.red("没有找到步骤数据"))
    return
  }

  const totalSteps = analyses.length
  const totalToolCalls = analyses.reduce((s, a) => s + a.toolCallCount, 0)
  const errorSteps = analyses.filter((a) => a.hasError)
  const errorCount = errorSteps.length

  const toolStats = new Map<string, { total: number; success: number; failed: number; durations: number[] }>()
  const toolEvents: Array<{ step: number; tc: ToolCallInfo }> = []
  for (const a of analyses) {
    for (const tc of a.toolCalls) {
      const cur = toolStats.get(tc.name) ?? { total: 0, success: 0, failed: 0, durations: [] }
      cur.total++
      tc.success ? cur.success++ : cur.failed++
      if (tc.estimatedDurationSeconds != null) cur.durations.push(tc.estimatedDurationSeconds)
      toolStats.set(tc.name, cur)
      toolEvents.push({ step: a.stepNumber, tc })
    }
  }

  const totalDurationSec = [...toolStats.values()].reduce((s, x) => s + x.durations.reduce((a, b) => a + b, 0), 0)

  const durationExclHuman = [...toolStats.entries()]
    .filter(([name]) => !isHumanInteractionTool(name))
    .reduce((s, [, x]) => s + x.durations.reduce((a, b) => a + b, 0), 0)
  const humanInteractionCount = [...toolStats.entries()]
    .filter(([name]) => isHumanInteractionTool(name))
    .reduce((s, [, x]) => s + x.durations.length, 0)

  console.log()
  console.log(box(pc.bold("Agent 轨迹分析"), "cyan"))
  console.log()

  const overallTable = new Table({ head: [pc.bold("指标"), pc.bold("值")], colWidths: [25, 40] })
  overallTable.push(
    ["总步骤数", String(totalSteps)],
    ["总工具调用次数", String(totalToolCalls)],
    ["错误步骤数", `${errorCount} (${totalSteps > 0 ? ((errorCount / totalSteps) * 100).toFixed(1) : 0}%)`],
    ["工具总耗时", totalDurationSec > 0 ? formatSeconds(totalDurationSec) : "N/A"],
    ["纯Agent耗时", durationExclHuman > 0 ? formatSeconds(durationExclHuman) + (humanInteractionCount > 0 ? ` (已排除 ${humanInteractionCount} 次人交互)` : "") : "N/A"],
    ["文件", truncate(traj.filePath, 50)],
    ["Agent", traj.agentName],
    ["Session", traj.sessionId.slice(0, 20) + "..."]
  )
  console.log(overallTable.toString())
  console.log()

  if (toolStats.size > 0) {
    const toolTable = new Table({
      head: [pc.bold("工具"), pc.bold("调用"), pc.bold("成功率"), pc.bold("失败"), pc.bold("总耗时"), pc.bold("平均")],
      colWidths: [22, 8, 10, 8, 10, 10],
    })
    const sorted = [...toolStats.entries()].sort((a, b) => {
      const aDur = a[1].durations.reduce((x, y) => x + y, 0)
      const bDur = b[1].durations.reduce((x, y) => x + y, 0)
      return bDur - aDur || b[1].total - a[1].total
    })
    for (const [name, s] of sorted.slice(0, 15)) {
      const rate = s.total > 0 ? ((s.success / s.total) * 100).toFixed(1) + "%" : "N/A"
      const totalDur = s.durations.reduce((a, b) => a + b, 0)
      const avgDur = s.durations.length > 0 ? totalDur / s.durations.length : 0
      const label = isHumanInteractionTool(name) ? `${name} (人交互)` : name
      toolTable.push([
        label,
        String(s.total),
        rate,
        String(s.failed),
        totalDur > 0 ? formatSeconds(totalDur) : "N/A",
        avgDur > 0 ? formatSeconds(avgDur) : "N/A",
      ])
    }
    const totalCalls = [...toolStats.values()].reduce((s, x) => s + x.total, 0)
    const totalSuccess = [...toolStats.values()].reduce((s, x) => s + x.success, 0)
    const totalDur = [...toolStats.values()].reduce((s, x) => s + x.durations.reduce((a, b) => a + b, 0), 0)
    const totalWithDur = [...toolStats.values()].reduce((s, x) => s + x.durations.length, 0)
    const overallRate = totalCalls > 0 ? ((totalSuccess / totalCalls) * 100).toFixed(1) + "%" : "N/A"
    const overallAvg = totalWithDur > 0 ? totalDur / totalWithDur : null
    toolTable.push(["TOTAL", String(totalCalls), overallRate, totalCalls - totalSuccess + "", formatSeconds(totalWithDur > 0 ? totalDur : null), formatSeconds(overallAvg)])
    console.log(pc.cyan("工具调用统计（含耗时）"))
    console.log(toolTable.toString())
    console.log()
  }

  const eventsWithDuration = toolEvents.filter(
    (e) => e.tc.estimatedDurationSeconds != null && !isHumanInteractionTool(e.tc.name)
  )
  if (eventsWithDuration.length > 0) {
    const sortedByDur = [...eventsWithDuration].sort((a, b) => (b.tc.estimatedDurationSeconds ?? 0) - (a.tc.estimatedDurationSeconds ?? 0))
    const hotTable = new Table({
      head: [pc.bold("耗时"), pc.bold("步骤"), pc.bold("工具"), pc.bold("状态"), pc.bold("摘要")],
      colWidths: [10, 8, 22, 8, 50],
      wordWrap: true,
    })
    for (const { step, tc } of sortedByDur.slice(0, Math.min(topN, 10))) {
      const dur = tc.estimatedDurationSeconds ?? 0
      const status = tc.success ? "OK" : "FAIL"
      const summary = commandSummary(tc) ?? tc.name
      hotTable.push([formatSeconds(dur), String(step), tc.name, status, truncate(summary, 70)])
    }
    console.log(pc.cyan(`最耗时的工具调用 (Top ${Math.min(topN, 10)}，已排除人交互工具)`))
    console.log(hotTable.toString())
    console.log()
  }

  const failedEvents: Array<{ step: number; name: string; summary: string; err: string }> = []
  for (const a of analyses) {
    for (const tc of a.toolCalls) {
      if (!tc.success) {
        failedEvents.push({
          step: a.stepNumber,
          name: tc.name,
          summary: commandSummary(tc) ?? tc.name,
          err: tc.errorMessage ?? "",
        })
      }
    }
  }

  if (failedEvents.length > 0) {
    const failByTool = new Map<string, { count: number; examples: Array<{ step: number; summary: string; err: string }> }>()
    for (const e of failedEvents) {
      const cur = failByTool.get(e.name) ?? { count: 0, examples: [] }
      cur.count++
      if (cur.examples.length < 3) cur.examples.push({ step: e.step, summary: e.summary, err: e.err })
      failByTool.set(e.name, cur)
    }

    const failTable = new Table({
      head: [pc.bold("工具"), pc.bold("失败次数"), pc.bold("示例")],
      colWidths: [22, 12, 60],
      wordWrap: true,
    })
    const sorted = [...failByTool.entries()].sort((a, b) => b[1].count - a[1].count)
    for (const [name, s] of sorted.slice(0, 5)) {
      const examples = s.examples.map((e) => `${e.step}: ${truncate(e.summary, 40)} | ${truncate(normalizeWhitespace(e.err), 60)}`).join("\n")
      failTable.push([name, String(s.count), examples])
    }
    console.log(pc.red("高频工具错误 (Top 5)"))
    console.log(failTable.toString())
    console.log()
  }

  const bashCalls: Array<{ step: number; cmd: string; tc: ToolCallInfo }> = []
  for (const a of analyses) {
    for (const tc of a.toolCalls) {
      const cmd = extractBashCommand(tc)
      if (cmd) bashCalls.push({ step: a.stepNumber, cmd, tc })
    }
  }

  if (bashCalls.length > 0) {
    const bashDurations = bashCalls.map((x) => x.tc.estimatedDurationSeconds).filter((d): d is number => d != null)
    if (bashDurations.length > 0) {
      const sorted = [...bashDurations].sort((a, b) => a - b)
      const total = sorted.length
      const mean = sorted.reduce((a, b) => a + b, 0) / total
      const p50 = percentile(sorted, 50)
      const p90 = percentile(sorted, 90)
      const p99 = percentile(sorted, 99)
      const buckets = [
        [0, 0.5],
        [0.5, 1],
        [1, 2],
        [2, 5],
        [5, 10],
        [10, 30],
        [30, 60],
        [60, Infinity],
      ] as const
      const bucketRows = buckets.map(([lo, hi]) => {
        const label = hi === Infinity ? `>= ${lo}s` : `[${lo}, ${hi})s`
        const count = hi === Infinity ? sorted.filter((x) => x >= lo).length : sorted.filter((x) => x >= lo && x < hi).length
        return { label, count, pct: (count / total) * 100 }
      })
      const maxCount = Math.max(...bucketRows.map((r) => r.count), 1)

      console.log(pc.cyan("Bash 命令耗时分布"))
      const distTable = new Table({
        head: [pc.bold("count"), pc.bold("min"), pc.bold("p50"), pc.bold("p90"), pc.bold("p99"), pc.bold("mean"), pc.bold("max")],
        colWidths: [8, 8, 8, 8, 8, 8, 8],
      })
      distTable.push([
        String(total),
        formatSeconds(sorted[0]),
        formatSeconds(p50),
        formatSeconds(p90),
        formatSeconds(p99),
        formatSeconds(mean),
        formatSeconds(sorted[sorted.length - 1]),
      ])
      console.log(distTable.toString())

      const histTable = new Table({
        head: [pc.bold("区间"), pc.bold("count"), pc.bold("pct"), pc.bold("bar")],
        colWidths: [12, 8, 8, 35],
      })
      for (const { label, count, pct } of bucketRows) {
        const barLen = Math.round((count / maxCount) * 30)
        histTable.push([label, String(count), pct.toFixed(1) + "%", "█".repeat(barLen)])
      }
      console.log(histTable.toString())
      console.log()
    }

    const cmdStats = new Map<
      string,
      { calls: number; failed: number; totalDur: number; durations: number[]; examples: Array<{ step: number; cmd: string }> }
    >()
    for (const { step, cmd, tc } of bashCalls) {
      const key = bashCommandKey(cmd)
      const cur = cmdStats.get(key) ?? { calls: 0, failed: 0, totalDur: 0, durations: [], examples: [] }
      cur.calls++
      if (!tc.success) cur.failed++
      if (tc.estimatedDurationSeconds != null) {
        cur.totalDur += tc.estimatedDurationSeconds
        cur.durations.push(tc.estimatedDurationSeconds)
      }
      if (cur.examples.length < 3) cur.examples.push({ step, cmd })
      cmdStats.set(key, cur)
    }

    const sorted = [...cmdStats.entries()].sort((a, b) => b[1].totalDur - a[1].totalDur)
    const bashTable = new Table({
      head: [pc.bold("总耗时"), pc.bold("调用"), pc.bold("失败"), pc.bold("平均"), pc.bold("命令")],
      colWidths: [10, 8, 8, 10, 62],
      wordWrap: true,
    })
    for (const [key, s] of sorted.slice(0, Math.max(topN, 5))) {
      const avg = s.durations.length > 0 ? s.totalDur / s.durations.length : 0
      bashTable.push([
        formatSeconds(s.totalDur),
        String(s.calls),
        String(s.failed),
        formatSeconds(avg),
        truncate(key, 80),
      ])
    }
    console.log(pc.cyan("最耗时的 Bash 命令 (Top 命令)"))
    console.log(bashTable.toString())
    console.log()
  }

  if (errorSteps.length > 0) {
    const errTable = new Table({
      head: [pc.bold("步骤"), pc.bold("错误")],
      colWidths: [8, 80],
      wordWrap: true,
    })
    for (const a of errorSteps.slice(0, 10)) {
      errTable.push([String(a.stepNumber), truncate(normalizeWhitespace(a.errorMessage ?? ""), 120)])
    }
    console.log(pc.yellow("错误步骤 (Top 10)"))
    console.log(errTable.toString())
    console.log()
  }
}

// ---------------------------------------------------------------------------
// Output: Replay mode
// ---------------------------------------------------------------------------

function printReplay(traj: TrajectoryFile, verbose: boolean = false) {
  console.log()
  console.log(box(pc.bold(`回放: ${traj.agentName}`) + ` ${traj.sessionId}`, "green"))
  console.log()

  for (const a of traj.analyses) {
    const stepDur = a.durationSeconds != null ? pc.dim(` (${formatSeconds(a.durationSeconds)})`) : ""
    console.log(pc.dim(`─── Step ${a.stepNumber}${stepDur} ───`))
    for (const tc of a.toolCalls) {
      const status = tc.success ? pc.green("OK") : pc.red("FAIL")
      const summary = commandSummary(tc) ?? tc.name
      const durStr = tc.estimatedDurationSeconds != null ? pc.dim(` ${formatSeconds(tc.estimatedDurationSeconds)}`) : ""
      console.log(`  ${status} ${pc.bold(tc.name)}${durStr} ${pc.dim(summary)}`)
      if (!tc.success && tc.errorMessage) {
        console.log(pc.red("    " + truncate(normalizeWhitespace(tc.errorMessage), 100)))
      }
      if (verbose && tc.resultSize != null) {
        console.log(pc.dim(`    结果: ${tc.resultSize} 字符`))
      }
    }
    console.log()
  }
}

// ---------------------------------------------------------------------------
// Output: Insights
// ---------------------------------------------------------------------------

function printInsights(traj: TrajectoryFile) {
  const analyses = traj.analyses
  const insights: string[] = []

  const toolCounts = new Map<string, number>()
  const failCounts = new Map<string, number>()
  for (const a of analyses) {
    for (const tc of a.toolCalls) {
      toolCounts.set(tc.name, (toolCounts.get(tc.name) ?? 0) + 1)
      if (!tc.success) failCounts.set(tc.name, (failCounts.get(tc.name) ?? 0) + 1)
    }
  }

  const totalCalls = [...toolCounts.values()].reduce((s, n) => s + n, 0)
  const totalFails = [...failCounts.values()].reduce((s, n) => s + n, 0)
  const failRate = totalCalls > 0 ? (totalFails / totalCalls) * 100 : 0

  if (failRate > 20) {
    insights.push(`工具失败率较高 (${failRate.toFixed(1)}%)，建议检查工具配置和参数校验`)
  }

  const topFail = [...failCounts.entries()].sort((a, b) => b[1] - a[1])[0]
  if (topFail && topFail[1] >= 2) {
    insights.push(`工具 "${topFail[0]}" 失败次数最多 (${topFail[1]} 次)，可优先优化`)
  }

  const bashCalls = analyses.flatMap((a) => a.toolCalls.filter((tc) => tc.name === "bash"))
  if (bashCalls.length > 0) {
    const bashFails = bashCalls.filter((tc) => !tc.success).length
    if (bashFails > 0) {
      insights.push(`Bash 命令执行失败 ${bashFails} 次，建议检查命令语法和环境依赖`)
    }
  }

  const editToolCalls = analyses.flatMap((a) => a.toolCalls.filter((tc) => tc.name === "str_replace_based_edit_tool"))
  const viewRangeErrors = editToolCalls.filter((tc) => tc.errorMessage?.includes("view_range")).length
  if (viewRangeErrors > 0) {
    insights.push(`str_replace_based_edit_tool view 缺少 view_range 参数 ${viewRangeErrors} 次，可改进 prompt 或默认值`)
  }

  const stepCount = analyses.length
  if (stepCount > 200) {
    insights.push(`步骤数较多 (${stepCount})，可考虑拆分任务或优化探索策略`)
  }

  const allDurationsExclHuman = analyses.flatMap((a) =>
    a.toolCalls
      .filter((tc) => !isHumanInteractionTool(tc.name))
      .map((tc) => tc.estimatedDurationSeconds)
      .filter((d): d is number => d != null)
  )
  if (allDurationsExclHuman.length > 0) {
    const totalSecExclHuman = allDurationsExclHuman.reduce((a, b) => a + b, 0)
    const sorted = [...allDurationsExclHuman].sort((a, b) => b - a)
    const topDur = sorted[0] ?? 0
    if (topDur > 60) {
      insights.push(`存在耗时超过 1 分钟的工具调用 (最长 ${formatSeconds(topDur)})，可考虑优化或增加超时`)
    } else if (topDur > 30) {
      insights.push(`存在耗时较长的工具调用 (最长 ${formatSeconds(topDur)})，可能含用户等待或可优化`)
    }
    const bashDurations = analyses.flatMap((a) =>
      a.toolCalls.filter((tc) => tc.name === "bash").map((tc) => tc.estimatedDurationSeconds).filter((d): d is number => d != null)
    )
    if (bashDurations.length > 0 && totalSecExclHuman > 0) {
      const bashTotal = bashDurations.reduce((a, b) => a + b, 0)
      const pct = ((bashTotal / totalSecExclHuman) * 100).toFixed(1)
      if (parseFloat(pct) > 30) {
        insights.push(`Bash 命令占纯Agent耗时 ${pct}%，可考虑缓存或优化常用命令`)
      }
    }
  }

  if (insights.length === 0) {
    insights.push("未发现明显优化点，轨迹运行较为平稳")
  }

  console.log()
  console.log(box(pc.bold("开发优化洞察"), "yellow"))
  console.log()
  for (let i = 0; i < insights.length; i++) {
    console.log(`  ${pc.bold(String(i + 1) + ".")} ${insights[i]}`)
  }
  console.log()
}

// ---------------------------------------------------------------------------
// Export CSV
// ---------------------------------------------------------------------------

function exportToCsv(traj: TrajectoryFile, outputPath: string) {
  const rows: string[][] = [
    ["step", "tool", "success", "duration_sec", "error", "summary"],
  ]
  for (const a of traj.analyses) {
    for (const tc of a.toolCalls) {
      rows.push([
        String(a.stepNumber),
        tc.name,
        tc.success ? "1" : "0",
        tc.estimatedDurationSeconds != null ? String(tc.estimatedDurationSeconds) : "",
        (tc.errorMessage ?? "").replace(/"/g, '""').replace(/\n/g, " "),
        (commandSummary(tc) ?? "").replace(/"/g, '""').replace(/\n/g, " "),
      ])
    }
  }
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n")
  Bun.write(outputPath, "\uFEFF" + csv)
  console.log(pc.green(`已导出: ${outputPath}`))
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function collectFiles(input: string): Promise<string[]> {
  const resolved = path.resolve(input)
  if (!existsSync(resolved)) return []

  const st = await stat(resolved).catch(() => null)
  if (!st) return []

  if (st.isFile()) {
    return resolved.endsWith(".json") ? [resolved] : []
  }

  const entries = await readdir(resolved, { withFileTypes: true })
  const files: string[] = []
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith(".json") && (e.name.startsWith("context-") || e.name.startsWith("trajectory_"))) {
      files.push(path.join(resolved, e.name))
    }
  }
  return files.sort()
}

async function main() {
  const args = process.argv.slice(2)
  const replayFlag = args.includes("--replay") || args.includes("-r")
  const topIdx = args.findIndex((a) => a === "--top" || a === "-n")
  const topN = topIdx >= 0 && args[topIdx + 1] ? parseInt(String(args[topIdx + 1]), 10) : 5
  const outIdx = args.findIndex((a) => a === "-o" || a === "--output")
  const outputPath = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : null
  const verboseFlag = args.includes("--verbose") || args.includes("-v")

  const input = args.find((a) => !a.startsWith("-") && !a.includes("analyze-trajectory")) ?? ".history_message"
  const scriptDir = path.dirname(import.meta.path)
  const projectRoot = path.resolve(scriptDir, "..", "..", "..")
  const defaultPath = path.join(projectRoot, ".history_message")
  const searchPath = path.isAbsolute(input) ? input : path.join(process.cwd(), input)
  const resolved = existsSync(searchPath) ? searchPath : (existsSync(defaultPath) ? defaultPath : searchPath)

  const files = await collectFiles(resolved)
  if (files.length === 0) {
    console.log(pc.yellow("未找到轨迹文件。请指定 .history_message 目录或单个 JSON 文件路径。"))
    console.log(pc.dim("示例: bun run analyze-trajectory 或 bun run analyze-trajectory .history_message"))
    process.exit(1)
  }

  const trajectories: TrajectoryFile[] = []
  for (const f of files) {
    const t = await loadTrajectory(f)
    if (t) trajectories.push(t)
  }

  if (trajectories.length === 0) {
    console.log(pc.red("没有找到有效的轨迹数据"))
    process.exit(1)
  }

  const sorted = trajectories.sort((a, b) => b.fileTimestamp.getTime() - a.fileTimestamp.getTime())
  const toAnalyze = sorted.slice(0, 1)

  if (outputPath) {
    const first = toAnalyze[0]
    if (!first) {
      console.log(pc.red("没有可导出的轨迹数据"))
      process.exit(1)
    }
    exportToCsv(first, outputPath)
    return
  }

  for (const traj of toAnalyze) {
    if (replayFlag) {
      printReplay(traj, verboseFlag)
    } else {
      printSummary(traj, topN)
      printInsights(traj)
    }
  }

  if (trajectories.length > 1 && !replayFlag) {
    console.log(pc.dim(`共 ${trajectories.length} 个轨迹文件，仅显示最新 1 个。指定完整路径可分析单个文件。`))
  }
}

main().catch((e) => {
  console.error(pc.red(e instanceof Error ? e.message : String(e)))
  process.exit(1)
})
