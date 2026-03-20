import z from "zod"
import { spawn, type ChildProcessWithoutNullStreams } from "child_process"
import { Tool } from "./tool"
import path from "path"
import DESCRIPTION from "./bash.txt"
import { Log } from "../util/log"
import { Instance } from "../project/instance"
import { Bus } from "../bus"
import { Session } from "../session"
import { lazy } from "@/util/lazy"
import { Language } from "web-tree-sitter"
import fs from "fs/promises"

import { Filesystem } from "@/util/filesystem"
import { fileURLToPath } from "url"
import { Shell } from "@/shell/shell"
import { Flag } from "@/flag/flag"
import { existsSync } from "fs"
import { resolveResourcesPath } from "@/util/resources"

import { BashArity } from "@/permission/arity"
import { Lock } from "@/util/lock"
import { Truncate } from "./truncation"
import { Plugin } from "@/plugin"

const MAX_METADATA_LENGTH = 30_000
const DEFAULT_TIMEOUT_SECONDS = 20
const MAX_TIMEOUT_SECONDS = 120
const MAX_SEARCH_LINES = 50
const SENTINEL = ",,,,bash-command-exit-__ERROR_CODE__-banner,,,,"
const READ_CHUNK_SIZE = 64 * 1024
const HEAD_MAX_BYTES = 256 * 1024
const TAIL_MAX_BYTES = 2 * 1024 * 1024
const SENTINEL_WINDOW_BYTES = 256 * 1024
const BOOT_MAX_BYTES = 8 * 1024

type BashMeta = {
  output: string
  exit: number | null
  description: string
  blocked?: boolean
  truncated?: boolean
  outputPath?: string
}

const sentinelParts = SENTINEL.split("__ERROR_CODE__")
const sentinelBefore = sentinelParts[0] || ""
const sentinelAfter = sentinelParts[1] || ""
const sentinelBeforeBytes = Buffer.from(sentinelBefore)
const sentinelAfterBytes = Buffer.from(sentinelAfter)

const isBashShell = (value: string | undefined) => {
  if (!value) return false
  return /bash/i.test(path.basename(value))
}

const resolveShell = () => {
  if (process.platform !== "win32") return Shell.acceptable()
  const flagged = Flag.COSTRICT_GIT_BASH_PATH ?? Flag.OPENCODE_GIT_BASH_PATH
  if (flagged && existsSync(flagged)) return flagged
  const shellEnv = process.env.SHELL
  if (shellEnv && isBashShell(shellEnv) && existsSync(shellEnv)) return shellEnv
  const gitBin = Bun.which("git")
  if (gitBin) {
    const fromGit = path.join(gitBin, "..", "..", "bin", "bash.exe")
    if (existsSync(fromGit)) return fromGit
  }
  const candidates = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ]
  const found = candidates.find((value) => existsSync(value))
  if (found) return found
  const bash = Bun.which("bash")
  if (bash) return bash
  return Shell.acceptable()
}

type BashState = {
  cwd: string
  prev: string
  shell: string
  session: BashSession | undefined
  restarts: number
}

const sessionStateStore = Instance.state(
  () => {
    const sessions = new Map<string, BashState>()
    const unsub = Bus.subscribe(Session.Event.Deleted, (event) => {
      const sessionID = event.properties.info.id
      const state = sessions.get(sessionID)
      if (!state) return
      void state.session?.stop().catch(() => { })
      sessions.delete(sessionID)
    })
    return { sessions, unsub }
  },
  async (entry) => {
    entry.unsub()
    const tasks = Array.from(entry.sessions.values()).map((value) => value.session?.stop().catch(() => { }) ?? Promise.resolve())
    await Promise.all(tasks)
    entry.sessions.clear()
  },
)

const getSessionState = (sessionID: string) => {
  const store = sessionStateStore()
  const existing = store.sessions.get(sessionID)
  if (existing) return existing
  const next: BashState = {
    cwd: Instance.directory,
    prev: Instance.directory,
    shell: resolveShell(),
    session: undefined,
    restarts: 0,
  }
  store.sessions.set(sessionID, next)
  return next
}

const precompiled = () => {
  const baseDir = resolveResourcesPath(import.meta.url, "search")
  const rgDir =
    process.platform === "win32"
      ? path.join(baseDir, "rg", "ripgrep-15.1.0-x86_64-pc-windows-msvc")
      : process.platform === "linux"
        ? path.join(baseDir, "rg", "ripgrep-15.1.0-x86_64-unknown-linux-musl")
        : ""
  const fdDir =
    process.platform === "win32"
      ? path.join(baseDir, "fd", "fd-v10.3.0-x86_64-pc-windows-msvc")
      : process.platform === "linux"
        ? path.join(baseDir, "fd", "fd-v10.3.0-x86_64-unknown-linux-gnu")
        : ""
  const rgBin = rgDir ? path.join(rgDir, process.platform === "win32" ? "rg.exe" : "rg") : ""
  const fdBin = fdDir ? path.join(fdDir, process.platform === "win32" ? "fd.exe" : "fd") : ""
  return { rgDir, fdDir, rgBin, fdBin }
}

const projectRoot = () => {
  const root = Instance.worktree
  if (!root || root === "/") return Instance.directory
  return root
}

const withPath = (envPath: string | undefined) => {
  const { rgDir, fdDir } = precompiled()
  const root = projectRoot()
  const baseEntries = [root, rgDir, fdDir]
  const split = envPath ? envPath.split(path.delimiter) : []
  const entries = [...baseEntries, ...split].filter((value) => value && value.length > 0)
  if (process.platform !== "win32") return entries.join(path.delimiter)
  const mapped = entries.map((value) => bashPath(value))
  return mapped.join(":")
}

