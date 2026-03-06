import { Server } from "../../server/server"
import { UI } from "../ui"
import { cmd } from "./cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "../../flag/flag"
import { Installation } from "../../installation"
import { Filesystem } from "../../util/filesystem"
import open from "open"
import path from "path"
import { networkInterfaces } from "os"
import net from "node:net"

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to acquire a free port")))
        return
      }
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve(address.port)
      })
    })
  })
}

async function waitForUrl(url: string) {
  const timeout = Date.now() + 120_000
  let message = ""

  while (Date.now() < timeout) {
    const result = await fetch(url)
      .then((response) => ({ ok: response.ok, message: `${response.status} ${response.statusText}` }))
      .catch((error) => ({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      }))

    if (result.ok) return
    message = result.message
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`Timed out waiting for ${url}${message ? ` (${message})` : ""}`)
}

async function appDir(input?: string) {
  if (input) {
    const root = path.resolve(input)
    const direct = path.join(root, "package.json")
    if (await Filesystem.exists(direct)) return root

    const nested = path.join(root, "packages", "app", "package.json")
    if (await Filesystem.exists(nested)) return path.dirname(nested)
    return
  }

  let current = process.cwd()

  while (true) {
    const app = path.join(current, "packages", "app", "package.json")
    const cli = path.join(current, "packages", "opencode", "package.json")
    if ((await Filesystem.exists(app)) && (await Filesystem.exists(cli))) {
      return path.dirname(app)
    }

    const parent = path.dirname(current)
    if (parent === current) return
    current = parent
  }
}

function bunPath() {
  const env = process.env.COSTRICT_BUN_PATH?.trim()
  if (env) return env
  if (Installation.isLocal()) return process.execPath
  return Bun.which("bun") ?? undefined
}

async function startLocalApp(input: { appDir: string; bun: string; backendHost: string; backendPort: number }) {
  const port = await freePort()
  const host = "127.0.0.1"
  const url = `http://localhost:${port}/?server=${encodeURIComponent(`http://${input.backendHost}:${input.backendPort}`)}`
  const proc = Bun.spawn({
    cmd: [input.bun, "run", "dev", "--", "--host", host, "--port", String(port)],
    cwd: input.appDir,
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      VITE_COSTRICT_SERVER_HOST: input.backendHost,
      VITE_COSTRICT_SERVER_PORT: String(input.backendPort),
      BUN_BE_BUN: "1",
    },
  })

  await waitForUrl(`http://${host}:${port}`)

  const stop = () => {
    if (proc.exitCode !== null) return
    proc.kill("SIGTERM")
  }

  process.once("exit", stop)

  return {
    appDir: input.appDir,
    port,
    proc,
    stop,
    url,
  }
}

function getNetworkIPs() {
  const nets = networkInterfaces()
  const results: string[] = []

  for (const name of Object.keys(nets)) {
    const net = nets[name]
    if (!net) continue

    for (const netInfo of net) {
      // Skip internal and non-IPv4 addresses
      if (netInfo.internal || netInfo.family !== "IPv4") continue

      // Skip Docker bridge networks (typically 172.x.x.x)
      if (netInfo.address.startsWith("172.")) continue

      results.push(netInfo.address)
    }
  }

  return results
}

export const WebCommand = cmd({
  command: "web",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "start costrict-cli server and open web interface",
  handler: async (args) => {
    if (!Flag.COSTRICT_SERVER_PASSWORD) {
      UI.println(UI.Style.TEXT_WARNING_BOLD + "!  " + "COSTRICT_SERVER_PASSWORD is not set; server is unsecured.")
    }
    const opts = await resolveNetworkOptions(args)
    const server = Server.listen(opts)
    const dir = await appDir(process.env.COSTRICT_APP_DEV_PATH)
    const bun = bunPath()
    const backendHost = opts.hostname === "0.0.0.0" ? "localhost" : opts.hostname
    const backendPort = server.port ?? Number(server.url.port)
    const app = dir && bun ? await startLocalApp({ appDir: dir, bun, backendHost, backendPort }) : undefined
    UI.empty()
    UI.println(UI.logo("  "))
    UI.empty()

    if (app) {
      UI.println(UI.Style.TEXT_INFO_BOLD + "  Backend:          ", UI.Style.TEXT_NORMAL, server.url.toString())
      UI.println(UI.Style.TEXT_INFO_BOLD + "  Web interface:    ", UI.Style.TEXT_NORMAL, app.url)
      UI.println(UI.Style.TEXT_INFO_BOLD + "  App source:       ", UI.Style.TEXT_NORMAL, app.appDir)
      open(app.url).catch(() => {})
    } else if (opts.hostname === "0.0.0.0") {
      if (dir && !bun) {
        UI.println(
          UI.Style.TEXT_WARNING_BOLD + "!  ",
          "Local app source found, but `bun` is not available. Falling back to the packaged web app.",
        )
        UI.println(UI.Style.TEXT_INFO_BOLD + "  App source:       ", UI.Style.TEXT_NORMAL, dir)
        UI.println(
          UI.Style.TEXT_INFO_BOLD + "  Hint:             ",
          UI.Style.TEXT_NORMAL,
          "Install bun or set COSTRICT_BUN_PATH to enable local web dev mode.",
        )
      }

      if (process.env.COSTRICT_APP_DEV_PATH && !dir) {
        UI.println(
          UI.Style.TEXT_WARNING_BOLD + "!  ",
          "COSTRICT_APP_DEV_PATH does not point to a valid app directory or repo root. Falling back to the packaged web app.",
        )
      }

      // Show localhost for local access
      const localhostUrl = `http://localhost:${server.port}`
      UI.println(UI.Style.TEXT_INFO_BOLD + "  Local access:      ", UI.Style.TEXT_NORMAL, localhostUrl)

      // Show network IPs for remote access
      const networkIPs = getNetworkIPs()
      if (networkIPs.length > 0) {
        for (const ip of networkIPs) {
          UI.println(
            UI.Style.TEXT_INFO_BOLD + "  Network access:    ",
            UI.Style.TEXT_NORMAL,
            `http://${ip}:${server.port}`,
          )
        }
      }

      if (opts.mdns) {
        UI.println(UI.Style.TEXT_INFO_BOLD + "  mDNS:              ", UI.Style.TEXT_NORMAL, "costrict.local")
      }

      // Open localhost in browser
      open(localhostUrl.toString()).catch(() => {})
    } else {
      if (dir && !bun) {
        UI.println(
          UI.Style.TEXT_WARNING_BOLD + "!  ",
          "Local app source found, but `bun` is not available. Falling back to the packaged web app.",
        )
        UI.println(UI.Style.TEXT_INFO_BOLD + "  App source:       ", UI.Style.TEXT_NORMAL, dir)
        UI.println(
          UI.Style.TEXT_INFO_BOLD + "  Hint:             ",
          UI.Style.TEXT_NORMAL,
          "Install bun or set COSTRICT_BUN_PATH to enable local web dev mode.",
        )
      }

      if (process.env.COSTRICT_APP_DEV_PATH && !dir) {
        UI.println(
          UI.Style.TEXT_WARNING_BOLD + "!  ",
          "COSTRICT_APP_DEV_PATH does not point to a valid app directory or repo root. Falling back to the packaged web app.",
        )
      }

      const displayUrl = server.url.toString()
      UI.println(UI.Style.TEXT_INFO_BOLD + "  Web interface:    ", UI.Style.TEXT_NORMAL, displayUrl)
      open(displayUrl).catch(() => {})
    }

    await new Promise(() => {})
    app?.stop()
    await server.stop()
  },
})
