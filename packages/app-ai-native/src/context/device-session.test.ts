import { describe, expect, test } from "bun:test"
import type { Session } from "@opencode-ai/sdk/v2/client"
import { sessionQuestionRequest, sessionTreeIDs } from "@/pages/session/composer/session-request-tree"
import { group, treeEvent, treeItems } from "./device-session"

const session = (input: { id: string; parentID?: string }) => input as Session

describe("DeviceSessionProvider helpers", () => {
  test("treeItems keeps only tree-scoped requests", () => {
    const ids = new Set(["root", "child"])
    const input = [
      { id: "q-root", sessionID: "root" },
      { id: "q-child", sessionID: "child" },
      { id: "q-other", sessionID: "other" },
    ]

    expect(treeItems(input, ids)).toEqual({
      root: [{ id: "q-root", sessionID: "root" }],
      child: [{ id: "q-child", sessionID: "child" }],
    })
  })

  test("treeEvent accepts tree request events but rejects unrelated ones", () => {
    const tree = new Set(["root", "child"])

    expect(treeEvent({ root: "root", eventSID: "child", type: "question.asked", tree })).toBe(true)
    expect(treeEvent({ root: "root", eventSID: "other", type: "question.asked", tree })).toBe(false)
    expect(treeEvent({ root: "root", eventSID: "root", type: "message.updated", tree })).toBe(true)
    expect(treeEvent({ root: "root", eventSID: "child", type: "message.updated", tree })).toBe(false)
  })
})

describe("shared session tree ids", () => {
  test("matches question traversal semantics", () => {
    const sessions = [session({ id: "root" }), session({ id: "child", parentID: "root" }), session({ id: "grand", parentID: "child" })]
    const ids = sessionTreeIDs(sessions, "root")
    const questions = {
      grand: [{ id: "q-grand", sessionID: "grand", questions: [] }],
    }

    expect(ids).toEqual(["root", "child", "grand"])
    expect(sessionQuestionRequest(sessions, questions, "root")?.id).toBe("q-grand")
  })

  test("group preserves per-session buckets", () => {
    expect(group([{ id: "a", sessionID: "x" }, { id: "b", sessionID: "x" }, { id: "c", sessionID: "y" }])).toEqual({
      x: [{ id: "a", sessionID: "x" }, { id: "b", sessionID: "x" }],
      y: [{ id: "c", sessionID: "y" }],
    })
  })
})
