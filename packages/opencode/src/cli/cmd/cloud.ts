import { spawn } from "child_process"
import fs from "fs"
import path from "path"
import { Server } from "../../server/server"
import { cmd } from "./cmd"
import { register, getCloudBaseUrl } from "../../costrict/device/client"
import { connect } from "../../costrict/device/tunnel"
import { initCloudNotifier } from "../../costrict/device/notify"
import { Daemon } from "../../costrict/device/daemon"
import { Log } from "../../util/log"
import { Flag } from "../../flag/flag"
import { Instance } from "../../project/instance"
import {
  downloadFavoriteSkill,
  loadFavoriteSkill,
  listFavoriteSkills,
  uninstallFavoriteSkill,
  unloadFavoriteSkill,
  viewFavoriteSkill,
} from "../../costrict/cloud/favorite"

const log = Log.create({ service: "cloud-cmd" })

const READY_TIMEOUT_MS = 30_000

const DEVICE_ENV_KEY = "__CLOUD_DEVICE__"

function pad(value: string, width: number) {
  return value.length >= width ? value : value + " ".repeat(width - value.length)
}

async function printFavoriteList(format: "table" | "json") {
  const items = await listFavoriteSkills()
  if (format === "json") {
    console.log(JSON.stringify(items, null, 2))
    return
  }

  if (!items.length) {
    console.log("No cloud favorites found")
    return
  }

  const statusWidth = Math.max("Status".length, ...items.map((item) => item.status.length))
  const slugWidth = Math.max("Slug".length, ...items.map((item) => item.slug.length))
  const nameWidth = Math.max("Name".length, ...items.map((item) => item.name.length))

  console.log(`${pad("Status", statusWidth)}  ${pad("Slug", slugWidth)}  ${pad("Name", nameWidth)}  Description`)
  for (const item of items) {
    console.log(
      `${pad(item.status, statusWidth)}  ${pad(item.slug, slugWidth)}  ${pad(item.name, nameWidth)}  ${item.description}`,
    )
  }
}

async function printFavoriteView(id: string, format: "table" | "json") {
  const item = await viewFavoriteSkill(id)
  if (format === "json") {
    console.log(JSON.stringify(item, null, 2))
    return
  }

  console.log(`Name: ${item.name}`)
  console.log(`Slug: ${item.slug}`)
  console.log(`ID: ${item.id}`)
  console.log(`Type: ${item.itemType}`)
  console.log(`Status: ${item.status}`)
  console.log(`Favorites: ${item.favoriteCount ?? 0}`)
  if (item.version) console.log(`Version: ${item.version}`)
  if (item.localPath) console.log(`Local path: ${item.localPath}`)
  console.log("")
  console.log(item.description || "(no description)")
}

function printFavoriteHelp() {
  console.log(`cs cloud favorite

Manage costrict-web favorite skills.

Usage:
  cs cloud favorite list [--format table|json]
  cs cloud favorite view <slug-or-id> [--format table|json]
  cs cloud favorite download <slug-or-id>
  cs cloud favorite load <slug-or-id>
  cs cloud favorite unload <slug-or-id>
  cs cloud favorite uninstall <slug-or-id>
  cs cloud favorite --help

Commands:
  list       List cloud favorite skills
  view       Show favorite skill details
  download   Download favorite skill to local storage
  load       Enable a downloaded favorite skill without restart
  unload     Disable a favorite skill without restart
  uninstall  Remove a local favorite skill without restart

Status flow:
  Cloud -> Downloaded -> Active -> Unloaded

State transition rules:
  download   Cloud/Unloaded -> Downloaded
  load       Cloud/Downloaded/Unloaded -> Active
  unload     Active -> Unloaded
  uninstall  Downloaded/Active/Unloaded -> Cloud
`)
}

async function runFavoriteAction(action: "download" | "load" | "unload" | "uninstall", id: string) {
  switch (action) {
    case "download": {
      const item = await downloadFavoriteSkill(id)
      console.log(`downloaded ${item.slug}`)
      return
    }
    case "load": {
      const item = await loadFavoriteSkill(id)
      console.log(`loaded ${item.slug} as active without restart`)
      return
    }
    case "unload": {
      const item = await unloadFavoriteSkill(id)
      console.log(`unloaded ${item.slug} without restart`)
      return
    }
    case "uninstall": {
      const item = await uninstallFavoriteSkill(id)
      console.log(`uninstalled ${item.slug} without restart`)
      return
    }
  }
}

