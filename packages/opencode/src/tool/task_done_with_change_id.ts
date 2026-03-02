import { Tool } from "./tool"
import DESCRIPTION from "./task_done_with_change_id.txt"
import z from "zod"

const parameters = z.object({
  summary: z.string().describe("最终 Markdown 摘要：包含提案内容概述、任务规划摘要等。"),
  change_id: z.string().describe("提案的 change_id，即创建提案时使用的目录名（如 proposal/<change_id>/ 中的 change_id）。必须与实际创建的目录名完全一致。"),
})

export const TaskDoneWithChangeIdTool = Tool.define("task_done_with_change_id", async () => {
  return {
    description: DESCRIPTION,
    parameters,
    async execute(params: z.infer<typeof parameters>) {
      const summary = params.summary
      const change_id = params.change_id

      if (!summary || typeof summary !== "string") {
        throw new Error(
          "Missing or invalid 'summary' parameter: must be a non-empty string. Provide a Markdown summary that includes: 1) Proposal overview, 2) Task planning summary. Example: {'summary': '## 提案概述\\n- 实现功能 X\\n\\n## 任务规划\\n- 任务1: ...'}",
        )
      }

      if (!change_id || typeof change_id !== "string") {
        throw new Error(
          "Missing or invalid 'change_id' parameter: must be a non-empty string. Provide the exact change_id used when creating the proposal directory. Example: {'change_id': 'feat-add-login-20250105'}",
        )
      }

      if (summary.trim().length < 10) {
        throw new Error(
          `Summary is too brief (${summary.trim().length} chars). Please provide a meaningful summary that describes the proposal and tasks.`,
        )
      }

      if (change_id.trim().length < 3) {
        throw new Error(
          `change_id is too brief (${change_id.trim().length} chars). Please provide a valid change_id that matches the proposal directory name.`,
        )
      }

      return {
        title: "",
        metadata: {
          changeID: change_id.trim(),
        },
        output: `Task done.\n\nChange ID: ${change_id.trim()}\n\nSummary:\n${summary}`,
      }
    },
  }
})
