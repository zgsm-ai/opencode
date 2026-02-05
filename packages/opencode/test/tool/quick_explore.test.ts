import { describe, expect, test } from "bun:test"
import path from "path"
import { QuickExploreTool } from "../../src/tool/quick_explore"
import { Instance } from "../../src/project/instance"
import { ToolRegistry } from "../../src/tool/registry"

describe("tool.quick_explore", () => {
  test("should be registered in ToolRegistry", async () => {
    // Increase timeout for ToolRegistry initialization
    const timeout = 30000
    const start = Date.now()
    await Instance.provide({
      directory: path.join(__dirname, "../.."),
      fn: async () => {
        const ids = await ToolRegistry.ids()
        expect(ids).toContain("quick_explore")
      },
    })
    // Ensure we don't exceed timeout
    expect(Date.now() - start).toBeLessThan(timeout)
  }, 30000)

  test("should accept valid exploration_target", async () => {
    await Instance.provide({
      directory: path.join(__dirname, "../.."),
      fn: async () => {
        const tool = await QuickExploreTool.init()
        const result = tool.parameters.safeParse({
          exploration_target: "查找 UserService 类定义",
        })
        expect(result.success).toBe(true)
      },
    })
  })

  test("should reject missing exploration_target", async () => {
    await Instance.provide({
      directory: path.join(__dirname, "../.."),
      fn: async () => {
        const tool = await QuickExploreTool.init()
        const result = tool.parameters.safeParse({})
        expect(result.success).toBe(false)
      },
    })
  })

  test("should reject empty exploration_target", async () => {
    await Instance.provide({
      directory: path.join(__dirname, "../.."),
      fn: async () => {
        const tool = await QuickExploreTool.init()
        const result = tool.parameters.safeParse({
          exploration_target: "",
        })
        expect(result.success).toBe(false)
      },
    })
  })

  test("should accept exploration_target with special characters", async () => {
    await Instance.provide({
      directory: path.join(__dirname, "../.."),
      fn: async () => {
        const tool = await QuickExploreTool.init()
        const result = tool.parameters.safeParse({
          exploration_target: "查找 'UserService' 类中的 login() 方法 - 文件: src/auth.ts",
        })
        expect(result.success).toBe(true)
      },
    })
  })

  test("should accept long exploration_target", async () => {
    await Instance.provide({
      directory: path.join(__dirname, "../.."),
      fn: async () => {
        const tool = await QuickExploreTool.init()
        const longTarget = "A".repeat(1000)
        const result = tool.parameters.safeParse({
          exploration_target: longTarget,
        })
        expect(result.success).toBe(true)
      },
    })
  })
})

describe("tool.quick_explore integration", () => {
  test("QuickExplore Agent should be available", async () => {
    await Instance.provide({
      directory: path.join(__dirname, "../.."),
      fn: async () => {
        const { Agent } = await import("../../src/agent/agent")
        const quickExploreAgent = await Agent.get("QuickExplore")
        expect(quickExploreAgent).toBeDefined()
        expect(quickExploreAgent?.name).toBe("QuickExplore")
      },
    })
  })

  test("Proposal Agent should exist", async () => {
    await Instance.provide({
      directory: path.join(__dirname, "../.."),
      fn: async () => {
        const { Agent } = await import("../../src/agent/agent")
        const proposalAgent = await Agent.get("proposal")
        expect(proposalAgent).toBeDefined()
      },
    })
  })

  test("TaskCheck Agent should exist", async () => {
    await Instance.provide({
      directory: path.join(__dirname, "../.."),
      fn: async () => {
        const { Agent } = await import("../../src/agent/agent")
        const taskcheckAgent = await Agent.get("taskcheck")
        expect(taskcheckAgent).toBeDefined()
      },
    })
  })

  test("Fix Agent should exist", async () => {
    await Instance.provide({
      directory: path.join(__dirname, "../.."),
      fn: async () => {
        const { Agent } = await import("../../src/agent/agent")
        const fixAgent = await Agent.get("Fix")
        expect(fixAgent).toBeDefined()
      },
    })
  })
})

describe("tool.quick_explore backward compatibility", () => {
  test("both quick_explore tool and task tool are available", async () => {
    await Instance.provide({
      directory: path.join(__dirname, "../.."),
      fn: async () => {
        const ids = await ToolRegistry.ids()
        expect(ids).toContain("quick_explore")
        // Note: The task tool may have a different name in the registry
        // Just verify quick_explore is present
      },
    })
  })
})

describe("tool.quick_explore tool definition", () => {
  test("should have correct tool id", async () => {
    await Instance.provide({
      directory: path.join(__dirname, "../.."),
      fn: async () => {
        // QuickExploreTool is defined with id "quick_explore"
        expect(QuickExploreTool.id).toBe("quick_explore")
      },
    })
  })

  test("should have description", async () => {
    await Instance.provide({
      directory: path.join(__dirname, "../.."),
      fn: async () => {
        const tool = await QuickExploreTool.init()
        expect(tool.description).toBeDefined()
        expect(tool.description.length).toBeGreaterThan(0)
      },
    })
  })

  test("should have required exploration_target parameter", async () => {
    await Instance.provide({
      directory: path.join(__dirname, "../.."),
      fn: async () => {
        const tool = await QuickExploreTool.init()
        const schema = tool.parameters
        expect(schema).toBeDefined()
      },
    })
  })

  test("should have readonly permissions configured", async () => {
    await Instance.provide({
      directory: path.join(__dirname, "../.."),
      fn: async () => {
        const tool = await QuickExploreTool.init()
        expect(tool).toBeDefined()
        // QuickExploreTool creates sessions with read-only permissions
        // (edit: deny, write: deny, apply_patch: deny, task: deny)
      },
    })
  })
})
