import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { describeRoute, resolver, validator } from "hono-openapi"
import { HTTPException } from "hono/http-exception"
import z from "zod"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { Session } from "../../session"
import { SessionPrompt } from "../../session/prompt"
import { MessageV2 } from "../../session/message-v2"
import { Provider } from "../../provider/provider"
import { Identifier } from "../../id/id"
import { Agent } from "../../agent/agent"
import { Instance } from "../../project/instance"
import { Bus } from "../../bus"

const Text = z
   .object({
      type: z.literal("text"),
      text: z.string(),
   })
   .strict()

const Image = z
   .object({
      type: z.literal("image_url"),
      image_url: z
         .object({
            url: z.string(),
         })
         .strict(),
   })
   .strict()

const Sys = z.union([z.string(), z.array(Text).min(1)])
const Usr = z.union([z.string(), z.array(z.union([Text, Image])).min(1)])
const Asst = z.union([z.string(), z.array(Text).min(1)])

const Msg = z.discriminatedUnion("role", [
   z
      .object({
         role: z.literal("system"),
         content: Sys,
      })
      .strict(),
   z
      .object({
         role: z.literal("developer"),
         content: Sys,
      })
      .strict(),
   z
      .object({
         role: z.literal("user"),
         content: Usr,
      })
      .strict(),
   z
      .object({
         role: z.literal("assistant"),
         content: Asst,
      })
      .strict(),
])

const Opts = z
   .object({
      include_usage: z.boolean().optional(),
   })
   .strict()

const Req = z
   .object({
      model: z.string(),
      messages: z.array(Msg).min(1),
      stream: z.boolean().optional().default(false),
      stream_options: Opts.optional(),
   })
   .strict()
   .superRefine((input, ctx) => {
      if (input.stream || !input.stream_options) return
      ctx.addIssue({
         code: "custom",
         path: ["stream_options"],
         message: "stream_options is only supported when stream is true",
      })
   })
   .meta({
      ref: "OpenAIChatCompletionsRequest",
   })

type Req = z.infer<typeof Req>
type Msg = z.infer<typeof Msg>

const Call = z
   .object({
      type: z.literal("function"),
      id: z.string(),
      function: z.object({
         name: z.string(),
         arguments: z.string(),
      }),
   })
   .meta({
      ref: "OpenAIChatCompletionToolCall",
   })

const Delta = z
   .object({
      role: z.literal("assistant").optional(),
      content: z.string().optional(),
      reasoning_text: z.string().optional(),
      reasoning_opaque: z.string().optional(),
      tool_calls: z
         .array(
            z.object({
               index: z.number(),
               id: z.string().optional(),
               function: z.object({
                  name: z.string().optional(),
                  arguments: z.string().optional(),
               }),
            }),
         )
         .optional(),
   })
   .meta({
      ref: "OpenAIChatCompletionDelta",
   })

type Delta = z.infer<typeof Delta>

const Usage = z
   .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      total_tokens: z.number(),
      prompt_tokens_details: z
         .object({
            cached_tokens: z.number(),
         })
         .optional(),
      completion_tokens_details: z
         .object({
            reasoning_tokens: z.number(),
         })
         .optional(),
   })
   .meta({
      ref: "OpenAIChatCompletionUsage",
   })

type Usage = z.infer<typeof Usage>

const Chunk = z
   .object({
      id: z.string(),
      object: z.literal("chat.completion.chunk"),
      created: z.number(),
      model: z.string(),
      system_fingerprint: z.string().optional(),
      choices: z.array(
         z.object({
            index: z.literal(0),
            delta: Delta,
            finish_reason: z.string().nullable().optional(),
         }),
      ),
      usage: Usage.optional(),
   })
   .meta({
      ref: "OpenAIChatCompletionChunk",
   })

