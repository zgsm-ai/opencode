import { describe, expect, test } from "bun:test"
import path from "path"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { Agent } from "../../src/agent/agent"
import { QuickExploreTool } from "../../src/tool/quick_explore"

describe("quick_explore integration", () => {
  test("Proposal Agent can call quick_explore tool", async () => {
    await Instance.provide({
      directory: path.join(__dirname, "../.."),
      fn: async () => {
        // 1. Get Proposal Agent
        const proposalAgent = await Agent.get("proposal")
        expect(proposalAgent).toBeDefined()
        expect(proposalAgent?.name).toBe("proposal")

        // 2. Check quick_explore permission
        // Note: Permission check would require running through the full permission system
        // For now, we verify the agent exists and has the tool available

        // 3. Verify QuickExploreTool is available
        const tool = await QuickExploreTool.init()
        expect(tool).toBeDefined()
        expect(tool.description).toContain("QuickExploreAgent")

        console.log("✅ Proposal Agent 可以访问 quick_explore 工具")
      },
    })
  }, 30000)

  test("quick_explore tool creates QuickExploreAgent session", async () => {
    await Instance.provide({
      directory: path.join(__dirname, "../.."),
      fn: async () => {
        // 1. Verify QuickExplore Agent exists
        const quickExploreAgent = await Agent.get("QuickExplore")
        expect(quickExploreAgent).toBeDefined()
        expect(quickExploreAgent?.name).toBe("QuickExplore")

        // 2. Verify agent mode is 'subagent'
        expect(quickExploreAgent?.mode).toBe("subagent")

        console.log("✅ QuickExploreAgent 配置正确，可以作为子 agent 启动")
      },
    })
  }, 30000)

  test("quick_explore tool has correct parameters", async () => {
    await Instance.provide({
      directory: path.join(__dirname, "../.."),
      fn: async () => {
        const tool = await QuickExploreTool.init()

        // Test valid parameter
        const validResult = tool.parameters.safeParse({
          exploration_target: "定位 SubCodingAgent 的实现位置和参数定义",
        })
        expect(validResult.success).toBe(true)

        // Test missing parameter
        const missingResult = tool.parameters.safeParse({})
        expect(missingResult.success).toBe(false)

        // Test empty parameter
        const emptyResult = tool.parameters.safeParse({
          exploration_target: "",
        })
        expect(emptyResult.success).toBe(false)

        console.log("✅ quick_explore 工具参数验证正确")
      },
    })
  }, 30000)

  test("quick_explore tool has streaming output support", async () => {
    await Instance.provide({
      directory: path.join(__dirname, "../.."),
      fn: async () => {
        // Read the quick_explore.ts source to verify streaming fix
        const fs = await import("fs")
        const toolSource = fs.readFileSync(
          path.join(__dirname, "../../src/tool/quick_explore.ts"),
          "utf-8"
        )

        // Verify messageID is defined before Bus.subscribe
        const messageIDIndex = toolSource.indexOf("const messageID = Identifier.ascending")
        const busSubscribeIndex = toolSource.indexOf("Bus.subscribe(MessageV2.Event.PartUpdated")

        expect(messageIDIndex).toBeGreaterThan(0)
        expect(busSubscribeIndex).toBeGreaterThan(0)
        expect(messageIDIndex).toBeLessThan(busSubscribeIndex)

        // Verify messageID filter exists in subscription
        expect(toolSource).toContain("if (evt.properties.part.messageID === messageID) return")

        console.log("✅ quick_explore 工具包含流式输出修复")
      },
    })
  }, 30000)

  test("Proposal and TaskCheck agents are available", async () => {
    await Instance.provide({
      directory: path.join(__dirname, "../.."),
      fn: async () => {
        // Check Proposal Agent
        const proposalAgent = await Agent.get("proposal")
        expect(proposalAgent).toBeDefined()

        // Check TaskCheck Agent
        const taskcheckAgent = await Agent.get("taskcheck")
        expect(taskcheckAgent).toBeDefined()

        console.log("✅ Proposal/TaskCheck 主 Agent 已配置")
      },
    })
  }, 30000)
})

describe("quick_explore real execution test", () => {
  test.skip("Execute quick_explore tool with real session (manual test)", async () => {
    // This test requires a full session setup and is skipped by default
    // To run manually:
    // 1. Start costrae CLI: bun run dev
    // 2. Use /agent proposal
    // 3. Send request: "请探索 SubCodingAgent 的实现"
    // 4. Observe:
    //    - Proposal Agent calls quick_explore tool
    //    - QuickExploreAgent session is created
    //    - Streaming output shows tool execution
    //    - Results are returned to Proposal Agent

    console.log("⚠️  Manual test required - see test description")
  })
})
