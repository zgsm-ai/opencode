import { describe, expect, test } from "bun:test"
import os from "os"
import path from "path"
import { BashTool } from "../../src/plugin/tdd/tools/bash"
import { Instance } from "../../src/project/instance"
import { Filesystem } from "../../src/util/filesystem"
import { tmpdir } from "../fixture/fixture"
import type { PermissionNext } from "../../src/permission/next"
import { Truncate } from "../../src/tool/truncation"
import { SessionID, MessageID } from "../../src/session/schema"

const ctx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make(""),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => {},
  ask: async () => {},
}

const projectRoot = path.join(__dirname, "../..")

describe("tool.bash", () => {
  test("basic", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const bash = await BashTool.init()
        const result = await bash.execute(
          {
            command: "echo 'test'",
            description: "Echo test message",
          },
          ctx,
        )
        expect(result.metadata.exit).toBe(0)
        expect(result.metadata.output).toContain("test")
      },
    })
  })
})

describe("bash tool safeguards", () => {
  test(
    "runs precompiled rg/fd binaries",
    async () => {
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
    },
    10_000,
  )

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

  test(
    "adds implicit path for rg -e without PATH",
    async () => {
    const dir = await prep("rg-dot-flag")
    const target = path.join(dir, "flag.txt")
    await fs.writeFile(target, "flag-needle\n", "utf8")
    const res = await call(dir, { command: 'rg -e "flag-needle"' })
    expect(res.result.output.includes("flag.txt")).toBe(true)
    expect(res.result.output.includes("flag-needle")).toBe(true)
    },
    10_000,
  )

  test(
    "adds implicit path for rg in pipeline-start",
    async () => {
    const dir = await prep("rg-pipeline")
    const target = path.join(dir, "pipe.txt")
    await fs.writeFile(target, "pipeline-needle\n", "utf8")
    const res = await call(dir, { command: 'rg "pipeline-needle" | head -n 1' })
    expect(res.result.output.includes("pipe.txt")).toBe(true)
    expect(res.result.output.includes("pipeline-needle")).toBe(true)
    },
    10_000,
  )

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

  test(
    "adds exit code info on non-zero exit",
    async () => {
    const dir = await prep("exit-code")
    const res = await call(dir, { command: 'rg "no-match-value" .' })
    expect(res.result.output.includes("[Command exited with code 1]")).toBe(true)
    },
    10_000,
  )

  test(
    "returns empty output hint",
    async () => {
    const dir = await prep("empty-output")
    const res = await call(dir, { command: "cd ." })
    expect(res.result.output.includes("[Command completed successfully but produced no output]")).toBe(true)
    },
    10_000,
  )

  test("blocks timeout above max seconds", async () => {
    const dir = await prep("timeout-max")
    const res = await call(dir, { command: "pwd", timeout: 121 })
    expect(res.result.metadata.blocked).toBe(true)
    expect(res.result.output.includes("最大支持 120 秒")).toBe(true)
  })

  test(
    "keeps cwd across timeout restart",
    async () => {
    const dir = await prep("restart")
    const sub = path.join(dir, "child")
    await fs.mkdir(sub, { recursive: true })
    await call(dir, { command: "cd child" })
    const slow = await call(dir, { command: "sleep 2", timeout: 1 })
    const pwd = await call(dir, { command: "pwd" })
    expect(slow.result.output.includes("bash tool terminated")).toBe(true)
    expect(pwd.result.output.includes("child")).toBe(true)
    },
    10_000,
  )

  test("asks for external_directory permission when workdir is outside project", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const bash = await BashTool.init()
        const requests: Array<Omit<PermissionNext.Request, "id" | "sessionID" | "tool">> = []
        const testCtx = {
          ...ctx,
          ask: async (req: Omit<PermissionNext.Request, "id" | "sessionID" | "tool">) => {
            requests.push(req)
          },
        }
        await bash.execute(
          {
            command: "ls",
            workdir: os.tmpdir(),
            description: "List temp dir",
          },
          testCtx,
        )
        const extDirReq = requests.find((r) => r.permission === "external_directory")
        expect(extDirReq).toBeDefined()
        expect(extDirReq!.patterns).toContain(path.join(os.tmpdir(), "*"))
      },
    })
  })

  test("asks for external_directory permission when file arg is outside project", async () => {
    await using outerTmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "outside.txt"), "x")
      },
    })
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const bash = await BashTool.init()
        const requests: Array<Omit<PermissionNext.Request, "id" | "sessionID" | "tool">> = []
        const testCtx = {
          ...ctx,
          ask: async (req: Omit<PermissionNext.Request, "id" | "sessionID" | "tool">) => {
            requests.push(req)
          },
        }
        const filepath = path.join(outerTmp.path, "outside.txt")
        await bash.execute(
          {
            command: `cat ${filepath}`,
            description: "Read external file",
          },
          testCtx,
        )
        const extDirReq = requests.find((r) => r.permission === "external_directory")
        const expected = path.join(outerTmp.path, "*")
        expect(extDirReq).toBeDefined()
        expect(extDirReq!.patterns).toContain(expected)
        expect(extDirReq!.always).toContain(expected)
      },
    })
  })

  test("does not ask for external_directory permission when rm inside project", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const bash = await BashTool.init()
        const requests: Array<Omit<PermissionNext.Request, "id" | "sessionID" | "tool">> = []
        const testCtx = {
          ...ctx,
          ask: async (req: Omit<PermissionNext.Request, "id" | "sessionID" | "tool">) => {
            requests.push(req)
          },
        }

        await Bun.write(path.join(tmp.path, "tmpfile"), "x")

        await bash.execute(
          {
            command: `rm -rf ${path.join(tmp.path, "nested")}`,
            description: "remove nested dir",
          },
          testCtx,
        )

        const extDirReq = requests.find((r) => r.permission === "external_directory")
        expect(extDirReq).toBeUndefined()
      },
    })
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
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const bash = await BashTool.init()
        const requests: Array<Omit<PermissionNext.Request, "id" | "sessionID" | "tool">> = []
        const testCtx = {
          ...ctx,
          ask: async (req: Omit<PermissionNext.Request, "id" | "sessionID" | "tool">) => {
            requests.push(req)
          },
        }
        await bash.execute(
          {
            command: "cd .",
            description: "Stay in current directory",
          },
          testCtx,
        )
        const bashReq = requests.find((r) => r.permission === "bash")
        expect(bashReq).toBeUndefined()
      },
    })
  })

  test("matches redirects in permission pattern", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const bash = await BashTool.init()
        const requests: Array<Omit<PermissionNext.Request, "id" | "sessionID" | "tool">> = []
        const testCtx = {
          ...ctx,
          ask: async (req: Omit<PermissionNext.Request, "id" | "sessionID" | "tool">) => {
            requests.push(req)
          },
        }
        await bash.execute({ command: "cat > /tmp/output.txt", description: "Redirect ls output" }, testCtx)
        const bashReq = requests.find((r) => r.permission === "bash")
        expect(bashReq).toBeDefined()
        expect(bashReq!.patterns).toContain("cat > /tmp/output.txt")
      },
    })
  })

  test("always pattern has space before wildcard to not include different commands", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const bash = await BashTool.init()
        const requests: Array<Omit<PermissionNext.Request, "id" | "sessionID" | "tool">> = []
        const testCtx = {
          ...ctx,
          ask: async (req: Omit<PermissionNext.Request, "id" | "sessionID" | "tool">) => {
            requests.push(req)
          },
        }
        await bash.execute({ command: "ls -la", description: "List" }, testCtx)
        const bashReq = requests.find((r) => r.permission === "bash")
        expect(bashReq).toBeDefined()
        const pattern = bashReq!.always[0]
        expect(pattern).toBe("ls *")
      },
    })
  })
})

