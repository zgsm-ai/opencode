import { describe, expect, test } from "bun:test"
import { getTools } from "../../../../src/plugin/tdd/handlers"

describe("Tool Handler - 工具注册", () => {
  test("should return tools object", () => {
    const tools = getTools()

    expect(tools).toBeDefined()
    expect(typeof tools).toBe("object")
  })

  test("should include list_user_commands tool", () => {
    const tools = getTools()

    expect(tools.list_user_commands).toBeDefined()
  })

  test("list_user_commands should be a valid tool function", () => {
    const tools = getTools()
    const tool = tools.list_user_commands

    expect(tool).toBeDefined()
    expect(typeof tool).toBe("object")
    expect(tool.execute).toBeDefined()
    expect(typeof tool.execute).toBe("function")
  })

  test("list_user_commands should have description", () => {
    const tools = getTools()
    const tool = tools.list_user_commands

    expect(tool.description).toBeDefined()
    expect(typeof tool.description).toBe("string")
    expect(tool.description.length).toBeGreaterThan(0)
  })

  test("list_user_commands should have args schema", () => {
    const tools = getTools()
    const tool = tools.list_user_commands

    expect(tool.args).toBeDefined()
    expect(typeof tool.args).toBe("object")
  })
})
