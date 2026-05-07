export type TransportOpts = {
  baseUrl: string
  headers?: HeadersInit
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
  directory?: string
}

type Query = Record<string, string | number | boolean | undefined>

function join(base: string, path: string) {
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`
}

function buildQuery(path: string, input?: Query) {
  if (!input) return path
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue
    params.set(key, String(value))
  }
  const text = params.toString()
  if (!text) return path
  return `${path}?${text}`
}

export class DeviceHttpError extends Error {
  code: string
  status: number
  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = "DeviceHttpError"
    this.status = status
    this.code = code
  }
}

export function isBinaryFileError(e: unknown): boolean {
  if (e instanceof DeviceHttpError) return e.code === "BINARY_FILE"
  if (e && typeof e === "object") {
    const err = (e as any).error
    if (err && typeof err === "object" && err.code === "BINARY_FILE") return true
  }
  return false
}

export function createDeviceTransport(opts: TransportOpts) {
  const run = async <T>(method: string, path: string, input?: { query?: Query; body?: unknown; signal?: AbortSignal; directory?: string }) => {
    const fn = opts.fetch ?? globalThis.fetch
    const dir = input?.directory ?? opts.directory
    const res = await fn(join(opts.baseUrl, buildQuery(path, input?.query)), {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(dir ? { "X-Workspace-Directory": encodeURIComponent(dir) } : {}),
        ...opts.headers,
      },
      signal: input?.signal ?? opts.signal,
      body: method !== "GET" && method !== "HEAD" ? JSON.stringify(input?.body ?? {}) : undefined,
    })

    const rawText = await res.text().catch(() => "")
    let data: any
    try {
      data = rawText ? JSON.parse(rawText) : undefined
    } catch {
      data = undefined
    }

    if (!res.ok) {
      let payload = data
      if (payload && typeof payload === "object" && "ok" in payload && "error" in payload) {
        payload = payload.error
      }
      if (payload && typeof payload === "object") {
        throw new DeviceHttpError(payload.message ?? String(payload), res.status, payload.code ?? "UNKNOWN")
      }
      throw new DeviceHttpError(`Request failed: ${res.status}`, res.status, "UNKNOWN")
    }

    if (res.status === 204 || res.status === 205) return undefined as T

    if (data && typeof data === "object" && "ok" in data && "data" in data && data.data != null) {
      data = data.data
    }

    return data as T
  }

  return {
    get<T>(path: string, input?: Query & { directory?: string }, signal?: AbortSignal) {
      const { directory, ...query } = input ?? ({} as Query & { directory?: string })
      return run<T>("GET", path, { query, signal, directory })
    },
    post<T>(path: string, body?: unknown, signal?: AbortSignal) {
      return run<T>("POST", path, { body, signal })
    },
    put<T>(path: string, body?: unknown, signal?: AbortSignal) {
      return run<T>("PUT", path, { body, signal })
    },
    patch<T>(path: string, body?: unknown, signal?: AbortSignal) {
      return run<T>("PATCH", path, { body, signal })
    },
    delete<T>(path: string, signal?: AbortSignal) {
      return run<T>("DELETE", path, { signal })
    },
  }
}