const pathPrefix = () => {
  const { rgDir, fdDir } = precompiled()
  const root = projectRoot()
  const entries = [root, rgDir, fdDir].filter((value) => value && value.length > 0)
  if (entries.length === 0) return ""
  if (process.platform !== "win32") return entries.join(":")
  return entries.map((value) => bashPath(value)).join(":")
}

const bashPath = (value: string) => {
  if (process.platform !== "win32") return value
  const normalized = value.replace(/\\/g, "/")
  if (normalized.match(/^[a-zA-Z]:\//)) {
    const drive = normalized[0].toLowerCase()
    return `/${drive}/${normalized.slice(3)}`
  }
  return normalized
}

const strip = (value: string) => {
  const trimmed = value.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1)
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1)
  return trimmed
}

const base = (value: string) => {
  const cleaned = strip(value).replace(/\\/g, "/")
  const parts = cleaned.split("/")
  return (parts[parts.length - 1] || "").toLowerCase()
}

const unwrap = (parts: string[]) => {
  const items = parts.map(strip)
  const state = { index: 0 }
  const xargsOpts = new Set(["-I", "-L", "-n", "-s"])

  while (state.index < items.length) {
    const token = base(items[state.index])
    if (token === "sudo") {
      state.index += 1
      while (state.index < items.length && items[state.index].startsWith("-")) {
        if ((items[state.index] === "-u" || items[state.index] === "-g") && state.index + 1 < items.length) {
          state.index += 2
          continue
        }
        state.index += 1
      }
      continue
    }
    if (token === "command") {
      state.index += 1
      while (state.index < items.length && items[state.index].startsWith("-")) state.index += 1
      continue
    }
    if (token === "env") {
      state.index += 1
      while (state.index < items.length) {
        if (items[state.index].startsWith("-")) {
          state.index += 1
          continue
        }
        if (items[state.index].includes("=")) {
          state.index += 1
          continue
        }
        break
      }
      continue
    }
    if (token === "xargs") {
      state.index += 1
      while (state.index < items.length && items[state.index].startsWith("-")) {
        const opt = items[state.index]
        state.index += 1
        if (xargsOpts.has(opt) && state.index < items.length) {
          state.index += 1
        }
      }
      const exe = state.index < items.length ? base(items[state.index]) : ""
      return { exe, index: state.index, items }
    }
    break
  }

  const exe = state.index < items.length ? base(items[state.index]) : ""
  return { exe, index: state.index, items }
}

const isGit = (name: string) => ["git", "git.exe", "git.cmd", "git.bat"].includes(name)
const isAgentGit = (name: string) =>
  ["agent-git", "agent-git.exe", "agent-git.cmd", "agent-git.bat"].includes(name)
const isRg = (name: string) => ["rg", "ripgrep", "rg.exe", "ripgrep.exe"].includes(name)
const isFd = (name: string) => ["fd", "fdfind", "fd.exe", "fdfind.exe"].includes(name)

type SplitPart = {
  text: string
  sep: string
}

const splitUnquoted = (text: string, seps: string[]) => {
  if (!text) return [{ text: "", sep: "" }] as SplitPart[]
  const ordered = [...seps].filter((item) => item.length > 0).sort((a, b) => b.length - a.length)
  const state = {
    start: 0,
    index: 0,
    single: false,
    double: false,
    escaped: false,
  }
  const parts: SplitPart[] = []

  while (state.index < text.length) {
    const ch = text[state.index]
    if (state.escaped) {
      state.escaped = false
      state.index += 1
      continue
    }
    if (!state.single && ch === "\\") {
      state.escaped = true
      state.index += 1
      continue
    }
    if (!state.double && ch === "'") {
      state.single = !state.single
      state.index += 1
      continue
    }
    if (!state.single && ch === '"') {
      state.double = !state.double
      state.index += 1
      continue
    }
    if (!state.single && !state.double) {
      const matched = ordered.find((sep) => text.startsWith(sep, state.index))
      if (matched) {
        parts.push({ text: text.slice(state.start, state.index), sep: matched })
        state.index += matched.length
        state.start = state.index
        continue
      }
    }
    state.index += 1
  }

  parts.push({ text: text.slice(state.start), sep: "" })
  return parts
}

const shellSplit = (text: string) => {
  const state = {
    index: 0,
    current: "",
    single: false,
    double: false,
    escaped: false,
  }
  const tokens: string[] = []
  const flush = () => {
    if (!state.current) return
    tokens.push(state.current)
    state.current = ""
  }

  while (state.index < text.length) {
    const ch = text[state.index]
    if (state.escaped) {
      state.current += ch
      state.escaped = false
      state.index += 1
      continue
    }
    if (!state.single && ch === "\\") {
      state.escaped = true
      state.index += 1
      continue
    }
    if (!state.double && ch === "'") {
      state.single = !state.single
      state.index += 1
      continue
    }
    if (!state.single && ch === '"') {
      state.double = !state.double
      state.index += 1
      continue
    }
    if (!state.single && !state.double && /\s/.test(ch)) {
      flush()
      state.index += 1
      while (state.index < text.length && /\s/.test(text[state.index])) state.index += 1
      continue
    }
    state.current += ch
    state.index += 1
  }

  flush()
  return tokens
}

