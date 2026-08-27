import { join } from "path"

const host = process.env.VITE_CLOUD_SERVER_HOST ?? "localhost"
const port = process.env.VITE_CLOUD_SERVER_PORT ?? "18080"
const appPort = parseInt(process.env.VITE_APP_PORT ?? "3000")
const prefix = process.env.VITE_API_PREFIX ?? ""
const basePath = (process.env.VITE_BASE_PATH ?? "").replace(/\/+$/, "") // e.g. "/costrict-web-portal"
const dist = join(import.meta.dir, "../dist")
const STATIC_CACHE_CONTROL = "public, max-age=2592000, immutable"
const ENTRY_CACHE_CONTROL = "no-cache, no-store, must-revalidate"
const types = new Set([
  "application/javascript",
  "application/json",
  "application/manifest+json",
  "application/wasm",
  "application/xml",
  "image/svg+xml",
  "text/css",
  "text/javascript",
  "text/plain",
  "text/xml",
])

const rewrite = (p: string) => p.replace(new RegExp(`^${prefix}`), "")

/** Strip the deployment base path prefix so static files resolve to dist/ */
const stripBase = (p: string) =>
  basePath && p.startsWith(basePath) ? p.slice(basePath.length) || "/" : p

const isEntryDocument = (p: string) => p === "/" || p.endsWith(".html")

const isCompressible = (file: Bun.BunFile, p: string) => {
  if (p.endsWith(".gz")) return false
  const mime = file.type.split(";")[0]
  return mime.startsWith("text/") || types.has(mime)
}

const wantsGzip = (req: Request) => {
  const enc = req.headers.get("accept-encoding") ?? ""
  return /\bgzip\b/i.test(enc) && !/\bgzip\s*;\s*q=0(?:\.0+)?\b/i.test(enc)
}

const withCacheHeaders = (file: Bun.BunFile, cacheControl: string) =>
  new Response(file, {
    headers: {
      "Cache-Control": cacheControl,
      Vary: "Accept-Encoding",
      ...(cacheControl === ENTRY_CACHE_CONTROL
        ? {
            Pragma: "no-cache",
            Expires: "0",
          }
        : {}),
    },
  })

const withGzipHeaders = (body: BodyInit, type: string, cacheControl: string) =>
  new Response(body, {
    headers: {
      "Cache-Control": cacheControl,
      "Content-Encoding": "gzip",
      "Content-Type": type || "application/octet-stream",
      Vary: "Accept-Encoding",
      ...(cacheControl === ENTRY_CACHE_CONTROL
        ? {
            Pragma: "no-cache",
            Expires: "0",
          }
        : {}),
    },
  })

const serve = async (req: Request, p: string, cacheControl: string) => {
  const file = Bun.file(join(dist, p))
  if (!(await file.exists())) return
  if (req.headers.has("range") || !wantsGzip(req) || !isCompressible(file, p)) {
    return withCacheHeaders(file, cacheControl)
  }

  const pre = Bun.file(join(dist, `${p}.gz`))
  if (await pre.exists()) {
    return withGzipHeaders(pre, file.type, cacheControl)
  }

  return withCacheHeaders(file, cacheControl)
}

const proxyHttp = async (req: Request) => {
  const url = new URL(req.url)
  url.hostname = host
  url.port = port
  url.protocol = "http:"
  url.pathname = rewrite(url.pathname)
  // redirect:"manual" so 3xx responses pass through to the browser instead of
  // being followed server-side. OAuth login (/api/auth/login → casdoor) and the
  // login callback (/api/auth/callback, which sets the session cookie on a 302)
  // rely on the browser receiving the redirect + Set-Cookie directly; following
  // them here chases host-only URLs the container can't reach and swallows the
  // Set-Cookie.
  return fetch(new Request(url.toString(), req), { redirect: "manual" })
}

Bun.serve({
  port: appPort,
  hostname: "0.0.0.0",
  fetch(req, server) {
    const url = new URL(req.url)
    const path = url.pathname

    if (path.startsWith(`${prefix}/cloud`)) {
      const upgraded = server.upgrade(req, { data: { path } } as any)
      if (upgraded) return
      return proxyHttp(req)
    }

    if (path.startsWith(`${prefix}/api`)) return proxyHttp(req)

    const filePath = stripBase(path)
    return serve(
      req,
      filePath,
      isEntryDocument(filePath) ? ENTRY_CACHE_CONTROL : STATIC_CACHE_CONTROL,
    ).then(
      (res) =>
        res ?? withCacheHeaders(Bun.file(join(dist, "index.html")), ENTRY_CACHE_CONTROL),
    )
  },
  websocket: {
    async open(ws) {
      const path = (ws.data as any).path
      const upstream = new WebSocket(`ws://${host}:${port}${rewrite(path)}`)
      upstream.binaryType = "arraybuffer"
      ;(ws.data as any).upstream = upstream

      upstream.onmessage = (e) => ws.send(e.data)
      upstream.onclose = (e) => ws.close(e.code, e.reason)
      upstream.onerror = () => ws.close(1011, "upstream error")
    },
    message(ws, msg) {
      const upstream: WebSocket = (ws.data as any).upstream
      if (upstream?.readyState === WebSocket.OPEN) upstream.send(msg)
    },
    close(ws, code, reason) {
      const upstream: WebSocket = (ws.data as any).upstream
      upstream?.close(code, reason)
    },
  },
})

console.log(`Listening on http://0.0.0.0:${appPort}`)
