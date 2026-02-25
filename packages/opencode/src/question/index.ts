import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { Identifier } from "@/id/id"
import { Instance } from "@/project/instance"
import { Log } from "@/util/log"
import { Config } from "@/config/config"
import z from "zod"

export namespace Question {
  const log = Log.create({ service: "question" })

  export const Option = z
    .object({
      label: z
        .string()
        .describe("Display text (1-5 words, concise). If you recommend an option, put it first and add '(Recommended)'"),
      description: z.string().describe("Explanation of choice"),
    })
    .meta({
      ref: "QuestionOption",
    })
  export type Option = z.infer<typeof Option>

  export const Info = z
    .object({
      question: z.string().describe("Complete question text shown to the user"),
      header: z.string().describe("Very short label used as the section title (max 30 chars)"),
      options: z
        .array(Option)
        .describe("Built-in selectable choices. Keep at most 4 items."),
      multiple: z
        .boolean()
        .optional()
        .describe("Whether multi-select is allowed; answers are returned as an array of selected labels"),
    })
    .meta({
      ref: "QuestionInfo",
    })
  export type Info = z.infer<typeof Info>

  export const Public = Info.describe("Questions to ask")
  export const Publics = z.array(Public).describe("Questions to ask")
  const Internal = Public.extend({
    custom: z.literal(true),
  })
  type PublicQuestion = Omit<z.infer<typeof Internal>, "custom">

  export function withCustom(questions: PublicQuestion[]) {
    return questions.map((question) => ({
      ...question,
      custom: true as const,
    }))
  }

  export const Request = z
    .object({
      id: Identifier.schema("question"),
      sessionID: Identifier.schema("session"),
      questions: z.array(Internal),
      tool: z
        .object({
          messageID: z.string(),
          callID: z.string(),
        })
        .optional(),
    })
    .meta({
      ref: "QuestionRequest",
    })
  export type Request = z.infer<typeof Request>

  export const Answer = z.array(z.string()).meta({
    ref: "QuestionAnswer",
  })
  export type Answer = z.infer<typeof Answer>

  export const Reply = z.object({
    answers: z
      .array(Answer)
      .describe("User answers in order of questions (each answer is an array of selected labels)"),
  })
  export type Reply = z.infer<typeof Reply>

  export const Event = {
    Asked: BusEvent.define("question.asked", Request),
    Replied: BusEvent.define(
      "question.replied",
      z.object({
        sessionID: z.string(),
        requestID: z.string(),
        answers: z.array(Answer),
      }),
    ),
    Rejected: BusEvent.define(
      "question.rejected",
      z.object({
        sessionID: z.string(),
        requestID: z.string(),
      }),
    ),
  }

  const state = Instance.state(() => {
    const pending: Record<
      string,
      {
        info: Request
        resolve: (answers: Answer[]) => void
        reject: (e: any) => void
      }
    > = {}

    return {
      pending,
    }
  })

  export async function ask(input: {
    sessionID: string
    questions: PublicQuestion[]
    tool?: { messageID: string; callID: string }
  }): Promise<Answer[]> {
    const questions = withCustom(input.questions)
    const s = state()
    const id = Identifier.ascending("question")

    log.info("asking", { id, questions: input.questions.length })

    const info: Request = {
      id,
      sessionID: input.sessionID,
      questions,
      tool: input.tool,
    }
    const pending = {
      resolve: (_answers: Answer[]) => {},
      reject: (_error: unknown) => {},
    }
    const promise = new Promise<Answer[]>((resolve, reject) => {
      pending.resolve = resolve
      pending.reject = reject
    })
    s.pending[id] = {
      info,
      resolve: pending.resolve,
      reject: pending.reject,
    }

    // Check if auto-select mode is enabled
    const configState = await Config.state()
    const autoSelectEnabled = configState.config.question?.autoSelectFirstOption ?? false

    if (autoSelectEnabled) {
      log.info("auto-select mode enabled", { id })
      // Auto-select first option for each question
      const autoAnswers: Answer[] = input.questions.map((question) => {
        if (question.options.length > 0) {
          return [question.options[0].label]
        }
        return []
      })
      delete s.pending[id]
      pending.resolve(autoAnswers)
      return promise
    }

    Bus.publish(Event.Asked, info)
    return promise
  }

  export async function reply(input: { requestID: string; answers: Answer[] }): Promise<void> {
    const s = state()
    const existing = s.pending[input.requestID]
    if (!existing) {
      log.warn("reply for unknown request", { requestID: input.requestID })
      return
    }
    delete s.pending[input.requestID]

    log.info("replied", { requestID: input.requestID, answers: input.answers })

    Bus.publish(Event.Replied, {
      sessionID: existing.info.sessionID,
      requestID: existing.info.id,
      answers: input.answers,
    })

    existing.resolve(input.answers)
  }

  export async function reject(requestID: string): Promise<void> {
    const s = state()
    const existing = s.pending[requestID]
    if (!existing) {
      log.warn("reject for unknown request", { requestID })
      return
    }
    delete s.pending[requestID]

    log.info("rejected", { requestID })

    Bus.publish(Event.Rejected, {
      sessionID: existing.info.sessionID,
      requestID: existing.info.id,
    })

    existing.reject(new RejectedError())
  }

  export class RejectedError extends Error {
    constructor() {
      super("The user dismissed this question")
    }
  }

  export async function list() {
    const s = state()
    return Object.values(s.pending).map((x) => x.info)
  }
}
