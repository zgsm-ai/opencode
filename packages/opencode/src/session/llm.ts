import os from "os"
import { Installation } from "@/installation"
import { Provider } from "@/provider/provider"
import { Log } from "@/util/log"
import { Bus } from "@/bus"
import { Session } from "."
import {
  streamText,
  wrapLanguageModel,
  type ModelMessage,
  type StreamTextResult,
  type Tool,
  type ToolSet,
  extractReasoningMiddleware,
  tool,
  jsonSchema,
} from "ai"
import { clone, mergeDeep, pipe } from "remeda"
import { jsonrepair } from "jsonrepair"
import { ProviderTransform } from "@/provider/transform"
import { Config } from "@/config/config"
import { Instance } from "@/project/instance"
import type { Agent } from "@/agent/agent"
import { MessageV2 } from "./message-v2"
import { Plugin } from "@/plugin"
import { SystemPrompt } from "./system"
import { Flag } from "@/flag/flag"
import { PermissionNext } from "@/permission/next"
import { Auth } from "@/auth"
import path from "path"
import fs from "fs/promises"
import { fileURLToPath } from "url"

export namespace LLM {
  const log = Log.create({ service: "llm" })

  // 本地开发（bun dev）保存在仓库根目录；打包后保存在 bin/resources 同级目录
  const HISTORY_DIR = path.join(
    Installation.isLocal()
      ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../")
      : path.resolve(path.dirname(process.execPath), ".."),
    ".history_message",
  )

  // 存储每个 session 的最新 system 提示词（经过 Plugin 处理后的完整版本）
  const sessionSystemCache = new Map<string, string[]>()

  // 存储每个 session 的初始北京时间戳（首次记录时生成，后续复用，格式 YYYY-MM-DD-HH-mm-ss）
  const sessionInitTime = new Map<string, string>()

  function beijingTimeString() {
    const now = new Date()
    // 北京时间 UTC+8
    const offset = 8 * 60 * 60 * 1000
    const t = new Date(now.getTime() + offset)
    const pad = (n: number) => String(n).padStart(2, "0")
    return (
      `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}` +
      `-${pad(t.getUTCHours())}-${pad(t.getUTCMinutes())}-${pad(t.getUTCSeconds())}`
    )
  }

  function beijingTimeWithMs(timestamp: number) {
    const offset = 8 * 60 * 60 * 1000
    const t = new Date(timestamp + offset)
    const pad = (n: number, size = 2) => String(n).padStart(size, "0")
    return (
      `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ` +
      `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}.${pad(t.getUTCMilliseconds(), 3)}`
    )
  }

  function toolStart(state: MessageV2.ToolPart["state"]) {
    if (state.status === "pending") return
    return state.time.start
  }

  function toolEnd(state: MessageV2.ToolPart["state"]) {
    if (state.status === "completed") return state.time.end
    if (state.status === "error") return state.time.end
  }

  function collectToolExecutions(messages: MessageV2.WithParts[]) {
    return messages.flatMap((msg) =>
      msg.parts
        .filter((part): part is MessageV2.ToolPart => part.type === "tool")
        .map((part) => {
          const start = toolStart(part.state)
          const end = toolEnd(part.state)
          const durationMs = start !== undefined && end !== undefined ? Math.max(0, end - start) : undefined
          return {
            messageID: part.messageID,
            partID: part.id,
            callID: part.callID,
            tool: part.tool,
            status: part.state.status,
            startedAt: start,
            startedAtBeijing: start === undefined ? undefined : beijingTimeWithMs(start),
            durationMs,
          }
        }),
    )
  }

  function sessionFilename(sessionID: string, agentName: string) {
    if (!sessionInitTime.has(sessionID)) {
      sessionInitTime.set(sessionID, beijingTimeString())
    }
    return `context-${agentName}-${sessionID}-${sessionInitTime.get(sessionID)}.json`
  }

  export const OUTPUT_TOKEN_MAX = Flag.COSTRICT_EXPERIMENTAL_OUTPUT_TOKEN_MAX || 10_240

  export type StreamInput = {
    user: MessageV2.User
    sessionID: string
    model: Provider.Model
    agent: Agent.Info
    system: string[]
    abort: AbortSignal
    messages: ModelMessage[]
    small?: boolean
    tools: Record<string, Tool>
    retries?: number
    temperatureOverride?: number  // 用于重试时覆盖温度
    silent?: boolean  // 用于在重试时抑制事件发布
  }

