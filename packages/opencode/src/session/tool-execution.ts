import { MessageV2 } from "./message-v2"
import { Session } from "."
import { Log } from "@/util/log"
import { Identifier } from "@/id/id"
import { PermissionNext } from "@/permission/next"
import { Agent } from "@/agent/agent"
import { toolAlias } from "@/costrict/utils/tool-transform-v2"
import { Truncate } from "@/tool/truncation"

const log = Log.create({ service: "tool-execution" })
const DOOM_LOOP_THRESHOLD = 3

export namespace ToolExecution {
  export type ExecutionResult = {
    shouldContinue: boolean  // 是否继续主循环
    hasToolCalls: boolean    // 是否有工具调用
    shouldRetry: boolean     // 是否应该重试（无工具且未达最大重试）
    needsReminder: boolean   // 是否需要插入提醒消息（达到最大重试）
    blocked: boolean         // 工具被拒绝，需要停止
  }

  /**
   * 拦截过长的工具结果
   * 对 output 和 error 字段进行拦截
   */
  async function interceptToolResults(toolParts: MessageV2.ToolPart[]): Promise<void> {
    for (const part of toolParts) {
      // 只处理已完成或错误状态的工具
      if (part.state.status === "completed") {
        const result = await Truncate.output(part.state.output, { toolName: part.tool })
        if (result.truncated) {
          // 更新工具结果
          await Session.updatePart({
            ...part,
            state: {
              ...part.state,
              output: result.content,
              metadata: {
                ...part.state.metadata,
                truncated: true,
              },
            },
          })
          log.info("intercepted oversized tool output", {
            toolName: part.tool,
            callID: part.callID,
          })
        }
      } else if (part.state.status === "error") {
        const result = await Truncate.output(part.state.error, { toolName: part.tool })
        if (result.truncated) {
          // 更新错误信息
          await Session.updatePart({
            ...part,
            state: {
              ...part.state,
              error: result.content,
              metadata: {
                ...part.state.metadata,
                truncated: true,
              },
            },
          })
          log.info("intercepted oversized tool error", {
            toolName: part.tool,
            callID: part.callID,
          })
        }
      }
    }
  }