const rgNeedsPath = (parts: string[]) => {
  const info = unwrap(parts)
  if (!isRg(info.exe)) return false

  const tokens = info.items.slice(info.index + 1)
  const values = new Set([
    "-A",
    "--after-context",
    "-B",
    "--before-context",
    "-C",
    "--context",
    "--color",
    "--colors",
    "--context-separator",
    "--crlf",
    "--encoding",
    "-e",
    "--regexp",
    "-f",
    "--file",
    "-g",
    "--glob",
    "--iglob",
    "-m",
    "--max-count",
    "--max-depth",
    "--max-filesize",
    "--path-separator",
    "-r",
    "--replace",
    "--sort",
    "--stats",
    "-t",
    "--type",
    "-T",
    "--type-not",
    "--threads",
    "--type-add",
  ])

  const state = { uses: false, index: 0 }
  const positionals: string[] = []

  while (state.index < tokens.length) {
    const token = tokens[state.index]
    if (token === "--") {
      positionals.push(...tokens.slice(state.index + 1))
      break
    }
    if (token === "-e" || token === "--regexp" || token === "-f" || token === "--file") {
      state.uses = true
    }
    if (token.startsWith("--") && token.includes("=")) {
      state.index += 1
      continue
    }
    if (token.startsWith("-") && token !== "-") {
      const short = token.slice(0, 2)
      if (token.length >= 3 && values.has(short)) {
        if (short === "-e" || short === "-f") state.uses = true
        state.index += 1
        continue
      }
      if (values.has(token) && state.index + 1 < tokens.length) {
        state.index += 2
        continue
      }
      state.index += 1
      continue
    }
    positionals.push(token)
    state.index += 1
  }

  if (state.uses) return positionals.length === 0
  return positionals.length <= 1
}

const rewriteRgDot = (command: string) => {
  if (!command.includes("rg") && !command.includes("ripgrep")) return command
  const control = splitUnquoted(command, ["&&", "||", ";", "\n"])
  const rebuilt = control.map((part) => {
    const pipes = splitUnquoted(part.text, ["|"])
    if (pipes.length === 0) return part.text + part.sep
    const first = pipes[0].text
    const tokens = shellSplit(first)
    if (!rgNeedsPath(tokens)) return pipes.map((pipe) => pipe.text + pipe.sep).join("") + part.sep
    const updated = addDot(first)
    const rest = pipes.map((pipe, index) => (index === 0 ? updated + pipe.sep : pipe.text + pipe.sep)).join("")
    return rest + part.sep
  })
  return rebuilt.join("")
}

const redir = (text: string) => {
  const state = {
    single: false,
    double: false,
    escaped: false,
    index: 0,
  }

  while (state.index < text.length) {
    const ch = text[state.index]
    if (state.escaped) {
      state.escaped = false
      state.index += 1
      continue
    }
    if (!state.single && ch === "\\") {
      state.escaped = true
      state.index += 1
      continue
    }
    if (!state.double && ch === "'") {
      state.single = !state.single
      state.index += 1
      continue
    }
    if (!state.single && ch === '"') {
      state.double = !state.double
      state.index += 1
      continue
    }
    if (!state.single && !state.double && /\s/.test(ch)) {
      const scan = { index: state.index }
      while (scan.index < text.length && /\s/.test(text[scan.index])) scan.index += 1
      const digits = { index: scan.index }
      while (digits.index < text.length && /\d/.test(text[digits.index])) digits.index += 1
      if (text.startsWith("<<<", digits.index) || text.startsWith("<<", digits.index) || text[digits.index] === "<") {
        return { pos: state.index, stdin: true }
      }
      if (text.startsWith("&>", digits.index) || text[digits.index] === ">") {
        return { pos: state.index, stdin: false }
      }
      state.index = scan.index
      continue
    }
    state.index += 1
  }
  return { pos: null, stdin: false }
}

const addDot = (command: string) => {
  const info = redir(command)
  if (info.stdin) return command
  if (info.pos === null) {
    const trimmed = command.trimEnd()
    return trimmed + " ." + command.slice(trimmed.length)
  }
  return command.slice(0, info.pos) + " ." + command.slice(info.pos)
}

