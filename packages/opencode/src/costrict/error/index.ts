import type { NamedError } from "@opencode-ai/util/error"
import { MessageV2 } from "@/session/message-v2"
import type { Provider } from "@/provider/provider"
import type { ModelMessage, APICallError } from "ai"

const COSTRICT_FINISH_REASON = {
  LENGTH: "length",
}

export namespace CostrictError {
  const RETRY_MESSAGE = "Service unavailable"
  const RATE_LIMIT_MESSAGE = "Too Many Requests"

  const RULES = [
    {
      match: (message: string) => /code\s*:\s*503/i.test(message),
      make: (message: string) =>
        new MessageV2.APIError({
          message: RETRY_MESSAGE,
          statusCode: 503,
          isRetryable: true,
          responseBody: message,
        }).toObject(),
    },
    {
      match: (message: string) => /status\s*:\s*503/i.test(message),
      make: (message: string) =>
        new MessageV2.APIError({
          message: RETRY_MESSAGE,
          statusCode: 503,
          isRetryable: true,
          responseBody: message,
        }).toObject(),
    },
    {
      match: (message: string) => /try again|retry/i.test(message),
      make: (message: string) =>
        new MessageV2.APIError({
          message: RETRY_MESSAGE,
          statusCode: 503,
          isRetryable: true,
          responseBody: message,
        }).toObject(),
    },
    {
      match: (message: string) => {
        const text = message.toLowerCase()
        return text.includes("too many requests") || text.includes("rate limit") || text.includes("official limit")
      },
      make: (message: string) =>
        new MessageV2.APIError({
          message: RATE_LIMIT_MESSAGE,
          statusCode: 429,
          isRetryable: true,
          responseBody: message,
        }).toObject(),
    },
    {
      match: (message: string) => /connection error/i.test(message),
      make: (message: string) =>
        new MessageV2.APIError({
          message: "Connection error",
          isRetryable: true,
          responseBody: message,
        }).toObject(),
    },
  ]

  export function fromError(error: unknown) {
    const message = typeof error === "string" ? error : error instanceof Error ? error.message : ""
    if (message === "") return
    for (const rule of RULES) {
      if (!rule.match(message)) continue
      return rule.make(message)
    }
  }

  export function retryable(error: ReturnType<NamedError["toObject"]>) {
    if (MessageV2.OutputLengthError.isInstance(error)) {
      return "Output length reached"
    }
    if (MessageV2.ReasoningOnlyError.isInstance(error)) {
      return "Response only contains reasoning content"
    }
    if (MessageV2.APIError.isInstance(error)) {
      const status = error.data.statusCode
      if (status === 503) {
        return RETRY_MESSAGE
      }
      if (status === 429) {
        return RATE_LIMIT_MESSAGE
      }
    }
  }

  export async function finish(input: {
    reason: string
    message: MessageV2.Assistant
    model: Provider.Model
    messages: ModelMessage[]
  }) {
    if (input.reason === COSTRICT_FINISH_REASON.LENGTH) {
      const current = await MessageV2.get({
        sessionID: input.message.sessionID,
        messageID: input.message.id,
      })
      const continuation = await MessageV2.toModelMessages([current], input.model)
      const messages = [
        ...input.messages,
        ...continuation,
        {
          role: "user",
          content: [
            "<system-reminder>",
            "模型输出内容超出了本次任务设定的 max token 上限，导致 agent 无法正常接收并执行后续操作。请基于本次任务核心需求，精简输出内容、剔除冗余表述，优先保留关键信息 / 核心指令 / 核心结果，严格控制文本 token 长度在限制范围内后重新输出；若需输出的内容较多，可采用分批次、分模块的方式依次输出，避免单次输出超限。",
            "</system-reminder>",
          ].join("\n"),
        },
      ] satisfies ModelMessage[]
      return {
        messages,
        error: new MessageV2.OutputLengthError({}),
      }
    }
    return void 0
  }
}