  /**
   * 执行工具验证：零工具检查 + 批准检查 + 重复工具检查
   *
   * @param input - 包含 assistant 消息、会话ID、重试次数的上下文
   * @returns ExecutionResult - 指示下一步操作
   */
  export async function executeToolsWithValidation(input: {
    assistantMessage: MessageV2.Assistant
    sessionID: string
    retryAttempt: number
    maxRetryAttempts: number
  }): Promise<ExecutionResult> {

    // 1. 零工具检查
    const allParts = await MessageV2.parts(input.assistantMessage.id)
    const toolParts = allParts.filter(p => p.type === "tool") as MessageV2.ToolPart[]

    const hasToolCalls = toolParts.some(part =>
      ["running", "completed", "error"].includes(part.state.status)
    )

    log.info("tool validation check", {
      sessionID: input.sessionID,
      messageID: input.assistantMessage.id,
      hasToolCalls,
      toolCount: toolParts.length,
      retryAttempt: input.retryAttempt
    })

    // 如果没有工具调用
    if (!hasToolCalls) {
      // 已达最大重试次数 - 插入提醒消息
      if (input.retryAttempt >= input.maxRetryAttempts) {
        log.warn("max retries reached without tool calls, inserting reminder", {
          sessionID: input.sessionID,
          messageID: input.assistantMessage.id,
          attempts: input.retryAttempt
        })

        await insertToolReminderMessage(input.sessionID, input.assistantMessage)

        return {
          shouldContinue: true,   // 继续循环让模型重新响应
          hasToolCalls: false,
          shouldRetry: false,
          needsReminder: true,
          blocked: false
        }
      }

      // 未达最大重试次数 - 请求重试
      return {
        shouldContinue: true,
        hasToolCalls: false,
        shouldRetry: true,
        needsReminder: false,
        blocked: false
      }
    }

    // 2. 工具批准检查 - 检查是否有被拒绝的工具
    const rejectedTools = toolParts.filter(part => {
      if (part.state.status !== "error") return false
      const error = part.state.error
      return error && (
        error.includes("rejected permission") ||
        error.includes("RejectedError") ||
        error.includes("CorrectedError") ||
        error.includes("DeniedError")
      )
    })

    if (rejectedTools.length > 0) {
      log.warn("tool rejection detected", {
        sessionID: input.sessionID,
        messageID: input.assistantMessage.id,
        rejectedCount: rejectedTools.length
      })

      // 插入user消息，说明工具被拒绝，需要换一种方式
      await insertRejectionMessage(
        input.sessionID,
        input.assistantMessage,
        rejectedTools
      )

      return {
        shouldContinue: true,   // 继续循环，让模型看到拒绝消息后重新响应
        hasToolCalls: true,
        shouldRetry: false,
        needsReminder: false,
        blocked: false  // 不再停止，而是让模型换方式
      }
    }

    // 2.5. 拦截过长的工具结果（在批准之后，doom loop 检查之前）
    await interceptToolResults(toolParts)

    // 3. 重复工具检查 (Doom Loop)
    if (toolParts.length >= DOOM_LOOP_THRESHOLD) {
      const lastThree = toolParts.slice(-DOOM_LOOP_THRESHOLD)
      const firstTool = lastThree[0]

      const isDoomLoop = lastThree.every(p =>
        p.tool === firstTool.tool &&
        p.state.status !== "pending" &&
        JSON.stringify(p.state.input) === JSON.stringify(firstTool.state.input)
      )

      if (isDoomLoop) {
        log.warn("doom loop detected", {
          sessionID: input.sessionID,
          tool: firstTool.tool,
          input: firstTool.state.input,
          occurrences: DOOM_LOOP_THRESHOLD
        })

        // 直接插入user消息，不询问用户
        await insertDoomLoopMessage(
          input.sessionID,
          input.assistantMessage,
          firstTool.tool,
          firstTool.state.input
        )

        return {
          shouldContinue: true,   // 继续循环，让模型看到doom loop提示后调整策略
          hasToolCalls: true,
          shouldRetry: false,
          needsReminder: false,
          blocked: false
        }
      }
    }

    // 4. 正常情况 - 有工具调用且未触发任何检查
    return {
      shouldContinue: false,
      hasToolCalls: true,
      shouldRetry: false,
      needsReminder: false,
      blocked: false
    }
  }

  /**
   * 检查内容是否包含 XML 工具调用模式
   */
  function containsXmlToolCallPatterns(content: string | undefined): boolean {
    if (!content) return false
    // 简单检查：如果内容包含 "<" 和 ">"，可能包含 XML
    return content.includes("<") && content.includes(">")
  }

  /**
   * 构建零工具调用响应消息
   */
  async function buildZeroToolCallResponse(
    assistantMessage: MessageV2.Assistant,
    exitToolName: string
  ): Promise<string> {
    // 基础消息
    const baseMessage = `You did not call any tools. If the task is fully completed, please use the \`${exitToolName}\` tool. Otherwise, use other tools to help you complete the task.`

    // 获取 assistant 消息的文本内容
    const allParts = await MessageV2.parts(assistantMessage.id)
    const textParts = allParts.filter(p => p.type === "text") as MessageV2.TextPart[]
    const content = textParts.map(p => p.text).join("\n")

    // 如果没有内容或不包含 XML 模式，直接返回基础消息
    if (!content || !containsXmlToolCallPatterns(content)) {
      return baseMessage
    }

    // 检测当前模型是否是 GLM 系列
    const modelID = assistantMessage.modelID?.toLowerCase() || ""
    const isGlmModel = modelID.includes("glm")

    let formatWarning: string
    if (isGlmModel) {
      // GLM 特定的 XML 格式警告
      formatWarning = `It could be that you are using the tool call incorrectly. When calling a tool, it must strictly follow the format below:
\`\`\`
<tool_call>
function_name
<arg_key>parameter_name1</arg_key><arg_value>parameter_value1</arg_value>
<arg_key>parameter_name2</arg_key><arg_value>parameter_value2</arg_value>
...
</tool_call>
\`\`\`
Additionally, you need to ensure that both the function name and parameters are correct.
Unregistered tools are not permitted, and the parameters used must strictly match the description of the corresponding tool.

`
    } else {
      // 通用的工具调用格式警告
      formatWarning = `It appears that you attempted to call a tool but the format was incorrect.
Please ensure you are using the correct tool calling format.
Make sure the function name is valid and all required parameters are provided correctly.
Unregistered tools are not permitted, and the parameters used must strictly match the description of the corresponding tool.

`
    }

    return formatWarning + baseMessage
  }

