import { execFile, spawn } from "child_process"
import { createHash } from "node:crypto"
import { createWriteStream, promises as fsp } from "node:fs"
import fs from "fs"
import os from "os"
import path from "path"
import { cmd } from "./cmd"
import { getCloudBaseUrl } from "../../costrict/device/client"
import {
  downloadFavoriteItem,
  loadFavoriteItem,
  listFavoriteItems,
  uninstallFavoriteItem,
  unloadFavoriteItem,
  viewFavoriteItem,
  type FavoriteItemType,
} from "../../costrict/cloud/favorite"

function csCloudBin(): string {
  const ext = process.platform === "win32" ? ".exe" : ""
  const binDir = path.join(os.homedir(), ".costrict", "bin")
  return path.join(binDir, `cs-cloud${ext}`)
}

function getReleasePlatform(): string {
  const os = process.platform === "win32" ? "windows" : process.platform
  const arch = process.arch === "x64" ? "amd64" : process.arch === "arm64" ? "arm64" : "amd64"
  return `${os}-${arch}`
}

interface UpdateCheckResponse {
  can_update: boolean
  version: string
  changelog?: string
  download_url?: string
  sha256?: string
  force?: boolean
  min_client_version?: string
  release_date?: string
  size?: number
}

async function fetchUpdateInfo(): Promise<UpdateCheckResponse> {
  const base = getCloudBaseUrl()
  const platform = getReleasePlatform()
  const url = `${base}/api/updates/check?platform=${encodeURIComponent(platform)}&version=0.0.0`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`update check failed: ${res.status} ${await res.text().catch(() => "")}`)
  }
  return (await res.json()) as UpdateCheckResponse
}

type ArchiveFormat = "targz" | "zip" | "raw"

function detectFormatByUrl(url: string): ArchiveFormat | undefined {
  const lower = url.toLowerCase()
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "targz"
  if (lower.endsWith(".zip")) return "zip"
  return undefined
}

async function detectFormatByMagic(file: string): Promise<ArchiveFormat> {
  const handle = await fsp.open(file, "r")
  const buf = Buffer.alloc(4)
  await handle.read(buf, 0, 4, 0)
  await handle.close()
  if (buf[0] === 0x1f && buf[1] === 0x8b) return "targz"
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return "zip"
  return "raw"
}

async function detectArchiveFormat(file: string, url: string): Promise<ArchiveFormat> {
  return detectFormatByUrl(url) ?? (await detectFormatByMagic(file))
}

const BIN_NAME = process.platform === "win32" ? "cs-cloud.exe" : "cs-cloud"

async function extractFromTarGz(archive: string, outDir: string): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    execFile("tar", ["xzf", archive, "-C", outDir], (err) => (err ? reject(err) : resolve()))
  })
  for (const name of [BIN_NAME, "cs-cloud"]) {
    const p = path.join(outDir, name)
    if (fs.existsSync(p)) {
      const dest = path.join(outDir, BIN_NAME)
      if (p !== dest) await fsp.rename(p, dest)
      return dest
    }
  }
  throw new Error("cs-cloud binary not found in tar.gz archive")
}

async function extractFromZip(archive: string, outDir: string): Promise<string> {
  const bin = path.join(outDir, BIN_NAME)
  if (process.platform === "win32") {
    await new Promise<void>((resolve, reject) => {
      execFile("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${outDir}' -Force`], (err) =>
        err ? reject(err) : resolve(),
      )
    })
    const extracted = path.join(outDir, "cs-cloud.exe")
    if (fs.existsSync(extracted)) {
      if (extracted !== bin) await fsp.rename(extracted, bin)
    } else if (!fs.existsSync(bin)) {
      throw new Error("cs-cloud.exe not found in zip archive")
    }
    return bin
  }
  await new Promise<void>((resolve, reject) => {
    execFile("unzip", ["-o", archive, "-d", outDir], (err) => (err ? reject(err) : resolve()))
  })
  for (const name of [BIN_NAME, "cs-cloud"]) {
    const p = path.join(outDir, name)
    if (fs.existsSync(p)) {
      if (p !== bin) await fsp.rename(p, bin)
      return bin
    }
  }
  throw new Error("cs-cloud binary not found in zip archive")
}

