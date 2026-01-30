import z from "zod"
import path from "path"
import { Tool } from "./tool"
import { Instance } from "../project/instance"
import { assertExternalDirectory } from "./external-directory"
import DESCRIPTION from "./memory-bank.txt"

const COMMANDS = ["view", "add", "update", "delete"] as const
const BANK_FILE = ".memory_bank.md"
const HEADER_ERROR = "记录条目格式错误：无法解析条目头部。"

type Entry = {
  tag: string
  title: string
  lesson: string[]
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))
const errorName = (error: unknown) => (error instanceof Error ? error.name : "Error")

const root = (ctx: Tool.Context) => {
  const raw = typeof ctx.extra?.projectPath === "string" ? ctx.extra.projectPath.trim() : ""
  if (raw) return path.isAbsolute(raw) ? raw : path.join(Instance.directory, raw)
  return Instance.directory
}

const bank = (ctx: Tool.Context) => path.join(root(ctx), BANK_FILE)

const split = (value: string) => {
  const trimmed = value.trimEnd()
  if (!trimmed) return [] as string[]
  return trimmed.split(/\r?\n/)
}

const isHeader = (line: string) => {
  const stripped = line.trimStart()
  return (stripped.startsWith("## [") || stripped.startsWith("### [")) && stripped.includes("]")
}

const header = (line: string) => {
  const stripped = line.trim()
  if (!(stripped.startsWith("## [") || stripped.startsWith("### [")) || !stripped.includes("]")) {
    throw new Error(HEADER_ERROR)
  }
  const prefix = stripped.startsWith("## ") ? 4 : 5
  const rest = stripped.slice(prefix)
  const close = rest.indexOf("]")
  if (close < 0) {
    throw new Error(HEADER_ERROR)
  }
  const tag = rest.slice(0, close).trim()
  const title = rest.slice(close + 1).trim()
  return { tag, title }
}

const parse = (lines: string[]) => {
  const entries: Entry[] = []
  const state = { index: 0 }

  while (state.index < lines.length) {
    const line = lines[state.index] ?? ""
    if (!isHeader(line)) {
      state.index += 1
      continue
    }
    const head = header(line)
    state.index += 1
    const body: string[] = []
    while (state.index < lines.length && !isHeader(lines[state.index] ?? "")) {
      body.push(lines[state.index] ?? "")
      state.index += 1
    }
    while (body.length > 0 && !body[0]?.trim()) {
      body.shift()
    }
    while (body.length > 0 && !body[body.length - 1]?.trim()) {
      body.pop()
    }
    entries.push({ tag: head.tag, title: head.title, lesson: body })
  }
  return entries
}

const render = (entries: Entry[]) => {
  const out: string[] = []
  out.push("# Memory Bank - 项目知识库")
  out.push("")
  out.push("本知识库由 MemoryBankTool 自动维护，用于记录可共享的项目知识。")
  out.push("")
  out.push("## 记录分类")
  out.push("")
  out.push("1. **项目规范（Project Context）**：开发环境、测试说明、代码风格等项目级约定")
  out.push("2. **开发实践（Best Practices）**：可泛化、可复用的开发规范和最佳实践")
  out.push("")
  out.push("## 索引")
  if (entries.length === 0) {
    out.push("- （暂无记录）")
  }
  if (entries.length > 0) {
    for (const entry of entries) {
      out.push(`- [${entry.tag}] ${entry.title}`)
    }
  }
  out.push("")
  out.push("---")
  out.push("")
  out.push("## 记录")
  out.push("")
  const state = { index: 0 }
  for (const entry of entries) {
    out.push(`### [${entry.tag}] ${entry.title}`)
    out.push("")
    if (entry.lesson.length > 0) {
      out.push(...entry.lesson)
    }
    if (entry.lesson.length === 0) {
      out.push("（无内容）")
    }
    if (state.index !== entries.length - 1) {
      out.push("")
    }
    state.index += 1
  }
  out.push("")
  return out
}

