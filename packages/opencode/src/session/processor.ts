import { MessageV2 } from "./message-v2"
import { Log } from "@/util/log"
import { Token } from "@/util/token"
import { Identifier } from "@/id/id"
import { Session } from "."
import { Agent } from "@/agent/agent"
import { Snapshot } from "@/snapshot"
import { SessionSummary } from "./summary"
import { Bus } from "@/bus"
import { SessionRetry } from "./retry"
import { SessionStatus } from "./status"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { LLM } from "./llm"
import { Config } from "@/config/config"
import { SessionCompaction } from "./compaction"
import { PermissionNext } from "@/permission/next"
import { Question } from "@/question"
import { toolInputFormatter, toolNameFormatter } from "@/costrict/utils/tool-transform-v2" // costrict change
import { ToolExecution } from "./tool-execution"
import { Storage } from "@/storage/storage"
import { Instance } from "@/project/instance"
import { SystemPrompt } from "./system"
import { Budget } from "./budget"
import path from "path"
import fs from "fs/promises"

export namespace SessionProcessor {
  const log = Log.create({ service: "session.processor" })

  // 重试机制相关类型和常量
  type RetrySnapshot = {
    messagePartIds: string[]  // 快照时的所有 part IDs
    temperature: number        // 当前尝试的温度
  }
  const MAX_RETRY_ATTEMPTS = 5
  const TEMPERATURE_SEQUENCE = [0.2, 0.4, 0.6, 0.8, 1.0]

  /**
   * 检查是否需要强制使用 sequential-thinking 工具
   *
   * @param agent - 当前 agent 配置
   * @param context - 强制思考检查的上下文
   * @returns 如果需要强制思考，返回提醒消息；否则返回 null
   */
  async function checkForcedSequentialThinking(
    agent: Agent.Info,
    context: Agent.ForcedThinkingContext
  ): Promise<string | null> {
    // 如果 agent.options 中定义了 forcedSequentialThinking 函数，调用它
    const forcedThinkingFn = agent.options?.forcedSequentialThinking as
      ((ctx: Agent.ForcedThinkingContext) => string | null) | undefined

    if (typeof forcedThinkingFn === 'function') {
      return forcedThinkingFn(context)
    }

    // 默认返回 null，不强制思考
    return null
  }

  export type Info = Awaited<ReturnType<typeof create>>
  export type Result = Awaited<ReturnType<Info["process"]>>

