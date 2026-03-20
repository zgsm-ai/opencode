import { MessageV2 } from "./message-v2"
import { Log } from "@/util/log"
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
import { ToolInputRecordError, toolInputFormatter, toolNameFormatter } from "@/costrict/utils/tool-transform-v2"
import { CostrictError } from "@/costrict/error"
import { PartID } from "./schema"
import type { SessionID, MessageID } from "./schema"
import { ToolExecution } from "./tool-execution"
import { Instance } from "@/project/instance"
import { Budget } from "./budget"

export namespace SessionProcessor {
  const log = Log.create({ service: "session.processor" })

  // 重试机制相关类型和常量
  type RetrySnapshot = {
    messagePartIds: string[]  // 快照时的所有 part IDs
    temperature: number        // 当前尝试的温度
  }
  const MAX_RETRY_ATTEMPTS = 5
  const MAX_JSON_PARSE_RETRIES = 5
  const MAX_RECORD_RETRIES = 5
  const TEMPERATURE_SEQUENCE = [0.2, 0.4, 0.6, 0.8, 1.0]
  const JSON_PARSE_RETRY_DELAY_MS = 150
  const RECORD_RETRY_DELAY_MS = 150

  /**
   * 检查是否需要强制使用 sequentialthinking 工具
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

  function isJSONParseFailure(error: unknown) {
    if (!(error instanceof Error)) return false
    const content = [error.name, error.message].filter(Boolean).join(" ").toLowerCase()
    if (!content.includes("json")) return false
    if (!content.includes("parse")) return false
    if (content.includes("ai_jsonparseerror")) return true
    if (content.includes("json parsing failed")) return true
    if (content.includes("json parse error")) return true
    return content.includes("chat.completion.chunk")
  }

  function isRecordFailure(error: unknown) {
    if (error instanceof ToolInputRecordError) return true
    if (!(error instanceof Error)) return false
    const content = [error.name, error.message].filter(Boolean).join(" ").toLowerCase()
    return content.includes("expected record") && content.includes("received string")
  }

  export type Info = Awaited<ReturnType<typeof create>>
  export type Result = Awaited<ReturnType<Info["process"]>>

  export function create(input: {
    assistantMessage: MessageV2.Assistant
    sessionID: SessionID
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
    let jsonParseRetryCount = 0
    let recordRetryCount = 0
    let isSilentMode = false  // Silent 模式：重试时不发布事件
    let shouldReplaySilentParts = false
    let shouldStopForRecordError = false

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
          await Session.removePart({
            sessionID: sessionId,
            messageID: messageId,
            partID: part.id,
          })
        }
      }

      log.info("rolled back to snapshot", {
        sessionID: sessionId,
        messageID: messageId,
        removedParts: currentParts.length - snapshot.messagePartIds.length
      })
    }

    async function replaySilentParts(snapshot: RetrySnapshot, messageId: string) {
      const parts = await MessageV2.parts(messageId)
      const ids = new Set(snapshot.messagePartIds)
      for (const part of parts) {
        if (ids.has(part.id)) continue
        Bus.publish(MessageV2.Event.PartUpdated, { part })
      }
    }

    function clearToolcalls() {
      for (const key of Object.keys(toolcalls)) {
        delete toolcalls[key]
      }
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
        const baseMessages = streamInput.messages
        const state = { messages: streamInput.messages }
        // Extract available tool names for alias resolution with custom tool priority
        const availableTools = new Set(Object.keys(streamInput.tools))
        while (true) {
         try {
          // 强制思考检查：判断是否需要强制只使用 sequentialthinking 工具
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
          if (forcedThinkingMessage && jsonParseRetryCount === 0) {
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

            // 创建强制思考权限：只允许 sequentialthinking 工具
            const forcedPermission = PermissionNext.fromConfig({
              "*": "deny",
              "sequentialthinking": "allow"
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
            let hasTextContent = false
            let hasToolCalls = false
            let hasReasoningContent = false
            // 在 silent 模式下，将参数传递给 LLM.stream
            streamInput.silent = isSilentMode
            const stream = await LLM.stream({
              ...streamInput,
              messages: state.messages,
            })

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
                  const reasoningPart = {
                    id: PartID.ascending(),
                    messageID: input.assistantMessage.id,
                    sessionID: input.assistantMessage.sessionID,
                    type: "reasoning" as const,
                    text: "",
                    time: {
                      start: Date.now(),
                    },
                    metadata: value.providerMetadata,
                  }
                  reasoningMap[value.id] = reasoningPart
                  await Session.updatePart(reasoningPart)
                  break

                case "reasoning-delta":
                  if (value.id in reasoningMap) {
                    const part = reasoningMap[value.id]
                    part.text += value.text
                    if (value.providerMetadata) part.metadata = value.providerMetadata
                    await Session.updatePartDelta({
                      sessionID: part.sessionID,
                      messageID: part.messageID,
                      partID: part.id,
                      field: "text",
                      delta: value.text,
                    })
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
                    hasReasoningContent = true
                  }
                  break

                case "tool-input-start":
                  const part = await updatePart({
                    id: toolcalls[value.id]?.id ?? PartID.ascending(),
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
                  hasToolCalls = true
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
                    const cleanedInput = toolInputFormatter(value.input ?? match.state.input, value.toolCallId)
                    await updatePart({
                      ...match,
                      state: {
                        status: "completed",
                        input: cleanedInput,
                        output: value.output.output,
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
                    const cleanedInput = toolInputFormatter(value.input ?? match.state.input, value.toolCallId)
                    await updatePart({
                      ...match,
                      state: {
                        status: "error",
                        input: cleanedInput,
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
                    id: PartID.ascending(),
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
                  input.assistantMessage.cost += usage.cost
                  input.assistantMessage.tokens = usage.tokens
                  if (input.model.providerID === "costrict") {
                    const next = await CostrictError.finish({
                      reason: value.finishReason,
                      message: input.assistantMessage,
                      model: input.model,
                      messages: baseMessages,
                    })
                    if (next) {
                      await Session.updateMessage(input.assistantMessage)
                      state.messages = next.messages
                      throw next.error
                    }
                  }
                  input.assistantMessage.finish = value.finishReason
                  await updatePart({
                    id: PartID.ascending(),
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
                        id: PartID.ascending(),
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
                  if (
                    !input.assistantMessage.summary &&
                    (await SessionCompaction.isOverflow({ tokens: usage.tokens, model: input.model }))
                  ) {
                    needsCompaction = true
                  }

                  // Check if response only contains reasoning content (no text or tool calls)
                  // This is an exception scenario that requires retry with thinking disabled
                  const isReasoningOnly = !hasTextContent && !hasToolCalls && hasReasoningContent
                  if (isReasoningOnly) {
                    throw new MessageV2.ReasoningOnlyError({}).toObject()
                  }

                  break

                case "text-start":
                  hasTextContent = true
                  currentText = {
                    id: PartID.ascending(),
                    messageID: input.assistantMessage.id,
                    sessionID: input.assistantMessage.sessionID,
                    type: "text",
                    text: "",
                    time: {
                      start: Date.now(),
                    },
                    metadata: value.providerMetadata,
                  }
                  await Session.updatePart(currentText)
                  break

                case "text-delta":
                  if (currentText) {
                    currentText.text += value.text
                    if (value.providerMetadata) currentText.metadata = value.providerMetadata
                    await Session.updatePartDelta({
                      sessionID: currentText.sessionID,
                      messageID: currentText.messageID,
                      partID: currentText.id,
                      field: "text",
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

            // 流式成功结束后，重置 JSON 解析失败重试计数
            jsonParseRetryCount = 0
            recordRetryCount = 0
            shouldStopForRecordError = false

            // 每次 LLM 流式响应完成后立即保存最新消息历史（覆盖式），
            // 确保即使 Agent 中途退出也能保留最新记录
            await LLM.saveContextAfterResponse({
              sessionID: input.sessionID,
              agent: streamInput.agent,
              model: input.model,
              tools: streamInput.tools,
            }).catch((err) => {
              log.error("failed to save context after llm stream", { error: err })
            })
          } catch (e: any) {
            log.error("process", {
              error: e,
              stack: JSON.stringify(e.stack),
            })

            // 流式 JSON 解析失败：丢弃本次不完整输出并原地重试（同一上下文）
            if (isJSONParseFailure(e) && jsonParseRetryCount < MAX_JSON_PARSE_RETRIES) {
              jsonParseRetryCount++
              if (retrySnapshot) {
                await rollbackToSnapshot(retrySnapshot, input.assistantMessage.id, input.sessionID)
              }
              clearToolcalls()
              const delay = Math.min(JSON_PARSE_RETRY_DELAY_MS * jsonParseRetryCount, 1000)
              log.warn("retrying stream after json parse failure", {
                sessionID: input.sessionID,
                providerID: input.model.providerID,
                modelID: input.model.id,
                retry: jsonParseRetryCount,
                maxRetries: MAX_JSON_PARSE_RETRIES,
                delay,
              })
              await SessionRetry.sleep(delay, input.abort).catch(() => {})
              continue
            }

            if (isRecordFailure(e) && recordRetryCount < MAX_RECORD_RETRIES) {
              recordRetryCount++
              shouldReplaySilentParts = true
              isSilentMode = true
              if (retrySnapshot) {
                await rollbackToSnapshot(retrySnapshot, input.assistantMessage.id, input.sessionID)
              }
              clearToolcalls()
              const temperature =
                TEMPERATURE_SEQUENCE[recordRetryCount - 1] ??
                TEMPERATURE_SEQUENCE[TEMPERATURE_SEQUENCE.length - 1] ??
                1
              streamInput.temperatureOverride = temperature
              const delay = Math.min(RECORD_RETRY_DELAY_MS * recordRetryCount, 1000)
              log.warn("retrying stream after invalid tool input", {
                sessionID: input.sessionID,
                providerID: input.model.providerID,
                modelID: input.model.id,
                retry: recordRetryCount,
                maxRetries: MAX_RECORD_RETRIES,
                temperature,
                delay,
                silentMode: true,
              })
              await SessionRetry.sleep(delay, input.abort).catch(() => {})
              continue
            }

            // Publish LLM error event for plugins to handle
            shouldStopForRecordError = isRecordFailure(e)
            Bus.publish(Session.Event.LLMError, {
              providerID: input.model.providerID,
              modelID: input.model.id,
              sessionID: input.sessionID,
              agent: input.assistantMessage.agent,
              requestType: "stream",
              attempt,
              error: e,
            })

            jsonParseRetryCount = 0
            recordRetryCount = 0
            shouldReplaySilentParts = false
            const error = MessageV2.fromError(e, { providerID: input.model.providerID })
            if (MessageV2.ContextOverflowError.isInstance(error)) {
              needsCompaction = true
              Bus.publish(Session.Event.Error, {
                sessionID: input.sessionID,
                error,
              })
            }
            const retry = SessionRetry.retryable(error, { providerID: input.model.providerID })
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

              // If error is ReasoningOnlyError, disable thinking for retry
              if (MessageV2.ReasoningOnlyError.isInstance(error)) {
                streamInput.providerOptions = {
                  ...streamInput.providerOptions,
                  enableThinking: false,
                }
              }

              continue
            }
            input.assistantMessage.error = error
            input.assistantMessage.finish = input.assistantMessage.finish || "error"
            Bus.publish(Session.Event.Error, {
              sessionID: input.assistantMessage.sessionID,
              error: input.assistantMessage.error,
            })
            SessionStatus.set(input.sessionID, { type: "idle" })
          }
          if (snapshot) {
            const patch = await Snapshot.patch(snapshot)
            if (patch.files.length) {
              await updatePart({
                id: PartID.ascending(),
                messageID: input.assistantMessage.id,
                sessionID: input.sessionID,
                type: "patch",
                hash: patch.hash,
                files: patch.files,
              })
            }
            snapshot = undefined
          }

          // 【预算前置检查】- 在工具执行之前检查预算是否充足
          // 必须在工具被标记为error之前执行
          const toolParts = await MessageV2.parts(input.assistantMessage.id)
          const toolPartsOnly = toolParts.filter(p => p.type === "tool") as MessageV2.ToolPart[]

          const budgetCheck = Budget.checkBudget(toolPartsOnly, budgetState)

          if (!budgetCheck.allowed && budgetCheck.guardMessage) {
            // 预算不足，所有工具都不执行，直接返回拦截消息
            log.warn("budget guard triggered", {
              sessionID: input.sessionID,
              requested: budgetCheck.consumeCount,
              remaining: budgetCheck.state.remaining,
              total: budgetCheck.state.total
            })

            // 将所有工具调用（包括白名单工具）标记为 completed，输出拦截消息
            // 注意：必须显式提供 title 和 metadata，因为 ToolStateCompleted 要求它们为必填字段，
            // 而 running/pending 状态的 part 可能没有这些字段（它们在 ToolStateRunning 中是 optional 的）。
            for (const part of toolPartsOnly) {
              const runningTitle = (part.state.status === "running" || part.state.status === "completed") ? part.state.title : undefined
              const runningMetadata = (part.state.status !== "pending") ? (part.state as any).metadata : undefined
              await updatePart({
                ...part,
                state: {
                  status: "completed",
                  input: part.state.input,
                  output: budgetCheck.guardMessage,
                  title: runningTitle ?? "",
                  metadata: runningMetadata ?? {},
                  time: {
                    start: (part.state.status !== "pending" && 'time' in part.state && part.state.time?.start) || Date.now(),
                    end: Date.now()
                  }
                }
              })

              log.info("tool blocked by budget guard", {
                sessionID: input.sessionID,
                tool: part.tool,
                callID: part.callID
              })
            }

            // 标记 assistant message 为完成状态
            input.assistantMessage.time.completed = Date.now()
            await Session.updateMessage(input.assistantMessage)

            // 不扣减预算（因为没有实际执行任何工具）
            // 返回 continue 让外层循环创建新的 assistant message
            return "continue"
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
          if (input.assistantMessage.error) {
            await LLM.saveContextAfterResponse({
              sessionID: input.sessionID,
              agent: streamInput.agent,
              model: input.model,
              tools: streamInput.tools,
            }).catch((err) => {
              log.error("failed to save context after llm error", { error: err })
            })
          }

          if (shouldStopForRecordError && input.assistantMessage.error) {
            return "stop"
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
            shouldReplaySilentParts = false

            // 标记当前 assistant message 为完成状态
            input.assistantMessage.time.completed = Date.now()
            await Session.updateMessage(input.assistantMessage)

            // 返回 "continue" 让外层循环创建新的 assistant message
            return "continue"
          }

          // 正常情况 - 有工具调用，重置重试状态
          if (shouldReplaySilentParts && retrySnapshot) {
            await replaySilentParts(retrySnapshot, input.assistantMessage.id)
          }
          retrySnapshot = undefined
          retryAttemptCount = 0
          isSilentMode = false  // 退出 silent 模式
          shouldReplaySilentParts = false

          // 【预算扣减】- 在工具执行成功后扣减预算
          if (executionResult.hasToolCalls) {
            const toolPartsAfterExecution = await MessageV2.parts(input.assistantMessage.id)
            const toolsExecuted = toolPartsAfterExecution.filter(p => p.type === "tool") as MessageV2.ToolPart[]

            // 扣减预算（重试模式下不扣减）
            budgetState = Budget.deductBudget(toolsExecuted, budgetState, false)

            if (toolsExecuted.length > 0 && budgetState.total !== undefined) {
              // 当启用预算时，将 <budget_notice> 拼接到“最后一个工具结果”的输出中，
              // 无论该工具是成功还是失败（success/error），都要体现最新的预算状态。
              const lastTool = toolsExecuted[toolsExecuted.length - 1]

              if (lastTool.state.status === "completed" && typeof lastTool.state.output === "string") {
                const baseOutput = lastTool.state.output
                const budgetNotice = Budget.buildBudgetNotice(
                  baseOutput,
                  budgetState,
                  streamInput.agent.warningThreshold ?? Budget.WARNING_THRESHOLD,
                )

                await updatePart({
                  ...lastTool,
                  state: {
                    ...lastTool.state,
                    output: budgetNotice.fullContent,
                  },
                })

                log.info("budget notice attached to last completed tool", {
                  sessionID: input.sessionID,
                  tool: lastTool.tool,
                  callID: lastTool.callID,
                  remaining: budgetState.remaining,
                  used: budgetState.used,
                  total: budgetState.total,
                })
              } else if (lastTool.state.status === "error" && typeof lastTool.state.error === "string") {
                const baseOutput = lastTool.state.error
                const budgetNotice = Budget.buildBudgetNotice(
                  baseOutput,
                  budgetState,
                  streamInput.agent.warningThreshold ?? Budget.WARNING_THRESHOLD,
                )

                await updatePart({
                  ...lastTool,
                  state: {
                    ...lastTool.state,
                    error: budgetNotice.fullContent,
                  },
                })

                log.info("budget notice attached to last errored tool", {
                  sessionID: input.sessionID,
                  tool: lastTool.tool,
                  callID: lastTool.callID,
                  remaining: budgetState.remaining,
                  used: budgetState.used,
                  total: budgetState.total,
                })
              }
            }
          }

          if (needsCompaction) return "compact"
          if (input.assistantMessage.error) return "stop"
          return "continue"

         } catch (fatal: any) {
            log.error("fatal error in processor loop", {
              error: fatal,
              stack: fatal?.stack,
              sessionID: input.sessionID,
            })
            if (!input.assistantMessage.error) {
              try {
                input.assistantMessage.error = MessageV2.fromError(fatal, { providerID: input.model.providerID })
              } catch {
                input.assistantMessage.error = { name: "UnknownError", data: { message: String(fatal) } } as any
              }
              input.assistantMessage.finish = input.assistantMessage.finish || "error"
            }
            input.assistantMessage.time.completed = Date.now()
            await Session.updateMessage(input.assistantMessage).catch(() => {})
            try {
              Bus.publish(Session.Event.Error, {
                sessionID: input.assistantMessage.sessionID,
                error: input.assistantMessage.error,
              })
            } catch {}
            return "stop"
         }
        }
      },
    }
    return result
  }
}
