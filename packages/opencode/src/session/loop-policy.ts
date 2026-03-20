import { PermissionNext } from "@/permission/next"
import { toolAlias } from "@/costrict/utils/tool-transform-v2"

type Agent = {
  options?: Record<string, unknown>
  permission: PermissionNext.Ruleset
  steps?: number
}

function configured(agent: Agent) {
  const raw = agent.options?.exitToolName
  if (typeof raw === "string" && raw.trim()) return toolAlias(raw)
  return "task_done"
}

function allowed(agent: Agent, name: string) {
  return PermissionNext.evaluate(name, "*", agent.permission).action !== "deny"
}

export function exitTool(agent: Agent, names?: string[]) {
  const name = configured(agent)
  if (!allowed(agent, name)) return
  if (!names) return name
  return names.some((item) => toolAlias(item) === name) ? name : undefined
}

export function maxStep(agent: Agent, step: number, names: string[]) {
  const max = agent.steps ?? Infinity
  const hit = step >= max
  const name = hit ? exitTool(agent, names) : undefined
  return {
    hit,
    exitToolName: name,
    forceExitTool: hit && !!name,
    shouldBreak: hit && !name,
  }
}

export function restrict<T>(tools: Record<string, T>, name: string) {
  const entries = Object.entries(tools).filter(([key]) => toolAlias(key) === name)
  return Object.fromEntries(entries) as Record<string, T>
}

export function reminder(name: string) {
  return [
    "CRITICAL - MAXIMUM STEPS REACHED",
    "",
    `You have reached the maximum number of outer-loop steps for this task. You must now call the \`${name}\` tool to stop this agent run cleanly.`,
    "",
    "STRICT REQUIREMENTS:",
    `1. Do not call any tool other than \`${name}\``,
    "2. Summarize completed work and remaining work in the tool input",
    "3. End this run by calling the exit tool immediately",
  ].join("\n")
}

export function unexpectedStop(name: string, reason?: string) {
  return [
    `The previous turn stopped without calling \`${name}\`.`,
    "This agent must not stop unless it exits via the designated exit tool.",
    reason ? `Observed stop reason:\n${reason}` : "",
    `If the task is complete, call \`${name}\` now.`,
    `Otherwise continue working, and only stop after calling \`${name}\`.`,
  ]
    .filter(Boolean)
    .join("\n\n")
}
