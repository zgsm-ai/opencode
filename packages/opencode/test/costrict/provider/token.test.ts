import { test, expect, mock } from "bun:test"
import {
  isCoStrictTokenValid,
  refreshCoStrictToken,
  parseJWT,
  extractExpiryFromJWT,
} from "../../../src/costrict/provider/token"
import type { CoStrictCredentials } from "../../../src/costrict/provider/credentials"
import { APICallError } from "ai"

test("isCoStrictTokenValid: validates token using expiry_date strategy (valid token)", () => {
  const credentials: CoStrictCredentials = {
    id: "opencode",
    name: "OpenCode Auth",
    access_token: "test-access-token",
    machine_id: "test-machine-id",
    base_url: "https://test.example.com",
    expiry_date: Date.now() + 60 * 60 * 1000, // 1 hour from now
    updated_at: new Date().toISOString(),
  }

  const isValid = isCoStrictTokenValid(credentials)

  expect(isValid).toBe(true)
})

test("isCoStrictTokenValid: validates token using expiry_date strategy (expiring soon)", () => {
  const credentials: CoStrictCredentials = {
    id: "opencode",
    name: "OpenCode Auth",
    access_token: "test-access-token",
    machine_id: "test-machine-id",
    base_url: "https://test.example.com",
    expiry_date: Date.now() + 20 * 60 * 1000, // 20 minutes from now (less than 30 min buffer)
    updated_at: new Date().toISOString(),
  }

  const isValid = isCoStrictTokenValid(credentials)

  expect(isValid).toBe(false)
})

test("isCoStrictTokenValid: validates token using refresh_token JWT strategy (valid)", () => {
  // Helper function to create a JWT token
  function createJWT(exp: number): string {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
    const payload = Buffer.from(JSON.stringify({ exp, iat: Math.floor(Date.now() / 1000) })).toString("base64url")
    const signature = "signature"
    return `${header}.${payload}.${signature}`
  }

  const futureExp = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
  const credentials: CoStrictCredentials = {
    id: "opencode",
    name: "OpenCode Auth",
    access_token: "test-access-token",
    refresh_token: createJWT(futureExp),
    machine_id: "test-machine-id",
    base_url: "https://test.example.com",
    expiry_date: undefined as any, // Test fallback to refresh_token JWT
    updated_at: new Date().toISOString(),
  }

  const isValid = isCoStrictTokenValid(credentials)

  expect(isValid).toBe(true)
})

test("isCoStrictTokenValid: validates token using refresh_token JWT strategy (expired)", () => {
  function createJWT(exp: number): string {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
    const payload = Buffer.from(JSON.stringify({ exp, iat: Math.floor(Date.now() / 1000) })).toString("base64url")
    const signature = "signature"
    return `${header}.${payload}.${signature}`
  }

  const pastExp = Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
  const credentials: CoStrictCredentials = {
    id: "opencode",
    name: "OpenCode Auth",
    access_token: "test-access-token",
    refresh_token: createJWT(pastExp),
    machine_id: "test-machine-id",
    base_url: "https://test.example.com",
    expiry_date: undefined as any, // Test fallback to refresh_token JWT
    updated_at: new Date().toISOString(),
  }

  const isValid = isCoStrictTokenValid(credentials)

  expect(isValid).toBe(false)
})

test("isCoStrictTokenValid: validates token using access_token JWT strategy (valid)", () => {
  function createJWT(exp: number): string {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
    const payload = Buffer.from(JSON.stringify({ exp, iat: Math.floor(Date.now() / 1000) })).toString("base64url")
    const signature = "signature"
    return `${header}.${payload}.${signature}`
  }

  const futureExp = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
  const credentials: CoStrictCredentials = {
    id: "opencode",
    name: "OpenCode Auth",
    access_token: createJWT(futureExp),
    machine_id: "test-machine-id",
    base_url: "https://test.example.com",
    expiry_date: undefined as any, // Test fallback to access_token JWT
    updated_at: new Date().toISOString(),
  }

  const isValid = isCoStrictTokenValid(credentials)

  expect(isValid).toBe(true)
})

test("isCoStrictTokenValid: validates token using access_token JWT strategy (expiring soon)", () => {
  function createJWT(exp: number): string {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
    const payload = Buffer.from(JSON.stringify({ exp, iat: Math.floor(Date.now() / 1000) })).toString("base64url")
    const signature = "signature"
    return `${header}.${payload}.${signature}`
  }

  const futureExp = Math.floor(Date.now() / 1000) + 20 * 60 // 20 minutes from now
  const credentials: CoStrictCredentials = {
    id: "opencode",
    name: "OpenCode Auth",
    access_token: createJWT(futureExp),
    machine_id: "test-machine-id",
    base_url: "https://test.example.com",
    expiry_date: undefined as any, // Test fallback to access_token JWT
    updated_at: new Date().toISOString(),
  }

  const isValid = isCoStrictTokenValid(credentials)

  expect(isValid).toBe(false)
})

test("isCoStrictTokenValid: returns false when all validation strategies fail", () => {
  const credentials: CoStrictCredentials = {
    id: "opencode",
    name: "OpenCode Auth",
    access_token: "invalid-jwt-token",
    machine_id: "test-machine-id",
    base_url: "https://test.example.com",
    expiry_date: undefined as any, // Test fallback to access_token JWT
    updated_at: new Date().toISOString(),
  }

  const isValid = isCoStrictTokenValid(credentials)

  expect(isValid).toBe(false)
})

