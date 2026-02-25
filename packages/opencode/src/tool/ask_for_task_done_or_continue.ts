import { Tool } from "./tool"
import z from "zod"
import { Question } from "../question"

const TASK_DONE_MARKER = "确认任务完成"

export const AskForTaskDoneOrContinueTool = Tool.define("ask_for_task_done_or_continue", {
  description: `请求用户确认任务完成或提供继续工作的反馈。

仅在以下情况使用此工具：
- 所有检查工作已完成
- tasks.md 的所有问题已修复
- 已完成代码关联分析

该工具向用户展示工作摘要，并提供两个选项：
1. 确认任务完成 - 结束任务
2. 提供反馈继续工作 - 用户可以输入反馈，agent 将根据反馈继续工作

规则：
- 始终提供已完成工作的全面摘要
- 在摘要中包含检查统计和主要改进点
- 用户的响应决定是结束还是继续
- 如果用户确认完成，任务立即结束
- 如果用户提供反馈，根据其输入继续改进 tasks.md`,

  parameters: z.object({
    summary: z.string().describe(
      "已完成工作的最终 Markdown 摘要。必须包括：" +
      "1) 检查统计（总任务数、检查阶段、发现问题数），" +
      "2) 主要改进点（清晰度、位置精确性、需求覆盖等），" +
      "3) 更新的文件列表。" +
      "此摘要将在用户决定前展示给他们审阅。最少 10 个字符。"
    ),
  }),

  async execute(params, ctx) {
    const { summary } = params

    // Validate summary length
    if (!summary || summary.trim().length < 10) {
      throw new Error(
        `Summary is too brief (${summary.trim().length} chars). ` +
        "Please provide a meaningful summary that describes what was checked and improved. " +
        "A good summary should include statistics and key improvement points."
      )
    }

    // Ask user for confirmation or feedback
    const answers = await Question.ask({
      sessionID: ctx.sessionID,
      questions: [
        {
          question: `## 工作总结\n\n${summary}\n\n---\n\n请确认任务是否完成，或提供反馈继续修改：`,
          header: "确认或继续",
          options: [
            {
              label: "任务完成",
              description: "确认检查完成，结束任务",
            },
            {
              label: "继续工作",
              description: "需要继续调整，提供反馈意见",
            },
          ],
          multiple: false,
        },
      ],
      tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
    })

    // Parse user response
    const answer = answers[0] // First (and only) question's answer
    if (!answer || answer.length === 0) {
      throw new Error("No answer received from user")
    }

    const userChoice = answer[0].trim()

    // Check if user confirmed task completion
    if (userChoice === "任务完成") {
      ctx.metadata({
        title: "任务已完成",
        metadata: {
          userConfirmed: true,
          completed: true,
          feedback: "", // Empty feedback when task is done
        },
      })

      return {
        title: "Task completed",
        metadata: {
          userConfirmed: true,
          completed: true,
          feedback: "", // Empty feedback when task is done
        },
        output: `✅ 用户确认任务完成\n\n${summary}`,
      }
    }

    // User chose to continue or provided custom feedback
    let feedback: string
    if (userChoice === "继续工作") {
      // User selected "继续工作" but might have added custom text
      // In OpenCode's Question system, custom input is appended or the full answer is custom text
      feedback = answer.length > 1 ? answer.slice(1).join(", ") : "请根据之前的分析继续改进 tasks.md"
    } else {
      // User provided completely custom input
      feedback = userChoice
    }

    ctx.metadata({
      title: "用户要求继续工作",
      metadata: {
        userConfirmed: false,
        completed: false,
        feedback,
      },
    })

    return {
      title: "User feedback - continue working",
      metadata: {
        userConfirmed: false,
        completed: false,
        feedback,
      },
      output: `🔄 用户要求继续工作\n\n**用户反馈**：${feedback}\n\n**下一步行动**：\n1. 仔细分析用户反馈\n2. 回到阶段2，根据反馈生成新的 issues 清单\n3. 逐项修复问题\n4. 修复完成后，再次调用 ask_for_task_done_or_continue\n5. 可以多次迭代，直到用户确认完成`,
    }
  },
})
