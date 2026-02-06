import z from "zod"
import path from "path"
import * as fs from "fs/promises"
import { Tool } from "./tool"
import { createTwoFilesPatch, diffLines } from "diff"
import DESCRIPTION from "./str_replace_based_edit_tool.txt"
import { Bus } from "../bus"
import { File } from "../file"
import { FileWatcher } from "../file/watcher"
import { FileTime } from "../file/time"
import { Instance } from "../project/instance"
import { Snapshot } from "@/snapshot"
import { assertExternalDirectory } from "./external-directory"
import { trimDiff } from "./edit"

const COMMANDS = ["view", "create", "str_replace", "insert"] as const
type Command = (typeof COMMANDS)[number]

const MAX_RESPONSE_LEN = 16000
const TRUNCATED_MESSAGE =
  "<response clipped><NOTE>To save on context only part of this file has been shown to you. You should retry this tool after you have searched inside the file with `grep -n` in order to find the line numbers of what you are looking for.</NOTE>"

type Params = z.infer<typeof Parameters>

type Meta = {
  truncated?: boolean
  filediff?: Snapshot.FileDiff
}

const Int = z.number().refine(Number.isInteger, "必须是整数")
const StartLine = z.number().min(1).refine(Number.isInteger, "必须是整数")
const EndLine = z.union([z.literal(-1), z.number().min(1).refine(Number.isInteger, "必须是整数")])
const ViewRange = z
  .tuple([StartLine, EndLine])
  .describe(
    "当 `path` 指向文件时，`view` 命令的参数。必须是 [start_line, end_line] 两个整数，例如 [11, 12] 显示第 11 和 12 行。索引从 1 开始。设置 [start_line, -1] 显示从 start_line 到文件末尾的所有行。最大行号由文件实际行数决定（运行时校验）。",
  )

const Parameters = z
  .object({
    command: z.enum(COMMANDS).describe(`要执行的命令。可选项：${COMMANDS.join(", ")}。`),
    path: z.string().describe("文件或目录的绝对路径，例如 `/repo/file.py` 或 `/repo`。"),
    view_range: ViewRange
      .optional()
      .describe(
        "`view` 命令在查看文件时必需；当 `path` 指向目录时不允许提供该参数。格式为 [start_line, end_line]，例如 [1, 200] 或 [10, -1]。",
      ),
    file_text: z.string().optional().describe("`create` 命令的必需参数，包含要创建的文件内容。"),
    old_str: z.string().optional().describe("`str_replace` 命令的必需参数，包含 `path` 中要替换的字符串。"),
    new_str: z
      .union([z.string(), z.null()])
      .optional()
      .describe(
        "`str_replace` 命令的可选参数，包含替换后的新字符串。可省略/设为 null 以删除匹配到的 `old_str`。`insert` 命令的必需参数（必须是 string）。",
      ),
    insert_line: Int.min(0)
      .optional()
      .describe("`insert` 命令的必需参数。`new_str` 将插入到 `path` 的第 `insert_line` 行之后。"),
  })
  .superRefine((value, ctx) => {
    const issue = (path: (string | number)[], message: string) => {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message,
      })
    }

    if (value.command === "create" && value.file_text === undefined) {
      issue(["file_text"], "Parameter `file_text` is required for command: create.")
    }
    if (value.command === "str_replace" && value.old_str === undefined) {
      issue(["old_str"], "Parameter `old_str` is required for command: str_replace.")
    }
    if (value.command === "insert") {
      if (value.insert_line === undefined) {
        issue(["insert_line"], "Parameter `insert_line` is required for command: insert.")
      }
      if (typeof value.new_str !== "string") {
        issue(["new_str"], "Parameter `new_str` is required and must be a string for command: insert.")
      }
    }
  })

function normalizeNewlines(text: string): string {
  return text.replaceAll("\r\n", "\n").replaceAll("\r", "\n")
}

function maybeTruncate(content: string, limit: number = MAX_RESPONSE_LEN) {
  if (!limit || content.length <= limit) {
    return { content, truncated: false }
  }
  return { content: content.slice(0, limit) + TRUNCATED_MESSAGE, truncated: true }
}

async function readText(target: string): Promise<string> {
  const file = Bun.file(target)
  const buffer = await file.arrayBuffer().catch((error) => {
    throw new Error(`Ran into ${error} while trying to read ${target}`)
  })
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer)
}

async function writeText(target: string, text: string) {
  const normalized = normalizeNewlines(text)
  await Bun.write(target, normalized).catch((error) => {
    throw new Error(`Ran into ${error} while trying to write to ${target}`)
  })
}