test("refreshCoStrictToken: refreshes token with state parameter", async () => {
  const originalFetch = globalThis.fetch
  const mockFetch = mock(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
        }),
      headers: new Headers(),
      text: () => Promise.resolve(""),
    }),
  )

  globalThis.fetch = mockFetch as unknown as typeof fetch

  try {
    const result = await refreshCoStrictToken({
      baseUrl: "https://test.example.com",
      refreshToken: "test-refresh-token",
      state: "test-state",
    })

    expect(result.access_token).toBe("new-access-token")
    expect(result.refresh_token).toBe("new-refresh-token")

    // Verify fetch was called with correct parameters
    expect(mockFetch).toHaveBeenCalled()
    const calls = mockFetch.mock.calls as any[][]
    expect(calls.length).toBeGreaterThan(0)
    if (calls.length > 0 && calls[0] && calls[0][0]) {
      const url = calls[0][0] as string
      expect(url).toContain("state=test-state")
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("refreshCoStrictToken: refreshes token without state parameter", async () => {
  const originalFetch = globalThis.fetch
  const mockFetch = mock(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
        }),
      headers: new Headers(),
      text: () => Promise.resolve(""),
    }),
  )

  globalThis.fetch = mockFetch as unknown as typeof fetch

  try {
    const result = await refreshCoStrictToken({
      baseUrl: "https://test.example.com",
      refreshToken: "test-refresh-token",
    })

    expect(result.access_token).toBe("new-access-token")
    expect(result.refresh_token).toBe("new-refresh-token")

    // Verify fetch was called without state parameter
    expect(mockFetch).toHaveBeenCalled()
    const calls = mockFetch.mock.calls as any[][]
    expect(calls.length).toBeGreaterThan(0)
    if (calls.length > 0 && calls[0] && calls[0][0]) {
      const url = calls[0][0] as string
      expect(url).not.toContain("state=")
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("refreshCoStrictToken: throws APICallError on 401 response", async () => {
  const originalFetch = globalThis.fetch
  const mockFetch = mock(() =>
    Promise.resolve({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "Unauthorized" }),
      headers: new Headers(),
      text: () => Promise.resolve("Unauthorized"),
    }),
  )

  globalThis.fetch = mockFetch as unknown as typeof fetch

  try {
    await expect(
      refreshCoStrictToken({
        baseUrl: "https://test.example.com",
        refreshToken: "test-refresh-token",
      }),
    ).rejects.toThrow(APICallError)

    try {
      await refreshCoStrictToken({
        baseUrl: "https://test.example.com",
        refreshToken: "test-refresh-token",
      })
    } catch (error: any) {
      expect(error.message).toContain("Refresh token is invalid or expired")
      expect(error.statusCode).toBe(401)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("refreshCoStrictToken: throws APICallError on 400 response", async () => {
  const originalFetch = globalThis.fetch
  const mockFetch = mock(() =>
    Promise.resolve({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "Bad Request" }),
      headers: new Headers(),
      text: () => Promise.resolve("Bad Request"),
    }),
  )

  globalThis.fetch = mockFetch as unknown as typeof fetch

  try {
    await expect(
      refreshCoStrictToken({
        baseUrl: "https://test.example.com",
        refreshToken: "test-refresh-token",
      }),
    ).rejects.toThrow(APICallError)

    try {
      await refreshCoStrictToken({
        baseUrl: "https://test.example.com",
        refreshToken: "test-refresh-token",
      })
    } catch (error: any) {
      expect(error.message).toContain("Refresh token is invalid or expired")
      expect(error.statusCode).toBe(400)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("refreshCoStrictToken: throws APICallError when response missing required fields", async () => {
  const originalFetch = globalThis.fetch
  const mockFetch = mock(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ access_token: "new-access-token" }), // Missing refresh_token
      headers: new Headers(),
      text: () => Promise.resolve(""),
    }),
  )

  globalThis.fetch = mockFetch as unknown as typeof fetch

  try {
    await expect(
      refreshCoStrictToken({
        baseUrl: "https://test.example.com",
        refreshToken: "test-refresh-token",
      }),
    ).rejects.toThrow(APICallError)

    try {
      await refreshCoStrictToken({
        baseUrl: "https://test.example.com",
        refreshToken: "test-refresh-token",
      })
    } catch (error: any) {
      expect(error.message).toContain("Token refresh response is missing required fields")
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("parseJWT: extracts payload from valid JWT", () => {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
  const payload = Buffer.from(JSON.stringify({ exp: 1234567890, iat: 1234567800, userId: "test-user" })).toString(
    "base64url",
  )
  const signature = "signature"
  const token = `${header}.${payload}.${signature}`

  const parsed = parseJWT(token)

  expect(parsed.exp).toBe(1234567890)
  expect(parsed.iat).toBe(1234567800)
  expect(parsed.userId).toBe("test-user")
})

test("parseJWT: throws error for invalid JWT format", () => {
  expect(() => parseJWT("invalid-token")).toThrow("Invalid JWT format")
})

test("extractExpiryFromJWT: returns expiry timestamp", () => {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
  const payload = Buffer.from(JSON.stringify({ exp: 1234567890 })).toString("base64url")
  const signature = "signature"
  const token = `${header}.${payload}.${signature}`

  const expiry = extractExpiryFromJWT(token)

  expect(expiry).toBe(1234567890000) // Converted to milliseconds
})

test("extractExpiryFromJWT: returns 0 for JWT without exp", () => {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
  const payload = Buffer.from(JSON.stringify({ userId: "test-user" })).toString("base64url")
  const signature = "signature"
  const token = `${header}.${payload}.${signature}`

  const expiry = extractExpiryFromJWT(token)

  expect(expiry).toBe(0)
})

test("extractExpiryFromJWT: returns 0 for invalid JWT", () => {
  const expiry = extractExpiryFromJWT("invalid-token")

  expect(expiry).toBe(0)
})
