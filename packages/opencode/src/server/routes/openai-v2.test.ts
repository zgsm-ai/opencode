import { describe, expect, it } from "bun:test"
import { parseQuestionToolResult } from "./openai-v2"
import type { Question } from "../../question"

const request: Pick<Question.Request, "questions"> = {
  questions: [
    {
      question: "这是一个测试问题，请选择一个选项来测试 question 工具是否正常工作。",
      header: "测试问题",
      options: [
        { label: "选项 A", description: "选择这个选项表示测试成功" },
        { label: "选项 B", description: "选择这个选项表示测试成功" },
        { label: "选项 C", description: "选择这个选项表示测试成功" },
      ],
      multiple: false,
    },
  ],
}

describe("parseQuestionToolResult", () => {
  it("parses the XML-like tool_result format emitted by the extension", () => {
    const content = [
      "<answers>",
      "<answer><question_id>question_1</question_id><selected_options>选项 B</selected_options></answer>",
      "</answers>",
    ].join("\n")

    expect(parseQuestionToolResult(content, request)).toEqual([["选项 B"]])
  })

  it("maps synthetic option ids back to the original labels", () => {
    const content = JSON.stringify({
      question_1: ["question_1_option_3"],
    })

    expect(parseQuestionToolResult(content, request)).toEqual([["选项 C"]])
  })

  it("treats skipped questionnaires as empty answers", () => {
    expect(parseQuestionToolResult("<answer>User chose to skip this questionnaire</answer>", request)).toEqual([[]])
  })
})