function makeOutput(text: string, label: string, initLine = 1) {
  const truncated = maybeTruncate(text)
  const numbered = truncated.content
    .split("\n")
    .map((line, index) => `${String(index + initLine).padStart(6, " ")}\t${line}`)
    .join("\n")
  return {
    output: `Here's the result of running \`cat -n\` on ${label}:\n${numbered}\n`,
    truncated: truncated.truncated,
  }
}

function findOverlaps(text: string, sub: string): number[] {
  if (sub === "") return []
  const indices: number[] = []
  let start = 0
  while (true) {
    const idx = text.indexOf(sub, start)
    if (idx === -1) break
    indices.push(idx)
    start = idx + 1
  }
  return indices
}

function lineNumber(text: string, index: number): number {
  let count = 1
  let pos = text.indexOf("\n")
  while (pos !== -1 && pos < index) {
    count += 1
    pos = text.indexOf("\n", pos + 1)
  }
  return count
}

function replaceOnceExact(content: string, oldStr: string, newStr: string | null, target: string) {
  const text = normalizeNewlines(content)
  const oldText = normalizeNewlines(oldStr)
  const newText = normalizeNewlines(newStr ?? "")
  if (oldText === "") {
    throw new Error(
      "Invalid `old_str`: empty string is not allowed. " +
        "It would match everywhere and can lead to unintended edits. " +
        "Please provide one or more full lines copied from `view`.",
    )
  }
  if (oldText === newText) {
    throw new Error(
      "No replacement was performed: `old_str` and `new_str` are identical. " +
        `No changes were applied to ${target}. ` +
        "If you need to perform complex text replacements, consider using the bash tool with sed or other text processing commands.",
    )
  }
  const matches = findOverlaps(text, oldText)
  if (matches.length === 0) {
    throw new Error(
      `No replacement performed: \`old_str\` (\`${oldText}\`) was not found verbatim in \`${target}\`.\n` +
        "Tip: Double-check for typos, whitespace differences, or updated content.\n" +
        "You can use the view command to inspect the file contents and ensure your `old_str` matches exactly.",
    )
  }
  if (matches.length > 1) {
    const lines = matches.map((idx) => lineNumber(text, idx))
    const preview = lines.slice(0, 10)
    const more = preview.length === lines.length ? "" : ` (and ${lines.length - preview.length} more)`
    throw new Error(
      "No replacement was performed. " +
        `Multiple occurrences of \`old_str\` found starting at lines ${preview}${more}. ` +
        "Please include more surrounding context in `old_str` to make it unique.",
    )
  }
  const idx = matches[0]
  return text.slice(0, idx) + newText + text.slice(idx + oldText.length)
}

function insertText(content: string, insertLine: number, text: string) {
  const normalized = normalizeNewlines(content)
  const lines = normalized.split("\n")
  const count = lines.length
  if (insertLine < 0 || insertLine > count) {
    throw new Error(
      `Invalid \`insert_line\` parameter: ${insertLine}. It should be within the range of lines of the file: [0, ${count}]`,
    )
  }
  const next = lines.slice(0, insertLine).concat(text.split("\n"), lines.slice(insertLine))
  return next.join("\n")
}

function treeKey(entries: Record<string, boolean>, entry: string) {
  const parts = entry.split("/")
  const pieces = parts.map((part, index) => {
    const leaf = index === parts.length - 1
    const isFile = leaf && !entries[entry]
    const flag = isFile ? "1" : "0"
    return `${flag}${part.toLowerCase()}`
  })
  return pieces.join("\u0000")
}

function fixTreeConnectors(lines: string[]) {
  if (lines.length <= 1) return lines
  const result = [...lines]
  let seen = new Set<number>()
  for (let i = result.length - 1; i >= 1; i -= 1) {
    const line = result[i]
    const level = (() => {
      let depth = 0
      let pos = 0
      while (pos < line.length) {
        const chunk = line.slice(pos, pos + 4)
        if (chunk === "│   " || chunk === "    ") {
          depth += 1
          pos += 4
          continue
        }
        break
      }
      return depth
    })()
    if (!seen.has(level)) {
      const prefix = "│   ".repeat(level)
      if (line.startsWith(prefix + "├── ")) {
        result[i] = prefix + "└── " + line.slice(prefix.length + 4)
      }
      seen.add(level)
      continue
    }
    seen = new Set(Array.from(seen).filter((value) => value <= level))
  }
  return result
}

