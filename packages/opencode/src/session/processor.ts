import { Cause, Effect, Layer, ServiceMap } from "effect"
import * as Stream from "effect/Stream"
import { Agent } from "@/agent/agent"
import { Bus } from "@/bus"
import { Config } from "@/config/config"
import { Permission } from "@/permission"
import { Plugin } from "@/plugin"
import { Snapshot } from "@/snapshot"
import { Log } from "@/util/log"
import { Session } from "."
import { LLM } from "./llm"
import { MessageV2 } from "./message-v2"
import { isOverflow } from "./overflow"
import { Identifier } from "@/id/id"
import { PartID } from "./schema"
import type { SessionID } from "./schema"
import { SessionRetry } from "./retry"
import { SessionStatus } from "./status"
import { SessionSummary } from "./summary"
import type { Provider } from "@/provider/provider"
import { CostrictError } from "@/costrict/error"
import { Question } from "@/question"
import crypto from "node:crypto"

export namespace SessionProcessor {
  const DOOM_LOOP_THRESHOLD = 3
  const log = Log.create({ service: "session.processor" })

  export type Result = "compact" | "stop" | "continue"

  export type Event = LLM.Event

  export interface Handle {
    readonly message: MessageV2.Assistant
    readonly partFromToolCall: (toolCallID: string) => MessageV2.ToolPart | undefined
    readonly abort: () => Effect.Effect<void>
    readonly process: (streamInput: LLM.StreamInput) => Effect.Effect<Result>
  }

  type Input = {
    assistantMessage: MessageV2.Assistant
    sessionID: SessionID
    model: Provider.Model
  }

  export interface Interface {
    readonly create: (input: Input) => Effect.Effect<Handle>
  }

  interface ProcessorContext extends Input {
    toolcalls: Record<string, MessageV2.ToolPart>
    shouldBreak: boolean
    snapshot: string | undefined
    blocked: boolean
    currentText: MessageV2.TextPart | undefined
    reasoningMap: Record<string, MessageV2.ReasoningPart>
    continuationMessages: import("ai").ModelMessage[] | undefined
  }

  class CompactSignal extends Error {
    constructor() {
      super("compact")
    }
  }

  type StreamEvent = Event

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/SessionProcessor") {}

