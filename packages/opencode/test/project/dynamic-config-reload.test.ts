import fs from "fs/promises"
import path from "path"
import { afterEach, describe, expect, test } from "bun:test"
import { Bus } from "../../src/bus"
import { Config } from "../../src/config/config"
import { FileWatcher } from "../../src/file/watcher"
import { Instance } from "../../src/project/instance"
import { isDynamicConfigFile, registerDynamicConfigReload } from "../../src/project/dynamic-config-reload"
import { tmpdir } from "../fixture/fixture"

describe("dynamic config reload", () => {
  afterEach(async () => {
    await Instance.disposeAll()
  })

  test("matches only agent and command markdown files inside config directories", async () => {
    const root = "/tmp/project"
    expect(isDynamicConfigFile("/tmp/project/.costrict/agent/reviewer.md", [root])).toBe(true)
    expect(isDynamicConfigFile("/tmp/project/.opencode/commands/review.md", [root])).toBe(true)
    expect(isDynamicConfigFile("/tmp/project/agents/dev.md", [root])).toBe(true)
    expect(isDynamicConfigFile("/tmp/project/.costrict/skills/reviewer/SKILL.md", [root])).toBe(true)
    expect(isDynamicConfigFile("/tmp/project/.claude/skills/reviewer/SKILL.md", [root])).toBe(true)
    expect(isDynamicConfigFile("/tmp/project/.agents/skills/reviewer/SKILL.md", [root])).toBe(true)
    expect(isDynamicConfigFile("/tmp/project/.opencode/skills/reviewer/SKILL.md", [root])).toBe(true)
    expect(isDynamicConfigFile("/tmp/project/skills/reviewer/SKILL.md", [root])).toBe(true)
    expect(isDynamicConfigFile("/tmp/project/src/command/index.ts", [root])).toBe(false)
    expect(isDynamicConfigFile("/tmp/project/.costrict/skills/reviewer/README.md", [root])).toBe(false)
    expect(isDynamicConfigFile("/tmp/project/docs/agent.md", [root])).toBe(false)
    expect(isDynamicConfigFile("/tmp/other/.costrict/agent/reviewer.md", [root])).toBe(false)
  })

  test("invalidates config when a dynamic agent file changes", async () => {
    await using tmp = await tmpdir()
    const agentFile = path.join(tmp.path, ".costrict", "agent", "reviewer.md")
    await fs.mkdir(path.dirname(agentFile), { recursive: true })
    await fs.writeFile(agentFile, "---\ndescription: test\n---\nprompt")

    const originalDirectories = Config.directories
    const originalInvalidate = Config.invalidate
    let invalidated = 0

    Config.directories = (async () => [tmp.path]) as typeof Config.directories
    Config.invalidate = (async (wait = false) => {
      invalidated += 1
      return originalInvalidate(wait)
    }) as typeof Config.invalidate

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const unsub = registerDynamicConfigReload()
          try {
            await Bus.publish(FileWatcher.Event.Updated, {
              file: agentFile,
              event: "change",
            })

            for (let i = 0; i < 20 && invalidated === 0; i += 1) {
              await Bun.sleep(25)
            }
            expect(invalidated).toBe(1)
          } finally {
            unsub()
          }
        },
      })
    } finally {
      Config.directories = originalDirectories
      Config.invalidate = originalInvalidate
    }
  })
})
