import { websocket, upgradeWebSocket } from "hono/bun"

export { websocket, upgradeWebSocket }

export function serveApp(args: {
  hostname: string
  port: number
  idleTimeout: number
  fetch: (request: Request) => Response | Promise<Response>
  websocket: typeof websocket
}) {
  const tryServe = (port: number) => {
    try {
      return Bun.serve({ ...args, port })
    } catch {
      return undefined
    }
  }

  const server = args.port === 0 ? (tryServe(4096) ?? tryServe(0)) : tryServe(args.port)
  if (!server) throw new Error(`Failed to start server on port ${args.port}`)
  return server
}
