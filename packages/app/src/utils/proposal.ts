import { OpencodeClient } from "@opencode-ai/sdk/v2/client"

export type ChangeAgent = "coding" | "FixAgent" | "taskcheck"

export type ProposalInfo = {
  changeId: string
  description?: string
  taskPath: string
}

function normalizePath(value: string) {
  return value.replaceAll("\\", "/")
}

function trimExcerpt(value: string) {
  const text = value.trim()
  if (text.length <= 500) return text
  return text.slice(0, 497) + "..."
}

function extractTaskcheckUserInput(content: string) {
  const match = content.match(/##\s*(背景|需求|用户需求|目标)[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
  if (match?.[2]) return trimExcerpt(match[2])

  const paragraphs = content
    .split("\n\n")
    .filter((line) => line.trim() && !line.trim().startsWith("#"))
    .slice(0, 2)
    .join("\n\n")
    .trim()

  if (paragraphs.length > 0) return trimExcerpt(paragraphs)
  return "（无法提取用户原始需求）"
}

async function list(client: OpencodeClient, path: string) {
  return client.file
    .list({ path })
    .then((x) => x.data ?? [])
    .catch(() => [])
}

async function read(client: OpencodeClient, path: string) {
  return client.file
    .read({ path })
    .then((x) => {
      const content = x.data
      if (!content || content.type !== "text") return ""
      return content.content
    })
    .catch(() => "")
}

function resolveTaskPath(paths: string[]) {
  return paths.find((item) => item.endsWith("/tasks.md")) ?? paths.find((item) => item.endsWith("/task.md"))
}

export function isChangeAgent(name?: string): name is ChangeAgent {
  return name === "coding" || name === "FixAgent" || name === "taskcheck"
}

export async function scanProposals(client: OpencodeClient) {
  const root = await list(client, "proposal")
  const dirs = root.filter((item) => item.type === "directory")

  const items = await Promise.all(
    dirs.map(async (item) => {
      const entries = await list(client, item.path)
      const taskPath = resolveTaskPath(entries.filter((entry) => entry.type === "file").map((entry) => entry.path))
      if (!taskPath) return

      const proposalPath = entries.find((entry) => entry.type === "file" && entry.name === "proposal.md")?.path
      const description = proposalPath ? proposalTag(await read(client, proposalPath)) : undefined

      return {
        changeId: item.name,
        description,
        taskPath,
      } satisfies ProposalInfo
    }),
  )

  return items.flatMap((item) => (item ? [item] : []))
}

export async function buildProposalPrompt(
  client: OpencodeClient,
  input: {
    agent: ChangeAgent
    changeId: string
    project: string
  },
) {
  const proposalDir = `proposal/${input.changeId}`
  const entries = await list(client, proposalDir)
  const taskPath = resolveTaskPath(entries.filter((item) => item.type === "file").map((item) => item.path))
  if (!taskPath) return

  const projectText = normalizePath(input.project)
  const taskText = normalizePath(taskPath)

  if (input.agent === "coding") {
    return `项目路径：\`${projectText}\`\n任务文件路径：\`${taskText}\`\n\n请确保本次编码任务高质量完成`
  }

  if (input.agent === "FixAgent") {
    return `项目路径：\`${projectText}\`\n任务文件路径：\`${taskText}\`\n\n请认真收集用户反馈并进行代码修复和改进`
  }

  const proposalPath = `${proposalDir}/proposal.md`
  const userInputPath = `${proposalDir}/user_input.md`
  const proposalContent = await read(client, proposalPath)
  const userInput = await read(client, userInputPath)
  const userTaskText = userInput.trim() ? trimExcerpt(userInput) : extractTaskcheckUserInput(proposalContent)

  return `## 用户原始需求

\`\`\`text
${userTaskText}
\`\`\`

## 任务上下文

项目路径：\`${projectText}\`
proposal.md路径：\`${normalizePath(proposalPath)}\`
task.md路径：\`${taskText}\`

请以"用户原始需求"为覆盖基准，认真检查 task.md 文件是否需要调整。`
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
    .map((item) => item.trim())
    .find((item) => item.startsWith("# "))

  if (!line) return undefined
  const text = line.replace(/^#\s+/, "")
  const cut = text.split(/[:：]/)
  const title = cut.length > 1 ? cut.slice(1).join(":").trim() : text
  return clean(title || text)
}

function section(content: string, names: string[]) {
  const lines = content.split("\n")

  for (const name of names) {
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
    .map((item) => item.trim())
    .filter(Boolean)
    .find((item) => item.startsWith("- ") && !item.startsWith("- 功能描述") && !item.startsWith("- 影响范围"))

  if (!line) return undefined
  return clean(line.replace(/^-+\s*/, "").replace(/^子需求\s*\d+\s*[:：]\s*/, ""))
}

function sentence(content: string) {
  return content
    .split("\n")
    .map((item) => clean(item))
    .find(Boolean)
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
