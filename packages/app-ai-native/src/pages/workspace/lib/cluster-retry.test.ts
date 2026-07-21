import { describe, expect, test } from "bun:test"
import { withClusterRetry } from "./cluster-retry"

describe("withClusterRetry", () => {
  test("retries once after refreshing route on 'device not connected'", async () => {
    let calls = 0
    let refreshed = ""
    const fn = async () => {
      calls++
      if (calls === 1) throw new Error("device not connected")
      return "ok"
    }
    const result = await withClusterRetry("dev-1", fn, async (id) => { refreshed = id })
    expect(result).toBe("ok")
    expect(calls).toBe(2)
    expect(refreshed).toBe("dev-1")
  })

  test("does not retry on unrelated errors", async () => {
    let calls = 0
    const fn = async () => { calls++; throw new Error("permission denied") }
    await expect(withClusterRetry("dev-1", fn, async () => {})).rejects.toThrow("permission denied")
    expect(calls).toBe(1)
  })

  test("propagates error if retry also fails", async () => {
    const fn = async () => { throw new Error("device not connected") }
    await expect(withClusterRetry("dev-1", fn, async () => {})).rejects.toThrow("device not connected")
  })

  test("still retries when refresh throws, propagating retry error", async () => {
    let calls = 0
    const fn = async () => {
      calls++
      throw new Error("device not connected")
    }
    await expect(
      withClusterRetry("dev-1", fn, async () => { throw new Error("refresh failed") }),
    ).rejects.toThrow("device not connected")
    expect(calls).toBe(2)
  })
})
