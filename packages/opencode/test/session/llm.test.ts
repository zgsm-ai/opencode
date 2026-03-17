import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Agent } from "../../src/agent/agent"
import { Identifier } from "../../src/id/id"
import { Instance } from "../../src/project/instance"
import { Provider } from "../../src/provider/provider"
import { Session } from "../../src/session"
import { LLM } from "../../src/session/llm"
import { MessageV2 } from "../../src/session/message-v2"
import type { ModelMessage } from "ai"

const packageRoot = path.join(__dirname, "../..")
const workspaceRoot = path.resolve(packageRoot, "../..")
const historyDir = path.join(workspaceRoot, ".history_message")

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

describe("session.llm.saveContextAfterResponse", () => {
  test("records assistant error turns in trajectory files", async () => {
    await Instance.provide({
      directory: packageRoot,
      fn: async () => {
        const agent = await Agent.get("coding")
        if (!agent) throw new Error("coding agent not found")
        const selected = await Provider.defaultModel()
        const model = await Provider.getModel(selected.providerID, selected.modelID)
        const session = await Session.create({})
        let filePath = ""

        try {
          const user = await Session.updateMessage({
            id: Identifier.ascending("message"),
            sessionID: session.id,
            role: "user",
            time: {
              created: Date.now(),
            },
            agent: agent.name,
            model: {
              providerID: model.providerID,
              modelID: model.id,
            },
          })
          await Session.updatePart({
            id: Identifier.ascending("part"),
            messageID: user.id,
            sessionID: session.id,
            type: "text",
            text: "trigger an error",
          })

          const assistant = await Session.updateMessage({
            id: Identifier.ascending("message"),
            sessionID: session.id,
            parentID: user.id,
            role: "assistant",
            mode: agent.name,
            agent: agent.name,
            path: {
              cwd: packageRoot,
              root: workspaceRoot,
            },
            cost: 0,
            tokens: {
              input: 0,
              output: 0,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
            modelID: model.id,
            providerID: model.providerID,
            time: {
              created: Date.now(),
              completed: Date.now(),
            },
            finish: "error",
            error: MessageV2.fromError(new Error("boom"), {
              providerID: model.providerID,
            }),
          })
          await Session.updatePart({
            id: Identifier.ascending("part"),
            messageID: assistant.id,
            sessionID: session.id,
            type: "text",
            text: "partial output",
          })

          await LLM.saveContextAfterResponse({
            sessionID: session.id,
            agent,
            model,
            tools: {},
          })

          const file = (await fs.readdir(historyDir)).find(
            (item) => item.includes(session.id) && item.endsWith("_CodingAgent.json"),
          )
          expect(file).toBeDefined()
          filePath = path.join(historyDir, file!)

          const saved = JSON.parse(await fs.readFile(filePath, "utf-8")) as {
            errorTurns: Array<{
              info: {
                id: string
                error?: {
                  name: string
                  data: {
                    message: string
                  }
                }
              }
              parts: Array<{
                type: string
                text?: string
              }>
            }>
          }
          expect(saved.errorTurns.length).toBe(1)

          const turn = saved.errorTurns[0]
          expect(turn?.info.id).toBe(assistant.id)
          expect(turn?.info.error?.name).toBe("UnknownError")
          expect(turn?.info.error?.data.message).toContain("Error: boom")
          expect(turn.parts.find((part) => part.type === "text")?.text).toBe("partial output")
        } finally {
          await Session.remove(session.id).catch(() => {})
          if (filePath) {
            await fs.unlink(filePath).catch(() => {})
          }
        }
      },
    })
  })
})