async function extractBinary(archive: string, outDir: string, url: string): Promise<string> {
  const fmt = await detectArchiveFormat(archive, url)
  switch (fmt) {
    case "targz":
      return extractFromTarGz(archive, outDir)
    case "zip":
      return extractFromZip(archive, outDir)
    default: {
      const dest = path.join(outDir, BIN_NAME)
      await fsp.rename(archive, dest)
      if (process.platform !== "win32") await fsp.chmod(dest, 0o755)
      return dest
    }
  }
}

async function downloadToTemp(url: string, expectedSha256?: string, totalSize?: number): Promise<string> {
  const tmp = path.join(os.tmpdir(), `cs-cloud-download-${Date.now()}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed: ${res.status}`)
  const body = res.body
  if (!body) throw new Error("empty response body")
  const ws = createWriteStream(tmp, { mode: 0o755 })
  const hash = expectedSha256 ? createHash("sha256") : null
  const reader = body.getReader()
  let downloaded = 0
  let lastLog = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      hash?.update(value)
      ws.write(value)
      downloaded += value.length
      const now = Date.now()
      if (totalSize && now - lastLog > 500) {
        const pct = Math.min(Math.round((downloaded / totalSize) * 100), 100)
        const mb = (downloaded / 1048576).toFixed(1)
        const total = (totalSize / 1048576).toFixed(1)
        process.stdout.write(`\rdownloading... ${pct}% (${mb}/${total} MB)`)
        lastLog = now
      }
    }
  } finally {
    reader.releaseLock()
  }
  if (totalSize) process.stdout.write("\r")
  ws.end()
  await new Promise<void>((resolve, reject) => {
    ws.on("finish", resolve)
    ws.on("error", reject)
  })
  if (hash && expectedSha256) {
    const actual = hash.digest("hex")
    if (actual !== expectedSha256) {
      await fsp.unlink(tmp).catch(() => {})
      throw new Error(`sha256 mismatch: expected ${expectedSha256}, got ${actual}`)
    }
  }
  return tmp
}

async function ensureCsCloud(): Promise<string> {
  const bin = csCloudBin()
  if (fs.existsSync(bin)) return bin

  console.log("cs-cloud not found, downloading...")
  const info = await fetchUpdateInfo()
  if (!info.can_update || !info.download_url) {
    throw new Error("no cs-cloud release available for your platform")
  }

  const binDir = path.dirname(bin)
  await fsp.mkdir(binDir, { recursive: true })

  const archive = await downloadToTemp(info.download_url, info.sha256, info.size)
  try {
    const extracted = await extractBinary(archive, binDir, info.download_url)
    if (extracted !== bin && fs.existsSync(extracted)) {
      await fsp.rename(extracted, bin)
    }
  } finally {
    await fsp.unlink(archive).catch(() => {})
  }

  if (process.platform === "darwin") {
    await new Promise<void>((resolve, reject) => {
      execFile("xattr", ["-d", "com.apple.quarantine", bin], (err) => {
        if (err && !(err as NodeJS.ErrnoException).code?.includes("ENOATTR")) reject(err)
        else resolve()
      })
    })
  }

  console.log(`cs-cloud ${info.version} installed`)
  return bin
}

async function runCsCloud(args: string[]): Promise<void> {
  const bin = await ensureCsCloud()
  const child = spawn(bin, args, {
    stdio: "inherit",
    windowsHide: false,
    env: { ...process.env },
  })
  const code = await new Promise<number | null>((resolve) => {
    child.on("error", (err) => {
      console.error(`failed to run cs-cloud: ${err.message}`)
      resolve(1)
    })
    child.on("exit", resolve)
  })
  process.exit(code ?? 1)
}

function pad(value: string, width: number) {
  return value.length >= width ? value : value + " ".repeat(width - value.length)
}

async function printFavoriteList(format: "table" | "json", type?: FavoriteItemType) {
  const items = await listFavoriteItems(type)
  if (format === "json") {
    console.log(JSON.stringify(items, null, 2))
    return
  }

  if (!items.length) {
    console.log("No cloud favorites found")
    return
  }

  const statusWidth = Math.max("Status".length, ...items.map((item) => item.status.length))
  const typeWidth = Math.max("Type".length, ...items.map((item) => item.itemType.length))
  const slugWidth = Math.max("Slug".length, ...items.map((item) => item.slug.length))
  const nameWidth = Math.max("Name".length, ...items.map((item) => item.name.length))

  console.log(
    `${pad("Status", statusWidth)}  ${pad("Type", typeWidth)}  ${pad("Slug", slugWidth)}  ${pad("Name", nameWidth)}  Description`,
  )
  for (const item of items) {
    console.log(
      `${pad(item.status, statusWidth)}  ${pad(item.itemType, typeWidth)}  ${pad(item.slug, slugWidth)}  ${pad(item.name, nameWidth)}  ${item.description}`,
    )
  }
}

