import { describe, expect, test } from "bun:test"
import { getCommands } from "../../../../src/plugin/tdd/commands"

describe("/test command", () => {
  describe("command registration and template loading", () => {
    test("should return commands object", async () => {
      const commands = await getCommands()

      expect(commands).toBeDefined()
      expect(typeof commands).toBe("object")
    })

    test("should include test command", async () => {
      const commands = await getCommands()

      expect(commands.test).toBeDefined()
    })

    test("test command should have correct name", async () => {
      const commands = await getCommands()

      expect(commands.test.name).toBe("test")
    })

    test("test command should have description", async () => {
      const commands = await getCommands()

      expect(commands.test.description).toBeDefined()
      expect(typeof commands.test.description).toBe("string")
      expect(commands.test.description?.length).toBeGreaterThan(0)
    })

    test("test command description should describe testing workflow", async () => {
      const commands = await getCommands()

      expect(commands.test.description).toMatch(/test/i)
      expect(commands.test.description?.length).toBeGreaterThan(20)
    })

    test("test command should have template", async () => {
      const commands = await getCommands()

      expect(commands.test.template).toBeDefined()
      expect(typeof commands.test.template).toBe("string")
    })

    test("test command template should contain testing workflow", async () => {
      const commands = await getCommands()

      const template = await Promise.resolve(commands.test.template)
      expect(template.length).toBeGreaterThan(0)
    })

    test("test command should have hints", async () => {
      const commands = await getCommands()

      expect(commands.test.hints).toBeDefined()
      expect(Array.isArray(commands.test.hints)).toBe(true)
    })

    test("test command hints should include $ARGUMENTS", async () => {
      const commands = await getCommands()

      expect(commands.test.hints).toContain("$ARGUMENTS")
    })
  })
})
