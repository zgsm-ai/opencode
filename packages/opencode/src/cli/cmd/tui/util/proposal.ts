import fs from "fs"
import path from "path"

export type Proposal = {
  changeId: string
  description?: string
  time: number
  taskPath: string
}

export async function scanProposals(directory: string) {
  const root = path.join(directory, "proposal")
  const entries = await fs.promises.readdir(root, { withFileTypes: true }).catch(() => [])
  const results: Proposal[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const tasks = path.join(root, entry.name, "tasks.md")
    const task = path.join(root, entry.name, "task.md")
    const taskPath = await fs.promises
      .access(tasks)
      .then(() => tasks)
      .catch(async () => fs.promises.access(task).then(() => task).catch(() => undefined))

    if (!taskPath) continue

    const time = await fs.promises
      .stat(taskPath)
      .then((stat) => stat.mtimeMs)
      .catch(() => 0)

    const proposalPath = path.join(root, entry.name, "proposal.md")
    const description = await fs.promises
      .readFile(proposalPath, "utf-8")
      .then((content) => proposalTag(content))
      .catch(() => undefined)

    results.push({ changeId: entry.name, description, time, taskPath })
  }

  return results.toSorted((a, b) => b.time - a.time)
}

export function proposalTag(content: string) {
  const title = heading(content)
  if (title) return title

  const scope = section(content, ["需求拆解"])
  const item = scope ? bullet(scope) : undefined
  if (item) return tag("子需", item)

  const goal = section(content, ["背景与目标", "背景", "需求", "目标"])
  const line = goal ? sentence(goal) : undefined
  if (line) return tag("背景", line)

  return undefined
}

function heading(content: string) {
  const line = content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "))

  if (!line) return undefined
  const text = line.replace(/^#\s+/, "")
  const cut = text.split(/[:：]/)
  const title = cut.length > 1 ? cut.slice(1).join(":").trim() : text
  return clean(title || text)
}

function section(content: string, list: string[]) {
  const lines = content.split("\n")

  for (const name of list) {
    const start = lines.findIndex((line) => new RegExp(`^##\\s*${escape(name)}(?:\\s|$)`).test(line.trim()))
    if (start === -1) continue

    const body = []
    for (const line of lines.slice(start + 1)) {
      if (line.trim().startsWith("## ")) break
      body.push(line)
    }

    const text = body.join("\n").trim()
    if (text) return text
  }

  return undefined
}

function bullet(content: string) {
  const line = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => line.startsWith("- ") && !line.startsWith("- 功能描述") && !line.startsWith("- 影响范围"))

  if (!line) return undefined

  return clean(line.replace(/^-+\s*/, "").replace(/^子需求\s*\d+\s*[:：]\s*/, ""))
}

function sentence(content: string) {
  return content
    .split("\n")
    .map((line) => clean(line))
    .find((line) => line && !line.startsWith("##"))
}

function clean(text: string) {
  const line = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/^[0-9]+[.)]\s*/, "")
    .replace(/^[-*]\s*/, "")
    .replace(/^(功能描述|影响范围|修改对象|修改目的|修改内容)\s*[:：]\s*/, "")
    .replace(/\s+/g, " ")
    .trim()

  if (!line) return undefined
  return line
}

function tag(name: string, text: string) {
  return `${name} ${text}`
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
