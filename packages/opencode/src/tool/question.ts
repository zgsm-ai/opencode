import z from "zod"
import { Tool } from "./tool"
import { Question } from "../question"
import DESCRIPTION from "./question.txt"

export const QuestionTool = Tool.define("question", {
  description: DESCRIPTION,
  parameters: z.object({
    questions: Question.Publics,
  }),
  async execute(params, ctx) {
    const maxOptions = 4

    for (const question of params.questions) {
      if (question.options.length > maxOptions) {
        const error = `Question "${question.question}" has ${
          question.options.length
        } options, but the maximum is ${maxOptions}. Please provide at most ${maxOptions} options.`
        return {
          title: "Question has too many options",
          output: error,
          metadata: {
            error,
            answers: [],
          },
        }
      }
    }

    const questions = Question.withCustom(params.questions)

    const answers = await Question.ask({
      sessionID: ctx.sessionID,
      questions,
      tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
    })

    function format(answer: Question.Answer | undefined) {
      if (!answer?.length) return "Unanswered"
      return answer.join(", ")
    }

    const formatted = questions.map((q, i) => `"${q.question}"="${format(answers[i])}"`).join(", ")

    return {
      title: `Asked ${questions.length} question${questions.length > 1 ? "s" : ""}`,
      output: `User has answered your questions: ${formatted}. You can now continue with the user's answers in mind.`,
      metadata: {
        error: "",
        answers,
      },
    }
  },
})