  /**
   * 插入提醒消息，强制要求模型使用工具
   */
  async function insertToolReminderMessage(
    sessionID: string,
    assistantMessage: MessageV2.Assistant
  ) {
    const agent = await Agent.get(assistantMessage.agent)
    const configuredExitToolName = (agent?.options?.exitToolName as string | undefined) || "task_done"
    const exitToolName = toolAlias(configuredExitToolName)

    // 构建零工具调用响应消息
    const reminderText = await buildZeroToolCallResponse(assistantMessage, exitToolName)

    const reminderMessage: MessageV2.User = {
      id: Identifier.ascending("message"),
      sessionID,
      role: "user",
      time: { created: Date.now() },
      agent: assistantMessage.agent,
      model: {
        providerID: assistantMessage.providerID,
        modelID: assistantMessage.modelID
      }
    }

    await Session.updateMessage(reminderMessage)

    await Session.updatePart({
      id: Identifier.ascending("part"),
      messageID: reminderMessage.id,
      sessionID,
      type: "text",
      text: reminderText,
      synthetic: true
    } as MessageV2.TextPart)

    log.info("inserted tool reminder message", {
      sessionID,
      reminderMessageID: reminderMessage.id
    })
  }

  /**
   * 插入工具拒绝消息，说明用户不同意，需要换一种方式
   */
  async function insertRejectionMessage(
    sessionID: string,
    assistantMessage: MessageV2.Assistant,
    rejectedTools: MessageV2.ToolPart[]
  ) {
    const rejectionMessage: MessageV2.User = {
      id: Identifier.ascending("message"),
      sessionID,
      role: "user",
      time: { created: Date.now() },
      agent: assistantMessage.agent,
      model: {
        providerID: assistantMessage.providerID,
        modelID: assistantMessage.modelID
      }
    }

    await Session.updateMessage(rejectionMessage)

    // 构建拒绝原因文本
    const reasons = rejectedTools.map(tool => {
      const error = tool.state.status === "error" ? tool.state.error : "Unknown error"
      return `- Tool "${tool.tool}" was rejected: ${error || "User did not approve"}`
    }).join("\n")

    await Session.updatePart({
      id: Identifier.ascending("part"),
      messageID: rejectionMessage.id,
      sessionID,
      type: "text",
      text: `The following tool calls were rejected by the user:\n\n${reasons}\n\nPlease find an alternative approach to accomplish the task without using these rejected tools. You may need to use different tools.`,
      synthetic: true
    } as MessageV2.TextPart)

    log.info("inserted rejection message", {
      sessionID,
      rejectionMessageID: rejectionMessage.id,
      rejectedCount: rejectedTools.length
    })
  }

  /**
   * 插入doom loop消息，说明检测到重复调用
   */
  async function insertDoomLoopMessage(
    sessionID: string,
    assistantMessage: MessageV2.Assistant,
    toolName: string,
    toolInput: any
  ) {
    const doomLoopMessage: MessageV2.User = {
      id: Identifier.ascending("message"),
      sessionID,
      role: "user",
      time: { created: Date.now() },
      agent: assistantMessage.agent,
      model: {
        providerID: assistantMessage.providerID,
        modelID: assistantMessage.modelID
      }
    }

    await Session.updateMessage(doomLoopMessage)

    await Session.updatePart({
      id: Identifier.ascending("part"),
      messageID: doomLoopMessage.id,
      sessionID,
      type: "text",
      text: `连续检测到多次调用相同工具"${toolName}"且参数也相同，这可能是陷入死循环的迹象。请停止重复调用，重新分析问题并调整策略。`,
      synthetic: true
    } as MessageV2.TextPart)

    log.info("inserted doom loop message", {
      sessionID,
      doomLoopMessageID: doomLoopMessage.id,
      tool: toolName
    })
  }
}