async function printFavoriteView(id: string, format: "table" | "json") {
  const item = await viewFavoriteItem(id)
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

Manage costrict-web favorite items (skills, agents, commands, MCPs).

Usage:
  cs cloud favorite list [--type skill|agent|command|mcp] [--format table|json]
  cs cloud favorite view <slug-or-id> [--format table|json]
  cs cloud favorite download <slug-or-id>
  cs cloud favorite load <slug-or-id>
  cs cloud favorite unload <slug-or-id>
  cs cloud favorite uninstall <slug-or-id>
  cs cloud favorite --help

Commands:
  list       List cloud favorite items
  view       Show favorite item details
  download   Download favorite item to local storage
  load       Enable a downloaded favorite item without restart
  unload     Disable a favorite item without restart
  uninstall  Remove a local favorite item without restart

Supported types:
  skill      Skill instructions (SKILL.md)
  agent      Subagent definitions (agent markdown)
  command    Command templates (command markdown)
  mcp        MCP server configurations (JSON config)

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
      const item = await downloadFavoriteItem(id)
      console.log(`downloaded ${item.slug}`)
      return
    }
    case "load": {
      const item = await loadFavoriteItem(id)
      console.log(`loaded ${item.slug} as active without restart`)
      return
    }
    case "unload": {
      const item = await unloadFavoriteItem(id)
      console.log(`unloaded ${item.slug} without restart`)
      return
    }
    case "uninstall": {
      const item = await uninstallFavoriteItem(id)
      console.log(`uninstalled ${item.slug} without restart`)
      return
    }
  }
}

export const CloudCommand = cmd({
  command: "cloud [command]",
  describe: "manage cloud daemon (register device and connect via WebSocket tunnel)",
  builder: (yargs) =>
    yargs
      .command("start", "start cloud daemon", {}, async () => {
        await runCsCloud(["start"])
      })
      .command("stop", "stop cloud daemon", {}, async () => {
        await runCsCloud(["stop"])
      })
      .command("status", "show cloud daemon status", {}, async () => {
        await runCsCloud(["status"])
      })
      .command(
        "logs",
        "tail cloud daemon logs",
        (y) =>
          y
            .option("lines", { alias: "n", type: "number", default: 100, describe: "number of lines to show" })
            .option("follow", { alias: "f", type: "boolean", default: false, describe: "follow log output" }),
        async (args) => {
          const pass = ["logs"]
          if (args.lines) pass.push("-n", String(args.lines))
          if (args.follow) pass.push("-f")
          await runCsCloud(pass)
        },
      )
      .command("restart", "restart cloud daemon", {}, async () => {
        await runCsCloud(["restart"])
      })
      .command("upgrade", "check and apply cs-cloud upgrade", {}, async () => {
        const bin = csCloudBin()
        if (fs.existsSync(bin)) {
          await runCsCloud(["upgrade"])
          return
        }
        await ensureCsCloud()
      })
      .command(
        "favorite <command> [id]",
        "manage costrict-web favorite items (skills, agents, commands, MCPs)",
        (y) =>
          y
            .positional("command", {
              type: "string",
              choices: ["list", "view", "download", "load", "unload", "uninstall", "help"],
            })
            .positional("id", {
              type: "string",
              describe: "favorite item slug or item id",
            })
            .option("format", {
              type: "string",
              choices: ["table", "json"],
              default: "table",
              describe: "output format",
            })
            .option("type", {
              type: "string",
              choices: ["skill", "agent", "command", "mcp"],
              describe: "filter by item type",
            }),
        async (args) => {
          const command = String(args.command)
          const format = (args.format ?? "table") as "table" | "json"
          const type = args.type as FavoriteItemType | undefined

          if (command === "help") {
            printFavoriteHelp()
            return
          }

          if (command === "list") {
            await printFavoriteList(format, type)
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
      ),
  handler: async () => {
    console.error("specify a subcommand: start, stop, restart, status, logs, upgrade, favorite")
    process.exit(1)
  },
})
