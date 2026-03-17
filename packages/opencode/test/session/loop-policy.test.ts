import { describe, expect, test } from "bun:test"
import { PermissionNext } from "../../src/permission/next"
import * as LoopPolicy from "../../src/session/loop-policy"

type Rule = "allow" | "ask" | "deny" | Record<string, "allow" | "ask" | "deny">

function rules(config: Record<string, Rule>) {
  return PermissionNext.fromConfig(config)
}

describe("session.loop-policy.exitTool", () => {
  test("uses configured exit tool when allowed and available", () => {
    const agent = {
      options: { exitToolName: "sub_agent_task_done" },
      permission: rules({
        "*": "deny",
        sub_agent_task_done: "allow",
      }),
    }

    expect(LoopPolicy.exitTool(agent, ["sub_agent_task_done", "bash"])).toBe("sub_agent_task_done")
  })

  test("falls back to task_done for agents that allow it", () => {
    const agent = {
      options: {},
      permission: rules({
        "*": "deny",
        task_done: "allow",
      }),
    }

    expect(LoopPolicy.exitTool(agent)).toBe("task_done")
  })

  test("returns undefined when the exit tool is unavailable", () => {
    const agent = {
      options: { exitToolName: "task_done_with_change_id" },
      permission: rules({
        "*": "deny",
        task_done_with_change_id: "allow",
      }),
    }

    expect(LoopPolicy.exitTool(agent, ["bash"])).toBeUndefined()
  })
})

describe("session.loop-policy.maxStep", () => {
  test("forces exit tool instead of breaking when one is available", () => {
    const agent = {
      options: { exitToolName: "sub_agent_task_done" },
      permission: rules({
        "*": "deny",
        sub_agent_task_done: "allow",
      }),
      steps: 2,
    }

    expect(LoopPolicy.maxStep(agent, 2, ["sub_agent_task_done", "bash"])).toStrictEqual({
      hit: true,
      exitToolName: "sub_agent_task_done",
      forceExitTool: true,
      shouldBreak: false,
    })
  })

  test("keeps breaking when no exit tool is available", () => {
    const agent = {
      options: {},
      permission: rules({
        "*": "deny",
        bash: "allow",
      }),
      steps: 2,
    }

    expect(LoopPolicy.maxStep(agent, 2, ["bash"])).toStrictEqual({
      hit: true,
      exitToolName: undefined,
      forceExitTool: false,
      shouldBreak: true,
    })
  })
})

describe("session.loop-policy.unexpectedStop", () => {
  test("mentions the exit tool and stop reason", () => {
    const text = LoopPolicy.unexpectedStop("task_done", "UnknownError: boom")

    expect(text).toContain("task_done")
    expect(text).toContain("UnknownError: boom")
  })
})