  export type StreamOutput = StreamTextResult<ToolSet, unknown>

  function parse(text: string) {
    try {
      const data = JSON.parse(text)
      if (!data || typeof data !== "object" || Array.isArray(data)) return
      return data
    } catch {
      return
    }
  }

  function repair(text: string) {
    try {
      return jsonrepair(text)
    } catch {
      return
    }
  }

  export function repairToolInput(input: unknown) {
    if (typeof input !== "string") return
    const raw = input.trim()
    if (!raw) return
    const direct = parse(raw)
    if (direct) return JSON.stringify(direct)
    const fixed = repair(raw)
    if (!fixed) return
    const parsed = parse(fixed)
    if (!parsed) return
    return JSON.stringify(parsed)
  }

  export async function stream(input: StreamInput) {
    const l = log
      .clone()
      .tag("providerID", input.model.providerID)
      .tag("modelID", input.model.id)
      .tag("sessionID", input.sessionID)
      .tag("small", (input.small ?? false).toString())
      .tag("agent", input.agent.name)
      .tag("mode", input.agent.mode)
    l.info("stream", {
      modelID: input.model.id,
      providerID: input.model.providerID,
    })
    const [language, cfg, provider, auth] = await Promise.all([
      Provider.getLanguage(input.model),
      Config.get(),
      Provider.getProvider(input.model.providerID),
      Auth.get(input.model.providerID),
    ])
    const isCodex = provider.id === "openai" && auth?.type === "oauth"

    const system = []
    system.push(
      [
        // use agent prompt otherwise provider prompt
        // For Codex sessions, skip SystemPrompt.provider() since it's sent via options.instructions
        ...(input.agent.prompt ? [input.agent.prompt] : isCodex ? [] : SystemPrompt.provider(input.model)),
        // any custom prompt passed into this call
        ...input.system,
        // any custom prompt from last user message
        ...(input.user.system ? [input.user.system] : []),
      ]
        .filter((x) => x)
        .join("\n"),
    )

    const header = system[0]
    const original = clone(system)
    await Plugin.trigger(
      "experimental.chat.system.transform",
      { sessionID: input.sessionID, model: input.model },
      { system },
    )
    if (system.length === 0) {
      system.push(...original)
    }
    // rejoin to maintain 2-part structure for caching if header unchanged
    if (system.length > 2 && system[0] === header) {
      const rest = system.slice(1)
      system.length = 0
      system.push(header, rest.join("\n"))
    }

    // 保存经过 Plugin 处理后的完整 system 数组，供 saveContextAfterResponse 使用
    sessionSystemCache.set(input.sessionID, clone(system))

    const variant =
      !input.small && input.model.variants && input.user.variant ? input.model.variants[input.user.variant] : {}
    const base = input.small
      ? ProviderTransform.smallOptions(input.model)
      : ProviderTransform.options({
          model: input.model,
          sessionID: input.sessionID,
          providerOptions: provider.options,
        })
    const options: Record<string, any> = pipe(
      base,
      mergeDeep(input.model.options),
      mergeDeep(input.agent.options),
      mergeDeep(variant),
    )
    if (isCodex) {
      options.instructions = SystemPrompt.instructions()
    }

    const params = await Plugin.trigger(
      "chat.params",
      {
        sessionID: input.sessionID,
        agent: input.agent,
        model: input.model,
        provider,
        message: input.user,
      },
      {
        temperature: input.temperatureOverride ?? (
          input.model.capabilities.temperature
            ? (input.agent.temperature ?? ProviderTransform.temperature(input.model))
            : undefined
        ),
        topP: input.agent.topP ?? ProviderTransform.topP(input.model),
        topK: ProviderTransform.topK(input.model),
        options,
      },
    )

    const { headers } = await Plugin.trigger(
      "chat.headers",
      {
        sessionID: input.sessionID,
        agent: input.agent,
        model: input.model,
        provider,
        message: input.user,
      },
      {
        headers: {},
      },
    )

    const maxOutputTokens = isCodex ? undefined : undefined
    log.info("max_output_tokens", {
      tokens: ProviderTransform.maxOutputTokens(
        input.model.api.npm,
        params.options,
        input.model.limit.output,
        OUTPUT_TOKEN_MAX,
      ),
      modelOptions: params.options,
      outputLimit: input.model.limit.output,
    })
    // tokens = 32000
    // outputLimit = 64000
    // modelOptions={"reasoningEffort":"minimal"}

    const tools = await resolveTools(input)

    // LiteLLM and some Anthropic proxies require the tools parameter to be present
    // when message history contains tool calls, even if no tools are being used.
    // Add a dummy tool that is never called to satisfy this validation.
    // This is enabled for:
    // 1. Providers with "litellm" in their ID or API ID (auto-detected)
    // 2. Providers with explicit "litellmProxy: true" option (opt-in for custom gateways)
    const isLiteLLMProxy =
      provider.options?.["litellmProxy"] === true ||
      input.model.providerID.toLowerCase().includes("litellm") ||
      input.model.api.id.toLowerCase().includes("litellm")

    if (isLiteLLMProxy && Object.keys(tools).length === 0 && hasToolCalls(input.messages)) {
      tools["_noop"] = tool({
        description:
          "Placeholder for LiteLLM/Anthropic proxy compatibility - required when message history contains tool calls but no active tools are needed",
        inputSchema: jsonSchema({ type: "object", properties: {} }),
        execute: async () => ({ output: "", title: "", metadata: {} }),
      })
    }

    const requestHeaders = {
      ...(isCodex
        ? {
            originator: "costrict",
            "User-Agent": `costrict-cli/${Installation.VERSION} (${os.platform()} ${os.release()}; ${os.arch()})`,
            session_id: input.sessionID,
          }
        : undefined),
      ...(input.model.providerID.startsWith("opencode")
        ? {
            "x-opencode-project": Instance.project.id,
            "x-opencode-session": input.sessionID,
            "x-opencode-request": input.user.id,
            "x-opencode-client": Flag.COSTRICT_CLIENT,
          }
        : undefined),
      ...input.model.headers,
    }

    const requestMessages = [
      ...(isCodex
        ? [
            {
              role: "user",
              content: system.join("\n\n"),
            } as ModelMessage,
          ]
        : system.map(
            (x): ModelMessage => ({
              role: "system",
              content: x,
            }),
          )),
      ...input.messages,
    ]

    const requestBody = {
      temperature: params.temperature,
      topP: params.topP,
      topK: params.topK,
      providerOptions: ProviderTransform.providerOptions(input.model, params.options),
      activeTools: Object.keys(tools).filter((x) => x !== "invalid"),
      tools,
      maxOutputTokens,
      messages: requestMessages,
      maxRetries: input.retries ?? 0,
    }

    // 保存实际发送给LLM的请求上下文
    await saveActualContext({
      sessionID: input.sessionID,
      requestMessages,
      requestHeaders,
      requestBody,
      system,
      isCodex,
      agent: input.agent,
      model: input.model,
    }).catch((err) => {
      l.error("failed to save actual context", { error: err })
    })

    return streamText({
      onError(error) {
        l.error("stream error", {
          error,
        })

        Bus.publish(Session.Event.LLMError, {
          providerID: input.model.providerID,
          modelID: input.model.id,
          sessionID: input.sessionID,
          agent: input.agent.name,
          requestType: "stream",
          attempt: 0,
          error,
          request: {
            body: requestBody,
            headers: requestHeaders,
          },
        })
      },
      async experimental_repairToolCall(failed) {
        const lower = failed.toolCall.toolName.toLowerCase()
        const name = lower !== failed.toolCall.toolName && tools[lower] ? lower : failed.toolCall.toolName
        if (name !== failed.toolCall.toolName) {
          l.info("repairing tool call", {
            tool: failed.toolCall.toolName,
            repaired: name,
          })
        }
        const input = repairToolInput(failed.toolCall.input)
        if (input) {
          return {
            ...failed.toolCall,
            toolName: name,
            input,
          }
        }
        if (name !== failed.toolCall.toolName) {
          return {
            ...failed.toolCall,
            toolName: name,
          }
        }
        return {
          ...failed.toolCall,
          input: JSON.stringify({
            tool: failed.toolCall.toolName,
            error: failed.error.message,
          }),
          toolName: "invalid",
        }
      },
      temperature: params.temperature,
      topP: params.topP,
      topK: params.topK,
      providerOptions: ProviderTransform.providerOptions(input.model, params.options),
      activeTools: Object.keys(tools).filter((x) => x !== "invalid"),
      tools,
      maxOutputTokens,
      abortSignal: input.abort,
      headers: {
        ...(isCodex
          ? {
              originator: "costrict",
              "User-Agent": `costrict-cli/${Installation.VERSION} (${os.platform()} ${os.release()}; ${os.arch()})`,
              session_id: input.sessionID,
            }
          : undefined),
        ...(input.model.providerID.startsWith("opencode")
          ? {
              "x-opencode-project": Instance.project.id,
              "x-opencode-session": input.sessionID,
              "x-opencode-request": input.user.id,
              "x-opencode-client": Flag.COSTRICT_CLIENT,
            }
          : input.model.providerID !== "anthropic"
            ? {
                "User-Agent": `opencode/${Installation.VERSION}`,
              }
            : undefined),
        ...input.model.headers,
        ...headers,
      },
      maxRetries: input.retries ?? 0,
      messages: requestMessages,
      model: wrapLanguageModel({
        model: language,
        middleware: [
          {
            async transformParams(args) {
              if (args.type === "stream") {
                // @ts-expect-error
                args.params.prompt = ProviderTransform.message(args.params.prompt, input.model, options)
              }
              return args.params
            },
          },
          extractReasoningMiddleware({ tagName: "think", startWithReasoning: false }),
        ],
      }),
      experimental_telemetry: { isEnabled: cfg.experimental?.openTelemetry },
    })
  }

