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

function query(path: string, input?: Query) {
  if (!input) return path
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue
    params.set(key, key === "path" ? encodeURIComponent(String(value)) : String(value))
  }
  const text = params.toString()
  if (!text) return path
  return `${path}?${text}`
}

async function parse(res: Response) {
  if (res.status === 204 || res.status === 205) return undefined
  const body = await res.json().catch(() => undefined)
  if (!body || typeof body !== "object") return body
  if ("ok" in body && "data" in body) return (body as any).data
  return body
}

export function createDeviceTransport(opts: TransportOpts) {
  const run = async <T>(method: string, path: string, input?: { query?: Query; body?: unknown; signal?: AbortSignal; directory?: string }) => {
    const fn = opts.fetch ?? globalThis.fetch
    const dir = input?.directory ?? opts.directory
    const res = await fn(join(opts.baseUrl, query(path, input?.query)), {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(dir ? { "X-Workspace-Directory": dir } : {}),
        ...opts.headers,
      },
      signal: input?.signal ?? opts.signal,
      body: method !== "GET" && method !== "HEAD" ? JSON.stringify(input?.body ?? {}) : undefined,
    })
    const data = await parse(res)
    if (!res.ok) {
      const message = data && typeof data === "object" && "error" in data
        ? (typeof (data as any).error === "object" ? ((data as any).error?.message ?? String((data as any).error)) : String((data as any).error))
        : `Request failed: ${res.status}`
      throw new Error(message)
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