const normalizeWin = (value: string) => {
  if (process.platform !== "win32") return value
  if (!value.match(/^\/[a-z]\//i)) return value
  return value
    .replace(/^\/([a-z])\//i, (_match, drive) => `${String(drive).toUpperCase()}:\\`)
    .replace(/\//g, "\\")
}

const ripgrepConfigPath = (value: string | undefined, cwd: string) => {
  if (!value) return ""
  const home = process.env.HOME || process.env.USERPROFILE || ""
  const cleaned = strip(value)
  if (!cleaned) return ""
  const expanded =
    cleaned.startsWith("~/") && home
      ? path.join(home, cleaned.slice(2))
      : cleaned === "~" && home
        ? home
        : cleaned
  const normalized = normalizeWin(expanded)
  if (path.isAbsolute(normalized)) return normalized
  return path.resolve(cwd, normalized)
}

const safeEnv = (cwd: string, envPath: string): NodeJS.ProcessEnv => {
  const env = { ...process.env, PATH: envPath } as NodeJS.ProcessEnv & Record<string, string | undefined>
  const key = "RIPGREP_CONFIG_PATH"
  const config = ripgrepConfigPath(env[key], cwd)
  if (!config) return env
  if (existsSync(config)) return env
  delete env[key]
  return env
}

const resolveCd = (cwd: string, prev: string, arg?: string) => {
  const home = process.env.HOME || process.env.USERPROFILE || ""
  if (arg === undefined) {
    if (home) return Filesystem.normalizePath(normalizeWin(home))
    return Filesystem.normalizePath(normalizeWin(cwd))
  }
  const raw = strip(arg)
  if (raw === "-") return Filesystem.normalizePath(normalizeWin(prev || cwd))
  const expanded =
    raw.startsWith("~") && home
      ? raw.length === 1
        ? home
        : path.join(home, raw.slice(2))
      : raw
  const normalized = normalizeWin(expanded)
  const resolved = path.isAbsolute(normalized) ? normalized : path.resolve(cwd, normalized)
  return Filesystem.normalizePath(resolved)
}

const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`

const shellArgs = (shellPath: string) => {
  const name = path.basename(shellPath).toLowerCase()
  if (name === "bash" || name === "bash.exe") {
    return process.platform === "win32" ? ["--login"] : ["-l"]
  }
  if (name.endsWith("sh")) return ["-l"]
  return []
}

const renderOutput = (head: Buffer, tail: Buffer, dropped: number, tag: string) => {
  const tailText = tail.toString("utf-8")
  if (dropped <= 0) return tailText
  const headText = head.toString("utf-8")
  if (!headText) return tailText
  return `${headText}\n...[${tag} truncated]...\n${tailText}`
}

class BashSession {
  private started = false
  private timedOut = false
  private proc: ChildProcessWithoutNullStreams | undefined
  private lastCwd: string | undefined
  private ran = false
  private boot = ""
  private readonly env: NodeJS.ProcessEnv
  private readonly shell: string
  private readonly args: string[]

  constructor(shell: string, env: NodeJS.ProcessEnv) {
    this.shell = shell
    this.env = env
    this.args = shellArgs(shell)
  }

  needsRestart() {
    if (!this.started || !this.proc) return false
    if (this.timedOut) return true
    return this.proc.exitCode !== null
  }

  getLastCwd() {
    return this.lastCwd
  }

  setLastCwd(cwd: string) {
    this.lastCwd = cwd
  }

  async start() {
    if (this.started) return
    const proc = spawn(this.shell, this.args, {
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    })
    this.proc = proc
    this.started = true
    this.timedOut = false
    this.ran = false
    this.boot = ""

    const record = (text: string) => {
      if (this.ran) return
      const next = this.boot ? `${this.boot}\n${text}` : text
      this.boot = next.length > BOOT_MAX_BYTES ? next.slice(-BOOT_MAX_BYTES) : next
    }

    proc.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf-8").trimEnd()
      if (!text) return
      record(text)
    })
    proc.on("error", (error) => {
      record(error.message || String(error))
    })
    proc.on("exit", (code, signal) => {
      if (this.ran) return
      const parts = [
        code !== null ? `exit code ${code}` : "",
        signal ? `signal ${signal}` : "",
      ].filter((value) => value.length > 0)
      if (parts.length === 0) return
      record(`bash exited early (${parts.join(", ")})`)
    })
  }

  async stop() {
    const proc = this.proc
    if (!proc) return
    await Shell.killTree(proc)
    this.proc = undefined
    this.started = false
    this.timedOut = false
    this.ran = false
    this.boot = ""
  }

  async run(options: {
    command: string
    timeout: number
    abort: AbortSignal
    onData?: (chunk: Buffer) => void
  }) {
    const proc = this.proc
    const boot = this.ran ? "" : this.boot.trim()
    const detail = boot ? `: ${boot}` : ""
    if (!proc || !proc.stdin || !proc.stdout || !proc.stderr) {
      throw new Error(`Bash session is not available${detail}`)
    }
    if (proc.exitCode !== null) {
      throw new Error(`Bash session exited with code ${proc.exitCode}${detail}`)
    }
    this.ran = true

    const status = {
      done: false,
      exit: null as number | null,
      timedOut: false,
      aborted: false,
      stdoutHead: Buffer.alloc(0),
      stdoutTail: Buffer.alloc(0),
      stdoutDropped: 0,
      stderrHead: Buffer.alloc(0),
      stderrTail: Buffer.alloc(0),
      stderrDropped: 0,
    }

    const updateBuffers = (chunk: Buffer, headKey: "stdoutHead" | "stderrHead", tailKey: "stdoutTail" | "stderrTail", dropKey: "stdoutDropped" | "stderrDropped") => {
      const head = status[headKey]
      const tail = status[tailKey]
      const dropped = status[dropKey]
      const headRemaining = HEAD_MAX_BYTES - head.length
      const nextHead = headRemaining > 0 ? Buffer.concat([head, chunk.subarray(0, headRemaining)]) : head
      const mergedTail = Buffer.concat([tail, chunk])
      const trimmed =
        mergedTail.length > TAIL_MAX_BYTES ? mergedTail.subarray(mergedTail.length - TAIL_MAX_BYTES) : mergedTail
      const dropDelta = mergedTail.length > TAIL_MAX_BYTES ? mergedTail.length - TAIL_MAX_BYTES : 0
      status[headKey] = nextHead
      status[tailKey] = trimmed
      status[dropKey] = dropped + dropDelta
    }

    const parseSentinel = () => {
      const tail = status.stdoutTail
      const start = Math.max(0, tail.length - SENTINEL_WINDOW_BYTES)
      const windowed = tail.subarray(start)
      const idx = windowed.lastIndexOf(sentinelBeforeBytes)
      if (idx === -1) return null
      const absolute = idx + start
      const afterIdx = tail.indexOf(sentinelAfterBytes, absolute + sentinelBeforeBytes.length)
      if (afterIdx === -1) return null
      const codeBytes = tail.subarray(absolute + sentinelBeforeBytes.length, afterIdx)
      const codeText = codeBytes.toString("utf-8")
      if (!/^\d+$/.test(codeText)) return null
      const code = Number(codeText)
      const stdoutTail = tail.subarray(0, absolute)
      return { code, stdoutTail }
    }

    const buildOutput = (stdoutTail: Buffer) => {
      const stdoutText = renderOutput(status.stdoutHead, stdoutTail, status.stdoutDropped, "stdout")
      const stderrText = renderOutput(status.stderrHead, status.stderrTail, status.stderrDropped, "stderr")
      const output = stderrText ? [stdoutText, stderrText].filter((item) => item.length > 0).join("\n") : stdoutText
      const trimmed = output.endsWith("\n") ? output.slice(0, -1) : output
      return trimmed
    }

    const wrapper = [
      "__OPENCODE_ERREXIT=0",
      "case $- in *e*) __OPENCODE_ERREXIT=1;; esac",
      "set +e",
      "{",
      options.command,
      "}",
      "__OPENCODE_STATUS=$?",
      "if [ $__OPENCODE_ERREXIT -eq 1 ]; then set -e; fi",
      `printf '%s%s%s\\n' ${shellQuote(sentinelBefore)} "$__OPENCODE_STATUS" ${shellQuote(sentinelAfter)}`,
      "",
    ].join("\n")

    const finalize = (payload: {
      exit: number | null
      timedOut: boolean
      aborted: boolean
      stdoutTail?: Buffer
    }) => {
      if (status.done) return
      status.done = true
      status.exit = payload.exit
      status.timedOut = payload.timedOut
      status.aborted = payload.aborted
      const stdoutTail = payload.stdoutTail || status.stdoutTail
      return {
        output: buildOutput(stdoutTail),
        exit: status.exit,
        timedOut: status.timedOut,
        aborted: status.aborted,
      }
    }

    return await new Promise<{
      output: string
      exit: number | null
      timedOut: boolean
      aborted: boolean
    }>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeoutTimer)
        proc.stdout.off("data", onStdout)
        proc.stderr.off("data", onStderr)
        proc.off("exit", onExit)
        proc.off("error", onError)
        options.abort.removeEventListener("abort", onAbort)
      }

      const finish = (payload: { exit: number | null; timedOut: boolean; aborted: boolean; stdoutTail?: Buffer }) => {
        const result = finalize(payload)
        if (!result) return
        cleanup()
        resolve(result)
      }

      const onStdout = (chunk: Buffer) => {
        updateBuffers(chunk, "stdoutHead", "stdoutTail", "stdoutDropped")
        if (options.onData) options.onData(chunk)
        const parsed = parseSentinel()
        if (!parsed) return
        finish({ exit: parsed.code, timedOut: false, aborted: false, stdoutTail: parsed.stdoutTail })
      }

      const onStderr = (chunk: Buffer) => {
        updateBuffers(chunk, "stderrHead", "stderrTail", "stderrDropped")
        if (options.onData) options.onData(chunk)
      }

      const onAbort = () => {
        status.aborted = true
        this.timedOut = true
        void Shell.killTree(proc)
        finish({ exit: null, timedOut: false, aborted: true })
      }

      const onTimeout = () => {
        status.timedOut = true
        this.timedOut = true
        void Shell.killTree(proc)
        finish({ exit: null, timedOut: true, aborted: false })
      }

      const onExit = () => {
        if (status.done) return
        cleanup()
        reject(new Error("Bash session exited unexpectedly"))
      }

      const onError = (error: Error) => {
        if (status.done) return
        cleanup()
        reject(error)
      }

      const timeoutTimer = setTimeout(onTimeout, options.timeout + 100)

      if (options.abort.aborted) {
        onAbort()
        return
      }

      proc.stdout.on("data", onStdout)
      proc.stderr.on("data", onStderr)
      proc.once("exit", onExit)
      proc.once("error", onError)
      options.abort.addEventListener("abort", onAbort, { once: true })

      proc.stdin.write(wrapper)
    })
  }

  async cwd() {
    const result = await this.run({ command: "pwd", timeout: 5_000, abort: new AbortController().signal })
    if (result.exit !== 0) return null
    const value = result.output.trim()
    if (!value) return null
    return value
  }
}

export const log = Log.create({ service: "bash-tool" })

const resolveWasm = (asset: string) => {
  if (asset.startsWith("file://")) return fileURLToPath(asset)
  if (asset.startsWith("/") || /^[a-z]:/i.test(asset)) return asset
  const url = new URL(asset, import.meta.url)
  return fileURLToPath(url)
}

const parser = lazy(async () => {
  const { Parser } = await import("web-tree-sitter")
  const { default: treeWasm } = await import("web-tree-sitter/tree-sitter.wasm" as string, {
    with: { type: "wasm" },
  })
  const treePath = resolveWasm(treeWasm)
  await Parser.init({
    locateFile() {
      return treePath
    },
  })
  const { default: bashWasm } = await import("tree-sitter-bash/tree-sitter-bash.wasm" as string, {
    with: { type: "wasm" },
  })
  const bashPath = resolveWasm(bashWasm)
  const bashLanguage = await Language.load(bashPath)
  const p = new Parser()
  p.setLanguage(bashLanguage)
  return p
})

// TODO: we may wanna rename this tool so it works better on other shells
export const BashTool = Tool.define("bash", async () => {
  const system = process.platform === "win32" ? "Windows（使用 Git Bash）" : "Unix/Linux（使用原生 bash）"
  const bins = precompiled()
  const exists = (value: string) => (value ? Filesystem.exists(value) : Promise.resolve(false))
  const rg = await exists(bins.rgBin).then((found) => found || Boolean(Bun.which("rg")))
  const fd = await exists(bins.fdBin).then((found) => found || Boolean(Bun.which("fd") || Bun.which("fdfind")))
  const note =
    rg && fd
      ? "- ⚠️ 搜索必须使用现代工具：`rg`（内容搜索）和 `fd`（文件查找），禁止使用 grep/find"
      : ""
  const desc = DESCRIPTION.replaceAll("${systemInfo}", system).replaceAll("${searchNote}", note).trim()
  return {
    description: desc,
    parameters: z.object({
      command: z.string().describe("要执行的 bash 命令").optional(),
      restart: z
        .preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean())
        .describe("设为 true 重启会话（超时或异常退出时使用）")
        .optional(),
      timeout: z
        .coerce.number()
        .describe("超时时间（秒），默认 20。编译等长时任务可适当增大，最大 120")
        .optional(),
    }),
    async execute(params, ctx) {
      const lock = await Lock.write(`bash:${ctx.sessionID}`)
      try {
        const restart = params.restart === true
        const command = typeof params.command === "string" ? params.command : ""
        if (!restart && !command) {
          throw new Error(
            "Missing required parameter 'command' for the bash tool. " +
            "Please provide a shell command string to execute. " +
            "Example: {'command': 'ls -la'} or {'command': 'pwd'}. " +
            "If you need to restart the session, use {'restart': true}.",
          )
        }
        const detail = command || "bash"
        const value = typeof params.timeout === "number" ? params.timeout : undefined
        const sessionState = getSessionState(ctx.sessionID)
        const cwd = sessionState.cwd || Instance.directory
        if (value !== undefined && value < 0) {
          throw new Error(`Invalid timeout value: ${value}. Timeout must be a positive number.`)
        }
        const timeoutSeconds = value ?? DEFAULT_TIMEOUT_SECONDS
        if (command && timeoutSeconds > MAX_TIMEOUT_SECONDS) {
          const out = `timeout 最大支持 ${MAX_TIMEOUT_SECONDS} 秒，请设置为 1-${MAX_TIMEOUT_SECONDS} 秒。已拦截本次 bash 命令执行。`
          throw new Error(out)
        }
        const timeout = timeoutSeconds * 1000
        const envPath = withPath(process.env.PATH)
        const env = safeEnv(cwd, envPath)
        const rgAvailable = await exists(bins.rgBin).then((found) => found || Boolean(Bun.which("rg")))
        const fdAvailable = await exists(bins.fdBin).then((found) => found || Boolean(Bun.which("fd") || Bun.which("fdfind")))
        if (restart) {
          const current = sessionState.session
          const last = sessionState.cwd
          if (current) {
            await current.stop().catch(() => { })
          }
          const shell = resolveShell()
          sessionState.shell = shell
          const next = new BashSession(shell, env)
          sessionState.session = next
          await next.start()
          sessionState.restarts += 1
          const prefix = pathPrefix()
          if (prefix) {
            await next
              .run({
                command: `export PATH="${prefix}:$PATH"\nhash -r`,
                timeout: 5_000,
                abort: new AbortController().signal,
              })
              .catch(() => { })
          }
          const restore = last ? bashPath(last).replace(/"/g, '\\"') : ""
          const note = restore ? ` (restored working directory: ${last})` : ""
          if (restore) {
            await next
              .run({
                command: `cd "${restore}" 2>/dev/null || true`,
                timeout: 5_000,
                abort: new AbortController().signal,
              })
              .catch(() => { })
            next.setLastCwd(last)
          }
          const out = `tool has been restarted.${note}`
          ctx.metadata({
            metadata: {
              output: out,
              description: detail,
            },
          })
          const meta: BashMeta = {
            output: out,
            exit: null,
            description: detail,
            blocked: false,
          }
          if (!command) {
            return {
              title: detail,
              metadata: meta,
              output: out,
            }
          }
        }
        const prepared = await (async () => {
          const text = rewriteRgDot(command)
          const tree = await parser().then((p) => p.parse(text))
          if (!tree) {
            throw new Error("Failed to parse command")
          }
          const commands: string[][] = []
          for (const node of tree.rootNode.descendantsOfType("command")) {
            if (!node) continue
            const commandParts: string[] = []
            const indices = Array.from({ length: node.childCount }, (_value, index) => index)
            for (const index of indices) {
              const child = node.child(index)
              if (!child) continue
              if (
                child.type !== "command_name" &&
                child.type !== "word" &&
                child.type !== "string" &&
                child.type !== "raw_string" &&
                child.type !== "concatenation"
              ) {
                continue
              }
              commandParts.push(child.text)
            }
            if (commandParts.length) commands.push(commandParts)
          }
          return { command: text, commands }
        })()

        const blocked = (() => {
          for (const command of prepared.commands) {
            const info = unwrap(command)
            if (isGit(info.exe)) {
              return {
                reason:
                  "检测到使用了 `git`，为避免污染用户的提交记录，本工具禁止直接调用 git 命令。请改用 `agent-git`（例如：`agent-git status`）。",
              }
            }
            if (isAgentGit(info.exe)) {
              const next = info.items[info.index + 1] || ""
              if (next.toLowerCase() === "reset") {
                return {
                  reason:
                    "检测到你使用了 `agent-git reset`，该命令会污染历史的提交记录，如果你需要回退某次提交，请改用 `agent-git revert <commit>` 撤销指定 commit 的改动，确保提交记录的完整性。",
                }
              }
            }
          }

          if (!rgAvailable || !fdAvailable) return null

          for (const command of prepared.commands) {
            const info = unwrap(command)
            if (info.exe === "find") {
              return {
                reason: [
                  "find 已禁用，请用 fd 代替（文件名搜索）",
                  "**规则**：必须显式指定搜索目录",
                  "```bash",
                  'fd "PATTERN" <dir>          # 按文件名正则搜索',
                  "fd -e py <dir>               # 按扩展名过滤",
                  'fd -t f "PATTERN" <dir>     # 只搜文件',
                  'fd -t d "PATTERN" <dir>     # 只搜目录',
                  'fd -d 2 "PATTERN" <dir>     # 限制深度',
                  'fd "PATTERN" <dir> -E .git -E node_modules  # 排除目录',
                  "```",
                ].join("\n"),
              }
            }
            if (info.exe === "grep") {
              return {
                reason: [
                  "grep 已禁用，请用 rg 代替（内容搜索）",
                  "**规则**：必须显式指定搜索目录",
                  "```bash",
                  'rg "PATTERN" <dir>          # 正则内容搜索',
                  'rg -F "LITERAL" <dir>       # 字面量搜索（精确匹配）',
                  'rg -t py "PATTERN" <dir>    # 按语言类型过滤',
                  'rg -g "*.py" "PATTERN" <dir>  # 按 glob 过滤',
                  'rg -l "PATTERN" <dir>       # 只列文件名',
                  'rg -C 3 "PATTERN" <dir>     # 显示上下文前后各3行',
                  'rg -i/-w/-S "PATTERN" <dir> # 忽略大小写/全词/智能大小写',
                  "```",
                ].join("\n"),
              }
            }
          }
          return null
        })()

        if (blocked) {
          throw new Error(blocked.reason)
        }

        const directories = new Set<string>()
        if (!Instance.containsPath(cwd)) directories.add(cwd)
        const patterns = new Set<string>()
        const always = new Set<string>()

        for (const command of prepared.commands) {
          const head = base(command[0] || "")
          if (["cd", "rm", "cp", "mv", "mkdir", "touch", "chmod", "chown"].includes(head)) {
            for (const arg of command.slice(1)) {
              if (arg.startsWith("-") || (head === "chmod" && arg.startsWith("+"))) continue
              const resolved = await $`realpath ${arg}`
                .cwd(cwd)
                .quiet()
                .nothrow()
                .text()
                .then((x) => x.trim())
              log.info("resolved path", { arg, resolved })
              if (resolved) {
                const normalized = normalizeWin(resolved)
                if (!Instance.containsPath(normalized)) directories.add(normalized)
              }
            }
          }

          if (command.length && head !== "cd") {
            patterns.add(command.join(" "))
            always.add(BashArity.prefix(command).join(" ") + "*")
          }
        }

        if (directories.size > 0) {
          const globs = Array.from(directories).map((dir) => {
            // Preserve POSIX-looking paths with /s, even on Windows
            if (dir.startsWith("/")) return `${dir.replace(/[\\/]+$/, "")}/*`
            return path.join(dir, "*")
          })
          await ctx.ask({
            permission: "external_directory",
            patterns: globs,
            always: globs,
            metadata: {},
          })
        }

        if (patterns.size > 0) {
          await ctx.ask({
            permission: "bash",
            patterns: Array.from(patterns),
            always: Array.from(always),
            metadata: {},
          })
        }

        const search = prepared.commands.some((command) => {
          const info = unwrap(command)
          return isRg(info.exe) || isFd(info.exe)
        })

        const ensureSession = async () => {
          const current = sessionState.session
          if (current && !current.needsRestart()) return { session: current, notice: "" }
          const restarted = Boolean(current)
          const last = current?.getLastCwd() || sessionState.cwd
          if (current) {
            await current.stop().catch(() => { })
          }
          const shell = resolveShell()
          sessionState.shell = shell
          const next = new BashSession(shell, env)
          sessionState.session = next
          await next.start()
          sessionState.restarts += 1
          const prefix = pathPrefix()
          if (prefix) {
            await next
              .run({
                command: `export PATH="${prefix}:$PATH"\nhash -r`,
                timeout: 5_000,
                abort: new AbortController().signal,
              })
              .catch(() => { })
          }
          if (last) {
            const restore = bashPath(last).replace(/"/g, '\\"')
            await next
              .run({
                command: `cd "${restore}" 2>/dev/null || true`,
                timeout: 5_000,
                abort: new AbortController().signal,
              })
              .catch(() => { })
            next.setLastCwd(last)
          }
          return { session: next, notice: restarted ? "[Auto-restarted bash session]\n" : "" }
        }

        const checkCwd = async (session: BashSession) => {
          const result = await session
            .run({ command: "command pwd", timeout: 5_000, abort: new AbortController().signal })
            .then(
              (value) => ({ ok: true, value, error: "" }),
              (error) => ({ ok: false, value: null, error: String(error) }),
            )
          if (!result.ok || !result.value || result.value.exit !== 0) {
            const error = result.error || "pwd failed"
            return { ok: false, cwd: "", error }
          }
          const text = result.value.output.trim()
          if (!text) return { ok: true, cwd: "", error: "" }
          return { ok: true, cwd: normalizeWin(text), error: "" }
        }

        const ensureReady = async () => {
          const state = { session: null as BashSession | null, notice: "", cwd: "", error: "" }
          const loop = { count: 0 }
          while (loop.count < 2) {
            loop.count += 1
            const ready = await ensureSession()
            state.notice += ready.notice
            const session = ready.session
            const check = await checkCwd(session)
            if (!check.ok) {
              state.error = check.error || state.error
              await session.stop().catch(() => { })
              sessionState.session = undefined
              continue
            }
            state.session = session
            state.cwd = check.cwd
            break
          }
          if (!state.session) {
            const tail = state.error ? `: ${state.error}` : ""
            throw new Error(`Bash session is not available${tail}`)
          }

          const expected = sessionState.cwd
          if (!expected) {
            if (state.cwd) {
              sessionState.cwd = state.cwd
              state.session.setLastCwd(state.cwd)
            }
            return { session: state.session, notice: state.notice }
          }
          const needs = state.cwd ? state.cwd !== expected : true
          if (needs) {
            const restore = bashPath(expected).replace(/"/g, '\\"')
            await state.session
              .run({
                command: `cd "${restore}" 2>/dev/null || cd "${restore}" || exit 1`,
                timeout: 5_000,
                abort: new AbortController().signal,
              })
              .catch(() => { })
            const synced = await checkCwd(state.session)
            if (synced.ok && synced.cwd) {
              sessionState.cwd = synced.cwd
              state.session.setLastCwd(synced.cwd)
              return { session: state.session, notice: state.notice }
            }
            sessionState.cwd = expected
            state.session.setLastCwd(expected)
            return { session: state.session, notice: state.notice }
          }
          if (state.cwd) {
            sessionState.cwd = state.cwd
            state.session.setLastCwd(state.cwd)
          }

          return { session: state.session, notice: state.notice }
        }

        const ready = await ensureReady()
        const session = ready.session
        const notice = ready.notice
        const meta = { output: "", truncated: false }

        ctx.metadata({
          metadata: {
            output: "",
            description: detail,
          },
        })
        const onData = (chunk: Buffer) => {
          if (meta.truncated) return
          const next = meta.output + chunk.toString()
          if (next.length <= MAX_METADATA_LENGTH) {
            meta.output = next
            ctx.metadata({ metadata: { output: meta.output, description: detail } })
            return
          }
          meta.output = next.slice(0, MAX_METADATA_LENGTH) + "\n\n..."
          meta.truncated = true
          ctx.metadata({ metadata: { output: meta.output, description: detail } })
        }

        const result = await session.run({
          command: prepared.command,
          timeout,
          abort: ctx.abort,
          onData,
        })

        const outputState = { value: result.output }
        if (notice) {
          outputState.value = outputState.value ? notice + outputState.value : notice.trim()
        }
        const countOutput = outputState.value


        const exit = typeof result.exit === "number" ? result.exit : null
        const resultMetadata: string[] = []

        if (result.timedOut) {
          resultMetadata.push(`bash tool terminated command after exceeding timeout ${timeoutSeconds} s`)
        }

        if (result.aborted) {
          resultMetadata.push("User aborted the command")
        }

        // if (resultMetadata.length > 0) {
        //   outputState.value += "\n\n<bash_metadata>\n" + resultMetadata.join("\n") + "\n</bash_metadata>"
        // }

        const lines = search && countOutput ? countOutput.split("\n").length : 0
        const intercept = search && lines > MAX_SEARCH_LINES
        if (intercept) {
          const noticeText = `搜索结果过多（超过50行）。关键词优化策略：
1. 保持主题相关性：基于当前意图扩展关键词，不要切换到不相关话题
    - 通用词→具体词：如'user'→'user_login'、'user_auth'
    - 短词→长词：如'auth'→'authentication'、'authorization'
    - 单一概念→复合概念：如'log'→'error_log'、'debug_log'
2. 添加上下文约束：结合具体场景、文件类型、模块名称等
3. 使用精确匹配：添加引号、使用正则表达式等
4. 使用限制参数减少输出：
   - rg: -c(仅计数), -l(仅文件名), --max-count(限制每文件匹配数), --max-depth(限制深度), --type(文件类型)
   - fd: --max-depth(限制深度), -t(文件类型), -E(扩展名), -x(执行命令过滤)

重要提醒：请继续使用rg/fd，只在相关语义范围内优化搜索词。`
          outputState.value = noticeText
          if (exit !== null && exit !== 0 && exit !== 1) {
            outputState.value += `\n[Command exited with code ${exit}]`
          }
        }

        if (!intercept) {
          if (exit !== null && exit !== 0) {
            const line = `[Command exited with code ${exit}]`
            outputState.value = outputState.value ? outputState.value + "\n" + line : line
          }
          if (exit === 0 && outputState.value.length === 0) {
            outputState.value = "[Command completed successfully but produced no output]"
          }
        }

        if (exit === 0) {
          const nextCwd = await session.cwd().then((value) => value, () => null)
          if (nextCwd) {
            sessionState.prev = sessionState.cwd
            sessionState.cwd = normalizeWin(nextCwd)
            session.setLastCwd(sessionState.cwd)
          }
        }

        const metaOut =
          outputState.value.length > MAX_METADATA_LENGTH
            ? outputState.value.slice(0, MAX_METADATA_LENGTH) + "\n\n..."
            : outputState.value
        ctx.metadata({
          metadata: {
            output: metaOut,
            description: detail,
          },
        })

        const metaResult: BashMeta = {
          output: metaOut,
          exit,
          description: detail,
          blocked: false,
        }
        return {
          title: detail,
          metadata: metaResult,
          output: outputState.value,
        }
      } finally {
        lock[Symbol.dispose]()
      }
    },
  }
})
