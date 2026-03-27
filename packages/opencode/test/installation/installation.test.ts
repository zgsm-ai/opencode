import { test, expect, mock, beforeAll, beforeEach, afterEach, describe } from "bun:test"
import { Installation } from "../../src/installation/index"

// Save original environment
const originalEnv = process.env.COSTRICT_CLIENT_ID

beforeEach(() => {
  // Clear cache before each test
  Installation.clearInstallationIdCache()
  // Clear environment variable
  delete process.env.COSTRICT_CLIENT_ID
})

// Restore original environment
beforeAll(() => {
  if (originalEnv !== undefined) {
    process.env.COSTRICT_CLIENT_ID = originalEnv
  } else {
    delete process.env.COSTRICT_CLIENT_ID
  }
})

const fetch0 = globalThis.fetch

afterEach(() => {
  globalThis.fetch = fetch0
})

describe("installation", () => {
  test("Installation.getInstallationId returns 32-character SHA256 hash", () => {
    const id = Installation.getInstallationId()

    expect(id).toHaveLength(32)
    expect(id).toMatch(/^[0-9a-f]{32}$/)
  })

  test("Installation.getInstallationId: COSTRICT_CLIENT_ID environment variable takes precedence", () => {
    process.env.COSTRICT_CLIENT_ID = "custom-client-id-123456789012"

    const id = Installation.getInstallationId()

    expect(id).toBe("custom-client-id-123456789012")

    // Clean up
    delete process.env.COSTRICT_CLIENT_ID
  })

  test("Installation.getInstallationId caches installation ID - returns same ID on multiple calls", () => {
    const id1 = Installation.getInstallationId()
    const id2 = Installation.getInstallationId()

    expect(id1).toBe(id2)
  })

  test("Installation.getInstallationId clears cache when COSTRICT_CLIENT_ID changes", () => {
    process.env.COSTRICT_CLIENT_ID = "first-id"
    const id1 = Installation.getInstallationId()

    process.env.COSTRICT_CLIENT_ID = "second-id"
    const id2 = Installation.getInstallationId()

    expect(id1).toBe("first-id")
    expect(id2).toBe("second-id")

    // Clean up
    delete process.env.COSTRICT_CLIENT_ID
  })

  test("Installation.compareVersions handles normal version comparisons", () => {
    expect(Installation.compareVersions("1.0.0", "1.0.0")).toBe(0)
    expect(Installation.compareVersions("1.0.1", "1.0.0")).toBe(1)
    expect(Installation.compareVersions("1.0.0", "1.0.1")).toBe(-1)
    expect(Installation.compareVersions("2.0.0", "1.9.9")).toBe(1)
    expect(Installation.compareVersions("1.2.3", "1.2.4")).toBe(-1)
  })

  test("Installation.compareVersions handles versions with different lengths", () => {
    expect(Installation.compareVersions("1.0", "1.0.0")).toBe(0)
    expect(Installation.compareVersions("1.0.0.0", "1.0")).toBe(0)
    expect(Installation.compareVersions("1.0.1", "1.0")).toBe(1)
    expect(Installation.compareVersions("1.0", "1.0.1")).toBe(-1)
  })

  test("Installation.compareVersions throws error for undefined or null inputs", () => {
    expect(() => Installation.compareVersions(undefined as any, "1.0.0")).toThrow(
      "Version string cannot be null or undefined",
    )
    expect(() => Installation.compareVersions("1.0.0", undefined as any)).toThrow(
      "Version string cannot be null or undefined",
    )
    expect(() => Installation.compareVersions(null as any, "1.0.0")).toThrow("Version string cannot be null or undefined")
    expect(() => Installation.compareVersions("1.0.0", null as any)).toThrow("Version string cannot be null or undefined")
  })

  test("Installation.compareVersions correctly finds latest version from version list", () => {
    const versions = ["3.0.1", "3.0.2", "3.0.3", "3.0.4", "3.0.0", "3.0.5", "3.0.6", "3.0.7", "3.0.8", "3.0.9"]

    const latestVersion = versions.sort((a, b) => Installation.compareVersions(b, a))[0]

    expect(latestVersion).toBe("3.0.9")
  })

  test("Installation.compareVersions filters out pre-release versions correctly", () => {
    const versions = ["3.0.9", "0.0.0-refactor-workflow-202603060823", "0.0.0-refactor-workflow-202603060904", "3.0.8"]

    const stableVersions = versions.filter((v) => /^\d+\.\d+\.\d+$/.test(v))
    const latestVersion = stableVersions.sort((a, b) => Installation.compareVersions(b, a))[0]

    expect(stableVersions).toHaveLength(2)
    expect(stableVersions).toContain("3.0.9")
    expect(stableVersions).toContain("3.0.8")
    expect(latestVersion).toBe("3.0.9")
  })

  test("reads release version from GitHub releases", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ tag_name: "v1.2.3" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch

    expect(await Installation.latest("unknown")).toBe("1.2.3")
  })

  test("reads scoop manifest versions", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ version: "2.3.4" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch

    expect(await Installation.latest("scoop")).toBe("2.3.4")
  })

  test("reads chocolatey feed versions", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          d: {
            results: [{ Version: "3.4.5" }],
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      )) as unknown as typeof fetch

    expect(await Installation.latest("choco")).toBe("3.4.5")
  })
})