async function formatDirectoryTree(target: string) {
  const entries: Record<string, boolean> = {}
  const scan = async (dir: string, depth: number) => {
    const items = await fs.readdir(dir, { withFileTypes: true })
    for (const item of items) {
      if (item.name.startsWith(".")) continue
      const abs = path.join(dir, item.name)
      const rel = path.relative(target, abs).replaceAll("\\", "/")
      if (!rel) continue
      entries[rel] = item.isDirectory()
      if (item.isDirectory() && depth < 2) {
        await scan(abs, depth + 1)
      }
    }
  }
  await scan(target, 1)
  const names = Object.keys(entries)
  if (names.length === 0) {
    return `Directory \`${target}\` is empty or contains only hidden items.\n`
  }
  const sorted = names.sort((a, b) => {
    const keyA = treeKey(entries, a)
    const keyB = treeKey(entries, b)
    if (keyA < keyB) return -1
    if (keyA > keyB) return 1
    return 0
  })
  const root = path.basename(target) || target
  const lines = [root.endsWith("/") ? root : `${root}/`]
  for (const entry of sorted) {
    const parts = entry.split("/")
    const depth = parts.length - 1
    const name = parts[parts.length - 1]
    const isDir = entries[entry]
    const prefix = depth === 0 ? "├── " : `${"│   ".repeat(depth)}├── `
    const display = isDir ? `${name}/` : name
    lines.push(prefix + display)
  }
  const fixed = fixTreeConnectors(lines)
  return `Directory structure of \`${target}\` (up to 2 levels, excluding hidden items):\n${fixed.join("\n")}\n`
}

function normalizeLineEndings(text: string): string {
  return text.replaceAll("\r\n", "\n")
}

function normalizeInputPath(target: string): string {
  if (process.platform !== "win32") return target
  const cleaned = target.replace(/\\/g, "/")
  const match = cleaned.match(/^\/([a-zA-Z])\/(.*)/)
  if (!match) return target
  const drive = match[1]?.toUpperCase()
  const rest = match[2] ?? ""
  return `${drive}:\\${rest.replace(/\//g, "\\")}`
}