const Res = z
   .object({
      id: z.string(),
      object: z.literal("chat.completion"),
      created: z.number(),
      model: z.string(),
      system_fingerprint: z.string().optional(),
      choices: z.array(
         z.object({
            index: z.literal(0),
            message: z.object({
               role: z.literal("assistant"),
               content: z.string().nullable().optional(),
               tool_calls: z.array(Call).optional(),
               reasoning_text: z.string().optional(),
               reasoning_opaque: z.string().optional(),
            }),
            finish_reason: z.string(),
         }),
      ),
      usage: Usage,
   })
   .meta({
      ref: "OpenAIChatCompletionResponse",
   })

function bad(message: string): never {
   throw new HTTPException(400, { message })
}

function join(input: z.infer<typeof Sys> | z.infer<typeof Asst>) {
   if (typeof input === "string") return input
   return input.map((item) => item.text).join("")
}

function mime(input: string) {
   const url = new URL(input)
   if (url.protocol === "data:") {
      return /^data:([^;,]+)/.exec(input)?.[1] ?? "image/*"
   }
   if (["http:", "https:", "file:"].includes(url.protocol)) return "image/*"
   bad(`unsupported image_url url scheme: ${url.protocol}`)
}

function parts(input: z.infer<typeof Usr>): SessionPrompt.PromptInput["parts"] {
   if (typeof input === "string") {
      return [{ type: "text", text: input }]
   }

   return input.map((item) => {
      if (item.type === "text") {
         return { type: "text", text: item.text } as const
      }

      return {
         type: "file" as const,
         url: item.image_url.url,
         filename: "image",
         mime: mime(item.image_url.url),
      }
   })
}

function content(input: MessageV2.Part[]) {
   return input
      .filter((part): part is MessageV2.TextPart => part.type === "text")
      .map((part) => part.text)
      .join("")
}

function reasoning(input: MessageV2.Part[]) {
   return input
      .filter((part): part is MessageV2.ReasoningPart => part.type === "reasoning")
      .map((part) => part.text)
      .join("")
}

function opaque(input: { metadata?: Record<string, unknown> }) {
   const meta = input.metadata as { copilot?: { reasoningOpaque?: unknown } } | undefined
   return typeof meta?.copilot?.reasoningOpaque === "string" ? meta.copilot.reasoningOpaque : undefined
}

function call(input: MessageV2.ToolPart) {
   return {
      type: "function" as const,
      id: input.callID,
      function: {
         name: input.tool,
         arguments: JSON.stringify(input.state.input ?? {}),
      },
   }
}

function calls(input: MessageV2.Part[]) {
   return input.flatMap((part) => (part.type === "tool" ? [call(part)] : []))
}

function finish(input: MessageV2.WithParts | MessageV2.Assistant) {
   if ("parts" in input && calls(input.parts).length > 0) return "tool_calls"
   const base = "parts" in input ? (input.info.role === "assistant" ? input.info.finish : undefined) : input.finish
   if (base === "length") return "length"
   if (base === "content-filter") return "content_filter"
   if (base === "function-call") return "function_call"
   if (base === "tool-calls") return "tool_calls"
   return "stop"
}

function usage(input: MessageV2.Assistant): Usage {
   const total = input.tokens.total ?? input.tokens.input + input.tokens.output
   return {
      prompt_tokens: input.tokens.input,
      completion_tokens: input.tokens.output,
      total_tokens: total,
      ...(input.tokens.cache.read > 0
         ? {
            prompt_tokens_details: {
               cached_tokens: input.tokens.cache.read,
            },
         }
         : {}),
      ...(input.tokens.reasoning > 0
         ? {
            completion_tokens_details: {
               reasoning_tokens: input.tokens.reasoning,
            },
         }
         : {}),
   }
}

function message(input: MessageV2.WithParts) {
   const text = content(input.parts)
   const tool = calls(input.parts)
   const think = reasoning(input.parts)
   const hint = input.parts
      .map((part) => ("metadata" in part ? opaque(part) : undefined))
      .find((part) => part)

   return {
      role: "assistant" as const,
      content: text ? text : null,
      ...(tool.length > 0 ? { tool_calls: tool } : {}),
      ...(think ? { reasoning_text: think } : {}),
      ...(hint ? { reasoning_opaque: hint } : {}),
   }
}

