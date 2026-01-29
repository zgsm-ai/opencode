import { test, expect, mock } from "bun:test"
import { promises as fs } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { createCoStrictCustomLoader } from "../../../src/costrict/provider/index"
import { Installation } from "../../../src/installation/index"
import { clearModelCache } from "../../../src/costrict/provider/models"

// Mock homedir to use temp directory
mock.module("node:os", () => ({
  homedir: () => process.env.COSTRICT_TEST_HOME || homedir(),
  platform: () => "linux",
  hostname: () => "test-host",
  userInfo: () => ({ username: "test-user" }),
}))

test("createCoStrictCustomLoader: conditional refresh with refresh_token and invalid token", async () => {
  const testHome = process.env.COSTRICT_TEST_HOME
  if (!testHome) throw new Error("COSTRICT_TEST_HOME not set")

  // Create credentials with expired token
  const credentials = {
    id: "opencode",
    name: "OpenCode Auth",
    access_token: "expired-access-token",
    refresh_token: "valid-refresh-token",
    state: "test-state",
    machine_id: "test-machine-id",
    base_url: "https://test.example.com",
    expiry_date: Date.now() - 3600000, // Expired
    updated_at: new Date().toISOString(),
  }

  const filepath = join(testHome, ".costrict", "share", "auth.json")
  await fs.mkdir(join(testHome, ".costrict", "share"), { recursive: true })
  await fs.writeFile(filepath, JSON.stringify(credentials, null, 2))

  // Mock fetch for models and token refresh
  const originalFetch = globalThis.fetch
  const mockFetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()

    if (url.includes("/models")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [{ id: "gpt-4", name: "GPT-4" }] }),
        headers: new Headers(),
        text: () => Promise.resolve(""),
      })
    }

    if (url.includes("/login/token")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: "new-access-token",
            refresh_token: "new-refresh-token",
          }),
        headers: new Headers(),
        text: () => Promise.resolve(""),
      })
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      headers: new Headers(),
      text: () => Promise.resolve(""),
    })
  })

  globalThis.fetch = mockFetch as unknown as typeof fetch

  try {
    const provider = { id: "costrict", name: "CoStrict", api: "https://test.example.com" }
    const loaderConfig = await createCoStrictCustomLoader(provider)

    expect(loaderConfig.autoload).toBe(true)
    expect(loaderConfig.options.baseURL).toBe("https://test.example.com/chat-rag/api/v1")
    expect(loaderConfig.models).toBeDefined()
    expect(loaderConfig.models["gpt-4"]).toBeDefined()

    // Verify token was refreshed
    expect(mockFetch).toHaveBeenCalled()
    const calls = mockFetch.mock.calls as any[][]
    const refreshCalls = calls.filter((call) => call[0]?.toString().includes("/login/token"))
    expect(refreshCalls.length).toBeGreaterThan(0)
  } finally {
    globalThis.fetch = originalFetch
    await fs.unlink(filepath).catch(() => {})
  }
})

test("createCoStrictCustomLoader: conditional refresh with refresh_token and valid token", async () => {
  const testHome = process.env.COSTRICT_TEST_HOME
  if (!testHome) throw new Error("COSTRICT_TEST_HOME not set")

  // Create credentials with valid token
  const credentials = {
    id: "opencode",
    name: "OpenCode Auth",
    access_token: "valid-access-token",
    refresh_token: "valid-refresh-token",
    state: "test-state",
    machine_id: "test-machine-id",
    base_url: "https://test.example.com",
    expiry_date: Date.now() + 3600000, // Valid
    updated_at: new Date().toISOString(),
  }

  const filepath = join(testHome, ".costrict", "share", "auth.json")
  await fs.mkdir(join(testHome, ".costrict", "share"), { recursive: true })
  await fs.writeFile(filepath, JSON.stringify(credentials, null, 2))

  // Mock fetch for models only (should not refresh token)
  const originalFetch = globalThis.fetch
  const mockFetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()

    if (url.includes("/models")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [{ id: "gpt-4", name: "GPT-4" }] }),
        headers: new Headers(),
        text: () => Promise.resolve(""),
      })
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      headers: new Headers(),
      text: () => Promise.resolve(""),
    })
  })

  globalThis.fetch = mockFetch as unknown as typeof fetch

  try {
    const provider = { id: "costrict", name: "CoStrict", api: "https://test.example.com" }
    const loaderConfig = await createCoStrictCustomLoader(provider)

    expect(loaderConfig.autoload).toBe(true)
    expect(loaderConfig.options.baseURL).toBe("https://test.example.com/chat-rag/api/v1")
    expect(loaderConfig.models).toBeDefined()

    // Verify token was NOT refreshed
    const calls = mockFetch.mock.calls as any[][]
    const refreshCalls = calls.filter((call) => call[0]?.toString().includes("/login/token"))
    expect(refreshCalls.length).toBe(0)
  } finally {
    globalThis.fetch = originalFetch
    await fs.unlink(filepath).catch(() => {})
  }
})

