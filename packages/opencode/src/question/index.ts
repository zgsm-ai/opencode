import z from "zod"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { Config } from "@/config/config"
import { Instance } from "@/project/instance"
import { Log } from "@/util/log"
import { type QuestionID } from "./schema"
import { QuestionID as QuestionIdentifier } from "./schema"
import type { SessionID, MessageID } from "@/session/schema"

const log = Log.create({ service: "question" })

export namespace Question {
  export const Option = z.object({
    label: z.string(),
    description: z.string(),
  })
  export type Option = z.infer<typeof Option>

  export const Info = z.object({
    question: z.string().describe("Complete question"),
    header: z.string().describe("Very short label (max 30 chars)"),
    options: z.array(Option).describe("Available choices"),
    multiple: z.boolean().optional().describe("Allow selecting multiple choices"),
    custom: z.boolean().optional().describe("Allow typing a custom answer (default: true)"),
  })
  export type Info = z.infer<typeof Info>

  export const Answer = z.array(z.string())
  export type Answer = z.infer<typeof Answer>

  export const Request = z.object({
    id: QuestionIdentifier.zod,
    sessionID: z.custom<SessionID>(),
    questions: z.array(Info),
    tool: z
      .object({
        messageID: z.custom<MessageID>(),
        callID: z.string(),
      })
      .optional(),
  })
  export type Request = z.infer<typeof Request>

  export const Reply = z.object({
    answers: z.array(Answer),
  })
  export type Reply = z.infer<typeof Reply>

  export const Event = {
    Asked: BusEvent.define("question.asked", Request),
    Replied: BusEvent.define(
      "question.replied",
      z.object({
        sessionID: z.custom<SessionID>(),
        requestID: QuestionIdentifier.zod,
        answers: z.array(Answer),
      }),
    ),
    Rejected: BusEvent.define(
      "question.rejected",
      z.object({
        sessionID: z.custom<SessionID>(),
        requestID: QuestionIdentifier.zod,
      }),
    ),
  }

  export class RejectedError extends Error {
    constructor() {
      super("The user rejected the question request.")
    }
  }

  type PendingEntry = {
    info: Request
    resolve: (answers: Answer[]) => void
    reject: (error: RejectedError) => void
  }

  const state = Instance.state(() => {
    return {
      pending: new Map<QuestionID, PendingEntry>(),
    }
  })

  export async function ask(input: {
    sessionID: SessionID
    questions: Info[]
    tool?: { messageID: MessageID; callID: string }
  }): Promise<Answer[]> {
    const config = await Config.get()
    const autoSelectEnabled = config.question?.autoSelectFirstOption ?? false

    if (autoSelectEnabled) {
      log.info("auto-select mode enabled")
      return input.questions.map((question) => {
        const first = question.options[0]?.label
        return first ? [first] : []
      })
    }

    const s = await state()
    const id = QuestionIdentifier.ascending()
    const info: Request = {
      id,
      sessionID: input.sessionID,
      questions: input.questions,
      tool: input.tool,
    }

    return new Promise<Answer[]>((resolve, reject) => {
      s.pending.set(id, {
        info,
        resolve,
        reject,
      })
      void Bus.publish(Event.Asked, info)
    })
  }

  export async function reply(input: { requestID: QuestionID; answers: Answer[] }): Promise<void> {
    const s = await state()
    const entry = s.pending.get(input.requestID)
    if (!entry) return
    s.pending.delete(input.requestID)
    await Bus.publish(Event.Replied, {
      sessionID: entry.info.sessionID,
      requestID: entry.info.id,
      answers: input.answers,
    })
    entry.resolve(input.answers)
  }

  export async function reject(requestID: QuestionID): Promise<void> {
    const s = await state()
    const entry = s.pending.get(requestID)
    if (!entry) return
    s.pending.delete(requestID)
    await Bus.publish(Event.Rejected, {
      sessionID: entry.info.sessionID,
      requestID: entry.info.id,
    })
    entry.reject(new RejectedError())
  }

  export async function list(): Promise<Request[]> {
    const s = await state()
    return Array.from(s.pending.values()).map((entry) => entry.info)
  }
}
