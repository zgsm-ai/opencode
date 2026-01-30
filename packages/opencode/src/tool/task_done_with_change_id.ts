import { Tool } from "./tool"
import z from "zod"

const parameters = z.object({
  summary: z.string().describe(
    "最终 Markdown 摘要：包含提案内容概述、任务规划摘要等。摘要应有意义且详细（最少 10 个字符）。"
  ),
  change_id: z.string().describe(
    "提案的 change_id，即创建提案时使用的目录名（如 proposal/<change_id>/ 中的 change_id）。" +
    "必须与实际创建的目录名完全一致（最少 3 个字符）。"
  ),
})

export const TaskDoneWithChangeIdTool = Tool.define("task_done_with_change_id", async () => {
  return {
    description: `标记提案任务完成，并提供生成的 change_id。此工具专门用于结束任务进行结果汇报。

应在以下情况调用此工具：
1. 所有提案文档已创建（proposal.md, tasks.md 等）
2. change_id 目录结构在 proposal/<change_id>/ 下已完成
3. 提案已准备好供审查或实施

必须提供在创建提案目录时使用的 change_id。`,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const { summary, change_id } = params

      // Validate summary length
      if (summary.trim().length < 10) {
        throw new Error(
          `Summary is too brief (${summary.trim().length} chars). ` +
          "Please provide a meaningful summary that describes the proposal and tasks."
        )
      }

      // Validate change_id format and length
      if (!/^[a-zA-Z0-9_-]+$/.test(change_id)) {
        throw new Error(
          `Invalid change_id "${change_id}". Change ID must only contain letters, numbers, hyphens, and underscores.`
        )
      }

      if (change_id.trim().length < 3) {
        throw new Error(
          `change_id is too brief (${change_id.trim().length} chars). ` +
          "Please provide a valid change_id that matches the proposal directory name."
        )
      }

      // Store metadata for UI display
      ctx.metadata({
        title: `Proposal completed: ${change_id.trim()}`,
        metadata: {
          changeID: change_id.trim(),
          summary: summary.trim(),
        },
      })

      // Return structured output following Python reference implementation
      return {
        title: `Proposal: ${change_id.trim()}`,
        metadata: {
          changeID: change_id.trim(),
          summary: summary.trim(),
        },
        output: `Task done.\n\nChange ID: ${change_id.trim()}\n\nSummary:\n${summary}`
      }
    },
  }
})