test("createCoStrictCustomLoader: conditional refresh without refresh_token", async () => {
  const testHome = process.env.COSTRICT_TEST_HOME
  if (!testHome) throw new Error("COSTRICT_TEST_HOME not set")

  // Create credentials without refresh_token
  const credentials = {
    id: "opencode",
    name: "OpenCode Auth",
    access_token: "valid-access-token",
    machine_id: "test-machine-id",
    base_url: "https://test.example.com",
    expiry_date: Date.now() + 3600000,
    updated_at: new Date().toISOString(),
  }

  const filepath = join(testHome, ".costrict", "share", "auth.json")
  await fs.mkdir(join(testHome, ".costrict", "share"), { recursive: true })
  await fs.writeFile(filepath, JSON.stringify(credentials, null, 2))

  // Mock fetch for models only
  const originalFetch = globalThis.fetch
  const mockFetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()

    if (url.includes("/models")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [{ id: "gpt-4", name: "GPT-4" }] }),
        headers: new Headers(),
        text: () => Promise.resolve(""),
      })
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      headers: new Headers(),
      text: () => Promise.resolve(""),
    })
  })

  globalThis.fetch = mockFetch as unknown as typeof fetch

  try {
    const provider = { id: "costrict", name: "CoStrict", api: "https://test.example.com" }
    const loaderConfig = await createCoStrictCustomLoader(provider)

    expect(loaderConfig.autoload).toBe(true)
    expect(loaderConfig.options.baseURL).toBe("https://test.example.com/chat-rag/api/v1")
    expect(loaderConfig.models).toBeDefined()

    // Verify token was NOT refreshed
    const calls = mockFetch.mock.calls as any[][]
    const refreshCalls = calls.filter((call) => call[0]?.toString().includes("/login/token"))
    expect(refreshCalls.length).toBe(0)
  } finally {
    globalThis.fetch = originalFetch
    await fs.unlink(filepath).catch(() => {})
  }
})

test("createCoStrictCustomLoader: custom headers include zgsm-client-id", async () => {
  const testHome = process.env.COSTRICT_TEST_HOME
  if (!testHome) throw new Error("COSTRICT_TEST_HOME not set")

  // Create credentials
  const credentials = {
    id: "opencode",
    name: "OpenCode Auth",
    access_token: "valid-access-token",
    machine_id: "test-machine-id",
    base_url: "https://test.example.com",
    expiry_date: Date.now() + 3600000,
    updated_at: new Date().toISOString(),
  }

  const filepath = join(testHome, ".costrict", "share", "auth.json")
  await fs.mkdir(join(testHome, ".costrict", "share"), { recursive: true })
  await fs.writeFile(filepath, JSON.stringify(credentials, null, 2))

  // Mock fetch to capture headers
  const originalFetch = globalThis.fetch
  const mockFetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()

    if (url.includes("/models")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [{ id: "gpt-4", name: "GPT-4" }] }),
        headers: new Headers(),
        text: () => Promise.resolve(""),
      })
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      headers: new Headers(),
      text: () => Promise.resolve(""),
    })
  })

  globalThis.fetch = mockFetch as unknown as typeof fetch

  try {
    const provider = { id: "costrict", name: "CoStrict", api: "https://test.example.com" }
    const loaderConfig = await createCoStrictCustomLoader(provider)

    expect(loaderConfig.autoload).toBe(true)
    expect(loaderConfig.options.fetch).toBeDefined()

    // Use the fetch function to verify headers
    const response = await loaderConfig.options.fetch("https://test.example.com/test", {})

    // Verify fetch was called
    expect(mockFetch).toHaveBeenCalled()
    const calls = mockFetch.mock.calls as any[][]
    expect(calls.length).toBeGreaterThan(0)

    // Verify headers include zgsm-client-id
    if (calls[0] && calls[0][1]) {
      const headers = calls[0][1].headers as Headers
      expect(headers.get("zgsm-client-id")).toBe(Installation.getInstallationId())
    }
  } finally {
    globalThis.fetch = originalFetch
    await fs.unlink(filepath).catch(() => {})
  }
})