  export function create(input: {
    assistantMessage: MessageV2.Assistant
    sessionID: string
    model: Provider.Model
    abort: AbortSignal
    budgetState?: Budget.BudgetState  // 接受外部传入的预算状态
  }) {
    const toolcalls: Record<string, MessageV2.ToolPart> = {}
    let snapshot: string | undefined
    let attempt = 0
    let needsCompaction = false

    // 重试机制相关状态
    let retrySnapshot: RetrySnapshot | undefined
    let retryAttemptCount = 0
    let isSilentMode = false  // Silent 模式：重试时不发布事件

    // 预算机制相关状态（从参数传入，如果没有则初始化为无预算）
    let budgetState: Budget.BudgetState = input.budgetState ?? {
      total: undefined,
      used: 0,
      remaining: undefined
    }

    // 快照管理函数
    async function createSnapshot(messageId: string): Promise<RetrySnapshot> {
      const parts = await MessageV2.parts(messageId)
      return {
        messagePartIds: parts.map(p => p.id),
        temperature: 0
      }
    }

    async function rollbackToSnapshot(
      snapshot: RetrySnapshot,
      messageId: string,
      sessionId: string
    ) {
      const currentParts = await MessageV2.parts(messageId)
      const snapshotPartIds = new Set(snapshot.messagePartIds)

      // 删除快照后创建的所有 parts
      for (const part of currentParts) {
        if (!snapshotPartIds.has(part.id)) {
          await Storage.remove(["part", messageId, part.id])
        }
      }

      log.info("rolled back to snapshot", {
        sessionID: sessionId,
        messageID: messageId,
        removedParts: currentParts.length - snapshot.messagePartIds.length
      })
    }

    // 包装 Session.updatePart，在 silent 模式下不发布事件
    async function updatePart(input: any) {
      return Session.updatePart({ ...input, silent: isSilentMode })
    }

    const result = {
      get message() {
        return input.assistantMessage
      },
      get budgetState() {
        return budgetState
      },
      partFromToolCall(toolCallID: string) {
        return toolcalls[toolCallID]
      },
      async process(streamInput: LLM.StreamInput) {
        log.info("process", {
          sessionID: input.sessionID,
          budgetTotal: budgetState.total,
          budgetUsed: budgetState.used,
          budgetRemaining: budgetState.remaining
        })
        needsCompaction = false
        const shouldBreak = (await Config.get()).experimental?.continue_loop_on_deny !== true

        // Extract available tool names for alias resolution with custom tool priority
        const availableTools = new Set(Object.keys(streamInput.tools))
        while (true) {
          // 强制思考检查：判断是否需要强制只使用 sequential-thinking 工具
          // 必须在快照创建之前执行，以便强制思考消息被包含在快照中
          const agent = await Agent.get(streamInput.agent.name)
          const allMessages = await Array.fromAsync(MessageV2.stream(input.sessionID))
          const lastAssistant = allMessages.reverse().find(m => m.info.role === "assistant")
          const currentToolParts = lastAssistant
            ? (await MessageV2.parts(lastAssistant.info.id)).filter(p => p.type === "tool")
            : []

          const forcedThinkingMessage = await checkForcedSequentialThinking(agent, {
            sessionID: input.sessionID,
            messages: allMessages,
            lastAssistant: lastAssistant?.info,
            toolParts: currentToolParts
          })

          // 如果需要强制思考，插入提醒消息并修改工具权限
          let originalPermission: PermissionNext.Ruleset | undefined
          if (forcedThinkingMessage) {
            log.info("forced sequential thinking triggered", {
              sessionID: input.sessionID,
              agent: agent.name,
              message: forcedThinkingMessage.substring(0, 100)
            })

            // 插入强制思考提醒消息（作为 user 消息的一部分）
            // 注意：这个消息会在快照创建前插入，因此回溯时会被保留
            const reminderPart: MessageV2.TextPart = {
              id: Identifier.ascending("part"),
              messageID: streamInput.user.id,
              sessionID: input.sessionID,
              type: "text",
              text: forcedThinkingMessage,
              synthetic: true
            }

            await Session.updatePart(reminderPart)

            log.info("inserted forced thinking reminder", {
              sessionID: input.sessionID,
              partID: reminderPart.id
            })

            // 保存原始权限
            originalPermission = streamInput.agent.permission

            // 创建强制思考权限：只允许 sequential-thinking 工具
            const forcedPermission = PermissionNext.fromConfig({
              "*": "deny",
              "sequential-thinking": "allow"
            })

            // 临时覆盖权限
            streamInput.agent = {
              ...streamInput.agent,
              permission: forcedPermission
            }
          }

          // 在调用 LLM 之前保存快照（用于零工具调用重试）
          // 快照会包含强制思考消息（如果有的话）
          if (!retrySnapshot) {
            retrySnapshot = await createSnapshot(input.assistantMessage.id)
            log.info("created pre-llm snapshot", {
              sessionID: input.sessionID,
              messageID: input.assistantMessage.id,
              partCount: retrySnapshot.messagePartIds.length,
              hasForcedThinking: !!forcedThinkingMessage
            })
          }

          try {
            let currentText: MessageV2.TextPart | undefined
            let reasoningMap: Record<string, MessageV2.ReasoningPart> = {}
            // 在 silent 模式下，将参数传递给 LLM.stream
            streamInput.silent = isSilentMode
            const stream = await LLM.stream(streamInput)

            // 如果修改了权限，在流式处理后恢复
            if (originalPermission) {
              streamInput.agent = {
                ...streamInput.agent,
                permission: originalPermission
              }
            }

            for await (const value of stream.fullStream) {
              input.abort.throwIfAborted()
              switch (value.type) {
                case "start":
                  SessionStatus.set(input.sessionID, { type: "busy" })
                  break

                case "reasoning-start":
                  if (value.id in reasoningMap) {
                    continue
                  }
                  reasoningMap[value.id] = {
                    id: Identifier.ascending("part"),
                    messageID: input.assistantMessage.id,
                    sessionID: input.assistantMessage.sessionID,
                    type: "reasoning",
                    text: "",
                    time: {
                      start: Date.now(),
                    },
                    metadata: value.providerMetadata,
                  }
                  break

                case "reasoning-delta":
                  if (value.id in reasoningMap) {
                    const part = reasoningMap[value.id]
                    part.text += value.text
                    if (value.providerMetadata) part.metadata = value.providerMetadata
                    if (part.text) await updatePart({ part, delta: value.text })
                  }
                  break

                case "reasoning-end":
                  if (value.id in reasoningMap) {
                    const part = reasoningMap[value.id]
                    part.text = part.text.trimEnd()

                    part.time = {
                      ...part.time,
                      end: Date.now(),
                    }
                    if (value.providerMetadata) part.metadata = value.providerMetadata
                    await updatePart(part)
                    delete reasoningMap[value.id]
                  }
                  break

                case "tool-input-start":
                  const part = await updatePart({
                    id: toolcalls[value.id]?.id ?? Identifier.ascending("part"),
                    messageID: input.assistantMessage.id,
                    sessionID: input.assistantMessage.sessionID,
                    type: "tool",
                    tool: toolNameFormatter(value.toolName, availableTools), // costrict change
                    callID: value.id,
                    state: {
                      status: "pending",
                      input: {},
                      raw: "",
                    },
                  })
                  toolcalls[value.id] = part as MessageV2.ToolPart
                  break

                case "tool-input-delta":
                  break

                case "tool-input-end":
                  break

                case "tool-call": {
                  const match = toolcalls[value.toolCallId]
                  if (match) {
                    const cleanedToolName = toolNameFormatter(value.toolName, availableTools) // costrict change
                    const cleanedInput = toolInputFormatter(value.input, value.toolCallId) // costrict change

                    const part = await updatePart({
                      ...match,
                      tool: cleanedToolName, // costrict change
                      state: {
                        status: "running",
                        input: cleanedInput, // costrict change
                        time: {
                          start: Date.now(),
                        },
                      },
                      metadata: value.providerMetadata,
                    })
                    toolcalls[value.toolCallId] = part as MessageV2.ToolPart

                    // Doom loop检查已移至tool-execution.ts中的executeToolsWithValidation
                    // 不再在这里询问用户权限
                  }
                  break
                }
                case "tool-result": {
                  const match = toolcalls[value.toolCallId]
                  if (match && match.state.status === "running") {
                    // 工具结果拦截机制：检查输出大小
                    const outputTokenCount = Token.estimate(value.output.output)
                    const MAX_OUTPUT_TOKENS = 10000

                    let finalOutput = value.output.output
                    if (outputTokenCount > MAX_OUTPUT_TOKENS) {
                      finalOutput = "工具返回内容过长（超过 10000 tokens），已被拦截并省略。请尝试调整工具参数以缩小范围（例如：增加过滤条件/限定文件或行范围/分页等）后重试。"

                      log.info("tool result intercepted due to size", {
                        sessionID: input.sessionID,
                        tool: match.tool,
                        originalTokens: outputTokenCount,
                        threshold: MAX_OUTPUT_TOKENS
                      })
                    }

                    await updatePart({
                      ...match,
                      state: {
                        status: "completed",
                        input: value.input ?? match.state.input,
                        output: finalOutput,
                        metadata: value.output.metadata,
                        title: value.output.title,
                        time: {
                          start: match.state.time.start,
                          end: Date.now(),
                        },
                        attachments: value.output.attachments,
                      },
                    })

                    delete toolcalls[value.toolCallId]
                  }
                  break
                }

                case "tool-error": {
                  const match = toolcalls[value.toolCallId]
                  if (match && match.state.status === "running") {
                    await updatePart({
                      ...match,
                      state: {
                        status: "error",
                        input: value.input ?? match.state.input,
                        error: (value.error as any).toString(),
                        time: {
                          start: match.state.time.start,
                          end: Date.now(),
                        },
                      },
                    })

                    // 工具被拒绝的检查已移至tool-execution.ts中的executeToolsWithValidation
                    // 不再在这里设置blocked状态，而是通过插入user消息让模型调整策略
                    delete toolcalls[value.toolCallId]
                  }
                  break
                }
                case "error":
                  throw value.error

                case "start-step":
                  snapshot = await Snapshot.track()
                  await updatePart({
                    id: Identifier.ascending("part"),
                    messageID: input.assistantMessage.id,
                    sessionID: input.sessionID,
                    snapshot,
                    type: "step-start",
                  })
                  break

                case "finish-step":
                  const usage = Session.getUsage({
                    model: input.model,
                    usage: value.usage,
                    metadata: value.providerMetadata,
                  })
                  input.assistantMessage.finish = value.finishReason
                  input.assistantMessage.cost += usage.cost
                  input.assistantMessage.tokens = usage.tokens
                  await updatePart({
                    id: Identifier.ascending("part"),
                    reason: value.finishReason,
                    snapshot: await Snapshot.track(),
                    messageID: input.assistantMessage.id,
                    sessionID: input.assistantMessage.sessionID,
                    type: "step-finish",
                    tokens: usage.tokens,
                    cost: usage.cost,
                  })
                  await Session.updateMessage(input.assistantMessage)
                  if (snapshot) {
                    const patch = await Snapshot.patch(snapshot)
                    if (patch.files.length) {
                      await updatePart({
                        id: Identifier.ascending("part"),
                        messageID: input.assistantMessage.id,
                        sessionID: input.sessionID,
                        type: "patch",
                        hash: patch.hash,
                        files: patch.files,
                      })
                    }
                    snapshot = undefined
                  }
                  SessionSummary.summarize({
                    sessionID: input.sessionID,
                    messageID: input.assistantMessage.parentID,
                  })
                  if (await SessionCompaction.isOverflow({ tokens: usage.tokens, model: input.model })) {
                    needsCompaction = true
                  }
                  break

                case "text-start":
                  currentText = {
                    id: Identifier.ascending("part"),
                    messageID: input.assistantMessage.id,
                    sessionID: input.assistantMessage.sessionID,
                    type: "text",
                    text: "",
                    time: {
                      start: Date.now(),
                    },
                    metadata: value.providerMetadata,
                  }
                  break

                case "text-delta":
                  if (currentText) {
                    currentText.text += value.text
                    if (value.providerMetadata) currentText.metadata = value.providerMetadata
                    if (currentText.text)
                      await updatePart({
                        part: currentText,
                        delta: value.text,
                      })
                  }
                  break

                case "text-end":
                  if (currentText) {
                    currentText.text = currentText.text.trimEnd()
                    const textOutput = await Plugin.trigger(
                      "experimental.text.complete",
                      {
                        sessionID: input.sessionID,
                        messageID: input.assistantMessage.id,
                        partID: currentText.id,
                      },
                      { text: currentText.text },
                    )
                    currentText.text = textOutput.text
                    currentText.time = {
                      start: Date.now(),
                      end: Date.now(),
                    }
                    if (value.providerMetadata) currentText.metadata = value.providerMetadata
                    await updatePart(currentText)
                  }
                  currentText = undefined
                  break

                case "finish":
                  break

                default:
                  log.info("unhandled", {
                    ...value,
                  })
                  continue
              }
              if (needsCompaction) break
            }
          } catch (e: any) {
            log.error("process", {
              error: e,
              stack: JSON.stringify(e.stack),
            })

            // Publish LLM error event for plugins to handle
            Bus.publish(Session.Event.LLMError, {
              providerID: input.model.providerID,
              modelID: input.model.id,
              sessionID: input.sessionID,
              agent: input.assistantMessage.agent,
              requestType: "stream",
              attempt,
              error: e,
            })

            const error = MessageV2.fromError(e, { providerID: input.model.providerID })
            const retry = SessionRetry.retryable(error)
            if (retry !== undefined) {
              attempt++
              const delay = SessionRetry.delay(attempt, error.name === "APIError" ? error : undefined)
              SessionStatus.set(input.sessionID, {
                type: "retry",
                attempt,
                message: retry,
                next: Date.now() + delay,
              })
              await SessionRetry.sleep(delay, input.abort).catch(() => {})
              continue
            }
            input.assistantMessage.error = error
            Bus.publish(Session.Event.Error, {
              sessionID: input.assistantMessage.sessionID,
              error: input.assistantMessage.error,
            })
          }
          if (snapshot) {
            const patch = await Snapshot.patch(snapshot)
            if (patch.files.length) {
              await updatePart({
                id: Identifier.ascending("part"),
                messageID: input.assistantMessage.id,
                sessionID: input.sessionID,
                type: "patch",
                hash: patch.hash,
                files: patch.files,
              })
            }
            snapshot = undefined
          }
          const p = await MessageV2.parts(input.assistantMessage.id)
          for (const part of p) {
            if (part.type === "tool" && part.state.status !== "completed" && part.state.status !== "error") {
              await updatePart({
                ...part,
                state: {
                  ...part.state,
                  status: "error",
                  error: "Tool execution aborted",
                  time: {
                    start: Date.now(),
                    end: Date.now(),
                  },
                },
              })
            }
          }
          input.assistantMessage.time.completed = Date.now()
          await Session.updateMessage(input.assistantMessage)
          
          // 保存完整的上下文历史
          await saveContext({
            sessionID: input.sessionID,
            streamInput,
            assistantMessage: input.assistantMessage,
          }).catch((err) => {
            log.error("failed to save context", { error: err })
          })

          // 【预算前置检查】- 在工具执行之前检查预算是否充足
          const toolParts = await MessageV2.parts(input.assistantMessage.id)
          const toolPartsOnly = toolParts.filter(p => p.type === "tool") as MessageV2.ToolPart[]

          const budgetCheck = Budget.checkBudget(toolPartsOnly, budgetState)

          if (!budgetCheck.allowed && budgetCheck.guardMessage) {
            // 预算不足，拦截工具调用
            log.warn("budget guard triggered", {
              sessionID: input.sessionID,
              requested: budgetCheck.consumeCount,
              remaining: budgetCheck.state.remaining,
              total: budgetCheck.state.total
            })

            // 将所有工具调用标记为 completed（拦截状态）
            for (const part of toolPartsOnly) {
              if (part.state.status === "running") {
                await updatePart({
                  ...part,
                  state: {
                    ...part.state,
                    status: "completed",
                    output: budgetCheck.guardMessage,
                    time: {
                      start: Date.now(),
                      end: Date.now()
                    }
                  }
                })
              }
            }

            // 扣减预算（作为惩罚机制，即使拦截了也要扣减）
            budgetState = Budget.deductBudget(toolPartsOnly, budgetState, isSilentMode)

            // 返回 continue 让外层循环创建新的 assistant message
            return "continue"
          }

          // 调用封装的工具执行验证函数
          const executionResult = await ToolExecution.executeToolsWithValidation({
            assistantMessage: input.assistantMessage,
            sessionID: input.sessionID,
            retryAttempt: retryAttemptCount,
            maxRetryAttempts: MAX_RETRY_ATTEMPTS
          })

          // 根据返回结果决定下一步操作
          if (executionResult.shouldRetry) {
            // 需要重试 - 执行快照回溯和温度调节
            if (retrySnapshot) {
              await rollbackToSnapshot(retrySnapshot, input.assistantMessage.id, input.sessionID)
              retryAttemptCount++
              streamInput.temperatureOverride = TEMPERATURE_SEQUENCE[retryAttemptCount - 1]

              // 进入 silent 模式，重试时不发布事件
              isSilentMode = true

              log.info("retrying with adjusted temperature", {
                sessionID: input.sessionID,
                attempt: retryAttemptCount,
                temperature: streamInput.temperatureOverride,
                maxAttempts: MAX_RETRY_ATTEMPTS,
                silentMode: true
              })

              continue  // 继续 while 循环
            }
          }

          if (executionResult.needsReminder || executionResult.blocked) {
            // 已插入提醒/拒绝/doom loop消息，重置重试状态
            // 提醒消息和不合格的 assistant 保留在上下文中
            // 退出 processor，让外层循环创建新的 assistant message
            retrySnapshot = undefined
            retryAttemptCount = 0
            isSilentMode = false  // 退出 silent 模式

            // 标记当前 assistant message 为完成状态
            input.assistantMessage.time.completed = Date.now()
            await Session.updateMessage(input.assistantMessage)

            // 返回 "continue" 让外层循环创建新的 assistant message
            return "continue"
          }

          // 正常情况 - 有工具调用，重置重试状态
          retrySnapshot = undefined
          retryAttemptCount = 0
          isSilentMode = false  // 退出 silent 模式

          // 【预算扣减】- 在工具执行成功后扣减预算
          if (executionResult.hasToolCalls) {
            const toolPartsAfterExecution = await MessageV2.parts(input.assistantMessage.id)
            const toolsExecuted = toolPartsAfterExecution.filter(p => p.type === "tool") as MessageV2.ToolPart[]

            // 扣减预算（重试模式下不扣减）
            budgetState = Budget.deductBudget(toolsExecuted, budgetState, false)

            // 【预算通知】- 附加到最后一个工具结果
            if (toolsExecuted.length > 0) {
              // 找到最后一个工具调用
              const lastTool = toolsExecuted[toolsExecuted.length - 1]

              if (lastTool.state.status === "completed" && lastTool.state.output) {
                // 构建预算通知
                const budgetNotice = Budget.buildBudgetNotice(
                  lastTool.state.output,
                  budgetState
                )

                // 更新最后一个工具的输出（包含预算通知）
                // fullContent 包含预算通知，会被 LLM 看到
                // displayContent 在前端展示时过滤预算通知标签
                await updatePart({
                  ...lastTool,
                  state: {
                    ...lastTool.state,
                    output: budgetNotice.fullContent
                  }
                })

                log.info("budget notice attached", {
                  sessionID: input.sessionID,
                  toolName: lastTool.tool,
                  remaining: budgetState.remaining,
                  used: budgetState.used,
                  total: budgetState.total
                })
              }
            }
          }

          if (needsCompaction) return "compact"
          if (input.assistantMessage.error) return "stop"
          return "continue"
        }
      },
    }
    return result
  }

