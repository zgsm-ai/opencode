import { describe, expect, test } from "bun:test"
import { handleConfig } from "../../../../src/plugin/tdd/handlers"

describe("TDD 代理权限配置验证", () => {
  test("TestDesign should have correct permissions", async () => {
    const config: any = {}

    await handleConfig(config)

    const agent = config.agent.TestDesign
    expect(agent.permission).toBeDefined()
    expect(agent.permission.question).toBe("allow")
    expect(agent.permission.todowrite).toBe("allow")
    expect(agent.permission.todoread).toBe("allow")
    expect(agent.permission.bash).toBe("deny")
  })

  test("TestAndFix should have correct permissions", async () => {
    const config: any = {}

    await handleConfig(config)

    const agent = config.agent.TestAndFix
    expect(agent.permission).toBeDefined()
    expect(agent.permission.question).toBe("allow")
    expect(agent.permission.todowrite).toBe("allow")
    expect(agent.permission.todoread).toBe("allow")
  })

  test("RunAndFix should have correct permissions", async () => {
    const config: any = {}

    await handleConfig(config)

    const agent = config.agent.RunAndFix
    expect(agent.permission).toBeDefined()
    expect(agent.permission.question).toBe("allow")
    expect(agent.permission.todowrite).toBe("allow")
    expect(agent.permission.todoread).toBe("allow")
  })

  test("TestPrepare should have correct permissions", async () => {
    const config: any = {}

    await handleConfig(config)

    const agent = config.agent.TestPrepare
    expect(agent.permission).toBeDefined()
    expect(agent.permission.question).toBe("allow")
    expect(agent.permission.todowrite).toBe("allow")
    expect(agent.permission.todoread).toBe("allow")
    expect(agent.permission.read).toBe("allow")
    expect(agent.permission.glob).toBe("allow")
    expect(agent.permission.grep).toBe("allow")
    expect(agent.permission.write).toBe("allow")
    expect(agent.permission.task).toBe("deny")
    expect(agent.permission.bash).toBe("deny")
  })
})
