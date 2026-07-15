import { describe, expect, test } from "bun:test"
import { fetchCostrictUniversalId, postCostrictIdentity } from "./identity-handoff"

describe("fetchCostrictUniversalId", () => {
  test("reads casdoorUniversalId from the costrict-web auth/me response", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      return Promise.resolve(
        new Response(
          JSON.stringify({
            user: {
              casdoorUniversalId: "4d4731fd-1929-4570-8442-3de170a29510",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
    }

    const universalId = await fetchCostrictUniversalId("/cloud-api", fetcher)

    expect(universalId).toBe("4d4731fd-1929-4570-8442-3de170a29510")
    expect(calls).toEqual([
      {
        url: "/cloud-api/api/auth/me",
        init: { credentials: "include" },
      },
    ])
  })

  test("returns null when auth/me is unavailable or has no universal id", async () => {
    const failingFetcher = () => Promise.resolve(new Response("{}", { status: 401 }))
    const missingFetcher = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ user: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ))

    expect(await fetchCostrictUniversalId("/cloud-api", failingFetcher)).toBe(null)
    expect(await fetchCostrictUniversalId("/cloud-api", missingFetcher)).toBe(null)
  })
})

describe("postCostrictIdentity", () => {
  test("posts only the universal id to the Multica iframe origin", () => {
    const messages: Array<{ message: unknown; targetOrigin: string }> = []
    const target = {
      postMessage: (message: unknown, targetOrigin: string) => {
        messages.push({ message, targetOrigin })
      },
    } as Window

    postCostrictIdentity(target, "https://multica.example.test", "uni-current")

    expect(messages).toEqual([
      {
        targetOrigin: "https://multica.example.test",
        message: {
          type: "costrict:identity",
          casdoorUniversalId: "uni-current",
        },
      },
    ])
  })
})
