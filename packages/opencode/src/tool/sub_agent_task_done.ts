import { Tool } from "./tool"
import DESCRIPTION from "./sub_agent_task_done.txt"
import z from "zod"

const parameters = z.object({
  direct_response: z.string().describe("对父 agent 分配任务的直接回答。应该回答被问了什么，而不是描述你是如何工作的。示例：如果被要求分析一个文件，回答'此文件实现了 X 功能'，而不是'我读取了文件并发现...'"),
})

export const SubAgentTaskDoneTool = Tool.define("sub_agent_task_done", async () => {
  return {
    description: DESCRIPTION,
    parameters,
    async execute(params: z.infer<typeof parameters>) {
      const direct_response = params.direct_response

      if (!direct_response || typeof direct_response !== "string") {
        return {
          title: "",
          metadata: {},
          output: "Error: Missing or invalid 'direct_response' parameter: must be a non-empty string. Provide a direct answer to the task assigned by the parent agent. Example: {'direct_response': 'This module implements user authentication with JWT tokens'}",
        }
      }

      if (direct_response.trim().length < 5) {
        return {
          title: "",
          metadata: {},
          output: `Error: direct_response is too brief (${direct_response.trim().length} chars). Please provide a meaningful response that directly answers the assigned task.`,
        }
      }

      return {
        title: "",
        metadata: {},
        output: `Task done.\n\nDirect Response:\n${direct_response}`,
      }
    },
  }
})
