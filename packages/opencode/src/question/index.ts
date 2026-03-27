import { Effect } from "effect"
import { runtime } from "@/effect/runtime"
import * as S from "./service"
import { Config } from "@/config/config"
import type { QuestionID } from "./schema"
import type { SessionID, MessageID } from "@/session/schema"
import { Log } from "@/util/log"

const log = Log.create({ service: "question" })

function runPromise<A, E>(f: (service: S.QuestionService.Service) => Effect.Effect<A, E>) {
  return runtime.runPromise(S.QuestionService.use(f))
}

export namespace Question {
  export const Option = S.Option
  export type Option = S.Option
  export const Info = S.Info
  export type Info = S.Info
  export const Request = S.Request
  export type Request = S.Request
  export const Answer = S.Answer
  export type Answer = S.Answer
  export const Reply = S.Reply
  export type Reply = S.Reply
  export const Event = S.Event
  export const RejectedError = S.RejectedError

  export async function ask(input: {
    sessionID: SessionID
    questions: Info[]
    tool?: { messageID: MessageID; callID: string }
  }): Promise<Answer[]> {
    // Check if auto-select mode is enabled (CoStrict feature)
    const configState = await Config.state()
    const autoSelectEnabled = configState.config.question?.autoSelectFirstOption ?? false

    if (autoSelectEnabled) {
      log.info("auto-select mode enabled")
      // Auto-select first option for each question
      const autoAnswers: Answer[] = input.questions.map((question) => {
        if (question.options.length > 0) {
          return [question.options[0].label]
        }
        return []
      })
      return autoAnswers
    }

    return runPromise((service) => service.ask(input))
  }

  export async function reply(input: { requestID: QuestionID; answers: Answer[] }): Promise<void> {
    return runPromise((service) => service.reply(input))
  }

  export async function reject(requestID: QuestionID): Promise<void> {
    return runPromise((service) => service.reject(requestID))
  }

  export async function list(): Promise<Request[]> {
    return runPromise((service) => service.list())
  }
}