test("createCoStrictCustomLoader: custom headers include zgsm-client-ide", async () => {
  const testHome = process.env.COSTRICT_TEST_HOME
  if (!testHome) throw new Error("COSTRICT_TEST_HOME not set")

  // Create credentials
  const credentials = {
    id: "opencode",
    name: "OpenCode Auth",
    access_token: "valid-access-token",
    machine_id: "test-machine-id",
    base_url: "https://test.example.com",
    expiry_date: Date.now() + 3600000,
    updated_at: new Date().toISOString(),
  }

  const filepath = join(testHome, ".costrict", "share", "auth.json")
  await fs.mkdir(join(testHome, ".costrict", "share"), { recursive: true })
  await fs.writeFile(filepath, JSON.stringify(credentials, null, 2))

  // Mock fetch to capture headers
  const originalFetch = globalThis.fetch
  const mockFetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()

    if (url.includes("/models")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [{ id: "gpt-4", name: "GPT-4" }] }),
        headers: new Headers(),
        text: () => Promise.resolve(""),
      })
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      headers: new Headers(),
      text: () => Promise.resolve(""),
    })
  })

  globalThis.fetch = mockFetch as unknown as typeof fetch

  try {
    const provider = { id: "costrict", name: "CoStrict", api: "https://test.example.com" }
    const loaderConfig = await createCoStrictCustomLoader(provider)

    expect(loaderConfig.autoload).toBe(true)
    expect(loaderConfig.options.fetch).toBeDefined()

    // Use the fetch function to verify headers
    const response = await loaderConfig.options.fetch("https://test.example.com/test", {})

    // Verify fetch was called
    expect(mockFetch).toHaveBeenCalled()
    const calls = mockFetch.mock.calls as any[][]
    expect(calls.length).toBeGreaterThan(0)

    // Verify headers include zgsm-client-ide
    if (calls[0] && calls[0][1]) {
      const headers = calls[0][1].headers as Headers
      expect(headers.get("zgsm-client-ide")).toBe("cli")
    }
  } finally {
    globalThis.fetch = originalFetch
    await fs.unlink(filepath).catch(() => {})
  }
})

test("createCoStrictCustomLoader: output limit is 8192", async () => {
  const testHome = process.env.COSTRICT_TEST_HOME
  if (!testHome) throw new Error("COSTRICT_TEST_HOME not set")

  // Create credentials
  const credentials = {
    id: "opencode",
    name: "OpenCode Auth",
    access_token: "valid-access-token",
    machine_id: "test-machine-id",
    base_url: "https://test.example.com",
    expiry_date: Date.now() + 3600000,
    updated_at: new Date().toISOString(),
  }

  const filepath = join(testHome, ".costrict", "share", "auth.json")
  await fs.mkdir(join(testHome, ".costrict", "share"), { recursive: true })
  await fs.writeFile(filepath, JSON.stringify(credentials, null, 2))

  // Mock fetch for models
  const originalFetch = globalThis.fetch
  const mockFetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()

    if (url.includes("/models")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [{ id: "gpt-4", name: "GPT-4" }] }),
        headers: new Headers(),
        text: () => Promise.resolve(""),
      })
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      headers: new Headers(),
      text: () => Promise.resolve(""),
    })
  })

  globalThis.fetch = mockFetch as unknown as typeof fetch

  try {
    const provider = { id: "costrict", name: "CoStrict", api: "https://test.example.com" }
    const loaderConfig = await createCoStrictCustomLoader(provider)

    expect(loaderConfig.autoload).toBe(true)
    expect(loaderConfig.models).toBeDefined()

    // Verify output limit is 8192
    if (loaderConfig.models && loaderConfig.models["gpt-4"]) {
      expect(loaderConfig.models["gpt-4"].limit.output).toBe(8192)
    }
  } finally {
    globalThis.fetch = originalFetch
    await fs.unlink(filepath).catch(() => {})
  }
})

