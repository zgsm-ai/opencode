import { describe, expect, test } from "bun:test"
import { TDDPlugin } from "../../../src/plugin/tdd"
import type { PluginInput } from "@opencode-ai/plugin"
import type { Config } from "@opencode-ai/sdk"

// Mock PluginInput - we only need minimal properties for our tests
function createMockPluginInput(): PluginInput {
  return {
    client: null as any,
    project: null as any,
    directory: "/mock/directory",
    worktree: "/mock/directory",
    serverUrl: new URL("http://localhost:3000"),
    $: null as any,
  }
}

describe("TDD Plugin", () => {
  describe("plugin initialization and hooks", () => {
    test("should return all required hooks", async () => {
      const input = createMockPluginInput()
      const hooks = await TDDPlugin(input)

      // Verify all hooks are present
      expect(hooks).toBeDefined()
      expect(hooks.config).toBeDefined()
      expect(hooks["experimental.chat.system.transform"]).toBeDefined()
      expect(hooks.tool).toBeDefined()
      expect(hooks["tool.execute.before"]).toBeDefined()
      expect(hooks["tool.execute.after"]).toBeDefined()
    })

    test("config hook should be an async function", async () => {
      const input = createMockPluginInput()
      const hooks = await TDDPlugin(input)

      expect(typeof hooks.config).toBe("function")
      expect(hooks.config!.constructor.name).toBe("AsyncFunction")
    })

    test("system.transform hook should be an async function", async () => {
      const input = createMockPluginInput()
      const hooks = await TDDPlugin(input)

      expect(typeof hooks["experimental.chat.system.transform"]).toBe("function")
      expect(hooks["experimental.chat.system.transform"]!.constructor.name).toBe("AsyncFunction")
    })

    test("tool hook should return tools object", async () => {
      const input = createMockPluginInput()
      const hooks = await TDDPlugin(input)

      expect(typeof hooks.tool).toBe("object")
      expect(hooks.tool).toBeDefined()
    })

    test("tool.execute.before hook should be an async function", async () => {
      const input = createMockPluginInput()
      const hooks = await TDDPlugin(input)

      expect(typeof hooks["tool.execute.before"]).toBe("function")
      expect(hooks["tool.execute.before"]!.constructor.name).toBe("AsyncFunction")
    })

    test("tool.execute.after hook should be an async function", async () => {
      const input = createMockPluginInput()
      const hooks = await TDDPlugin(input)

      expect(typeof hooks["tool.execute.after"]).toBe("function")
      expect(hooks["tool.execute.after"]!.constructor.name).toBe("AsyncFunction")
    })

    test("config hook should process config object", async () => {
      const input = createMockPluginInput()
      const hooks = await TDDPlugin(input)

      const config: Partial<Config> = { model: "claude-sonnet-4-5" }

      await hooks.config!(config as Config)

      // Verify agents are registered
      expect(config.agent).toBeDefined()
      expect(config.agent!.RunAndFix).toBeDefined()
      expect(config.agent!.TestDesign).toBeDefined()
      expect(config.agent!.TestAndFix).toBeDefined()
      expect(config.agent!.TestPrepare).toBeDefined()
    })
  })

  describe("Tool Execute Hooks - 日志记录", () => {
    test("tool.execute.before should log tool name and callID", async () => {
      const input = createMockPluginInput()
      const hooks = await TDDPlugin(input)

      const inputParams = {
        tool: "test-tool",
        sessionID: "session-123",
        callID: "call-456",
      }

      const output = {
        args: { param1: "value1", param2: "value2" },
      }

      // Should not throw
      await hooks["tool.execute.before"]!(inputParams, output)
    })

    test("tool.execute.before should truncate long arguments", async () => {
      const input = createMockPluginInput()
      const hooks = await TDDPlugin(input)

      const inputParams = {
        tool: "test-tool",
        sessionID: "session-123",
        callID: "call-456",
      }

      const longString = "a".repeat(200)
      const output = {
        args: { param1: longString },
      }

      // Should not throw
      await hooks["tool.execute.before"]!(inputParams, output)
    })

    test("tool.execute.after should log tool name, callID, title and output", async () => {
      const input = createMockPluginInput()
      const hooks = await TDDPlugin(input)

      const inputParams = {
        tool: "test-tool",
        sessionID: "session-123",
        callID: "call-456",
      }

      const output = {
        title: "Test Tool Output",
        output: "Tool execution successful",
        metadata: { status: "success" },
      }

      // Should not throw
      await hooks["tool.execute.after"]!(inputParams, output)
    })

    test("tool.execute.after should truncate long output", async () => {
      const input = createMockPluginInput()
      const hooks = await TDDPlugin(input)

      const inputParams = {
        tool: "test-tool",
        sessionID: "session-123",
        callID: "call-456",
      }

      const longString = "a".repeat(200)
      const output = {
        title: "Test Tool Output",
        output: longString,
        metadata: { status: "success" },
      }

      // Should not throw
      await hooks["tool.execute.after"]!(inputParams, output)
    })

    test("tool.execute.after should handle object output", async () => {
      const input = createMockPluginInput()
      const hooks = await TDDPlugin(input)

      const inputParams = {
        tool: "test-tool",
        sessionID: "session-123",
        callID: "call-456",
      }

      const objectOutput = { result: "success", data: [1, 2, 3] }
      const output = {
        title: "Test Tool Output",
        output: JSON.stringify(objectOutput),
        metadata: { status: "success" },
      }

      // Should not throw
      await hooks["tool.execute.after"]!(inputParams, output)
    })
  })
})