// Patch child_process.spawn/spawnSync at the CJS module level so that
// third-party CJS libraries (e.g. cross-spawn used by MCP SDK) automatically
// get windowsHide: true on Windows.  ESM named imports are static bindings
// and won't see this patch, so our own code also sets windowsHide explicitly.
function patchSpawnForWindows() {
  if (process.platform !== "win32") return
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cp = require("child_process") as typeof import("child_process")

  function inject(args: any[]): void {
    const last = args[args.length - 1]
    if (typeof last === "object" && last !== null && !Array.isArray(last)) {
      if (last.windowsHide === undefined) last.windowsHide = true
    }
  }

  const origSpawn = cp.spawn
  ;(cp as any).spawn = function (...args: any[]) {
    inject(args)
    return origSpawn.apply(this, args as Parameters<typeof origSpawn>)
  }

  const origSpawnSync = cp.spawnSync
  ;(cp as any).spawnSync = function (...args: any[]) {
    inject(args)
    return origSpawnSync.apply(this, args as Parameters<typeof origSpawnSync>)
  }

  const origExec = cp.exec
  ;(cp as any).exec = function (...args: any[]) {
    inject(args)
    return origExec.apply(this, args as Parameters<typeof origExec>)
  }

  const origExecSync = cp.execSync
  ;(cp as any).execSync = function (...args: any[]) {
    inject(args)
    return origExecSync.apply(this, args as Parameters<typeof origExecSync>)
  }
}

async function runWorker() {
  Log.useStderr()

  // Prevent child processes from allocating visible console windows.
  // The daemon runs detached with no console; without this, every spawned
  // child (LSP, MCP via cross-spawn, shell commands, etc.) would pop up a
  // console window on Windows.
  patchSpawnForWindows()

  // Handle TLS certificate verification setting before any network requests
  if (Flag.COSTRICT_INSECURE_SKIP_TLS_VERIFY) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
    log.warn("TLS certificate verification is disabled (COSTRICT_INSECURE_SKIP_TLS_VERIFY=true) - this is insecure!")
  }

  // Device registration is done in the foreground parent process (startDaemon)
  // and passed to the worker via environment variable.
  const raw = process.env[DEVICE_ENV_KEY]
  if (!raw) throw new Error("missing device info from parent process")
  const device = JSON.parse(raw) as import("../../costrict/device/client").DeviceInfo
  console.log(`device registered: ${device.device_id}`)

  initCloudNotifier(getCloudBaseUrl(), device.device_token, device.device_id)

  const server = Server.listen({ port: 0, hostname: "127.0.0.1" })
  console.log(`internal server on port ${server.port}`)

  connect(server.port!).catch((e) => log.error("tunnel fatal", { error: e?.message ?? e }))

  // Gracefully shut down all child processes (LSP, MCP, PTY, etc.) on termination.
  // Without this, child processes spawned via Instance become orphaned when the
  // daemon is killed because Daemon.stop() only signals this top-level process.
  let stopping = false
  const shutdown = async () => {
    if (stopping) return
    stopping = true
    log.info("daemon shutting down, disposing instances")
    try {
      await Instance.disposeAll()
    } catch (e: any) {
      log.error("dispose error during shutdown", { error: e?.message ?? e })
    }
    server.stop(true)
    process.exit(0)
  }
  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)

  // On Windows, process.kill(pid, "SIGTERM") calls TerminateProcess() which
  // bypasses signal handlers entirely.  Poll for a stop-signal file instead
  // so we get a chance to run the graceful shutdown path above.
  if (process.platform === "win32") {
    const file = Daemon.stopFile()
    Daemon.removeStop()
    const timer = setInterval(() => {
      try {
        fs.statSync(file)
        clearInterval(timer)
        shutdown()
      } catch {}
    }, 500)
    timer.unref()
  }

  if (process.send) {
    process.send({ ready: true, pid: process.pid })
  }

  await new Promise(() => {})
}