  async function resolveTools(input: Pick<StreamInput, "tools" | "agent" | "user">) {
    const disabled = PermissionNext.disabled(Object.keys(input.tools), input.agent.permission)
    for (const tool of Object.keys(input.tools)) {
      if (input.user.tools?.[tool] === false || disabled.has(tool)) {
        delete input.tools[tool]
      }
    }
    return input.tools
  }

  // Check if messages contain any tool-call content
  // Used to determine if a dummy tool should be added for LiteLLM proxy compatibility
  export function hasToolCalls(messages: ModelMessage[]): boolean {
    for (const msg of messages) {
      if (!Array.isArray(msg.content)) continue
      for (const part of msg.content) {
        if (part.type === "tool-call" || part.type === "tool-result") return true
      }
    }
    return false
  }

  /**
   * 保存实际发送给LLM的请求上下文
   * 这个函数保存的是真正发送给LLM的消息，包含所有provider特殊处理
   */
  export async function saveActualContext(input: {
    sessionID: string
    requestMessages: ModelMessage[]
    requestHeaders: Record<string, any>
    requestBody: Record<string, any>
    system: string[]
    isCodex: boolean
    agent: Agent.Info
    model: Provider.Model
    responseMessage?: ModelMessage  // 可选：LLM 的响应消息
  }) {
    await fs.mkdir(HISTORY_DIR, { recursive: true })
    const history = await Session.messages({ sessionID: input.sessionID }).catch(() => [] as MessageV2.WithParts[])
    const toolExecutions = collectToolExecutions(history)

    // 转换消息格式为 OpenAI 标准格式
    const convertedMessages = input.requestMessages.map((msg) => {
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        return {
          ...msg,
          content: msg.content.map((part: any) => {
            if (part.type === "tool-call") {
              // toolName -> name, input -> arguments
              const { toolName, input: toolInput, ...rest } = part
              return {
                ...rest,
                name: toolName,
                arguments: toolInput,
              }
            }
            return part
          }),
        }
      }
      return msg
    })

