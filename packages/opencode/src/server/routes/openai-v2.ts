import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import z from "zod"
import { Provider } from "../../provider/provider"
import { Session } from "../../session"
import { SessionPrompt } from "../../session/prompt"
import { MessageV2 } from "../../session/message-v2"
import { Agent } from "../../agent/agent"
import { Log } from "../../util/log"
import { lazy } from "../../util/lazy"
import { Bus } from "../../bus"
import { ulid } from "ulid"

const log = Log.create({ service: "openai" })

const ChatMessage = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z
    .union([
      z.string(),
      z.null(),
      z.array(
        z.discriminatedUnion("type", [
          z.object({ type: z.literal("text"), text: z.string() }),
          z.object({
            type: z.literal("image_url"),
            image_url: z.object({
              url: z.string(),
              detail: z.enum(["auto", "low", "high"]).optional(),
            }),
          }),
        ]),
      ),
    ])
    .optional(),
  name: z.string().optional(),
  tool_calls: z
    .array(
      z.object({
        id: z.string(),
        type: z.literal("function"),
        function: z.object({
          name: z.string(),
          arguments: z.string(),
        }),
      }),
    )
    .optional(),
  tool_call_id: z.string().optional(),
})
type ChatMessage = z.infer<typeof ChatMessage>

const ToolFunction = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.record(z.string(), z.any()).optional(),
  }),
})

const CompletionRequest = z.object({
  model: z.string(),
  messages: z.array(ChatMessage),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  max_tokens: z.number().optional(),
  stream: z.boolean().optional().default(false),
  tools: z.array(ToolFunction).optional(),
  tool_choice: z
    .union([z.literal("auto"), z.literal("none"), z.literal("required"), z.string()])
    .optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  n: z.number().optional().default(1),
  // opencode extensions
  session_id: z.string().optional(),
  agent: z.string().optional(),
})

function now() {
  return Math.floor(Date.now() / 1000)
}

function split(model: string) {
  const idx = model.indexOf("/")
  if (idx === -1) return { providerID: model, modelID: model }
  return { providerID: model.slice(0, idx), modelID: model.slice(idx + 1) }
}

function mid(providerID: string, modelID: string) {
  return `${providerID}/${modelID}`
}

function partsToContent(parts: MessageV2.Part[]) {
  const text: string[] = []
  const reasoning: string[] = []
  const calls: {
    id: string
    type: "function"
    function: { name: string; arguments: string }
  }[] = []

  for (const p of parts) {
    if (p.type === "text" && !p.ignored && !p.synthetic) text.push(p.text)
    if (p.type === "reasoning") reasoning.push(p.text)
    if (p.type === "tool" && (p.state.status === "completed" || p.state.status === "running")) {
      calls.push({
        id: p.callID,
        type: "function",
        function: {
          name: p.tool,
          arguments: JSON.stringify(p.state.input),
        },
      })
    }
  }

  return { text: text.join(""), reasoning: reasoning.join(""), calls }
}

function finish(msg: MessageV2.WithParts) {
  if (msg.info.role !== "assistant") return "stop"
  const f = (msg.info as MessageV2.Assistant).finish
  if (!f) return "stop"
  if (f === "tool-calls") return "tool_calls"
  if (f === "length" || f === "max_tokens") return "length"
  if (f === "content-filter") return "content_filter"
  return "stop"
}

function tokens(msg: MessageV2.WithParts) {
  if (msg.info.role !== "assistant") return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  const t = (msg.info as MessageV2.Assistant).tokens
  return {
    prompt_tokens: t.input,
    completion_tokens: t.output,
    total_tokens: t.total ?? t.input + t.output,
  }
}

function chunk(id: string, model: string, delta: Record<string, any>, reason: string | null, extra?: Record<string, any>) {
  return JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created: now(),
    model,
    choices: [{ index: 0, delta, finish_reason: reason }],
    ...extra,
  })
}

function extractText(msg: ChatMessage): string {
  if (typeof msg.content === "string") return msg.content
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((p) => p.type === "text")
      .map((p) => (p as { type: "text"; text: string }).text)
      .join("\n")
  }
  return ""
}

function guessMime(url: string): string {
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;]+)/)
    if (match) return match[1]
  }
  const lower = url.toLowerCase()
  if (lower.includes(".png")) return "image/png"
  if (lower.includes(".jpg") || lower.includes(".jpeg")) return "image/jpeg"
  if (lower.includes(".gif")) return "image/gif"
  if (lower.includes(".webp")) return "image/webp"
  if (lower.includes(".svg")) return "image/svg+xml"
  return "image/png"
}

