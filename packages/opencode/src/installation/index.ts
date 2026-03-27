import { BusEvent } from "@/bus/bus-event"
import path from "path"
import z from "zod"
import { NamedError } from "@opencode-ai/util/error"
import { Log } from "../util/log"
import { iife } from "@/util/iife"
import { Flag } from "../flag/flag"
import { createHash } from "node:crypto"
import { hostname, userInfo } from "node:os"
import { Process } from "@/util/process"
import { buffer } from "node:stream/consumers"
import Package from "../../package.json"
declare global {
  const COSTRICT_VERSION: string
  const COSTRICT_CHANNEL: string
  const COSTRICT_COMMIT_HASH: string
  const COSTRICT_BUILD_TIME: string
}

export namespace Installation {
  const log = Log.create({ service: "installation" })

  async function text(cmd: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
    return Process.text(cmd, {
      cwd: opts.cwd,
      env: opts.env,
      nothrow: true,
    }).then((x) => x.text)
  }

  async function upgradeCurl(target: string) {
    const body = await fetch("https://opencode.ai/install").then((res) => {
      if (!res.ok) throw new Error(res.statusText)
      return res.text()
    })
    const proc = Process.spawn(["bash"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        VERSION: target,
      },
    })
    if (!proc.stdin || !proc.stdout || !proc.stderr) throw new Error("Process output not available")
    proc.stdin.end(body)
    const [code, stdout, stderr] = await Promise.all([proc.exited, buffer(proc.stdout), buffer(proc.stderr)])
    return {
      code,
      stdout,
      stderr,
    }
  }

  export type Method = Awaited<ReturnType<typeof method>>

  export const Event = {
    Updated: BusEvent.define(
      "installation.updated",
      z.object({
        version: z.string(),
      }),
    ),
    UpdateAvailable: BusEvent.define(
      "installation.update-available",
      z.object({
        version: z.string(),
      }),
    ),
  }

  export const Info = z
    .object({
      version: z.string(),
      latest: z.string(),
    })
    .meta({
      ref: "InstallationInfo",
    })
  export type Info = z.infer<typeof Info>

  export async function info() {
    return {
      version: VERSION,
      latest: await latest(),
    }
  }

  export function isPreview() {
    return CHANNEL !== "latest"
  }

  export function isLocal() {
    return CHANNEL === "local"
  }

  export async function method() {
    const exec = process.execPath.toLowerCase()

    const checks = [
      {
        name: "npm" as const,
        command: () => text(["npm", "list", "-g", "--depth=0"]),
      },
      {
        name: "yarn" as const,
        command: () => text(["yarn", "global", "list"]),
      },
      {
        name: "pnpm" as const,
        command: () => text(["pnpm", "list", "-g", "--depth=0"]),
      },
      {
        name: "bun" as const,
        command: () => text(["bun", "pm", "ls", "-g"]),
      },
      {
        name: "brew" as const,
        command: () => text(["brew", "list", "--formula", "opencode"]),
      },
      {
        name: "scoop" as const,
        command: () => text(["scoop", "list", "opencode"]),
      },
      {
        name: "choco" as const,
        command: () => text(["choco", "list", "--limit-output", "opencode"]),
      },
    ]

    checks.sort((a, b) => {
      const aMatches = exec.includes(a.name)
      const bMatches = exec.includes(b.name)
      if (aMatches && !bMatches) return -1
      if (!aMatches && bMatches) return 1
      return 0
    })

    for (const check of checks) {
      const output = await check.command()
      // Check for multiple possible package names
      const possibleNames =
        check.name === "brew" || check.name === "choco" || check.name === "scoop"
          ? ["opencode"]
          : [
              "@costrict/cs",
              "opencode-ai",
              "@costrict/cs-darwin-arm64",
              "@costrict/cs-linux-x64",
              "@costrict/cs-darwin-x64",
            ]

      for (const name of possibleNames) {
        if (output.includes(name)) {
          return check.name
        }
      }
    }

    // Only use curl as fallback if installed in specific curl-based installation paths
    if (process.execPath.includes(path.join(".costrict", "bin"))) return "curl"
    if (process.execPath.includes(path.join(".local", "bin"))) return "curl"

    // Check for npm-like installation paths (e.g., node_modules/@costrict/...)
    if (process.execPath.includes("node_modules/@costrict")) return "npm"

    return "unknown"
  }

  export const UpgradeFailedError = NamedError.create(
    "UpgradeFailedError",
    z.object({
      stderr: z.string(),
    }),
  )

  async function getBrewFormula() {
    const tapFormula = await text(["brew", "list", "--formula", "anomalyco/tap/opencode"])
    if (tapFormula.includes("opencode")) return "anomalyco/tap/opencode"
    const coreFormula = await text(["brew", "list", "--formula", "opencode"])
    if (coreFormula.includes("opencode")) return "opencode"
    return "opencode"
  }

  export async function upgrade(method: Method, target: string) {
    let result: Awaited<ReturnType<typeof upgradeCurl>> | undefined
    switch (method) {
      case "curl": {
        const baseUrl = Flag.COSTRICT_BASE_URL || "https://zgsm.sangfor.com"
        result = await Process.run(
          ["curl", "-fsSL", `${baseUrl}/costrict/install.sh`, "|", "bash"],
          {
            env: {
              ...process.env,
              VERSION: target,
              COSTRICT_BASE_URL: baseUrl,
            },
            nothrow: true,
          },
        )
        break
      }
      case "npm":
        result = await Process.run(["npm", "install", "-g", `@costrict/cs@${target}`], { nothrow: true })
        break
      case "pnpm":
        result = await Process.run(["pnpm", "install", "-g", `@costrict/cs@${target}`], { nothrow: true })
        break
      case "bun":
        result = await Process.run(["bun", "install", "-g", `@costrict/cs@${target}`], { nothrow: true })
        break
      case "brew": {
        const formula = await getBrewFormula()
        const env = {
          HOMEBREW_NO_AUTO_UPDATE: "1",
          ...process.env,
        }
        if (formula.includes("/")) {
          const tap = await Process.run(["brew", "tap", "anomalyco/tap"], { env, nothrow: true })
          if (tap.code !== 0) {
            result = tap
            break
          }
          const repo = await Process.text(["brew", "--repo", "anomalyco/tap"], { env, nothrow: true })
          if (repo.code !== 0) {
            result = repo
            break
          }
          const dir = repo.text.trim()
          if (dir) {
            const pull = await Process.run(["git", "pull", "--ff-only"], { cwd: dir, env, nothrow: true })
            if (pull.code !== 0) {
              result = pull
              break
            }
          }
        }
        result = await Process.run(["brew", "upgrade", formula], { env, nothrow: true })
        break
      }

      case "choco":
        result = await Process.run(["choco", "upgrade", "opencode", `--version=${target}`, "-y"], { nothrow: true })
        break
      case "scoop":
        result = await Process.run(["scoop", "install", `opencode@${target}`], { nothrow: true })
        break
      default:
        throw new Error(`Unknown method: ${method}`)
    }
    if (!result || result.code !== 0) {
      const stderr =
        method === "choco" ? "not running from an elevated command shell" : result?.stderr.toString("utf8") || ""
      throw new UpgradeFailedError({
        stderr: stderr,
      })
    }
    log.info("upgraded", {
      method,
      target,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    })
    await Process.text([process.execPath, "--version"], { nothrow: true })
  }

  export const VERSION = typeof COSTRICT_VERSION === "string" ? COSTRICT_VERSION : Package.version
  export const CHANNEL = typeof COSTRICT_CHANNEL === "string" ? COSTRICT_CHANNEL : Package.version
  export const COMMIT_HASH = typeof COSTRICT_COMMIT_HASH === "string" ? COSTRICT_COMMIT_HASH : "unknown"
  export const BUILD_TIME = typeof COSTRICT_BUILD_TIME === "string" ? COSTRICT_BUILD_TIME : "unknown"
  export const CLIENT = process.env["COSTRICT_CLIENT"] ?? "cli"
  export const USER_AGENT = `opencode/${CHANNEL}/${VERSION}/${CLIENT}`

  /**
   * Generate stable installation ID based on machine information
   * Compatible with costrict-cli InstallationManager
   */
  let cachedInstallationId: string | null = null
  export function getInstallationId(): string {
    // Try environment variable first (always check, not cached)
    const envId = process.env["COSTRICT_CLIENT_ID"]
    if (envId) {
      // If env ID changed, update cache
      if (cachedInstallationId !== envId) {
        cachedInstallationId = envId
      }
      return envId
    }

    // If we have a cached ID and no env var, return it
    if (cachedInstallationId) {
      return cachedInstallationId
    }

    // Generate stable ID based on hostname and username
    const host = hostname()
    const user = userInfo().username
    const machineInfo = `${host}-${user}`
    const hash = createHash("sha256").update(machineInfo).digest("hex")

    // Use first 32 characters for compatibility
    cachedInstallationId = hash.substring(0, 32)
    return cachedInstallationId
  }

  /**
   * Clear the installation ID cache (for testing)
   */
  export function clearInstallationIdCache(): void {
    cachedInstallationId = null
  }

  /**
   * Compare two semantic version strings
   * @param v1 - First version string (e.g., "1.2.3")
   * @param v2 - Second version string (e.g., "1.2.0")
   * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
   */
  export function compareVersions(v1: string | undefined | null, v2: string | undefined | null): number {
    if (!v1 || !v2) {
      throw new Error("Version string cannot be null or undefined")
    }
    const parts1 = v1.split(".").map(Number)
    const parts2 = v2.split(".").map(Number)
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0
      const p2 = parts2[i] || 0
      if (p1 > p2) return 1
      if (p1 < p2) return -1
    }
    return 0
  }

  export async function latest(installMethod?: Method) {
    const detectedMethod = installMethod || (await method())

    if (detectedMethod === "brew") {
      const formula = await getBrewFormula()
      if (formula.includes("/")) {
        const infoJson = await text(["brew", "info", "--json=v2", formula])
        const info = JSON.parse(infoJson)
        const version = info.formulae?.[0]?.versions?.stable
        if (!version) throw new Error(`Could not detect version for tap formula: ${formula}`)
        return version
      }
      return fetch("https://formulae.brew.sh/api/formula/opencode.json")
        .then((res) => {
          if (!res.ok) throw new Error(res.statusText)
          return res.json()
        })
        .then((data: any) => data.versions.stable)
    }

    if (detectedMethod === "npm" || detectedMethod === "bun" || detectedMethod === "pnpm") {
      const registry = await iife(async () => {
        const r = (await text(["npm", "config", "get", "registry"])).trim()
        const reg = r || "https://registry.npmjs.org"
        return reg.endsWith("/") ? reg.slice(0, -1) : reg
      })
      const channel = CHANNEL
      const channelVersion = await fetch(`${registry}/@costrict/cs/${channel}`)
        .then((res) => {
          if (!res.ok) throw new Error(res.statusText)
          return res.json()
        })
        .then((data: any) => {
          if (!data.version) throw new Error("Invalid response: missing version field")
          return data.version
        })
        .catch(() => null)

      if (channelVersion) return channelVersion

      return fetch(`${registry}/@costrict/cs`)
        .then((res) => {
          if (!res.ok) throw new Error(res.statusText)
          return res.json()
        })
        .then((data: any) => {
          if (data["dist-tags"]?.latest) {
            return data["dist-tags"].latest
          }

          if (data.time && data.versions) {
            const stableVersions = Object.keys(data.versions).filter((v: string) => /^\d+\.\d+\.\d+$/.test(v))

            if (stableVersions.length === 0) {
              throw new Error("No stable versions found in package registry")
            }

            const latestVersion = stableVersions.sort((a: string, b: string) => compareVersions(b, a))[0]

            return latestVersion
          }

          throw new Error("Invalid response: unable to determine latest version")
        })
    }

    if (detectedMethod === "choco") {
      return fetch(
        "https://community.chocolatey.org/api/v2/Packages?$filter=Id%20eq%20%27opencode%27%20and%20IsLatestVersion&$select=Version",
        { headers: { Accept: "application/json;odata=verbose" } },
      )
        .then((res) => {
          if (!res.ok) throw new Error(res.statusText)
          return res.json()
        })
        .then((data: any) => data.d.results[0].Version)
    }

    if (detectedMethod === "scoop") {
      return fetch("https://raw.githubusercontent.com/ScoopInstaller/Main/master/bucket/opencode.json", {
        headers: { Accept: "application/json" },
      })
        .then((res) => {
          if (!res.ok) throw new Error(res.statusText)
          return res.json()
        })
        .then((data: any) => data.version)
    }

    const baseUrl = Flag.COSTRICT_BASE_URL || "https://zgsm.sangfor.com"
    return fetch(`${baseUrl}/costrict-cli/pkg/latest.json`)
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText)
        return res.json()
      })
      .then((data: any) => data.tag_name)
  }
}
