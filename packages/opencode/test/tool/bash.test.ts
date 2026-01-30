import { beforeAll, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"

const root = path.resolve(process.cwd())
const tmp = path.join(root, ".tmp-bash-tool-test")
const home = path.join(tmp, "home")
const plat = process.platform
const rbin =
  plat === "win32"
    ? path.join(root, "src", "pre_compiled", "rg", "ripgrep-15.1.0-x86_64-pc-windows-msvc")
    : path.join(root, "src", "pre_compiled", "rg", "ripgrep-15.1.0-x86_64-unknown-linux-musl")
const fbin =
  plat === "win32"
    ? path.join(root, "src", "pre_compiled", "fd", "fd-v10.3.0-x86_64-pc-windows-msvc")
    : path.join(root, "src", "pre_compiled", "fd", "fd-v10.3.0-x86_64-unknown-linux-gnu")

process.env.COSTRICT_TEST_HOME = home
process.env.XDG_DATA_HOME = path.join(home, "data")
process.env.XDG_CACHE_HOME = path.join(home, "cache")
process.env.XDG_CONFIG_HOME = path.join(home, "config")
process.env.XDG_STATE_HOME = path.join(home, "state")
const existing = process.env.PATH || ""
const entries = [rbin, fbin, existing].filter((value) => value && value.length > 0)
process.env.PATH = entries.join(path.delimiter)

const cache = {
  bash: undefined as undefined | typeof import("../../src/tool/bash"),
  inst: undefined as undefined | typeof import("../../src/project/instance"),
}

const slash = (value: string) => value.replace(/\\/g, "/")

const load = async () => {
  if (cache.bash && cache.inst) return { bash: cache.bash, inst: cache.inst }
  const bash = await import("../../src/tool/bash")
  const inst = await import("../../src/project/instance")
  cache.bash = bash
  cache.inst = inst
  return { bash, inst }
}

const prep = async (name: string) => {
  const dir = path.join(tmp, name)
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
  return dir
}

const call = async (dir: string, params: { command: string; timeout?: number; restart?: boolean }) => {
  const mod = await load()
  const meta = { output: "", description: "" }
  const asks: Array<Record<string, unknown>> = []
  const ctx = {
    sessionID: "test",
    messageID: "test",
    agent: "test",
    abort: new AbortController().signal,
    metadata(input: { title?: string; metadata?: { output?: string; description?: string } }) {
      if (input.metadata?.output !== undefined) meta.output = input.metadata.output
      if (input.metadata?.description !== undefined) meta.description = input.metadata.description
    },
    async ask(input: Record<string, unknown>) {
      asks.push(input)
    },
  }
  const result = await mod.inst.Instance.provide({
    directory: dir,
    fn: async () => {
      const tool = await mod.bash.BashTool.init()
      return tool.execute(params, ctx)
    },
  })
  return { result, meta, asks }
}

const pick = (asks: Array<Record<string, unknown>>, name: string) => {
  const match = asks.find((item) => (item as { permission?: string }).permission === name)
  return match as { permission?: string; patterns?: string[]; always?: string[] } | undefined
}

const hasRealpath = () => Boolean(Bun.which("realpath"))

beforeAll(async () => {
  await fs.mkdir(tmp, { recursive: true })
  await fs.mkdir(home, { recursive: true })
})

describe("bash tool basics", () => {
  test("basic command", async () => {
    const dir = await prep("basic")
    const res = await call(dir, { command: "echo test" })
    expect(res.result.metadata.exit).toBe(0)
    expect(res.result.output.includes("test")).toBe(true)
  })
})

describe("bash tool safeguards", () => {
  test("runs precompiled rg/fd binaries", async () => {
    const dir = await prep("bins")
    const file = path.join(dir, "bin.txt")
    await fs.writeFile(file, "bin-check\n", "utf8")
    const rex = plat === "win32" ? "rg.exe" : "rg"
    const fex = plat === "win32" ? "fd.exe" : "fd"
    const rcmd = slash(path.join(rbin, rex))
    const fcmd = slash(path.join(fbin, fex))
    const resRg = await call(dir, { command: `"${rcmd}" "bin-check" .` })
    const resFd = await call(dir, { command: `"${fcmd}" "bin" .` })
    expect(resRg.result.output.includes("bin.txt")).toBe(true)
    expect(resFd.result.output.includes("bin.txt")).toBe(true)
  })

  test("blocks direct git usage", async () => {
    const dir = await prep("git-block")
    const res = await call(dir, { command: "git status" })
    expect(res.result.metadata.blocked).toBe(true)
    expect(res.result.output.includes("agent-git")).toBe(true)
  })

  test("blocks agent-git reset", async () => {
    const dir = await prep("agent-git-reset")
    const res = await call(dir, { command: "agent-git reset HEAD~1" })
    expect(res.result.metadata.blocked).toBe(true)
    expect(res.result.output.includes("revert")).toBe(true)
  })

  test("blocks find/grep when rg/fd available", async () => {
    const dir = await prep("find-grep-block")
    const resFind = await call(dir, { command: "find . -maxdepth 1" })
    const resGrep = await call(dir, { command: "grep foo bar.txt" })
    expect(resFind.result.metadata.blocked).toBe(true)
    expect(resFind.result.output.includes("fd")).toBe(true)
    expect(resGrep.result.metadata.blocked).toBe(true)
    expect(resGrep.result.output.includes("rg")).toBe(true)
  })

  test("adds implicit path for rg without explicit PATH", async () => {
    const dir = await prep("rg-dot")
    const target = path.join(dir, "needle.txt")
    await fs.writeFile(target, "unique-rg-dot-value\n", "utf8")
    const res = await call(dir, { command: 'rg "unique-rg-dot-value"' })
    expect(res.result.output.includes("needle.txt")).toBe(true)
    expect(res.result.output.includes("unique-rg-dot-value")).toBe(true)
  })

  test("adds implicit path for rg -e without PATH", async () => {
    const dir = await prep("rg-dot-flag")
    const target = path.join(dir, "flag.txt")
    await fs.writeFile(target, "flag-needle\n", "utf8")
    const res = await call(dir, { command: 'rg -e "flag-needle"' })
    expect(res.result.output.includes("flag.txt")).toBe(true)
    expect(res.result.output.includes("flag-needle")).toBe(true)
  })

  test("adds implicit path for rg in pipeline-start", async () => {
    const dir = await prep("rg-pipeline")
    const target = path.join(dir, "pipe.txt")
    await fs.writeFile(target, "pipeline-needle\n", "utf8")
    const res = await call(dir, { command: 'rg "pipeline-needle" | head -n 1' })
    expect(res.result.output.includes("pipe.txt")).toBe(true)
    expect(res.result.output.includes("pipeline-needle")).toBe(true)
  })

  test("does not add dot for rg with stdin pipe", async () => {
    const dir = await prep("rg-pipe")
    const res = await call(dir, { command: 'printf "pipe-needle\\n" | rg "pipe-needle"' })
    expect(res.result.output.includes("pipe-needle")).toBe(true)
  })

  test("does not add dot for rg with stdin redirection", async () => {
    const dir = await prep("rg-redir")
    const target = path.join(dir, "input.txt")
    await fs.writeFile(target, "redir-needle\n", "utf8")
    const res = await call(dir, { command: 'rg "redir-needle" < input.txt' })
    expect(res.result.output.includes("redir-needle")).toBe(true)
  })

  test("blocks git under wrappers", async () => {
    const dir = await prep("git-wrap")
    const envRes = await call(dir, { command: "env FOO=1 git status" })
    const cmdRes = await call(dir, { command: "command -- git status" })
    const sudoRes = await call(dir, { command: "sudo -n git status" })
    expect(envRes.result.metadata.blocked).toBe(true)
    expect(cmdRes.result.metadata.blocked).toBe(true)
    expect(sudoRes.result.metadata.blocked).toBe(true)
  })

  test("blocks git under xargs", async () => {
    const dir = await prep("git-xargs")
    const res = await call(dir, { command: "xargs git status" })
    expect(res.result.metadata.blocked).toBe(true)
    expect(res.result.output.includes("agent-git")).toBe(true)
  })

  test("blocks agent-git reset under wrappers", async () => {
    const dir = await prep("agent-git-wrap")
    const res = await call(dir, { command: "env FOO=1 agent-git reset HEAD~1" })
    expect(res.result.metadata.blocked).toBe(true)
    expect(res.result.output.includes("revert")).toBe(true)
  })

  test("blocks agent-git reset under xargs", async () => {
    const dir = await prep("agent-git-xargs")
    const res = await call(dir, { command: "xargs agent-git reset HEAD~1" })
    expect(res.result.metadata.blocked).toBe(true)
    expect(res.result.output.includes("revert")).toBe(true)
  })

  test("blocks grep in pipelines", async () => {
    const dir = await prep("grep-pipe")
    const res = await call(dir, { command: 'printf "pipe\\n" | grep pipe' })
    expect(res.result.metadata.blocked).toBe(true)
    expect(res.result.output.includes("rg")).toBe(true)
  })

  test("blocks grep under xargs", async () => {
    const dir = await prep("grep-xargs")
    const res = await call(dir, { command: "xargs grep needle" })
    expect(res.result.metadata.blocked).toBe(true)
    expect(res.result.output.includes("rg")).toBe(true)
  })

  test("blocks large rg/fd output with fixed message", async () => {
    const dir = await prep("truncate")
    const files = Array.from({ length: 60 }, (_item, index) => path.join(dir, `bulk-${index}.txt`))
    await Promise.all(files.map((file) => fs.writeFile(file, "x\n", "utf8")))
    const res = await call(dir, { command: 'fd "bulk-" .' })
    expect(res.result.output.includes("搜索结果过多（超过50行）。关键词优化策略：")).toBe(true)
    expect(res.result.output.includes("请继续使用rg/fd")).toBe(true)
    expect(res.result.metadata.truncated).toBe(false)
  })

  test("adds exit code info on non-zero exit", async () => {
    const dir = await prep("exit-code")
    const res = await call(dir, { command: 'rg "no-match-value" .' })
    expect(res.result.output.includes("[Command exited with code 1]")).toBe(true)
  })

  test("returns empty output hint", async () => {
    const dir = await prep("empty-output")
    const res = await call(dir, { command: "cd ." })
    expect(res.result.output.includes("[Command completed successfully but produced no output]")).toBe(true)
  })

  test("blocks timeout above max seconds", async () => {
    const dir = await prep("timeout-max")
    const res = await call(dir, { command: "pwd", timeout: 121 })
    expect(res.result.metadata.blocked).toBe(true)
    expect(res.result.output.includes("最大支持 120 秒")).toBe(true)
  })

  test("keeps cwd across timeout restart", async () => {
    const dir = await prep("restart")
    const sub = path.join(dir, "child")
    await fs.mkdir(sub, { recursive: true })
    await call(dir, { command: "cd child" })
    const slow = await call(dir, { command: "sleep 2", timeout: 1 })
    const pwd = await call(dir, { command: "pwd" })
    expect(slow.result.output.includes("bash tool terminated")).toBe(true)
    expect(pwd.result.output.includes("child")).toBe(true)
  })

  test("persists exported env across calls", async () => {
    const dir = await prep("env-persist")
    await call(dir, { command: 'export FOO="bar-value"' })
    const res = await call(dir, { command: 'printf "$FOO"' })
    expect(res.result.output.includes("bar-value")).toBe(true)
  })

  test("persists alias across calls", async () => {
    const dir = await prep("alias-persist")
    await call(dir, { command: 'shopt -s expand_aliases\nalias ll="printf alias-ok"' })
    const res = await call(dir, { command: "ll" })
    expect(res.result.output.includes("alias-ok")).toBe(true)
  })

  test("injects precompiled PATH in session", async () => {
    const dir = await prep("path-inject")
    const original = process.env.PATH || ""
    process.env.PATH = ""
    try {
      const res = await call(dir, { command: "command -v rg" })
      expect(res.result.output.includes("pre_compiled")).toBe(true)
    } finally {
      process.env.PATH = original
    }
  })
})

describe("bash tool permissions", () => {
  test("asks for bash permission with correct pattern", async () => {
    const dir = await prep("perm-basic")
    const res = await call(dir, { command: "echo hello" })
    const req = pick(res.asks, "bash")
    expect(req).toBeDefined()
    expect(req?.patterns?.includes("echo hello")).toBe(true)
  })

  test("asks for bash permission with multiple commands", async () => {
    const dir = await prep("perm-multi")
    const res = await call(dir, { command: "echo foo && echo bar" })
    const req = pick(res.asks, "bash")
    expect(req).toBeDefined()
    expect(req?.patterns?.includes("echo foo")).toBe(true)
    expect(req?.patterns?.includes("echo bar")).toBe(true)
  })

  test("does not ask for external_directory permission when rm inside project", async () => {
    const dir = await prep("perm-rm-local")
    await fs.writeFile(path.join(dir, "tmpfile"), "x", "utf8")
    const res = await call(dir, { command: "rm tmpfile" })
    const req = pick(res.asks, "external_directory")
    expect(req).toBeUndefined()
  })

  test("includes always patterns for auto-approval", async () => {
    const dir = await prep("perm-always")
    const res = await call(dir, { command: "echo hello" })
    const req = pick(res.asks, "bash")
    const always = req?.always || []
    const hasStar = always.some((item) => item.endsWith("*"))
    expect(hasStar).toBe(true)
  })

  test("does not ask for bash permission when command is cd only", async () => {
    const dir = await prep("perm-cd-only")
    const res = await call(dir, { command: "cd ." })
    const req = pick(res.asks, "bash")
    expect(req).toBeUndefined()
  })
})