function chunk(input: {
   id: string
   created: number
   model: string
   choices: Array<{
      index: 0
      delta: Delta
      finish_reason?: string | null
   }>
   usage?: Usage
}) {
   return {
      id: input.id,
      object: "chat.completion.chunk" as const,
      created: input.created,
      model: input.model,
      choices: input.choices,
      ...(input.usage ? { usage: input.usage } : {}),
   }
}

function error(input: NonNullable<MessageV2.Assistant["error"]>) {
   if ("message" in input && typeof input.message === "string") return input.message
   if (
      "data" in input &&
      input.data &&
      typeof input.data === "object" &&
      "message" in input.data &&
      typeof input.data.message === "string"
   )
      return input.data.message
   return input.name
}

async function model(input: string) {
   if (input.includes("/")) {
      const next = Provider.parseModel(input)
      await Provider.getModel(next.providerID, next.modelID)
      return next
   }

   const hits = Object.entries(await Provider.list()).flatMap(([providerID, provider]) => {
      if (!(input in provider.models)) return []
      return [{ providerID, modelID: input }]
   })

   if (hits.length === 1) return hits[0]
   if (hits.length === 0) {
      throw new HTTPException(400, {
         message: `Unknown model: ${input}`,
      })
   }

   throw new HTTPException(400, {
      message: `Ambiguous model: ${input}. Use provider/model.`,
   })
}

async function seed(input: {
   sessionID: string
   messages: Msg[]
   model: { providerID: string; modelID: string }
   agent: string
}) {
   let parent: string | undefined
   const path = {
      cwd: Instance.directory,
      root: Instance.worktree,
   }

   for (const item of input.messages) {
      if (item.role === "system" || item.role === "developer") continue

      if (item.role === "user") {
         const msg = await SessionPrompt.prompt({
            sessionID: input.sessionID,
            messageID: Identifier.ascending("message"),
            model: input.model,
            agent: input.agent,
            noReply: true,
            parts: parts(item.content),
         })
         parent = msg.info.id
         continue
      }

      if (!parent) {
         bad("assistant messages must follow a user message")
      }

      const id = Identifier.ascending("message")
      const now = Date.now()
      await Session.updateMessage({
         id,
         sessionID: input.sessionID,
         role: "assistant",
         parentID: parent,
         mode: input.agent,
         agent: input.agent,
         path,
         cost: 0,
         tokens: {
            input: 0,
            output: 0,
            reasoning: 0,
            cache: { read: 0, write: 0 },
         },
         providerID: input.model.providerID,
         modelID: input.model.modelID,
         time: {
            created: now,
            completed: now,
         },
         finish: "stop",
      })
      await Session.updatePart({
         id: Identifier.ascending("part"),
         sessionID: input.sessionID,
         messageID: id,
         type: "text",
         text: join(item.content),
         time: {
            start: now,
            end: now,
         },
      })
   }
}

async function prep(input: Req) {
   const next = await model(input.model)
   const agent = await Agent.defaultAgent()
   const session = await Session.create({ title: "OpenAI Chat Completion" })
   const system = input.messages
      .filter((item) => item.role === "system" || item.role === "developer")
      .map((item) => join(item.content))
      .filter((item) => item.length > 0)
      .join("\n\n")
   const messages = input.messages.filter((item) => item.role !== "system" && item.role !== "developer")
   const last = messages.at(-1)

   if (!last || last.role !== "user") {
      bad("messages must end with a user message")
   }

   await seed({
      sessionID: session.id,
      messages: messages.slice(0, -1),
      model: next,
      agent,
   })

   const messageID = Identifier.ascending("message")
   return {
      id: `chatcmpl_${session.id}`,
      created: Math.floor(Date.now() / 1000),
      session,
      include: input.stream_options?.include_usage === true,
      prompt: {
         sessionID: session.id,
         messageID,
         model: next,
         agent,
         ...(system ? { system } : {}),
         parts: parts(last.content),
      },
   }
}

