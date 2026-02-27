import { Tool } from "./tool"
import DESCRIPTION from "./task_done.txt"
import z from "zod"

const parameters = z.object({
  summary: z.string().describe("最终 Markdown 摘要：实现内容、验证结果、关键更改（编码任务）或直接回答（问答任务）。"),
})

export const TaskDoneTool = Tool.define("task_done", async () => {
  return {
    description: DESCRIPTION,
    parameters,
    async execute(params: z.infer<typeof parameters>) {
      if (!params.summary || typeof params.summary !== "string") {
        return {
          title: "",
          metadata: {},
          output:
            "Missing or invalid 'summary' parameter: must be a non-empty string. " +
            "Provide a Markdown summary that includes: " +
            "1) What was implemented/done, " +
            "2) Verification results (test outputs, command results), " +
            "3) Key changes made. " +
            "Example: {'summary': '## Implementation\\n- Added feature X\\n\\n## Verification\\n- Tests pass\\n\\n## Changes\\n- Modified file.py'}",
        }
      }

      if (params.summary.trim().length < 10) {
        return {
          title: "",
          metadata: {},
          output:
            `Summary is too brief (${params.summary.trim().length} chars). ` +
            "Please provide a meaningful summary that describes what was done and verified. " +
            "A good summary should be at least a few sentences.",
        }
      }

      return {
        title: "",
        metadata: {},
        output: `Task done.\n\nSummary:\n${params.summary}`,
      }
    },
  }
})
