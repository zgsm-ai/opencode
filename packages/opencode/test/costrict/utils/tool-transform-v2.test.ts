import { describe, expect, test } from "bun:test"
import { toolAlias } from "../../../src/costrict/utils/tool-transform-v2"

describe("costrict.tool-transform-v2.toolAlias", () => {
  test("maps taskdone to task_done", () => {
    expect(toolAlias("taskdone")).toBe("task_done")
  })

  test("maps task done variants to canonical names", () => {
    expect(toolAlias("task_done_with_changeid")).toBe("task_done_with_change_id")
    expect(toolAlias("taskdone_with_change_id")).toBe("task_done_with_change_id")
    expect(toolAlias("sub_agent_taskdone")).toBe("sub_agent_task_done")
  })

  test("keeps custom tool name when already registered", () => {
    const tools = new Set(["taskdone"])
    expect(toolAlias("taskdone", tools)).toBe("taskdone")
  })
})