export const OpenAIRoutes = lazy(() =>
   new Hono().post(
      "/chat/completions",
      describeRoute({
         summary: "OpenAI-compatible chat completions",
         description: "Create a chat completion using an OpenAI-compatible request and response shape.",
         operationId: "openai.chat.completions.create",
         responses: {
            200: {
               description: "Chat completion response",
               content: {
                  "application/json": {
                     schema: resolver(Res),
                  },
                  "text/event-stream": {
                     schema: resolver(Chunk),
                  },
               },
            },
            ...errors(400, 404),
         },
      }),
      validator("json", Req),
      async (c) => {
         const body = c.req.valid("json")
         const init = await prep(body)

         if (!body.stream) {
            const result = await SessionPrompt.prompt(init.prompt)
            if (result.info.role !== "assistant") {
               throw new Error("prompt did not produce an assistant message")
            }
            if (result.info.error) {
               throw new HTTPException(500, {
                  message: error(result.info.error),
               })
            }
            return c.json({
               id: init.id,
               object: "chat.completion" as const,
               created: init.created,
               model: body.model,
               choices: [
                  {
                     index: 0 as const,
                     message: message(result),
                     finish_reason: finish(result),
                  },
               ],
               usage: usage(result.info),
            })
         }

         c.header("X-Accel-Buffering", "no")
         c.header("X-Content-Type-Options", "nosniff")
         return streamSSE(c, async (stream) => {
            let aid = ""
            let open = false
            let fail: string | undefined
            let sent = false
            const kind = new Map<string, MessageV2.Part["type"]>()
            const text = new Map<string, string>()
            const think = new Map<string, string>()
            const tool = new Map<string, string>()
            const slot = new Map<string, number>()
            const emit = async (data: string | object) => {
               await stream.writeSSE({
                  data: typeof data === "string" ? data : JSON.stringify(data),
               })
            }
            const role = async () => {
               if (open) return
               open = true
               await emit(
                  chunk({
                     id: init.id,
                     created: init.created,
                     model: body.model,
                     choices: [{ index: 0 as const, delta: { role: "assistant" } }],
                  }),
               )
            }
            const patch = (part: MessageV2.Part, delta: Delta) => {
               const hint = "metadata" in part ? opaque(part) : undefined
               if (!hint || sent) return delta
               sent = true
               return { ...delta, reasoning_opaque: hint }
            }
            const push = async (part: MessageV2.Part, delta: Delta) => {
               const next = patch(part, delta)
               if (Object.keys(next).length === 0) return
               await role()
               await emit(
                  chunk({
                     id: init.id,
                     created: init.created,
                     model: body.model,
                     choices: [{ index: 0 as const, delta: next }],
                  }),
               )
            }
            const textdelta = async (part: MessageV2.TextPart, delta: string) => {
               if (!delta) return
               text.set(part.id, (text.get(part.id) ?? "") + delta)
               await push(part, { content: delta })
            }
            const reasondelta = async (part: MessageV2.ReasoningPart, delta: string) => {
               if (!delta) return
               think.set(part.id, (think.get(part.id) ?? "") + delta)
               await push(part, { reasoning_text: delta })
            }
            const tooldelta = async (part: MessageV2.ToolPart) => {
               if (part.state.status === "pending") return
               const raw = JSON.stringify(part.state.input ?? {})
               if (tool.get(part.callID) === raw) return
               tool.set(part.callID, raw)
               const index = slot.get(part.callID) ?? slot.size
               slot.set(part.callID, index)
               await push(part, {
                  tool_calls: [
                     {
                        index,
                        id: part.callID,
                        function: {
                           name: part.tool,
                           arguments: raw,
                        },
                     },
                  ],
               })
            }
            const tail = async (part: MessageV2.Part) => {
               if (part.type === "text") {
                  const seen = text.get(part.id) ?? ""
                  if (!part.text.startsWith(seen)) {
                     text.set(part.id, part.text)
                     await push(part, { content: part.text })
                     return
                  }
                  await textdelta(part, part.text.slice(seen.length))
                  return
               }
               if (part.type === "reasoning") {
                  const seen = think.get(part.id) ?? ""
                  if (!part.text.startsWith(seen)) {
                     think.set(part.id, part.text)
                     await push(part, { reasoning_text: part.text })
                     return
                  }
                  await reasondelta(part, part.text.slice(seen.length))
                  if (!sent && opaque(part)) {
                     await push(part, {})
                  }
                  return
               }
               if (part.type === "tool") {
                  await tooldelta(part)
               }
            }
            const done = () => {
               SessionPrompt.cancel(init.session.id)
            }

            stream.onAbort(done)
            const off = [
               Bus.subscribe(MessageV2.Event.Updated, async (evt) => {
                  const info = evt.properties.info
                  if (info.sessionID !== init.session.id) return
                  if (info.role !== "assistant") return
                  if (info.parentID !== init.prompt.messageID) return
                  aid = info.id
                  await role()
               }),
               Bus.subscribe(MessageV2.Event.PartUpdated, async (evt) => {
                  const next = evt.properties.part
                  if (next.sessionID !== init.session.id) return
                  kind.set(next.id, next.type)
                  if (!aid || next.messageID !== aid) return
                  if (next.type === "tool") {
                     await tooldelta(next)
                     return
                  }
                  if (next.type === "text") {
                     const seen = text.get(next.id) ?? ""
                     if (!next.text.startsWith(seen)) return
                     await textdelta(next, next.text.slice(seen.length))
                     if (!sent && opaque(next)) {
                        await push(next, {})
                     }
                     return
                  }
                  if (next.type !== "reasoning") return
                  const seen = think.get(next.id) ?? ""
                  if (!next.text.startsWith(seen)) return
                  await reasondelta(next, next.text.slice(seen.length))
                  if (!sent && opaque(next)) {
                     await push(next, {})
                  }
               }),
               Bus.subscribe(MessageV2.Event.PartDelta, async (evt) => {
                  if (evt.properties.sessionID !== init.session.id) return
                  if (!aid || evt.properties.messageID !== aid) return
                  if (evt.properties.field !== "text") return
                  const type = kind.get(evt.properties.partID)
                  if (type === "text") {
                     await textdelta(
                        {
                           id: evt.properties.partID,
                           messageID: evt.properties.messageID,
                           sessionID: evt.properties.sessionID,
                           type: "text",
                           text: "",
                        },
                        evt.properties.delta,
                     )
                     return
                  }
                  if (type !== "reasoning") return
                  await reasondelta(
                     {
                        id: evt.properties.partID,
                        messageID: evt.properties.messageID,
                        sessionID: evt.properties.sessionID,
                        type: "reasoning",
                        text: "",
                        time: { start: 0 },
                     },
                     evt.properties.delta,
                  )
               }),
               Bus.subscribe(Session.Event.Error, async (evt) => {
                  if (evt.properties.sessionID !== init.session.id) return
                  if (!evt.properties.error) return
                  fail = error(evt.properties.error)
               }),
            ]

            try {
               const result = await SessionPrompt.prompt(init.prompt)
               if (result.info.role !== "assistant") {
                  throw new Error("prompt did not produce an assistant message")
               }
               if (result.info.error) {
                  throw new Error(error(result.info.error))
               }
               if (fail) {
                  throw new Error(fail)
               }

               aid = result.info.id
               for (const part of result.parts) {
                  await tail(part)
               }
               await role()
               await emit(
                  chunk({
                     id: init.id,
                     created: init.created,
                     model: body.model,
                     choices: [{ index: 0 as const, delta: {}, finish_reason: finish(result) }],
                  }),
               )
               if (init.include) {
                  await emit(
                     chunk({
                        id: init.id,
                        created: init.created,
                        model: body.model,
                        choices: [],
                        usage: usage(result.info),
                     }),
                  )
               }
               await emit("[DONE]")
            } finally {
               off.forEach((item) => item())
            }
         })
      },
   ),
)
