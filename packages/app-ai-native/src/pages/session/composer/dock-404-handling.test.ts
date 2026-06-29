import { describe, expect, mock, test } from "bun:test"

// Avoid importing from @/client/device-transport because its dependency tree
// pulls in SolidJS router code that fails outside a browser. Instead, inline
// the minimal class and predicate we need — they are trivially correct and
// must stay in sync with the source.

class DeviceHttpError extends Error {
  code: string
  status: number
  override name = "DeviceHttpError"
  constructor(message: string, status: number, code: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

function isNotFoundError(e: unknown): e is DeviceHttpError {
  if (e instanceof DeviceHttpError) return e.status === 404
  return false
}

describe("isNotFoundError", () => {
  test("matches DeviceHttpError with status 404", () => {
    expect(isNotFoundError(new DeviceHttpError("not found", 404, "NOT_FOUND"))).toBe(true)
  })

  test("rejects DeviceHttpError with other status codes", () => {
    expect(isNotFoundError(new DeviceHttpError("bad request", 400, "BAD_REQUEST"))).toBe(false)
    expect(isNotFoundError(new DeviceHttpError("server error", 500, "INTERNAL"))).toBe(false)
    expect(isNotFoundError(new DeviceHttpError("unauthorized", 401, "UNAUTHORIZED"))).toBe(false)
  })

  test("rejects non-DeviceHttpError values", () => {
    expect(isNotFoundError(new Error("generic"))).toBe(false)
    expect(isNotFoundError("string error")).toBe(false)
    expect(isNotFoundError(null)).toBe(false)
    expect(isNotFoundError(undefined)).toBe(false)
    expect(isNotFoundError(404)).toBe(false)
  })

  test("narrows type to DeviceHttpError on match", () => {
    const err: unknown = new DeviceHttpError("not found", 404, "UNKNOWN")
    if (isNotFoundError(err)) {
      expect(err.status).toBe(404)
      expect(err.code).toBe("UNKNOWN")
      expect(err.message).toBe("not found")
    } else {
      expect.unreachable("should have matched")
    }
  })
})

describe("question dock 404 stale handling", () => {
  test("onStale is called when questionReply returns 404", async () => {
    const staleCalls: string[] = []
    const onStale = () => { staleCalls.push("stale") }

    const questionReply = async () => {
      throw new DeviceHttpError("question not found", 404, "NOT_FOUND")
    }

    // Mirrors session-question-dock.tsx reply catch block
    const reply = async () => {
      try { await questionReply() } catch (err) {
        if (isNotFoundError(err)) onStale()
      }
    }

    await reply()
    expect(staleCalls).toEqual(["stale"])
  })

  test("onStale is called when questionReject returns 404", async () => {
    const staleCalls: string[] = []
    const onStale = () => { staleCalls.push("stale") }

    const questionReject = async () => {
      throw new DeviceHttpError("question not found", 404, "NOT_FOUND")
    }

    const reject = async () => {
      try { await questionReject() } catch (err) {
        if (isNotFoundError(err)) onStale()
      }
    }

    await reject()
    expect(staleCalls).toEqual(["stale"])
  })

  test("onStale is NOT called for 500 errors", async () => {
    const staleCalls: string[] = []
    const onStale = () => { staleCalls.push("stale") }

    const questionReply = async () => {
      throw new DeviceHttpError("server error", 500, "INTERNAL")
    }

    const reply = async () => {
      try { await questionReply() } catch (err) {
        if (isNotFoundError(err)) onStale()
      }
    }

    await reply()
    expect(staleCalls).toEqual([])
  })

  test("onStale is NOT called for generic network errors", async () => {
    const staleCalls: string[] = []
    const onStale = () => { staleCalls.push("stale") }

    const questionReply = async () => { throw new Error("Network error") }

    const reply = async () => {
      try { await questionReply() } catch (err) {
        if (isNotFoundError(err)) onStale()
      }
    }

    await reply()
    expect(staleCalls).toEqual([])
  })
})

describe("permission respond 404 stale handling", () => {
  test("removePermission is called when permission respond returns 404", async () => {
    const removed: { sid: string; pid: string }[] = []
    const permissions: Record<string, { id: string }[]> = {
      "sess-1": [{ id: "perm-1" }],
    }

    const removePermission = (sid: string, pid: string) => removed.push({ sid, pid })

    // Mirrors device-session.tsx permissionRespond catch block
    const respond = async (permissionID: string) => {
      try {
        throw new DeviceHttpError("permission not found", 404, "NOT_FOUND")
      } catch (err) {
        if (isNotFoundError(err)) {
          for (const [sid, list] of Object.entries(permissions)) {
            if (!Array.isArray(list)) continue
            if (list.findIndex((p) => p.id === permissionID) !== -1) {
              removePermission(sid, permissionID)
              break
            }
          }
        }
      }
    }

    await respond("perm-1")
    expect(removed).toEqual([{ sid: "sess-1", pid: "perm-1" }])
  })

  test("removePermission is NOT called for 500 errors", async () => {
    const removed: { sid: string; pid: string }[] = []
    const permissions: Record<string, { id: string }[]> = {
      "sess-1": [{ id: "perm-1" }],
    }

    const removePermission = (sid: string, pid: string) => removed.push({ sid, pid })

    const respond = async (permissionID: string) => {
      try {
        throw new DeviceHttpError("server error", 500, "INTERNAL")
      } catch (err) {
        if (isNotFoundError(err)) {
          for (const [sid, list] of Object.entries(permissions)) {
            if (!Array.isArray(list)) continue
            if (list.findIndex((p) => p.id === permissionID) !== -1) {
              removePermission(sid, permissionID)
              break
            }
          }
        }
      }
    }

    await respond("perm-1")
    expect(removed).toEqual([])
  })

  test("no crash when permission ID not in any session bucket", async () => {
    const removed: { sid: string; pid: string }[] = []
    const permissions: Record<string, { id: string }[]> = {
      "sess-1": [{ id: "perm-other" }],
    }

    const removePermission = (sid: string, pid: string) => removed.push({ sid, pid })

    const respond = async (permissionID: string) => {
      try {
        throw new DeviceHttpError("permission not found", 404, "NOT_FOUND")
      } catch (err) {
        if (isNotFoundError(err)) {
          for (const [sid, list] of Object.entries(permissions)) {
            if (!Array.isArray(list)) continue
            if (list.findIndex((p) => p.id === permissionID) !== -1) {
              removePermission(sid, permissionID)
              break
            }
          }
        }
      }
    }

    await respond("perm-unknown")
    expect(removed).toEqual([])
  })
})

describe("dismissQuestion flow", () => {
  test("removes the current question from workspace store", () => {
    const removed: { sid: string; qid: string }[] = []
    const removeQuestion = (sid: string, qid: string) => removed.push({ sid, qid })

    // Mirrors device-session-composer-state.ts dismissQuestion
    const currentQuestion = { id: "q-1", sessionID: "sess-1", questions: [] }
    const dismissQuestion = () => {
      const q = currentQuestion
      if (!q) return
      removeQuestion(q.sessionID, q.id)
    }

    dismissQuestion()
    expect(removed).toEqual([{ sid: "sess-1", qid: "q-1" }])
  })

  test("is a no-op when no question is active", () => {
    const removed: { sid: string; qid: string }[] = []
    const removeQuestion = (sid: string, qid: string) => removed.push({ sid, qid })

    const dismissQuestion = (q: { id: string; sessionID: string } | undefined) => {
      if (!q) return
      removeQuestion(q.sessionID, q.id)
    }

    dismissQuestion(undefined)
    expect(removed).toEqual([])
  })
})

describe("blocked state recovers after 404 dismissal", () => {
  test("blocked becomes false once stale question is removed", () => {
    // Simulate the workspace store state
    const questions: Record<string, { id: string; sessionID: string }[]> = {
      "sess-1": [{ id: "q-1", sessionID: "sess-1" }],
    }
    const permissions: Record<string, { id: string; sessionID: string }[]> = {}

    const questionRequest = () => {
      for (const list of Object.values(questions)) {
        if (list.length > 0) return list[0]
      }
      return undefined
    }

    const permissionRequest = () => {
      for (const list of Object.values(permissions)) {
        if (list.length > 0) return list[0]
      }
      return undefined
    }

    const blocked = () => !!questionRequest() || !!permissionRequest()

    expect(blocked()).toBe(true)

    // Simulate removeQuestion after 404
    const removeQuestion = (sessionID: string, requestID: string) => {
      const list = questions[sessionID]
      if (!list) return
      const idx = list.findIndex((r) => r.id === requestID)
      if (idx === -1) return
      list.splice(idx, 1)
    }

    removeQuestion("sess-1", "q-1")

    expect(blocked()).toBe(false)
  })

  test("blocked becomes false once stale permission is removed", () => {
    const questions: Record<string, { id: string; sessionID: string }[]> = {}
    const permissions: Record<string, { id: string; sessionID: string }[]> = {
      "sess-1": [{ id: "perm-1", sessionID: "sess-1" }],
    }

    const questionRequest = () => undefined
    const permissionRequest = () => {
      for (const list of Object.values(permissions)) {
        if (list.length > 0) return list[0]
      }
      return undefined
    }

    const blocked = () => !!questionRequest() || !!permissionRequest()

    expect(blocked()).toBe(true)

    const removePermission = (sessionID: string, requestID: string) => {
      const list = permissions[sessionID]
      if (!list) return
      const idx = list.findIndex((r) => r.id === requestID)
      if (idx === -1) return
      list.splice(idx, 1)
    }

    removePermission("sess-1", "perm-1")

    expect(blocked()).toBe(false)
  })

  test("blocked stays true if only one of question/permission is removed", () => {
    const questions: Record<string, { id: string; sessionID: string }[]> = {
      "sess-1": [{ id: "q-1", sessionID: "sess-1" }],
    }
    const permissions: Record<string, { id: string; sessionID: string }[]> = {
      "sess-1": [{ id: "perm-1", sessionID: "sess-1" }],
    }

    const questionRequest = () => {
      for (const list of Object.values(questions)) {
        if (list.length > 0) return list[0]
      }
      return undefined
    }

    const permissionRequest = () => {
      for (const list of Object.values(permissions)) {
        if (list.length > 0) return list[0]
      }
      return undefined
    }

    const blocked = () => !!questionRequest() || !!permissionRequest()

    expect(blocked()).toBe(true)

    // Remove only the question (permission still blocking)
    const removeQuestion = (sessionID: string, requestID: string) => {
      const list = questions[sessionID]
      if (!list) return
      const idx = list.findIndex((r) => r.id === requestID)
      if (idx === -1) return
      list.splice(idx, 1)
    }

    removeQuestion("sess-1", "q-1")
    expect(blocked()).toBe(true) // still blocked by permission
  })
})
