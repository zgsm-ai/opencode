import http from "node:http"
import { Readable } from "node:stream"
import { URL } from "node:url"
import type { MiddlewareHandler } from "hono"

type FetchHandler = (request: Request) => Response | Promise<Response>

export const websocket = undefined as never

export function upgradeWebSocket(_handler: unknown): MiddlewareHandler {
  return async (c) => {
    return c.json(
      {
        error: "WebSocket PTY endpoints are not supported in the Node.js source runtime",
      },
      501,
    )
  }
}

export function serveApp(args: {
  hostname: string
  port: number
  idleTimeout: number
  fetch: FetchHandler
  websocket?: unknown
}) {
  const requestedPort = args.port === 0 ? 4096 : args.port

  const server = http.createServer(async (req, res) => {
    try {
      const protocol = req.headers["x-forwarded-proto"] ?? "http"
      const authority = req.headers.host ?? `${args.hostname}:${requestedPort}`
      const url = new URL(req.url ?? "/", `${protocol}://${authority}`)
      const init: RequestInit = {
        method: req.method,
        headers: req.headers as Record<string, string>,
      }

      if (req.method !== "GET" && req.method !== "HEAD") {
        init.body = Readable.toWeb(req) as BodyInit
        init.duplex = "half"
      }

      const response = await args.fetch(new Request(url, init))
      res.statusCode = response.status
      response.headers.forEach((value, key) => {
        res.setHeader(key, value)
      })

      if (!response.body) {
        res.end()
        return
      }

      const body = Readable.fromWeb(response.body as globalThis.ReadableStream)
      body.on("error", () => {
        if (!res.writableEnded) res.destroy()
      })
      body.pipe(res)
    } catch (error) {
      res.statusCode = 500
      res.setHeader("content-type", "application/json; charset=utf-8")
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    }
  })

  server.keepAliveTimeout = args.idleTimeout * 1000
  server.headersTimeout = Math.max(server.keepAliveTimeout + 1000, 60_000)
  server.listen(requestedPort, args.hostname)

  return {
    hostname: args.hostname,
    port: requestedPort,
    url: new URL(`http://${args.hostname}:${requestedPort}`),
    stop(closeActiveConnections?: boolean) {
      return new Promise<void>((resolve, reject) => {
        const done = (error?: Error | null) => {
          if (error) reject(error)
          else resolve()
        }
        if (closeActiveConnections) {
          server.closeAllConnections()
        }
        server.close(done)
      })
    },
  }
}
