import z from "zod"
import { Tool } from "./tool"
import { Question } from "../question"
import DESCRIPTION from "./question.txt"

const FORBIDDEN_PATTERNS = [
  /option_\d+/,
  /<arg_key>/,
  /<arg_value>/,
  /<\/arg_key>/,
  /<\/arg_value>/,
]

export const QuestionTool = Tool.define("question", {
  description: DESCRIPTION,
  parameters: z.object({
    questions: Question.Publics,
  }),
  async execute(params, ctx) {
    const maxOptions = 4

    for (let qi = 0; qi < params.questions.length; qi++) {
      const q = params.questions[qi]

      if (!q.question) {
        const error =
          "Missing required 'question' parameter. " +
          "Provide a clear, concise question to ask the user. " +
          "You must provide at least one option in the 'options' array. " +
          "A custom input option is automatically added. " +
          "Example: {'questions': [{'question': 'Is the plan ready?', 'header': 'Plan Status', 'options': [{'label': 'Yes, approved', 'description': 'Proceed with the plan'}]}]}"
        return {
          title: "Missing question",
          output: error,
          metadata: { error, answers: [] },
        }
      }

      if (q.options.length === 0) {
        const error =
          "TOOL CALL FAILED: Missing required option. " +
          "Each question MUST provide at least one option in the 'options' array. " +
          "A custom input option is automatically added. " +
          "Example: {'questions': [{'question': 'Is this correct?', 'header': 'Verification', 'options': [{'label': 'Yes, correct', 'description': 'The current approach is correct'}]}]}"
        return {
          title: "Question has no options",
          output: error,
          metadata: { error, answers: [] },
        }
      }

      for (let oi = 0; oi < q.options.length; oi++) {
        const opt = q.options[oi]
        for (const field of ["label", "description"] as const) {
          const fieldName = `questions[${qi}].options[${oi}].${field}`
          for (const pattern of FORBIDDEN_PATTERNS) {
            if (pattern.test(opt[field])) {
              const error = `TOOL CALL FAILED: Invalid ${fieldName} content. ${fieldName} uses an incorrect tool call format. `
              return {
                title: "Invalid option content",
                output: error,
                metadata: { error, answers: [] },
              }
            }
          }
        }
      }

      if (q.options.length > maxOptions) {
        const error = `Question "${q.question}" has ${q.options.length} options, but the maximum is ${maxOptions}. Please provide at most ${maxOptions} options.`
        return {
          title: "Question has too many options",
          output: error,
          metadata: { error, answers: [] },
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