const seed = () => `${render([]).join("\n").trimEnd()}\n`

const ensure = async (filepath: string) => {
  const file = Bun.file(filepath)
  const exists = await file.exists()
  if (exists) return
  await Bun.write(filepath, seed(), { createPath: true })
}

const save = async (filepath: string, lines: string[]) => {
  const content = `${lines.join("\n").trimEnd()}\n`
  await Bun.write(filepath, content, { createPath: true })
}

export const MemoryBankTool = Tool.define("memory_bank", {
  description: DESCRIPTION,
  parameters: z.object({
    command: z.unknown().optional().describe("操作类型：view(查看全部) | add(添加) | update(更新) | delete(删除)"),
    tag: z.unknown().optional().describe("记录的唯一标识符。add/update/delete 时必填。"),
    title: z.unknown().optional().describe("一句话概括记录内容，让人一眼判断是否相关。add 必填，update 可选。"),
    lesson: z.unknown().optional().describe("记录内容，简短描述即可，一条记录只说一个规范点。add 必填，update 可选。"),
  }),
  async execute(params, ctx) {
    const command = typeof params.command === "string" ? params.command : String(params.command ?? "")
    if (!command) {
      throw new Error(
        `缺少必填参数: command\n可用的命令: ${COMMANDS.join(", ")}\n示例: {'command': 'view'}`,
      )
    }
    if (!COMMANDS.includes(command as (typeof COMMANDS)[number])) {
      throw new Error(`无效的命令: ${command}\n可用的命令: ${COMMANDS.join(", ")}`)
    }

    const filepath = bank(ctx)
    await assertExternalDirectory(ctx, filepath)

    if (command === "view") {
      const edit = { asked: false }
      const askEdit = async () => {
        if (edit.asked) return
        await ctx.ask({
          permission: "edit",
          patterns: [path.relative(Instance.worktree, filepath)],
          always: ["*"],
          metadata: {},
        })
        edit.asked = true
      }

      await ctx.ask({
        permission: "read",
        patterns: [filepath],
        always: ["*"],
        metadata: {},
      })

      const file = Bun.file(filepath)
      const exists = await file.exists().catch((error) => {
        throw new Error(`查看Memory Bank失败: ${errorText(error)}`)
      })
      if (!exists) {
        await askEdit()
        await Bun.write(filepath, seed(), { createPath: true }).catch((error) => {
          throw new Error(`查看Memory Bank失败: ${errorText(error)}`)
        })
      }

      const text = await Bun.file(filepath)
        .text()
        .catch((error) => {
          throw new Error(`查看Memory Bank失败: ${errorText(error)}`)
        })

      const entries = parse(text.split(/\r?\n/))
      if (entries.length === 0) {
        return {
          title: "memory_bank",
          output:
            "暂无记录。\n当你在开发过程中发现了有价值的项目规范或开发实践，用 `add` 命令记录下来，帮助后续 agent 高效协作。\n每条记录必须提供全局唯一 tag；如需修改已有记录请使用 `update` 命令；过期/错误记录请使用 `delete` 命令。",
          metadata: {},
        }
      }

      const rendered = render(entries)
      await askEdit()
      await save(filepath, rendered).catch((error) => {
        throw new Error(`查看Memory Bank失败: ${errorText(error)}`)
      })

      return {
        title: "memory_bank",
        output: `${rendered.join("\n").trimEnd()}\n`,
        metadata: {},
      }
    }

    await ctx.ask({
      permission: "edit",
      patterns: [path.relative(Instance.worktree, filepath)],
      always: ["*"],
      metadata: {},
    })

    if (command === "add") {
      if (!params.tag) {
        throw new Error("缺少必填参数: tag\nadd命令需要: tag, title, lesson")
      }
      if (!params.title) {
        throw new Error("缺少必填参数: title\nadd命令需要: tag, title, lesson")
      }
      if (!params.lesson) {
        throw new Error("缺少必填参数: lesson\nadd命令需要: tag, title, lesson")
      }

      const tag = String(params.tag).trim()
      const title = String(params.title)
      const lesson = String(params.lesson)
      if (!tag) {
        throw new Error("tag 不能为空。请提供全局唯一的 tag（例如：'dev-env-setup'）。")
      }

      await ensure(filepath).catch((error) => {
        throw new Error(`添加记录失败: ${errorText(error)}\n详情: ${errorName(error)}`)
      })

      const text = await Bun.file(filepath)
        .text()
        .catch((error) => {
          throw new Error(`添加记录失败: ${errorText(error)}\n详情: ${errorName(error)}`)
        })
      const entries = parse(text.split(/\r?\n/))
      if (entries.some((entry) => entry.tag === tag)) {
        throw new Error(
          `tag 重复：'${tag}' 已存在。\n请使用全局唯一的tag；如需修改已有记录请使用 update(tag=...)。`,
        )
      }

      entries.push({ tag, title, lesson: split(lesson) })
      await save(filepath, render(entries)).catch((error) => {
        throw new Error(`添加记录失败: ${errorText(error)}\n详情: ${errorName(error)}`)
      })

      return {
        title: "memory_bank",
        output: `✓ 已添加记录\ntag: ${tag}\ntitle: ${title}\n使用 command='view' 查看所有记录。`,
        metadata: {},
      }
    }

    if (command === "update") {
      if (!params.tag) {
        throw new Error("缺少必填参数: tag\nupdate命令需要提供tag（全局唯一标识）。")
      }

      const tag = String(params.tag).trim()
      const title = params.title
      const lesson = params.lesson
      if (!title && !lesson) {
        throw new Error(
          `update命令需要至少提供以下参数之一: title, lesson\n示例: {'command': 'update', 'tag': '${tag}', 'lesson': '...'}`,
        )
      }

      await ensure(filepath).catch((error) => {
        throw new Error(`更新记录失败: ${errorText(error)}`)
      })

      const text = await Bun.file(filepath)
        .text()
        .catch((error) => {
          throw new Error(`更新记录失败: ${errorText(error)}`)
        })
      const entries = parse(text.split(/\r?\n/))
      const hit = entries.findIndex((entry) => entry.tag === tag)
      if (hit < 0) {
        throw new Error(`找不到tag为 '${tag}' 的记录\n使用 command='view' 查看所有记录和对应的tag`)
      }

      const old = entries[hit]
      const nextTitle = title !== undefined && title !== null ? String(title).trim() : old.title
      const nextLesson = lesson !== undefined && lesson !== null ? split(String(lesson)) : old.lesson
      entries[hit] = { tag: old.tag, title: nextTitle, lesson: nextLesson }
      await save(filepath, render(entries)).catch((error) => {
        throw new Error(`更新记录失败: ${errorText(error)}`)
      })

      return {
        title: "memory_bank",
        output: `✓ 已更新记录：${tag}`,
        metadata: {},
      }
    }

    if (command === "delete") {
      if (!params.tag) {
        throw new Error("缺少必填参数: tag\ndelete命令需要提供tag（全局唯一标识）。")
      }

      const tag = String(params.tag).trim()
      await ensure(filepath).catch((error) => {
        throw new Error(`删除记录失败: ${errorText(error)}`)
      })

      const text = await Bun.file(filepath)
        .text()
        .catch((error) => {
          throw new Error(`删除记录失败: ${errorText(error)}`)
        })
      const entries = parse(text.split(/\r?\n/))
      if (!entries.some((entry) => entry.tag === tag)) {
        throw new Error(`找不到tag为 '${tag}' 的记录\n使用 command='view' 查看所有记录和对应的tag`)
      }

      const next = entries.filter((entry) => entry.tag !== tag)
      await save(filepath, render(next)).catch((error) => {
        throw new Error(`删除记录失败: ${errorText(error)}`)
      })

      return {
        title: "memory_bank",
        output: `✓ 已删除记录：${tag}`,
        metadata: {},
      }
    }

    throw new Error(`未实现的命令: ${command}`)
  },
})