async function startDaemon() {
  const { running, pid } = Daemon.status()
  if (running) {
    console.log(`cloud daemon already running (pid: ${pid})`)
    return
  }

  // Handle TLS certificate verification setting before any network requests
  if (Flag.COSTRICT_INSECURE_SKIP_TLS_VERIFY) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
    log.warn("TLS certificate verification is disabled (COSTRICT_INSECURE_SKIP_TLS_VERIFY=true) - this is insecure!")
  }

  // Perform device registration in the foreground so auth errors are visible
  const device = await register()
  console.log(`device registered: ${device.device_id}`)

  const logFd = Daemon.openLogFd()

  // In dev mode, process.execPath is "bun" and `bun cloud` is a reserved
  // Bun subcommand, so we need to go through `bun run` with the script
  // entrypoint.  In production the compiled binary handles it directly.
  const entry = process.execPath
  const dev = path.basename(entry).toLowerCase().startsWith("bun")
  const args = dev
    ? ["run", "--conditions=browser", path.resolve(import.meta.dirname, "../../index.ts"), "cloud", "_worker"]
    : ["cloud", "_worker"]

  const child = spawn(entry, args, {
    detached: true,
    windowsHide: true,
    stdio: ["ignore", logFd, logFd, "ipc"],
    env: { ...process.env, [DEVICE_ENV_KEY]: JSON.stringify(device) },
    ...(dev ? { cwd: path.resolve(import.meta.dirname, "../../..") } : {}),
  })

  child.unref()

  const ready = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), READY_TIMEOUT_MS)
    child.on("message", (msg: any) => {
      if (msg?.ready) {
        clearTimeout(timer)
        resolve(true)
      }
    })
    child.on("exit", () => {
      clearTimeout(timer)
      resolve(false)
    })
  })

  fs.closeSync(logFd)

  if (!ready || !child.pid) {
    console.error("cloud daemon failed to start, check logs: " + Daemon.logFile())
    process.exit(1)
  }

  Daemon.writePid(child.pid)
  console.log(`cloud daemon started (pid: ${child.pid})`)
  console.log(`logs: cs cloud logs`)
}

export const CloudCommand = cmd({
  command: "cloud [command]",
  describe: "manage cloud daemon (register device and connect via WebSocket tunnel)",
  builder: (yargs) =>
    yargs
      .command("start", "start cloud daemon", {}, async () => {
        await startDaemon()
      })
      .command("stop", "stop cloud daemon", {}, () => {
        const stopped = Daemon.stop()
        console.log(stopped ? "cloud daemon stopped" : "cloud daemon is not running")
      })
      .command("status", "show cloud daemon status", {}, () => {
        const { running, pid } = Daemon.status()
        if (running) {
          console.log(`running (pid: ${pid})`)
          console.log(`logs: ${Daemon.logFile()}`)
        } else {
          console.log("not running")
        }
      })
      .command(
        "logs",
        "tail cloud daemon logs",
        (y) =>
          y
            .option("lines", { alias: "n", type: "number", default: 100, describe: "number of lines to show" })
            .option("follow", { alias: "f", type: "boolean", default: false, describe: "follow log output" }),
        (args) => {
          Daemon.tailLogs(args.lines, args.follow)
        },
      )
      .command("restart", "restart cloud daemon", {}, async () => {
        const stopped = Daemon.stop()
        if (stopped) console.log("cloud daemon stopped")
        await startDaemon()
      })
      .command(
        "favorite <command> [id]",
        "manage costrict-web favorite skills",
        (y) =>
          y
            .positional("command", {
              type: "string",
              choices: ["list", "view", "download", "load", "unload", "uninstall", "help"],
            })
            .positional("id", {
              type: "string",
              describe: "favorite skill slug or item id",
            })
            .option("format", {
              type: "string",
              choices: ["table", "json"],
              default: "table",
              describe: "output format",
            }),
        async (args) => {
          const command = String(args.command)
          const format = (args.format ?? "table") as "table" | "json"

          if (command === "help") {
            printFavoriteHelp()
            return
          }

          if (command === "list") {
            await printFavoriteList(format)
            return
          }

          const id = String(args.id ?? "").trim()
          if (!id) {
            console.error("favorite id/slug is required")
            process.exit(1)
          }

          if (command === "view") {
            await printFavoriteView(id, format)
            return
          }

          await runFavoriteAction(command as "download" | "load" | "unload" | "uninstall", id)
        },
      )
      .command("_worker", false, {}, async () => {
        await runWorker()
      }),
  handler: async () => {
    console.error("specify a subcommand: start, stop, restart, status, logs, favorite")
    process.exit(1)
  },
})