  async function saveContext(input: {
    sessionID: string
    streamInput: LLM.StreamInput
    assistantMessage: MessageV2.Assistant
  }) {
    const historyDir = path.join(Instance.worktree, "history_message")
    await fs.mkdir(historyDir, { recursive: true })

    // 每次保存都获取当前的完整历史记录上下文
    const allMessages: MessageV2.WithParts[] = []
    for await (const msg of MessageV2.stream(input.sessionID)) {
      allMessages.push(msg)
    }
    allMessages.reverse()

    // 获取模型信息以转换消息格式
    const model = await Provider.getModel(
      input.assistantMessage.providerID,
      input.assistantMessage.modelID,
    )

    // 重建完整的 system 数组（与 llm.ts 中的逻辑一致）
    // 这样可以确保 toolRequirements 被包含在保存的上下文中
    const fullSystem = [
      ...(input.streamInput.agent.prompt ? [input.streamInput.agent.prompt] : SystemPrompt.provider(model)),
      ...SystemPrompt.toolRequirements(),
      ...input.streamInput.system,
      ...(input.streamInput.user.system ? [input.streamInput.user.system] : []),
    ].filter((x) => x)

    // 构建完整的请求消息（包括system和所有消息）
    // 这代表了发送给模型的完整上下文
    const requestMessages = [
      ...fullSystem.map((x) => ({
        role: "system" as const,
        content: x,
      })),
      ...MessageV2.toModelMessages(allMessages, model),
    ]

    // 获取可用的工具列表
    const availableTools = Object.keys(input.streamInput.tools).map(toolName => {
      const tool = input.streamInput.tools[toolName]
      return {
        name: toolName,
        description: tool.description || "",
      }
    })

    // 构建完整的上下文对象
    const context = {
      timestamp: Date.now(),
      sessionID: input.sessionID,
      request: {
        messages: requestMessages,
        system: fullSystem,
        availableTools,
      },
      allMessages: allMessages.map((msg) => ({
        info: msg.info,
        parts: msg.parts,
      })),
    }
    
    // 文件名格式：context-{sessionID}-{timestamp}.json
    const timestamp = Date.now()
    const filename = `context-${input.sessionID}-${timestamp}.json`
    const contextFile = path.join(historyDir, filename)
    
    // 删除旧的context文件（同一会话内只保留最新的）
    try {
      const files = await fs.readdir(historyDir)
      for (const file of files) {
        if (file.startsWith(`context-${input.sessionID}-`) && file.endsWith(".json") && file !== filename) {
          await fs.unlink(path.join(historyDir, file)).catch(() => {})
        }
      }
    } catch {
      // 忽略错误
    }
    
    // 每次都重写整个文件，保存当前的完整历史记录上下文
    await Bun.write(contextFile, JSON.stringify(context, null, 2))
  }
}