    // 如果有响应消息，添加到消息列表中
    const messagesWithResponse = input.responseMessage
      ? [...convertedMessages, input.responseMessage]
      : convertedMessages

    // 提取工具信息并转换为 OpenAI 格式
    const availableTools = input.requestBody.activeTools.map((toolName: string) => {
      const toolDef = input.requestBody.tools[toolName]
      if (!toolDef) {
        return {
          type: "function",
          function: {
            name: toolName,
            description: "",
            parameters: {
              type: "object",
              properties: {},
              required: [],
            },
          },
        }
      }

      // 从 AI SDK 的 Tool 对象中提取 inputSchema
      let schema = toolDef.inputSchema || toolDef.parameters || {}

      // 如果 inputSchema 包含 jsonSchema 字段，提取它
      if (schema.jsonSchema) {
        schema = schema.jsonSchema
      }

      // 删除不需要的字段
      if (schema.$schema || schema.additionalProperties !== undefined) {
        const { $schema, additionalProperties, ...rest } = schema
        schema = rest
      }

      return {
        type: "function",
        function: {
          name: toolName,
          description: toolDef.description || "",
          parameters: schema,
        },
      }
    })

    // 构建完整的上下文对象
    const context = {
      timestamp: Date.now(),
      sessionID: input.sessionID,

      // 元信息
      meta: {
        agent: input.agent.name,
        agentMode: input.agent.mode,
        modelID: input.model.id,
        providerID: input.model.providerID,
        isCodex: input.isCodex,
      },

      // 实际发送的请求（这是最关键的部分）
      actualRequest: {
        messages: messagesWithResponse,  // 转换后的消息（OpenAI格式），包含响应
        headers: input.requestHeaders,    // 包含provider特殊headers
        parameters: {
          temperature: input.requestBody.temperature,
          topP: input.requestBody.topP,
          topK: input.requestBody.topK,
          maxOutputTokens: input.requestBody.maxOutputTokens,
          providerOptions: input.requestBody.providerOptions,
        },
        tools: availableTools,  // OpenAI格式的工具定义
      },

      // System消息的原始形式（用于对比）
      systemPrompts: {
        array: input.system,  // 可能是拼接前的数组
        isCodexFormat: input.isCodex,  // 标记是否使用Codex格式
      },
      // 仅用于轨迹分析，不会发送给模型
      toolExecutions,
    }