test("createCoStrictCustomLoader: 401 error recovery with refresh_token", async () => {
  const testHome = process.env.COSTRICT_TEST_HOME
  if (!testHome) throw new Error("COSTRICT_TEST_HOME not set")

  // Create credentials with refresh_token
  const credentials = {
    id: "opencode",
    name: "OpenCode Auth",
    access_token: "expired-access-token",
    refresh_token: "valid-refresh-token",
    state: "test-state",
    machine_id: "test-machine-id",
    base_url: "https://test.example.com",
    expiry_date: Date.now() + 3600000,
    updated_at: new Date().toISOString(),
  }

  const filepath = join(testHome, ".costrict", "share", "auth.json")
  await fs.mkdir(join(testHome, ".costrict", "share"), { recursive: true })
  await fs.writeFile(filepath, JSON.stringify(credentials, null, 2))

  // Mock fetch to return 401 first, then 200 after refresh
  let callCount = 0
  const originalFetch = globalThis.fetch
  const mockFetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()

    // Handle token refresh first
    if (url.includes("/login/token")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: "new-access-token",
            refresh_token: "new-refresh-token",
          }),
        headers: new Headers(),
        text: () => Promise.resolve(""),
      })
    }

    // Handle models endpoint
    if (url.includes("/models")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [{ id: "gpt-4", name: "GPT-4" }] }),
        headers: new Headers(),
        text: () => Promise.resolve(""),
      })
    }

    // Handle test endpoint - return 401 first, then 200
    if (url.includes("/test")) {
      callCount++
      if (callCount === 1) {
        // First call returns 401
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: "Unauthorized" }),
          headers: new Headers(),
          text: () => Promise.resolve("Unauthorized"),
        })
      } else {
        // Second call after refresh returns 200
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: [{ id: "gpt-4", name: "GPT-4" }] }),
          headers: new Headers(),
          text: () => Promise.resolve(""),
        })
      }
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      headers: new Headers(),
      text: () => Promise.resolve(""),
    })
  })

  globalThis.fetch = mockFetch as unknown as typeof fetch

  try {
    const provider = { id: "costrict", name: "CoStrict", api: "https://test.example.com" }
    const loaderConfig = await createCoStrictCustomLoader(provider)

    expect(loaderConfig.autoload).toBe(true)
    expect(loaderConfig.options.fetch).toBeDefined()

    // Use the fetch function to trigger 401 recovery
    const response = await loaderConfig.options.fetch("https://test.example.com/test", {})

    // Verify token was refreshed
    const calls = mockFetch.mock.calls as any[][]
    const refreshCalls = calls.filter((call) => call[0]?.toString().includes("/login/token"))
    expect(refreshCalls.length).toBeGreaterThan(0)
  } finally {
    globalThis.fetch = originalFetch
    await fs.unlink(filepath).catch(() => {})
  }
})

test("createCoStrictCustomLoader: 401 error recovery without refresh_token", async () => {
  const testHome = process.env.COSTRICT_TEST_HOME
  if (!testHome) throw new Error("COSTRICT_TEST_HOME not set")

  // Create credentials without refresh_token
  const credentials = {
    id: "opencode",
    name: "OpenCode Auth",
    access_token: "expired-access-token",
    machine_id: "test-machine-id",
    base_url: "https://test.example.com",
    expiry_date: Date.now() + 3600000,
    updated_at: new Date().toISOString(),
  }

  const filepath = join(testHome, ".costrict", "share", "auth.json")
  await fs.mkdir(join(testHome, ".costrict", "share"), { recursive: true })
  await fs.writeFile(filepath, JSON.stringify(credentials, null, 2))

  // Mock fetch to return 401
  const originalFetch = globalThis.fetch
  const mockFetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()

    if (url.includes("/models")) {
      return Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: "Unauthorized" }),
        headers: new Headers(),
        text: () => Promise.resolve("Unauthorized"),
      })
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      headers: new Headers(),
      text: () => Promise.resolve(""),
    })
  })

  globalThis.fetch = mockFetch as unknown as typeof fetch

  try {
    const provider = { id: "costrict", name: "CoStrict", api: "https://test.example.com" }
    const loaderConfig = await createCoStrictCustomLoader(provider)

    expect(loaderConfig.autoload).toBe(true)
    expect(loaderConfig.options.fetch).toBeDefined()

    // Use the fetch function to trigger 401
    const response = await loaderConfig.options.fetch("https://test.example.com/test", {})

    // Verify token was NOT refreshed
    const calls = mockFetch.mock.calls as any[][]
    const refreshCalls = calls.filter((call) => call[0]?.toString().includes("/login/token"))
    expect(refreshCalls.length).toBe(0)
  } finally {
    globalThis.fetch = originalFetch
    await fs.unlink(filepath).catch(() => {})
  }
})

test("createCoStrictCustomLoader: provider visible without credentials", async () => {
  const testHome = process.env.COSTRICT_TEST_HOME
  if (!testHome) throw new Error("COSTRICT_TEST_HOME not set")

  // Don't create credentials file
  const filepath = join(testHome, ".costrict", "share", "auth.json")
  await fs.mkdir(join(testHome, ".costrict", "share"), { recursive: true })

  // Mock fetch for models
  const originalFetch = globalThis.fetch
  const mockFetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()

    if (url.includes("/models")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [{ id: "gpt-4", name: "GPT-4" }] }),
        headers: new Headers(),
        text: () => Promise.resolve(""),
      })
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      headers: new Headers(),
      text: () => Promise.resolve(""),
    })
  })

  globalThis.fetch = mockFetch as unknown as typeof fetch

  try {
    const provider = { id: "costrict", name: "CoStrict", api: "https://test.example.com" }
    const loaderConfig = await createCoStrictCustomLoader(provider)

    // Provider should still be visible
    expect(loaderConfig.autoload).toBe(true)
    expect(loaderConfig.options.baseURL).toBe("https://test.example.com/chat-rag/api/v1")

    // But should not have models
    expect(loaderConfig.models).toBeUndefined()
  } finally {
    globalThis.fetch = originalFetch
    await fs.unlink(filepath).catch(() => {})
  }
})