export const OpenAIRoutes = lazy(() =>
  new Hono()
    .get("/models", async (c) => {
      const providers = await Provider.list()
      const data: any[] = []
      for (const [pid, provider] of Object.entries(providers)) {
        for (const [, model] of Object.entries(provider.models)) {
          data.push({
            id: mid(pid, model.id),
            object: "model",
            created: now(),
            owned_by: pid,
            permission: [],
            root: model.id,
            parent: null,
          })
        }
      }
      return c.json({ object: "list", data })
    })

    .get("/models/*", async (c) => {
      const raw = c.req.path.replace(/^\/models\//, "")
      const parsed = split(raw)
      try {
        const model = await Provider.getModel(parsed.providerID, parsed.modelID)
        return c.json({
          id: mid(model.providerID, model.id),
          object: "model",
          created: now(),
          owned_by: model.providerID,
          permission: [],
          root: model.id,
          parent: null,
        })
      } catch {
        return c.json({ error: { message: `Model '${raw}' not found`, type: "invalid_request_error" } }, 404)
      }
    })

    .post("/chat/completions", async (c) => {
      const body = await c.req.json()
      const input = CompletionRequest.parse(body)
      const parsed = split(input.model)

      let model: Provider.Model
      try {
        model = await Provider.getModel(parsed.providerID, parsed.modelID)
      } catch {
        return c.json(
          {
            error: {
              message: `Model '${input.model}' not found`,
              type: "invalid_request_error",
              code: "model_not_found",
            },
          },
          404,
        )
      }

      const sessionID = input.session_id ?? (await Session.create({})).id
      const agent = input.agent ?? (await Agent.defaultAgent())

      // Build prompt parts from OpenAI messages
      const promptParts: SessionPrompt.PromptInput["parts"] = []
      const system: string[] = []

      for (const msg of input.messages) {
        if (msg.role === "system") {
          const txt = extractText(msg)
          if (txt) system.push(txt)
          continue
        }
        if (msg.role === "user") {
          const txt = extractText(msg)
          if (txt) promptParts.push({ type: "text", text: txt })
          if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
              if (part.type === "image_url") {
                promptParts.push({
                  type: "file",
                  url: part.image_url.url,
                  mime: guessMime(part.image_url.url),
                })
              }
            }
          }
          continue
        }
        if (msg.role === "assistant") {
          const txt = extractText(msg)
          if (txt) promptParts.push({ type: "text", text: txt })
          if (msg.tool_calls) {
            for (const call of msg.tool_calls) {
              promptParts.push({
                type: "text",
                text: `[Tool Call: ${call.function.name}]\n${call.function.arguments}`,
              })
            }
          }
          continue
        }
        if (msg.role === "tool") {
          const txt = extractText(msg)
          if (txt) {
            promptParts.push({
              type: "text",
              text: `[Tool Result]\n${txt}`,
            })
          }
          continue
        }
      }

      if (promptParts.length === 0) {
        const last = input.messages[input.messages.length - 1]
        promptParts.push({ type: "text", text: extractText(last) || "Continue" })
      }

      const systemText = system.length > 0 ? system.join("\n") : undefined
      const id = `chatcmpl-${ulid()}`

      if (input.stream) {
        return streamSSE(c, async (stream) => {
          try {
            await stream.writeSSE({
              data: chunk(id, input.model, { role: "assistant" }, null),
            })

            let done = false
            let usage = { input: 0, output: 0, total: 0 }
            const seen = new Set<string>()
            let toolIdx = 0

            const unsub = Bus.subscribeAll(async (event) => {
              if (done) return
              const props = event.properties as any

              // Incremental text/reasoning deltas
              if (event.type === "message.part.delta") {
                if (props.sessionID !== sessionID) return
                if (props.field === "text") {
                  await stream.writeSSE({
                    data: chunk(id, input.model, { content: props.delta }, null),
                  })
                }
                if (props.field === "reasoning") {
                  await stream.writeSSE({
                    data: chunk(id, input.model, { reasoning_content: props.delta }, null),
                  })
                }
                return
              }

              if (event.type !== "message.part.updated") return
              const part = props.part as MessageV2.Part
              if (!part || part.sessionID !== sessionID) return

              // Tool call notifications
              if (part.type === "tool" && part.state.status === "running" && !seen.has(part.callID)) {
                seen.add(part.callID)
                const idx = toolIdx++
                await stream.writeSSE({
                  data: chunk(
                    id,
                    input.model,
                    {
                      tool_calls: [
                        {
                          index: idx,
                          id: part.callID,
                          type: "function",
                          function: {
                            name: part.tool,
                            arguments: JSON.stringify(part.state.input),
                          },
                        },
                      ],
                    },
                    null,
                  ),
                })
              }

              // Accumulate token usage
              if (part.type === "step-finish") {
                usage.input += part.tokens.input
                usage.output += part.tokens.output
                usage.total += part.tokens.total ?? part.tokens.input + part.tokens.output
              }
            })

            const result = await SessionPrompt.prompt({
              sessionID,
              parts: promptParts,
              system: systemText,
              agent,
              model: { providerID: model.providerID, modelID: model.id },
            })

            unsub()
            done = true

            await stream.writeSSE({
              data: chunk(id, input.model, {}, finish(result), {
                usage: {
                  prompt_tokens: usage.input,
                  completion_tokens: usage.output,
                  total_tokens: usage.total,
                },
              }),
            })
            await stream.writeSSE({ data: "[DONE]" })
          } catch (err) {
            log.error("stream error", { error: err })
            await stream.writeSSE({ data: chunk(id, input.model, {}, "stop") })
            await stream.writeSSE({ data: "[DONE]" })
          }
        })
      }

      // Non-streaming
      const result = await SessionPrompt.prompt({
        sessionID,
        parts: promptParts,
        system: systemText,
        agent,
        model: { providerID: model.providerID, modelID: model.id },
      })

      const content = partsToContent(result.parts)
      const message: Record<string, any> = {
        role: "assistant",
        content: content.text || null,
      }
      if (content.calls.length > 0) message.tool_calls = content.calls
      if (content.reasoning) message.reasoning_content = content.reasoning

      return c.json({
        id,
        object: "chat.completion",
        created: now(),
        model: input.model,
        choices: [{ index: 0, message, finish_reason: finish(result) }],
        usage: tokens(result),
        system_fingerprint: `opencode-${model.providerID}`,
      })
    }),
)