    const filename = sessionFilename(input.sessionID, input.agent.name)
    const contextFile = path.join(HISTORY_DIR, filename)

    // 删除旧的context文件（同一会话内只保留最新的，兼容旧格式）
    try {
      const files = await fs.readdir(HISTORY_DIR)
      for (const file of files) {
        if (file.includes(`-${input.sessionID}-`) && file.endsWith(".json") && file !== filename) {
          await fs.unlink(path.join(HISTORY_DIR, file)).catch(() => {})
        }
      }
    } catch {
      // 忽略错误
    }

    // 保存context到文件
    await fs.writeFile(contextFile, JSON.stringify(context, null, 2), "utf-8")

    log.info("saved actual LLM request context", {
      sessionID: input.sessionID,
      file: contextFile,
      messageCount: input.requestMessages.length,
      isCodex: input.isCodex,
      hasResponse: !!input.responseMessage,
    })
  }

  /**
   * 保存包含 LLM 响应的完整上下文
   * 在 LLM 响应完成后调用此函数
   * 这个函数会读取当前 session 的所有消息，并保存完整的上下文
   */
  export async function saveContextAfterResponse(input: {
    sessionID: string
    agent: Agent.Info
    model: Provider.Model
    tools: Record<string, any>  // AI SDK 工具对象
    system?: string[]  // 可选：系统提示词数组，如果没有提供则从 sessionSystemCache 读取
  }) {
    try {
      log.info("saveContextAfterResponse called", {
        sessionID: input.sessionID,
        agent: input.agent.name,
      })

      // 获取系统提示词：优先使用传入的，否则从缓存读取
      const systemPrompts = input.system || sessionSystemCache.get(input.sessionID) || []
      if (!input.system && systemPrompts.length === 0) {
        log.warn("No system prompts available", {
          sessionID: input.sessionID,
        })
      } else {
        log.info("Using system prompts", {
          sessionID: input.sessionID,
          source: input.system ? "provided" : "cache",
          count: systemPrompts.length,
        })
      }

      // 读取当前 session 的所有消息
      const messages = await Session.messages({ sessionID: input.sessionID })
      const toolExecutions = collectToolExecutions(messages)
      log.info("messages read from DB", {
        count: messages.length,
      })

      // 检查最后一条消息
      const lastMessage = messages[messages.length - 1]
      if (lastMessage?.info.role === "assistant") {
        log.info("last message is assistant", {
          partsCount: lastMessage.parts.length,
          parts: lastMessage.parts.map((p: any) => ({
            type: p.type,
            tool: p.type === "tool" ? p.tool : undefined,
            status: p.type === "tool" ? p.state?.status : undefined,
          })),
        })
      }

      // 转换为 ModelMessage 格式
      const modelMessages = MessageV2.toModelMessages(messages, input.model)
      log.info("converted to ModelMessages", {
        count: modelMessages.length,
      })

      // 检查最后一条 ModelMessage
      const lastModelMsg = modelMessages[modelMessages.length - 1]
      if (lastModelMsg?.role === "assistant") {
        log.info("last ModelMessage details", {
          role: lastModelMsg.role,
          contentType: Array.isArray(lastModelMsg.content) ? "array" : typeof lastModelMsg.content,
          contentParts: Array.isArray(lastModelMsg.content)
            ? lastModelMsg.content.map((p: any) => ({
                type: p.type,
                toolName: p.type === "tool-call" ? p.toolName : undefined,
              }))
            : undefined,
        })
      }

      // 转换消息格式为 OpenAI 标准格式（与 saveActualContext 一致）
      const convertedMessages = modelMessages.map((msg) => {
        if (msg.role === "assistant" && Array.isArray(msg.content)) {
          return {
            ...msg,
            content: msg.content.map((part: any) => {
              if (part.type === "tool-call") {
                // toolName -> name, input -> arguments
                const { toolName, input: toolInput, ...rest } = part
                return {
                  ...rest,
                  name: toolName,
                  arguments: toolInput,
                }
              }
              return part
            }),
          }
        }
        return msg
      })

      log.info("converted to OpenAI format", {
        count: convertedMessages.length,
      })

      const lastConvertedMsg = convertedMessages[convertedMessages.length - 1]
      if (lastConvertedMsg?.role === "assistant" && Array.isArray(lastConvertedMsg.content)) {
        log.info("last converted message details", {
          role: lastConvertedMsg.role,
          contentParts: lastConvertedMsg.content.map((p: any) => ({
            type: p.type,
            name: p.type === "tool-call" ? p.name : undefined,
          })),
        })
      }

      // 构建与 saveActualContext 一致的 context 对象
      await fs.mkdir(HISTORY_DIR, { recursive: true })

      // 将系统提示词转换为 system 消息（放在 messages 最开头）
      const systemMessages = systemPrompts.map(
        (x): ModelMessage => ({
          role: "system",
          content: x,
        }),
      )

      // 合并系统提示词和对话消息（system 放在最开头）
      const messagesWithSystem = [...systemMessages, ...convertedMessages]

      // 提取工具信息并转换为 OpenAI 格式（与 saveActualContext 一致）
      const activeToolNames = Object.keys(input.tools).filter((x) => x !== "invalid")
      const availableTools = activeToolNames.map((toolName: string) => {
        const toolDef = input.tools[toolName]
        if (!toolDef) {
          return {
            type: "function",
            function: {
              name: toolName,
              description: "",
              parameters: {
                type: "object",
                properties: {},
                required: [],
              },
            },
          }
        }

        // 从 AI SDK 的 Tool 对象中提取 inputSchema
        let schema = toolDef.inputSchema || toolDef.parameters || {}

        // 如果 inputSchema 包含 jsonSchema 字段，提取它
        if (schema.jsonSchema) {
          schema = schema.jsonSchema
        }

        // 删除不需要的字段
        if (schema.$schema || schema.additionalProperties !== undefined) {
          const { $schema, additionalProperties, ...rest } = schema
          schema = rest
        }

        return {
          type: "function",
          function: {
            name: toolName,
            description: toolDef.description || "",
            parameters: schema,
          },
        }
      })

      const context = {
        timestamp: Date.now(),
        sessionID: input.sessionID,
        meta: {
          agent: input.agent.name,
          agentMode: input.agent.mode,
          modelID: input.model.id,
          providerID: input.model.providerID,
        },
        // 使用 actualRequest 格式，与 saveActualContext 保持一致
        actualRequest: {
          messages: messagesWithSystem,  // 包含系统提示词和 LLM 响应的完整消息历史
          tools: availableTools,  // OpenAI格式的工具定义
        },
        // System消息的原始形式（用于对比）
        systemPrompts: {
          array: systemPrompts,  // 经过 Plugin 处理后的完整系统提示词数组
        },
        // 仅用于轨迹分析，不会发送给模型
        toolExecutions,
      }

      const filename = sessionFilename(input.sessionID, input.agent.name)
      const contextFile = path.join(HISTORY_DIR, filename)

      // 删除旧的context文件（同一会话内只保留最新的，兼容旧格式）
      try {
        const files = await fs.readdir(HISTORY_DIR)
        for (const file of files) {
          if (file.includes(`-${input.sessionID}-`) && file.endsWith(".json") && file !== filename) {
            await fs.unlink(path.join(HISTORY_DIR, file)).catch(() => {})
          }
        }
      } catch {
        // 忽略错误
      }

      // 保存context到文件
      await fs.writeFile(contextFile, JSON.stringify(context, null, 2), "utf-8")
      log.info("context file saved successfully", {
        file: contextFile,
      })

      log.info("saved context with LLM response", {
        sessionID: input.sessionID,
        file: contextFile,
        messageCount: convertedMessages.length,
      })
    } catch (error) {
      log.error("failed to save context after response", { error, sessionID: input.sessionID })
    }
  }
}
