import { test, expect, mock } from "bun:test"
import { promises as fs } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import {
  loadCoStrictCredentials,
  saveCoStrictCredentials,
  getCoStrictCredentialsPath,
  generateMachineId,
} from "../../../src/costrict/provider/credentials"
import type { CoStrictCredentials } from "../../../src/costrict/provider/credentials"

// Mock homedir to use temp directory
mock.module("node:os", () => ({
  homedir: () => process.env.COSTRICT_TEST_HOME || homedir(),
  platform: () => "linux",
  hostname: () => "test-host",
  userInfo: () => ({ username: "test-user" }),
}))

test("loadCoStrictCredentials with all fields present", async () => {
  const testHome = process.env.COSTRICT_TEST_HOME
  if (!testHome) throw new Error("COSTRICT_TEST_HOME not set")

  const credentials: CoStrictCredentials = {
    id: "opencode",
    name: "OpenCode Auth",
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    state: "test-state",
    machine_id: "test-machine-id",
    base_url: "https://test.example.com",
    expiry_date: Date.now() + 3600000,
    updated_at: new Date().toISOString(),
    expired_at: new Date(Date.now() + 3600000).toISOString(),
  }

  const filepath = join(testHome, ".costrict", "share", "auth.json")
  await fs.mkdir(join(testHome, ".costrict", "share"), { recursive: true })
  await fs.writeFile(filepath, JSON.stringify(credentials, null, 2))

  const loaded = await loadCoStrictCredentials()

  expect(loaded).not.toBeNull()
  expect(loaded?.access_token).toBe("test-access-token")
  expect(loaded?.refresh_token).toBe("test-refresh-token")
  expect(loaded?.state).toBe("test-state")
  expect(loaded?.base_url).toBe("https://test.example.com")
})

test("loadCoStrictCredentials without refresh_token", async () => {
  const testHome = process.env.COSTRICT_TEST_HOME
  if (!testHome) throw new Error("COSTRICT_TEST_HOME not set")

  const credentials: CoStrictCredentials = {
    id: "opencode",
    name: "OpenCode Auth",
    access_token: "test-access-token",
    machine_id: "test-machine-id",
    base_url: "https://test.example.com",
    expiry_date: Date.now() + 3600000,
    updated_at: new Date().toISOString(),
  }

  const filepath = join(testHome, ".costrict", "share", "auth.json")
  await fs.mkdir(join(testHome, ".costrict", "share"), { recursive: true })
  await fs.writeFile(filepath, JSON.stringify(credentials, null, 2))

  const loaded = await loadCoStrictCredentials()

  expect(loaded).not.toBeNull()
  expect(loaded?.access_token).toBe("test-access-token")
  expect(loaded?.refresh_token).toBeUndefined()
  expect(loaded?.state).toBeUndefined()
})

test("loadCoStrictCredentials without state", async () => {
  const testHome = process.env.COSTRICT_TEST_HOME
  if (!testHome) throw new Error("COSTRICT_TEST_HOME not set")

  const credentials: CoStrictCredentials = {
    id: "opencode",
    name: "OpenCode Auth",
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    machine_id: "test-machine-id",
    base_url: "https://test.example.com",
    expiry_date: Date.now() + 3600000,
    updated_at: new Date().toISOString(),
  }

  const filepath = join(testHome, ".costrict", "share", "auth.json")
  await fs.mkdir(join(testHome, ".costrict", "share"), { recursive: true })
  await fs.writeFile(filepath, JSON.stringify(credentials, null, 2))

  const loaded = await loadCoStrictCredentials()

  expect(loaded).not.toBeNull()
  expect(loaded?.access_token).toBe("test-access-token")
  expect(loaded?.refresh_token).toBe("test-refresh-token")
  expect(loaded?.state).toBeUndefined()
})