  export const layer: Layer.Layer<
    Service,
    never,
    | Session.Service
    | Config.Service
    | Bus.Service
    | Snapshot.Service
    | Agent.Service
    | LLM.Service
    | Permission.Service
    | Plugin.Service
    | SessionStatus.Service
  > = Layer.effect(
    Service,
    Effect.gen(function* () {
      const session = yield* Session.Service
      const config = yield* Config.Service
      const bus = yield* Bus.Service
      const snapshot = yield* Snapshot.Service
      const agents = yield* Agent.Service
      const llm = yield* LLM.Service
      const permission = yield* Permission.Service
      const plugin = yield* Plugin.Service
      const status = yield* SessionStatus.Service

      const create = Effect.fn("SessionProcessor.create")(function* (input: Input) {
        const ctx: ProcessorContext = {
          assistantMessage: input.assistantMessage,
          sessionID: input.sessionID,
          model: input.model,
          toolcalls: {},
          shouldBreak: false,
          snapshot: undefined,
          blocked: false,
          currentText: undefined,
          reasoningMap: {},
          continuationMessages: undefined,
        }
        let aborted = false

        const parse = (e: unknown) =>
          MessageV2.fromError(e, {
            providerID: input.model.providerID,
            aborted,
          })

        const handleEvent = Effect.fn("SessionProcessor.handleEvent")(function* (value: StreamEvent) {
          switch (value.type) {
            case "start":
              yield* status.set(ctx.sessionID, { type: "busy" })
              return "continue" as const

            case "reasoning-start":
              if (value.id in ctx.reasoningMap) return "continue" as const
              ctx.reasoningMap[value.id] = {
                id: PartID.ascending(),
                messageID: ctx.assistantMessage.id,
                sessionID: ctx.assistantMessage.sessionID,
                type: "reasoning",
                text: "",
                time: { start: Date.now() },
                metadata: value.providerMetadata,
              }
              yield* session.updatePart(ctx.reasoningMap[value.id])
              return "continue" as const

            case "reasoning-delta":
              if (!(value.id in ctx.reasoningMap)) return "continue" as const
              ctx.reasoningMap[value.id].text += value.text
              if (value.providerMetadata) ctx.reasoningMap[value.id].metadata = value.providerMetadata
              yield* session.updatePartDelta({
                sessionID: ctx.reasoningMap[value.id].sessionID,
                messageID: ctx.reasoningMap[value.id].messageID,
                partID: ctx.reasoningMap[value.id].id,
                field: "text",
                delta: value.text,
              })
              return "continue" as const

            case "reasoning-end":
              if (!(value.id in ctx.reasoningMap)) return "continue" as const
              ctx.reasoningMap[value.id].text = ctx.reasoningMap[value.id].text.trimEnd()
              ctx.reasoningMap[value.id].time = { ...ctx.reasoningMap[value.id].time, end: Date.now() }
              if (value.providerMetadata) ctx.reasoningMap[value.id].metadata = value.providerMetadata
              yield* session.updatePart(ctx.reasoningMap[value.id])
              delete ctx.reasoningMap[value.id]
              return "continue" as const

            case "tool-input-start":
              if (ctx.assistantMessage.summary) {
                throw new Error(`Tool call not allowed while generating summary: ${value.toolName}`)
              }
              ctx.toolcalls[value.id] = yield* session.updatePart({
                id: ctx.toolcalls[value.id]?.id ?? PartID.ascending(),
                messageID: ctx.assistantMessage.id,
                sessionID: ctx.assistantMessage.sessionID,
                type: "tool",
                tool: value.toolName,
                callID: value.id,
                state: { status: "pending", input: {}, raw: "" },
              } satisfies MessageV2.ToolPart)
              return "continue" as const

            case "tool-input-delta":
              return "continue" as const

            case "tool-input-end":
              return "continue" as const

            case "tool-call": {
              if (ctx.assistantMessage.summary) {
                throw new Error(`Tool call not allowed while generating summary: ${value.toolName}`)
              }
              const match = ctx.toolcalls[value.toolCallId]
              if (!match) return "continue" as const
              ctx.toolcalls[value.toolCallId] = yield* session.updatePart({
                ...match,
                tool: value.toolName,
                state: { status: "running", input: value.input, time: { start: Date.now() } },
                metadata: value.providerMetadata,
              } satisfies MessageV2.ToolPart)

              const parts = yield* Effect.promise(() => MessageV2.parts(ctx.assistantMessage.id))
              const recentParts = parts.slice(-DOOM_LOOP_THRESHOLD)

              if (
                recentParts.length !== DOOM_LOOP_THRESHOLD ||
                !recentParts.every(
                  (part) =>
                    part.type === "tool" &&
                    part.tool === value.toolName &&
                    part.state.status !== "pending" &&
                    JSON.stringify(part.state.input) === JSON.stringify(value.input),
                )
              ) {
                return "continue" as const
              }

              const agent = yield* agents.get(ctx.assistantMessage.agent)
              yield* permission.ask({
                permission: "doom_loop",
                patterns: [value.toolName],
                sessionID: ctx.assistantMessage.sessionID,
                metadata: { tool: value.toolName, input: value.input },
                always: [value.toolName],
                ruleset: agent.permission,
              })
              return "continue" as const
            }

            case "tool-result": {
              const match = ctx.toolcalls[value.toolCallId]
              if (!match || match.state.status !== "running") return "continue" as const
              yield* session.updatePart({
                ...match,
                state: {
                  status: "completed",
                  input: value.input ?? match.state.input,
                  output: value.output.output,
                  metadata: value.output.metadata,
                  title: value.output.title,
                  time: { start: match.state.time.start, end: Date.now() },
                  attachments: value.output.attachments,
                },
              })
              delete ctx.toolcalls[value.toolCallId]
              return "continue" as const
            }

            case "tool-error": {
              const match = ctx.toolcalls[value.toolCallId]
              if (!match || match.state.status !== "running") return "continue" as const
              yield* session.updatePart({
                ...match,
                state: {
                  status: "error",
                  input: value.input ?? match.state.input,
                  error: value.error instanceof Error ? value.error.message : String(value.error),
                  time: { start: match.state.time.start, end: Date.now() },
                },
              })
              if (value.error instanceof Permission.RejectedError || value.error instanceof Question.RejectedError) {
                ctx.blocked = ctx.shouldBreak
              }
              delete ctx.toolcalls[value.toolCallId]
              return "continue" as const
            }

            case "error":
              throw value.error

            case "start-step":
              ctx.snapshot = yield* snapshot.track()
              yield* session.updatePart({
                id: PartID.ascending(),
                messageID: ctx.assistantMessage.id,
                sessionID: ctx.sessionID,
                snapshot: ctx.snapshot,
                type: "step-start",
              })
              return "continue" as const

            case "finish-step": {
              const usage = Session.getUsage({
                model: ctx.model,
                usage: value.usage,
                metadata: value.providerMetadata,
              })
              ctx.assistantMessage.finish = value.finishReason
              ctx.assistantMessage.cost += usage.cost
              ctx.assistantMessage.tokens = usage.tokens
              yield* session.updatePart({
                id: PartID.ascending(),
                reason: value.finishReason,
                snapshot: yield* snapshot.track(),
                messageID: ctx.assistantMessage.id,
                sessionID: ctx.assistantMessage.sessionID,
                type: "step-finish",
                tokens: usage.tokens,
                cost: usage.cost,
              })
              yield* session.updateMessage(ctx.assistantMessage)
              if (ctx.snapshot) {
                const patch = yield* snapshot.patch(ctx.snapshot)
                if (patch.files.length) {
                  yield* session.updatePart({
                    id: PartID.ascending(),
                    messageID: ctx.assistantMessage.id,
                    sessionID: ctx.sessionID,
                    type: "patch",
                    hash: patch.hash,
                    files: patch.files,
                  })
                }
                ctx.snapshot = undefined
              }
              SessionSummary.summarize({
                sessionID: ctx.sessionID,
                messageID: ctx.assistantMessage.parentID,
              })
              if (
                !ctx.assistantMessage.summary &&
                isOverflow({ cfg: yield* config.get(), tokens: usage.tokens, model: ctx.model })
              ) {
                return "compact" as const
              }
              return "continue" as const
            }

            case "text-start":
              ctx.currentText = {
                id: PartID.ascending(),
                messageID: ctx.assistantMessage.id,
                sessionID: ctx.assistantMessage.sessionID,
                type: "text",
                text: "",
                time: { start: Date.now() },
                metadata: value.providerMetadata,
              }
              yield* session.updatePart(ctx.currentText)
              return "continue" as const

            case "text-delta":
              if (!ctx.currentText) return "continue" as const
              ctx.currentText.text += value.text
              if (value.providerMetadata) ctx.currentText.metadata = value.providerMetadata
              yield* session.updatePartDelta({
                sessionID: ctx.currentText.sessionID,
                messageID: ctx.currentText.messageID,
                partID: ctx.currentText.id,
                field: "text",
                delta: value.text,
              })
              return "continue" as const

            case "text-end":
              if (!ctx.currentText) return "continue" as const
              ctx.currentText.text = ctx.currentText.text.trimEnd()
              // For CoStrict provider: extract inline <think>...</think> tags into reasoning parts
              // so the UI renders them with thinking style, instead of discarding them.
              // Use a timestamp before the text part's ID so reasoning sorts before text in the UI.
              if (ctx.model.providerID === "costrict") {
                const textTimestamp = Identifier.timestamp(ctx.currentText.id)
                const thinkRegex = /<think>([\s\S]*?)<\/think>\s*/g
                let match: RegExpExecArray | null
                let idx = 0
                while ((match = thinkRegex.exec(ctx.currentText.text)) !== null) {
                  const reasoningText = match[1].trim()
                  if (reasoningText) {
                    yield* session.updatePart({
                      id: PartID.ascending(Identifier.create("part", false, textTimestamp - 1000 + idx)),
                      messageID: ctx.assistantMessage.id,
                      sessionID: ctx.assistantMessage.sessionID,
                      type: "reasoning",
                      text: reasoningText,
                      time: { start: ctx.currentText.time?.start ?? Date.now(), end: Date.now() },
                    })
                    idx++
                  }
                }
                ctx.currentText.text = ctx.currentText.text.replace(/<think>[\s\S]*?<\/think>\s*/g, "")
              }
              ctx.currentText.text = (yield* plugin.trigger(
                "experimental.text.complete",
                {
                  sessionID: ctx.sessionID,
                  messageID: ctx.assistantMessage.id,
                  partID: ctx.currentText.id,
                },
                { text: ctx.currentText.text },
              )).text
              ctx.currentText.time = { start: Date.now(), end: Date.now() }
              if (value.providerMetadata) ctx.currentText.metadata = value.providerMetadata
              yield* session.updatePart(ctx.currentText)
              ctx.currentText = undefined
              return "continue" as const

            case "finish":
              return "continue" as const

            default:
              log.info("unhandled", { ...value })
              return "continue" as const
          }
        })

        const cleanup = Effect.fn("SessionProcessor.cleanup")(function* () {
          if (ctx.snapshot) {
            const patch = yield* snapshot.patch(ctx.snapshot)
            if (patch.files.length) {
              yield* session.updatePart({
                id: PartID.ascending(),
                messageID: ctx.assistantMessage.id,
                sessionID: ctx.sessionID,
                type: "patch",
                hash: patch.hash,
                files: patch.files,
              })
            }
            ctx.snapshot = undefined
          }

          if (ctx.currentText) {
            const end = Date.now()
            ctx.currentText.time = { start: ctx.currentText.time?.start ?? end, end }
            yield* session.updatePart(ctx.currentText)
            ctx.currentText = undefined
          }

          for (const part of Object.values(ctx.reasoningMap)) {
            const end = Date.now()
            yield* session.updatePart({
              ...part,
              time: { start: part.time.start ?? end, end },
            })
          }
          ctx.reasoningMap = {}

          const parts = yield* Effect.promise(() => MessageV2.parts(ctx.assistantMessage.id))
          for (const part of parts) {
            if (part.type !== "tool" || part.state.status === "completed" || part.state.status === "error") continue
            yield* session.updatePart({
              ...part,
              state: {
                ...part.state,
                status: "error",
                error: "Tool execution aborted",
                time: { start: Date.now(), end: Date.now() },
              },
            })
          }
          ctx.assistantMessage.time.completed = Date.now()
          yield* session.updateMessage(ctx.assistantMessage)
        })

        const halt = Effect.fn("SessionProcessor.halt")(function* (e: unknown) {
          log.error("process", { error: e, stack: e instanceof Error ? e.stack : undefined })
          const error = parse(e)
          if (MessageV2.ContextOverflowError.isInstance(error)) {
            yield* bus.publish(Session.Event.Error, { sessionID: ctx.sessionID, error })
            return "compact" as const
          }
          ctx.assistantMessage.error = error
          yield* bus.publish(Session.Event.Error, {
            sessionID: ctx.assistantMessage.sessionID,
            error: ctx.assistantMessage.error,
          })
          yield* status.set(ctx.sessionID, { type: "idle" })
          return "stop" as const
        })

        const abort = Effect.fn("SessionProcessor.abort")(() =>
          Effect.gen(function* () {
            aborted = true
            if (!ctx.assistantMessage.error) {
              yield* halt(new DOMException("Aborted", "AbortError"))
            }
            if (!ctx.assistantMessage.time.completed) {
              yield* cleanup()
              return
            }
            yield* session.updateMessage(ctx.assistantMessage)
          }),
        )

        const process = Effect.fn("SessionProcessor.process")(function* (streamInput: LLM.StreamInput) {
          log.info("process")
          ctx.shouldBreak = (yield* config.get()).experimental?.continue_loop_on_deny !== true
          ctx.assistantMessage.requestID = crypto.randomUUID()
          yield* session.updateMessage(ctx.assistantMessage)

          const flow = yield* Effect.gen(function* () {
            return yield* Effect.gen(function* () {
              ctx.currentText = undefined
              ctx.reasoningMap = {}
              // Use continuation messages from previous output length retry if available
              if (ctx.continuationMessages) {
                streamInput = { ...streamInput, messages: ctx.continuationMessages }
                ctx.continuationMessages = undefined
              }
              const stream = llm.stream({
                ...streamInput,
                requestID: ctx.assistantMessage.requestID,
              })

              const streamResult = yield* stream.pipe(
                Stream.runForEach((event) =>
                  Effect.gen(function* () {
                    const next = yield* handleEvent(event)
                    if (next === "compact") {
                      return yield* Effect.fail(new CompactSignal())
                    }
                  }),
                ),
                Effect.as("continue" as const),
                Effect.catchIf(
                  (err) => err instanceof CompactSignal,
                  () => Effect.succeed("compact" as const),
                ),
              )

              if (streamResult === "compact") return "compact" as const

              // For costrict provider, handle output length exceeded by constructing continuation messages
              if (ctx.model.providerID === "costrict") {
                const next = yield* Effect.promise(() =>
                  CostrictError.finish({
                    reason: ctx.assistantMessage.finish ?? "",
                    message: ctx.assistantMessage,
                    model: ctx.model,
                    messages: streamInput.messages,
                  }),
                )
                if (next) {
                  ctx.continuationMessages = next.messages
                  return yield* Effect.fail(next.error)
                }
              }

              return "continue" as const
            }).pipe(
              Effect.catchCauseIf(
                (cause) => !Cause.hasInterruptsOnly(cause),
                (cause) => Effect.fail(Cause.squash(cause)),
              ),
              Effect.retry(
                SessionRetry.policy({
                  providerID: input.model.providerID,
                  parse,
                  set: (info) =>
                    status.set(ctx.sessionID, {
                      type: "retry",
                      attempt: info.attempt,
                      message: info.message,
                      next: info.next,
                    }),
                }),
              ),
              Effect.catch(halt),
              Effect.ensuring(cleanup()),
            )
          })

          if (flow === "compact") return "compact"
          if (aborted && !ctx.assistantMessage.error) return "stop"
          if (ctx.blocked || ctx.assistantMessage.error || aborted || flow === "stop") return "stop"
          return "continue"
        })

        return {
          get message() {
            return ctx.assistantMessage
          },
          partFromToolCall(toolCallID: string) {
            return ctx.toolcalls[toolCallID]
          },
          abort,
          process,
        } satisfies Handle
      })

      return Service.of({ create })
    }),
  )

  export const defaultLayer = Layer.unwrap(
    Effect.sync(() =>
      layer.pipe(
        Layer.provide(Session.defaultLayer),
        Layer.provide(Snapshot.defaultLayer),
        Layer.provide(Agent.defaultLayer),
        Layer.provide(LLM.defaultLayer),
        Layer.provide(Permission.layer),
        Layer.provide(Plugin.defaultLayer),
        Layer.provide(SessionStatus.layer.pipe(Layer.provide(Bus.layer))),
        Layer.provide(Bus.layer),
        Layer.provide(Config.defaultLayer),
      ),
    ),
  )
}
