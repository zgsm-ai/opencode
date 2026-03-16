import { Tool } from "@/tool/tool"
import z from "zod"

const DESCRIPTION = `After each tool use, the user will respond with the result of that tool use, i.e. if it succeeded or failed, along with any reasons for failure. Once you've received the results of tool uses and can confirm that the task is complete, use this tool to present the result of your work to the user. The user may respond with feedback if they are not satisfied with the result, which you can use to make improvements and try again.

IMPORTANT NOTE: This tool CANNOT be used until you've confirmed from the user that any previous tool uses were successful. Failure to do so will result in code corruption and system failure. Before using this tool, you must confirm that you've received successful results from the user for any previous tool uses. If not, then DO NOT use this tool.

Parameters:
- result: (required) The result of the task. Formulate this result in a way that is final and does not require further input from the user. Don't end your result with questions or offers for further assistance.

Example: Completing after updating CSS
{ "result": "I've updated the CSS to use flexbox layout for better responsiveness" }`

const parameters = z.object({
  result: z.string().describe("Final result message to deliver to the user once the task is complete"),
})

export const AttemptCompletionTool = Tool.define("attempt_completion", {
  description: DESCRIPTION,
  parameters,
  async execute(params, ctx) {
    ctx.metadata({
      title: "Task Completed",
      metadata: {
        result: params.result,
      },
    })

    return {
      title: "Task Completed",
      output: `Task completed successfully.\n\n${params.result}`,
      metadata: {
        completed: true,
        result: params.result,
      },
    }
  },
})