test("loadCoStrictCredentials without both optional fields", async () => {
  const testHome = process.env.COSTRICT_TEST_HOME
  if (!testHome) throw new Error("COSTRICT_TEST_HOME not set")

  const credentials: CoStrictCredentials = {
    id: "opencode",
    name: "OpenCode Auth",
    access_token: "test-access-token",
    machine_id: "test-machine-id",
    base_url: "https://test.example.com",
    expiry_date: Date.now() + 3600000,
    updated_at: new Date().toISOString(),
  }

  const filepath = join(testHome, ".costrict", "share", "auth.json")
  await fs.mkdir(join(testHome, ".costrict", "share"), { recursive: true })
  await fs.writeFile(filepath, JSON.stringify(credentials, null, 2))

  const loaded = await loadCoStrictCredentials()

  expect(loaded).not.toBeNull()
  expect(loaded?.access_token).toBe("test-access-token")
  expect(loaded?.refresh_token).toBeUndefined()
  expect(loaded?.state).toBeUndefined()
})

test("loadCoStrictCredentials returns null when access_token is missing", async () => {
  const testHome = process.env.COSTRICT_TEST_HOME
  if (!testHome) throw new Error("COSTRICT_TEST_HOME not set")

  const credentials = {
    id: "opencode",
    name: "OpenCode Auth",
    refresh_token: "test-refresh-token",
    machine_id: "test-machine-id",
    base_url: "https://test.example.com",
    expiry_date: Date.now() + 3600000,
    updated_at: new Date().toISOString(),
  }

  const filepath = join(testHome, ".costrict", "share", "auth.json")
  await fs.mkdir(join(testHome, ".costrict", "share"), { recursive: true })
  await fs.writeFile(filepath, JSON.stringify(credentials, null, 2))

  const loaded = await loadCoStrictCredentials()

  expect(loaded).toBeNull()
})

test("loadCoStrictCredentials returns null when base_url is missing", async () => {
  const testHome = process.env.COSTRICT_TEST_HOME
  if (!testHome) throw new Error("COSTRICT_TEST_HOME not set")

  const credentials = {
    id: "opencode",
    name: "OpenCode Auth",
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    machine_id: "test-machine-id",
    expiry_date: Date.now() + 3600000,
    updated_at: new Date().toISOString(),
  }

  const filepath = join(testHome, ".costrict", "share", "auth.json")
  await fs.mkdir(join(testHome, ".costrict", "share"), { recursive: true })
  await fs.writeFile(filepath, JSON.stringify(credentials, null, 2))

  const loaded = await loadCoStrictCredentials()

  expect(loaded).toBeNull()
})

test("loadCoStrictCredentials returns null when file does not exist", async () => {
  const testHome = process.env.COSTRICT_TEST_HOME
  if (!testHome) throw new Error("COSTRICT_TEST_HOME not set")

  const loaded = await loadCoStrictCredentials()

  expect(loaded).toBeNull()
})

test("loadCoStrictCredentials returns null for corrupted JSON", async () => {
  const testHome = process.env.COSTRICT_TEST_HOME
  if (!testHome) throw new Error("COSTRICT_TEST_HOME not set")

  const filepath = join(testHome, ".costrict", "share", "auth.json")
  await fs.mkdir(join(testHome, ".costrict", "share"), { recursive: true })
  await fs.writeFile(filepath, "invalid json {{{")

  const loaded = await loadCoStrictCredentials()

  expect(loaded).toBeNull()
})

test("generateMachineId creates stable SHA256 hash", () => {
  const id1 = generateMachineId()
  const id2 = generateMachineId()

  expect(id1).toBe(id2)
  expect(id1).toMatch(/^[0-9a-f]{64}$/) // SHA256 produces 64 hex chars
})

test("getCoStrictCredentialsPath returns correct path", () => {
  const path = getCoStrictCredentialsPath()

  expect(path).toContain(".costrict")
  expect(path).toContain("share")
  expect(path).toContain("auth.json")
})
