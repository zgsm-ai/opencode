import { Tool } from "./tool"
import DESCRIPTION from "./task_done.txt"
import z from "zod"

const parameters = z.object({
  summary: z.string().describe("A summary of what was completed, including what was done, verification results, and key changes"),
})

export const TaskDoneTool = Tool.define("task_done", async () => {
  return {
    description: DESCRIPTION,
    parameters,
    async execute(params: z.infer<typeof parameters>) {
      // 检查 summary 参数是否存在且为字符串
      if (!params.summary || typeof params.summary !== "string") {
        return {
          title: "",
          metadata: {},
          output: "Error: summary parameter is required and must be a string.",
        }
      }

      // 检查 summary 长度 >= 10 个字符
      if (params.summary.length < 10) {
        return {
          title: "",
          metadata: {},
          output: `Error: summary must be at least 10 characters long. Current length: ${params.summary.length}`,
        }
      }

      // 验证成功，返回任务完成信息
      return {
        title: "",
        metadata: {},
        output: `Task done.\n\nSummary:\n${params.summary}`,
      }
    },
  }
})
