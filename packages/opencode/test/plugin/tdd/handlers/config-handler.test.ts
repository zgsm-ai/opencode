import { describe, expect, test } from "bun:test"
import { handleConfig } from "../../../../src/plugin/tdd/handlers"

describe("Config Handler - TDD 代理注册", () => {
  test("should create agent object if it doesn't exist", async () => {
    const config: any = {}

    await handleConfig(config)

    expect(config.agent).toBeDefined()
    expect(typeof config.agent).toBe("object")
  })

  test("should register all 4 TDD agents", async () => {
    const config: any = {}

    await handleConfig(config)

    expect(config.agent.RunAndFix).toBeDefined()
    expect(config.agent.TestDesign).toBeDefined()
    expect(config.agent.TestAndFix).toBeDefined()
    expect(config.agent.TestPrepare).toBeDefined()
  })

  test("should preserve existing agents", async () => {
    const config: any = {
      agent: {
        existingAgent: { name: "Existing", description: "Test" },
      },
    }

    await handleConfig(config)

    expect(config.agent.existingAgent).toBeDefined()
    expect(config.agent.RunAndFix).toBeDefined()
    expect(config.agent.TestDesign).toBeDefined()
    expect(config.agent.TestAndFix).toBeDefined()
    expect(config.agent.TestPrepare).toBeDefined()
  })

  test("should register RunAndFix agent with correct properties", async () => {
    const config: any = {}

    await handleConfig(config)

    const agent = config.agent.RunAndFix
    expect(agent.name).toBe("RunAndFix")
    expect(agent.description).toBeDefined()
    expect(agent.mode).toBe("subagent")
    expect(agent.temperature).toBe(0.1)
    expect(agent.prompt).toBeDefined()
  })

  test("should register TestDesign agent with correct properties", async () => {
    const config: any = {}

    await handleConfig(config)

    const agent = config.agent.TestDesign
    expect(agent.name).toBe("TestDesign")
    expect(agent.description).toBeDefined()
    expect(agent.mode).toBe("subagent")
    expect(agent.temperature).toBe(0.1)
    expect(agent.prompt).toBeDefined()
  })

  test("should register TestAndFix agent with correct properties", async () => {
    const config: any = {}

    await handleConfig(config)

    const agent = config.agent.TestAndFix
    expect(agent.name).toBe("TestAndFix")
    expect(agent.description).toBeDefined()
    expect(agent.mode).toBe("subagent")
    expect(agent.temperature).toBe(0.1)
    expect(agent.prompt).toBeDefined()
  })

  test("should register TestPrepare agent with correct properties", async () => {
    const config: any = {}

    await handleConfig(config)

    const agent = config.agent.TestPrepare
    expect(agent.name).toBe("TestPrepare")
    expect(agent.description).toBeDefined()
    expect(agent.mode).toBe("subagent")
    expect(agent.temperature).toBe(0.1)
    expect(agent.prompt).toBeDefined()
  })

  test("should use default model if not provided in config", async () => {
    const config: any = {}

    await handleConfig(config)

    // Should not throw even without model in config
    expect(config.agent.RunAndFix).toBeDefined()
  })

  test("should handle config with model property", async () => {
    const config: any = { model: "custom-model" }

    await handleConfig(config)

    // Should not throw
    expect(config.agent.RunAndFix).toBeDefined()
  })
})