describe("tool.bash truncation", () => {
  test("truncates output exceeding line limit", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const bash = await BashTool.init()
        const lineCount = Truncate.MAX_LINES + 500
        const result = await bash.execute(
          {
            command: `seq 1 ${lineCount}`,
            description: "Generate lines exceeding limit",
          },
          ctx,
        )
        expect((result.metadata as any).truncated).toBe(true)
        expect(result.output).toContain("truncated")
        expect(result.output).toContain("The tool call succeeded but the output was truncated")
      },
    })
  })

  test("truncates output exceeding byte limit", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const bash = await BashTool.init()
        const byteCount = Truncate.MAX_BYTES + 10000
        const result = await bash.execute(
          {
            command: `head -c ${byteCount} /dev/zero | tr '\\0' 'a'`,
            description: "Generate bytes exceeding limit",
          },
          ctx,
        )
        expect((result.metadata as any).truncated).toBe(true)
        expect(result.output).toContain("truncated")
        expect(result.output).toContain("The tool call succeeded but the output was truncated")
      },
    })
  })

  test("does not truncate small output", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const bash = await BashTool.init()
        const result = await bash.execute(
          {
            command: "echo hello",
            description: "Echo hello",
          },
          ctx,
        )
        expect((result.metadata as any).truncated).toBe(false)
        const eol = process.platform === "win32" ? "\r\n" : "\n"
        expect(result.output).toBe(`hello${eol}`)
      },
    })
  })

  test("full output is saved to file when truncated", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const bash = await BashTool.init()
        const lineCount = Truncate.MAX_LINES + 100
        const result = await bash.execute(
          {
            command: `seq 1 ${lineCount}`,
            description: "Generate lines for file check",
          },
          ctx,
        )
        expect((result.metadata as any).truncated).toBe(true)

        const filepath = (result.metadata as any).outputPath
        expect(filepath).toBeTruthy()

        const saved = await Filesystem.readText(filepath)
        const lines = saved.trim().split("\n")
        expect(lines.length).toBe(lineCount)
        expect(lines[0]).toBe("1")
        expect(lines[lineCount - 1]).toBe(String(lineCount))
      },
    })
  })
})
