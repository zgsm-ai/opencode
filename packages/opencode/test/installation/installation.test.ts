import { test, expect, mock, beforeAll, beforeEach } from "bun:test"
import { Installation } from "../../src/installation/index"

// Save original environment
const originalEnv = process.env.COSTRICT_CLIENT_ID

beforeEach(() => {
  // Clear cache before each test
  Installation.clearInstallationIdCache()
  // Clear environment variable
  delete process.env.COSTRICT_CLIENT_ID
})

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

test("Installation.getInstallationId generates stable ID based on hostname and username", () => {
  // Mock os.hostname and os.userInfo
  mock.module("node:os", () => ({
    hostname: () => "test-host",
    userInfo: () => ({ username: "test-user" }),
    platform: () => "linux",
  }))

  // Clear cache by re-importing
  const { Installation: Installation2 } = require("../../src/installation/index")

  const id = Installation2.getInstallationId()

  // Verify it's a SHA256 hash of "test-host-test-user"
  const crypto = require("node:crypto")
  const expectedHash = crypto.createHash("sha256").update("test-host-test-user").digest("hex").substring(0, 32)

  expect(id).toBe(expectedHash)
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

// Restore original environment
beforeAll(() => {
  if (originalEnv !== undefined) {
    process.env.COSTRICT_CLIENT_ID = originalEnv
  } else {
    delete process.env.COSTRICT_CLIENT_ID
  }
})
