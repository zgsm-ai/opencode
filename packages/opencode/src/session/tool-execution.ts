import { MessageV2 } from "./message-v2"
import { Session } from "."
import { Log } from "@/util/log"
import { Identifier } from "@/id/id"

const log = Log.create({ service: "tool-execution" })
const DOOM_LOOP_THRESHOLD = 3

export namespace ToolExecution {
  export type ExecutionResult = {
    shouldContinue: boolean  // 是否继续主循环
    hasToolCalls: boolean    // 是否有工具调用
    shouldRetry: boolean     // 是否应该重试（无工具且未达最大重试）
    needsReminder: boolean   // 是否需要插入提醒消息（达到最大重试）
  }

  /**
   * 执行工具验证：零工具检查 + 重复工具检查
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

    // 2. 如果没有工具调用
    if (!hasToolCalls) {
      // 2a. 已达最大重试次数 - 插入提醒消息
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
          needsReminder: true
        }
      }

      // 2b. 未达最大重试次数 - 请求重试
      return {
        shouldContinue: true,
        hasToolCalls: false,
        shouldRetry: true,
        needsReminder: false
      }
    }

    // 3. 有工具调用 - 执行重复工具检查 (Doom Loop)
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
        // 注意：实际的权限询问已在 processor.ts:152-177 实现
        // 这里只是记录日志，不重复执行逻辑
      }
    }

    // 4. 正常情况 - 有工具调用且未触发 doom loop
    return {
      shouldContinue: false,
      hasToolCalls: true,
      shouldRetry: false,
      needsReminder: false
    }
  }

  /**
   * 插入提醒消息，强制要求模型使用工具
   */
  async function insertToolReminderMessage(
    sessionID: string,
    assistantMessage: MessageV2.Assistant
  ) {
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
      text: "CRITICAL: You MUST call at least one tool in your response. Text-only responses are strictly forbidden. Please analyze the current situation and use the appropriate tools to make progress on the task. If you believe the task is complete and there is nothing more to do, you MUST call the `task_done` tool to signal completion.",
      synthetic: true
    } as MessageV2.TextPart)

    log.info("inserted tool reminder message", {
      sessionID,
      reminderMessageID: reminderMessage.id
    })
  }
}