export const StrReplaceBasedEditTool = Tool.define<typeof Parameters, Meta>("str_replace_based_edit_tool", {
  description: DESCRIPTION,
  parameters: Parameters,
  formatValidationError(error: z.ZodError): string {
    const commandIssue = error.issues.find((issue) => issue.path.join(".") === "command")
    if (commandIssue) {
      return (
        `Missing or invalid parameter 'command' for the str_replace_based_edit_tool tool. ` +
        `Available commands: ${COMMANDS.join(", ")}. ` +
        `Example: {'command': 'view', 'path': '/path/to/file'}`
      )
    }

    const pathIssue = error.issues.find((issue) => issue.path.join(".") === "path")
    if (pathIssue) {
      if (pathIssue.code === "invalid_type" && pathIssue.message.includes("received undefined")) {
        return (
          `Missing required parameter 'path' for the str_replace_based_edit_tool tool. ` +
          `Provide an absolute path to a file or directory. ` +
          `Example: {'command': 'view', 'path': '/absolute/path/to/file.py'}`
        )
      }
      return "Parameter `path` must be a string absolute path, e.g. `/repo/file.py`."
    }

    const viewRangeIssue = error.issues.find((issue) => issue.path.join(".") === "view_range")
    if (viewRangeIssue) {
      return (
        "Parameter `view_range` is required for command: view and must be a list of two integers [start_line, end_line]. " +
        "Examples: [1, 50] shows lines 1-50, [10, -1] shows from line 10 to end of file. " +
        "Line numbers start at 1."
      )
    }

    const issues = error.issues
      .map((issue) => {
        const p = issue.path.length > 0 ? issue.path.join(".") : "root"
        return `  - ${p}: ${issue.message}`
      })
      .join("\n")

    return [
      "str_replace_based_edit_tool 参数校验失败，请根据以下错误修正输入：",
      issues,
      "",
      "常见示例：",
      `- view 文件：{"command":"view","path":"/abs/file.ts"}`,
      `- view 行范围：{"command":"view","path":"/abs/file.ts","view_range":[1,50]}`,
      `- create：{"command":"create","path":"/abs/new.txt","file_text":"...内容..."}`,
      `- str_replace：{"command":"str_replace","path":"/abs/file.ts","old_str":"...","new_str":"..."}`,
      `- insert：{"command":"insert","path":"/abs/file.ts","insert_line":10,"new_str":"...要插入的内容..."}`,
    ].join("\n")
  },
  async execute(params: Params, ctx) {
    const target = normalizeInputPath(params.path)

    if (!path.isAbsolute(target)) {
      const root = path.parse(Instance.directory).root || "/"
      const suggestion = path.join(root, target)
      throw new Error(
        `The path ${target} is not an absolute path, it should start with \`/\`. Maybe you meant ${suggestion}?`,
      )
    }

    await assertExternalDirectory(ctx, target)

    const stat = await Bun.file(target).stat().catch(() => undefined)
    const exists = Boolean(stat)
    const isDir = Boolean(stat && stat.isDirectory())
    if (!exists && params.command !== "create") {
      throw new Error(`The path ${target} does not exist. Please provide a valid path.`)
    }
    if (exists && params.command === "create") {
      throw new Error(`File already exists at: ${target}. Cannot overwrite files using command \`create\`.`)
    }
    if (isDir && params.command !== "view") {
      throw new Error(`The path ${target} is a directory and only the \`view\` command can be used on directories`)
    }

    if (params.command === "view") {
      const viewRange = params.view_range
      if (!isDir && viewRange === undefined) {
        throw new Error(
          "Parameter `view_range` is required for command: view when `path` points to a file. " +
            "Please specify the line range to view, e.g. [1, 50] or [10, -1].",
        )
      }

      await ctx.ask({
        permission: "read",
        patterns: [target],
        always: ["*"],
        metadata: {},
      })

      if (isDir) {
        const output = await formatDirectoryTree(target)
        const truncated = maybeTruncate(output)
        return {
          title: path.relative(Instance.worktree, target) || target,
          output: truncated.content,
          metadata: {
            truncated: truncated.truncated,
          },
        }
      }

      const raw = await readText(target)
      let text = normalizeNewlines(raw)
      let initLine = 1
      if (viewRange) {
        const lines = text.split("\n")
        const total = lines.length
        const startLine = viewRange[0]
        const endLine = viewRange[1]
        if (startLine < 1 || startLine > total) {
          throw new Error(
            `Invalid \`view_range\`: ${viewRange}. Its first element \`${startLine}\` should be within the range of lines of the file: [1, ${total}]`,
          )
        }
        if (endLine > total) {
          throw new Error(
            `Invalid \`view_range\`: ${viewRange}. Its second element \`${endLine}\` should be smaller than the number of lines in the file: \`${total}\``,
          )
        }
        if (endLine !== -1 && endLine < startLine) {
          throw new Error(
            `Invalid \`view_range\`: ${viewRange}. Its second element \`${endLine}\` should be larger or equal than its first \`${startLine}\``,
          )
        }
        initLine = startLine
        if (endLine === -1) {
          text = lines.slice(startLine - 1).join("\n")
        } else {
          text = lines.slice(startLine - 1, endLine).join("\n")
        }
      }

      const output = makeOutput(text, target, initLine)
      FileTime.read(ctx.sessionID, target)
      return {
        title: path.relative(Instance.worktree, target) || target,
        output: output.output,
        metadata: {
          truncated: output.truncated,
        },
      }
    }

    if (params.command === "create") {
      const text = params.file_text
      if (typeof text !== "string") {
        throw new Error(
          "Parameter `file_text` is required and must be a string for command: create. " +
            `Received: ${text === undefined ? "None" : typeof text}. ` +
            "Provide the complete file content as a string. " +
            "Example: {'command': 'create', 'path': '/path/to/file.txt', 'file_text': 'file content here'}",
        )
      }

      const contentNew = normalizeNewlines(text)
      const diff = trimDiff(createTwoFilesPatch(target, target, "", contentNew))
      await ctx.ask({
        permission: "edit",
        patterns: [path.relative(Instance.worktree, target)],
        always: ["*"],
        metadata: {
          filepath: target,
          diff,
        },
      })

      await FileTime.withLock(target, async () => {
        await writeText(target, contentNew)
        await Bus.publish(File.Event.Edited, { file: target })
        await Bus.publish(FileWatcher.Event.Updated, { file: target, event: "add" })
        FileTime.read(ctx.sessionID, target)
      })

      const filediff: Snapshot.FileDiff = {
        file: target,
        before: "",
        after: contentNew,
        additions: 0,
        deletions: 0,
      }
      for (const change of diffLines("", contentNew)) {
        if (change.added) filediff.additions += change.count || 0
        if (change.removed) filediff.deletions += change.count || 0
      }

      const output = `✓ File created successfully at: ${target}`
      return {
        title: path.relative(Instance.worktree, target) || target,
        output,
        metadata: {
          filediff,
          truncated: false,
        },
      }
    }

    if (params.command === "str_replace") {
      const oldStr = params.old_str
      const newStr = params.new_str ?? null
      if (typeof oldStr !== "string") {
        throw new Error(
          "Parameter `old_str` is required and must be a string for command: str_replace. " +
            `Received: ${oldStr === undefined ? "None" : typeof oldStr}. ` +
            "The `old_str` must match EXACTLY one or more consecutive lines in the file, " +
            "including all whitespace and indentation. Use the `view` command first to see the exact content.",
        )
      }

      let contentOld = ""
      let contentNew = ""
      let diff = ""

      await FileTime.withLock(target, async () => {
        await FileTime.assert(ctx.sessionID, target)
        contentOld = normalizeNewlines(await readText(target))
        contentNew = replaceOnceExact(contentOld, oldStr, newStr, target)
        diff = trimDiff(
          createTwoFilesPatch(target, target, normalizeLineEndings(contentOld), normalizeLineEndings(contentNew)),
        )
        await ctx.ask({
          permission: "edit",
          patterns: [path.relative(Instance.worktree, target)],
          always: ["*"],
          metadata: {
            filepath: target,
            diff,
          },
        })
        await writeText(target, contentNew)
        await Bus.publish(File.Event.Edited, { file: target })
        await Bus.publish(FileWatcher.Event.Updated, { file: target, event: "change" })
        FileTime.read(ctx.sessionID, target)
      })

      const filediff: Snapshot.FileDiff = {
        file: target,
        before: contentOld,
        after: contentNew,
        additions: 0,
        deletions: 0,
      }
      for (const change of diffLines(contentOld, contentNew)) {
        if (change.added) filediff.additions += change.count || 0
        if (change.removed) filediff.deletions += change.count || 0
      }

      const output = `✓ The file ${target} has been edited successfully.`
      return {
        title: path.relative(Instance.worktree, target) || target,
        output,
        metadata: {
          filediff,
          truncated: false,
        },
      }
    }

    const insertLine = params.insert_line
    const insertTextValue = params.new_str
    if (params.command !== "insert") {
      throw new Error(
        `Unrecognized command ${params.command}. The allowed commands for the str_replace_based_edit_tool tool are: ${COMMANDS.join(
          ", ",
        )}`,
      )
    }
    if (insertLine === undefined || !Number.isInteger(insertLine)) {
      throw new Error(
        "Parameter `insert_line` is required and must be an integer for command: insert. " +
          `Received: ${insertLine === undefined ? "None" : typeof insertLine}. ` +
          "The `insert_line` specifies the line number AFTER which the new content will be inserted. " +
          "Use 0 to insert at the beginning of the file. Use the `view` command to check line numbers.",
      )
    }
    if (typeof insertTextValue !== "string") {
      throw new Error(
        "Parameter `new_str` is required and must be a string for command: insert. " +
          `Received: ${insertTextValue === undefined ? "None" : typeof insertTextValue}. ` +
          `Provide the text content to insert after line ${insertLine}.`,
      )
    }

    let contentOld = ""
    let contentNew = ""
    let diff = ""

    await FileTime.withLock(target, async () => {
      await FileTime.assert(ctx.sessionID, target)
      contentOld = await readText(target)
      contentNew = insertText(contentOld, insertLine, insertTextValue)
      diff = trimDiff(
        createTwoFilesPatch(target, target, normalizeLineEndings(contentOld), normalizeLineEndings(contentNew)),
      )
      await ctx.ask({
        permission: "edit",
        patterns: [path.relative(Instance.worktree, target)],
        always: ["*"],
        metadata: {
          filepath: target,
          diff,
        },
      })
      await writeText(target, contentNew)
      await Bus.publish(File.Event.Edited, { file: target })
      await Bus.publish(FileWatcher.Event.Updated, { file: target, event: "change" })
      FileTime.read(ctx.sessionID, target)
    })

    const filediff: Snapshot.FileDiff = {
      file: target,
      before: contentOld,
      after: contentNew,
      additions: 0,
      deletions: 0,
    }
    for (const change of diffLines(contentOld, contentNew)) {
      if (change.added) filediff.additions += change.count || 0
      if (change.removed) filediff.deletions += change.count || 0
    }

    const output = `✓ The file ${target} has been edited successfully (insertion at line ${insertLine}).`
    return {
      title: path.relative(Instance.worktree, target) || target,
      output,
      metadata: {
        filediff,
        truncated: false,
      },
    }
  },
})
