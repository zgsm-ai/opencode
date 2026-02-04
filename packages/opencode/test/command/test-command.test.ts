import { test, expect, describe } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Command } from "../../src/command/index"
import { Config } from "../../src/config/config"
import path from "path"
import fs from "fs/promises"

describe("/test command", () => {
  test("is registered as built-in command", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const commands = await Command.list()
        const names = commands.map((c) => c.name)
        expect(names).toContain("test")
      },
    })
  })

  test("has correct name from Default constant", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const cmd = await Command.get("test")
        expect(cmd).toBeDefined()
        expect(cmd?.name).toBe(Command.Default.TEST)
        expect(cmd?.name).toBe("test")
      },
    })
  })

  test("has descriptive description", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const cmd = await Command.get("test")
        expect(cmd?.description).toBeDefined()
        expect(cmd?.description).toContain("testing")
        expect(cmd?.description).toContain("test cases")
      },
    })
  })

  test("has template defined", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const cmd = await Command.get("test")
        expect(cmd).toBeDefined()

        const template = await Promise.resolve(cmd!.template)
        expect(template).toBeDefined()
        expect(template.length).toBeGreaterThan(100)
      },
    })
  })

  test("template mentions TestDesign and TestAndFix agents", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const cmd = await Command.get("test")
        const template = await Promise.resolve(cmd!.template)

        expect(template).toContain("@TestDesign")
        expect(template).toContain("@TestAndFix")
      },
    })
  })

  test("template includes testing workflow phases", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const cmd = await Command.get("test")
        const template = await Promise.resolve(cmd!.template)

        // Should have workflow phases
        expect(template).toContain("Phase")
        expect(template).toMatch(/Phase 1|Phase 2|Phase 3/i)
      },
    })
  })

  test.todo("can be disabled via config - needs state isolation fix", () => {})

  test.todo("description can be overridden via config - needs state isolation fix", () => {})

  test.todo("template can be overridden via config - needs state isolation fix", () => {})

  test.todo("agent can be specified via config - needs state isolation fix", () => {})

  test.todo("model can be specified via config - needs state isolation fix", () => {})

  test.todo("subtask flag can be set via config - needs state isolation fix", () => {})

  test("hints are parsed from template", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const cmd = await Command.get("test")
        expect(cmd?.hints).toBeDefined()
        expect(Array.isArray(cmd?.hints)).toBe(true)
        expect(cmd?.hints).toContain("$ARGUMENTS")
      },
    })
  })
})

describe("command system", () => {
  test("all default commands are registered", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const commands = await Command.list()
        const names = commands.map((c) => c.name)
        expect(names).toContain(Command.Default.INIT)
        expect(names).toContain(Command.Default.REVIEW)
        expect(names).toContain(Command.Default.TEST)
      },
    })
  })

  test.todo("custom command can be added via config - needs state isolation fix", () => {})

  test("Command.get returns undefined for non-existent command", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const cmd = await Command.get("does_not_exist")
        expect(cmd).toBeUndefined()
      },
    })
  })

  test("reloads commands after invalidate", async () => {
    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const dir = path.join(tmp.path, "..costrict", "command")
        await fs.mkdir(dir, { recursive: true })
        const file = path.join(dir, "foo.md")

        await Bun.write(
          file,
          `---
description: First command.
---
echo one
`,
        )

        const first = await Command.get("foo")
        expect(first?.description).toBe("First command.")

        await Bun.write(
          file,
          `---
description: Second command.
---
echo two
`,
        )

        await Config.invalidate()
        await Command.invalidate()

        const next = await Command.get("foo")
        expect(next?.description).toBe("Second command.")
      },
    })
  })
})
