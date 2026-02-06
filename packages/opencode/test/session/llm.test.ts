import { describe, expect, test } from "bun:test"
import { LLM } from "../../src/session/llm"
import type { ModelMessage } from "ai"

describe("session.llm.hasToolCalls", () => {
  test("returns false for empty messages array", () => {
    expect(LLM.hasToolCalls([])).toBe(false)
  })

  test("returns false for messages with only text content", () => {
    const messages: ModelMessage[] = [
      {
        role: "user",
        content: [{ type: "text", text: "Hello" }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Hi there" }],
      },
    ]
    expect(LLM.hasToolCalls(messages)).toBe(false)
  })

  test("returns true when messages contain tool-call", () => {
    const messages = [
      {
        role: "user",
        content: [{ type: "text", text: "Run a command" }],
      },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call-123",
            toolName: "bash",
          },
        ],
      },
    ] as ModelMessage[]
    expect(LLM.hasToolCalls(messages)).toBe(true)
  })

  test("returns true when messages contain tool-result", () => {
    const messages = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-123",
            toolName: "bash",
          },
        ],
      },
    ] as ModelMessage[]
    expect(LLM.hasToolCalls(messages)).toBe(true)
  })

  test("returns false for messages with string content", () => {
    const messages: ModelMessage[] = [
      {
        role: "user",
        content: "Hello world",
      },
      {
        role: "assistant",
        content: "Hi there",
      },
    ]
    expect(LLM.hasToolCalls(messages)).toBe(false)
  })

  test("returns true when tool-call is mixed with text content", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Let me run that command" },
          {
            type: "tool-call",
            toolCallId: "call-456",
            toolName: "read",
          },
        ],
      },
    ] as ModelMessage[]
    expect(LLM.hasToolCalls(messages)).toBe(true)
  })
})

describe("session.llm.repairToolInput", () => {
  test("returns undefined for non-string input", () => {
    const out = LLM.repairToolInput({ a: 1 })
    expect(out).toBeUndefined()
  })

  test("repairs fenced json input", () => {
    const raw = "```json\n{\"command\":\"create\",\"path\":\"/a\",\"file_text\":\"ok\"}\n```"
    const out = LLM.repairToolInput(raw)
    expect(out).toBeDefined()
    const data = JSON.parse(out as string)
    expect(data.command).toBe("create")
    expect(data.file_text).toBe("ok")
  })

  test("repairs common json mistakes", () => {
    const raw = "{command: 'create', path: '/a', file_text: 'ok',}"
    const out = LLM.repairToolInput(raw)
    expect(out).toBeDefined()
    const data = JSON.parse(out as string)
    expect(data.command).toBe("create")
    expect(data.path).toBe("/a")
  })
})
