import { describe, expect, test } from "bun:test"
import { handleSystemTransform } from "../../../../src/plugin/tdd/handlers"

describe("System Transform Handler - TDD 指导注入", () => {
  test("should add TDD guidance to system messages", async () => {
    const context = { sessionID: "test-session" }
    const output = { system: [] }

    await handleSystemTransform(context as any, output)

    expect(output.system).toBeDefined()
    expect(output.system.length).toBeGreaterThan(0)
  })

  test("should include TDD Guidance title", async () => {
    const context = { sessionID: "test-session" }
    const output = { system: [] }

    await handleSystemTransform(context as any, output)

    const systemMessage = output.system[0]
    expect(systemMessage).toMatch(/# TDD Guidance/)
  })

  test("should include RunAndFix agent name", async () => {
    const context = { sessionID: "test-session" }
    const output = { system: [] }

    await handleSystemTransform(context as any, output)

    const systemMessage = output.system[0]
    expect(systemMessage).toMatch(/RunAndFix/)
  })

  test("should describe the 3 main steps", async () => {
    const context = { sessionID: "test-session" }
    const output = { system: [] }

    await handleSystemTransform(context as any, output)

    const systemMessage = output.system[0]
    expect(systemMessage).toMatch(/1\./)
    expect(systemMessage).toMatch(/2\./)
    expect(systemMessage).toMatch(/3\./)
  })

  test("should describe verification step", async () => {
    const context = { sessionID: "test-session" }
    const output = { system: [] }

    await handleSystemTransform(context as any, output)

    const systemMessage = output.system[0]
    expect(systemMessage).toMatch(/verification/)
    expect(systemMessage).toMatch(/compile/)
    expect(systemMessage).toMatch(/test/)
  })

  test("should describe fixing step", async () => {
    const context = { sessionID: "test-session" }
    const output = { system: [] }

    await handleSystemTransform(context as any, output)

    const systemMessage = output.system[0]
    expect(systemMessage).toMatch(/fix/)
    expect(systemMessage).toMatch(/coding issues/)
  })

  test("should describe continue development step", async () => {
    const context = { sessionID: "test-session" }
    const output = { system: [] }

    await handleSystemTransform(context as any, output)

    const systemMessage = output.system[0]
    expect(systemMessage).toMatch(/continue/)
    expect(systemMessage).toMatch(/development/)
  })
})
