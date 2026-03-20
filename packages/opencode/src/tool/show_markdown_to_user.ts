import path from "path"
import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./show_markdown_to_user.txt"
import { assertExternalDirectory } from "./external-directory"

const parameters = z.object({
  markdown_file_path: z.string().describe("要向用户展示的 markdown 文件绝对路径（必须是 .md 文件）"),
})

type ShowMarkdownMetadata = {
  path: string
  title: string
  content: string
  lineCount: number
  byteSize: number
  preview: string
}

export const ShowMarkdownToUserTool = Tool.define<typeof parameters, ShowMarkdownMetadata>(
  "show_markdown_to_user",
  {
    description: DESCRIPTION,
    parameters,
    async execute(params, ctx) {
      const raw = params.markdown_file_path.trim()
      if (!raw) throw new Error("Missing required parameter: markdown_file_path")
      if (!path.isAbsolute(raw)) throw new Error(`markdown_file_path must be an absolute path: ${raw}`)

      const filePath = path.resolve(raw)
      if (!filePath.toLowerCase().endsWith(".md")) {
        throw new Error(`markdown_file_path must point to a .md file: ${filePath}`)
      }

      await assertExternalDirectory(ctx, filePath, {
        bypass: Boolean(ctx.extra?.["bypassCwdCheck"]),
      })

      await ctx.ask({
        permission: "read",
        patterns: [filePath],
        always: ["*"],
        metadata: {
          filepath: filePath,
        },
      })

      const file = Bun.file(filePath)
      if (!(await file.exists())) throw new Error(`Markdown file not found: ${filePath}`)

      const stat = await file.stat()
      if (!stat.isFile()) throw new Error(`Path is not a file: ${filePath}`)

      const content = await file.text()
      const lineCount = content ? content.split("\n").length : 0
      const title = path.basename(filePath)
      const preview = content.split("\n").slice(0, 20).join("\n")

      return {
        title: `Show markdown ${title}`,
        output: `Rendered markdown to user: ${filePath}`,
        metadata: {
          path: filePath,
          title,
          content,
          lineCount,
          byteSize: stat.size,
          preview,
        },
      }
    },
  },
)
