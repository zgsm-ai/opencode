import { describe, expect, test } from "bun:test"
import path from "path"
import type { PermissionNext } from "../../src/permission/next"
import { MemoryBankTool } from "../../src/tool/memory-bank"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

type Request = Omit<PermissionNext.Request, "id" | "sessionID" | "tool">

const tool = await MemoryBankTool.init()
const base = {
  sessionID: "test",
  messageID: "",
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => {},
}

const run = async (dir: string, params: Record<string, unknown>, extra?: Record<string, unknown>) => {
  const requests: Request[] = []
  const ctx = {
    ...base,
    ask: async (req: Request) => {
      requests.push(req)
    },
    extra,
  }
  const result = await Instance.provide({
    directory: dir,
    fn: async () => tool.execute(params, ctx),
  })
  return { result, requests }
}

describe("tool.memory_bank command validation", () => {
  test("requires command", async () => {
    await using tmp = await tmpdir()
    await expect(run(tmp.path, {})).rejects.toThrow("缺少必填参数: command")
  })

  test("rejects unknown command", async () => {
    await using tmp = await tmpdir()
    await expect(run(tmp.path, { command: "noop" })).rejects.toThrow("无效的命令: noop")
  })
})

describe("tool.memory_bank view", () => {
  test("creates file and returns hint when empty", async () => {
    await using tmp = await tmpdir()
    const res = await run(tmp.path, { command: "view" })
    expect(res.result.output).toContain("暂无记录")

    const file = path.join(tmp.path, ".memory_bank.md")
    const text = await Bun.file(file).text()
    expect(text).toContain("# Memory Bank - 项目知识库")
    expect(text).toContain("## 记录")

    const read = res.requests.find((req) => req.permission === "read")
    const edit = res.requests.find((req) => req.permission === "edit")
    expect(read).toBeDefined()
    expect(edit).toBeDefined()
  })

  test("keeps legacy template and skips edit when empty", async () => {
    await using tmp = await tmpdir()
    const legacy = [
      "# Memory Bank - 已验证经验",
      "",
      "本经验库由 MemoryBankTool 自动维护，用于沉淀本项目中已验证的开发经验。",
      "",
      "## 索引",
      "- （暂无已验证经验记录）",
      "",
      "---",
      "",
      "## 经验",
      "",
    ].join("\n")
    const file = path.join(tmp.path, ".memory_bank.md")
    await Bun.write(file, legacy)

    const res = await run(tmp.path, { command: "view" })
    expect(res.result.output).toContain("暂无记录")

    const text = await Bun.file(file).text()
    expect(text).toBe(legacy)

    const read = res.requests.find((req) => req.permission === "read")
    const edit = res.requests.find((req) => req.permission === "edit")
    expect(read).toBeDefined()
    expect(edit).toBeUndefined()
  })
})

describe("tool.memory_bank add", () => {
  const cases = [
    {
      name: "requires tag",
      params: { command: "add", title: "配置", lesson: "内容" },
      msg: "缺少必填参数: tag",
    },
    {
      name: "requires title",
      params: { command: "add", tag: "dev-setup", lesson: "内容" },
      msg: "缺少必填参数: title",
    },
    {
      name: "requires lesson",
      params: { command: "add", tag: "dev-setup", title: "配置" },
      msg: "缺少必填参数: lesson",
    },
  ]

  test.each(cases)("$name", async (item) => {
    await using tmp = await tmpdir()
    await expect(run(tmp.path, item.params)).rejects.toThrow(item.msg)
  })

  test("adds entry and renders in view", async () => {
    await using tmp = await tmpdir()
    const tag = "dev-setup"
    const title = "开发环境配置"
    const lesson = "first line\n\nsecond line"

    const add = await run(tmp.path, { command: "add", tag, title, lesson })
    expect(add.result.output).toContain("✓ 已添加记录")

    const view = await run(tmp.path, { command: "view" })
    expect(view.result.output).toContain(`### [${tag}] ${title}`)
    expect(view.result.output).toContain("first line")
    expect(view.result.output).toContain("second line")
    expect(view.result.output).toContain(`- [${tag}] ${title}`)

    const file = path.join(tmp.path, ".memory_bank.md")
    const text = await Bun.file(file).text()
    expect(text).toContain(`### [${tag}] ${title}`)
    expect(text).toContain("first line\n\nsecond line")
  })

  test("rejects duplicate tag", async () => {
    await using tmp = await tmpdir()
    await run(tmp.path, { command: "add", tag: "dup", title: "一次", lesson: "内容" })
    await expect(run(tmp.path, { command: "add", tag: "dup", title: "二次", lesson: "内容" })).rejects.toThrow(
      "tag 重复",
    )
  })
})

describe("tool.memory_bank update", () => {
  test("requires tag", async () => {
    await using tmp = await tmpdir()
    await expect(run(tmp.path, { command: "update", title: "配置" })).rejects.toThrow("缺少必填参数: tag")
  })

  test("requires title or lesson", async () => {
    await using tmp = await tmpdir()
    await run(tmp.path, { command: "add", tag: "u1", title: "旧标题", lesson: "旧内容" })
    await expect(run(tmp.path, { command: "update", tag: "u1" })).rejects.toThrow(
      "update命令需要至少提供以下参数之一",
    )
  })

  test("rejects missing tag entry", async () => {
    await using tmp = await tmpdir()
    await expect(run(tmp.path, { command: "update", tag: "missing", title: "新" })).rejects.toThrow(
      "找不到tag为 'missing'",
    )
  })

  test("updates title and lesson", async () => {
    await using tmp = await tmpdir()
    await run(tmp.path, { command: "add", tag: "u2", title: "旧标题", lesson: "旧内容" })
    const res = await run(tmp.path, { command: "update", tag: "u2", title: "新标题", lesson: "新内容" })
    expect(res.result.output).toContain("✓ 已更新记录")

    const text = await Bun.file(path.join(tmp.path, ".memory_bank.md")).text()
    expect(text).toContain("### [u2] 新标题")
    expect(text).toContain("新内容")
    expect(text).not.toContain("旧标题")
  })

  test("updates title only and keeps lesson", async () => {
    await using tmp = await tmpdir()
    await run(tmp.path, { command: "add", tag: "u3", title: "旧标题", lesson: "旧内容" })
    await run(tmp.path, { command: "update", tag: "u3", title: "新标题" })

    const text = await Bun.file(path.join(tmp.path, ".memory_bank.md")).text()
    expect(text).toContain("### [u3] 新标题")
    expect(text).toContain("旧内容")
  })
})

describe("tool.memory_bank delete", () => {
  test("requires tag", async () => {
    await using tmp = await tmpdir()
    await expect(run(tmp.path, { command: "delete" })).rejects.toThrow("缺少必填参数: tag")
  })

  test("rejects missing tag entry", async () => {
    await using tmp = await tmpdir()
    await expect(run(tmp.path, { command: "delete", tag: "missing" })).rejects.toThrow("找不到tag为 'missing'")
  })

  test("deletes entry", async () => {
    await using tmp = await tmpdir()
    await run(tmp.path, { command: "add", tag: "d1", title: "待删", lesson: "内容" })
    const res = await run(tmp.path, { command: "delete", tag: "d1" })
    expect(res.result.output).toContain("✓ 已删除记录")

    const text = await Bun.file(path.join(tmp.path, ".memory_bank.md")).text()
    expect(text).not.toContain("### [d1] 待删")
  })
})

describe("tool.memory_bank projectPath", () => {
  test("writes to extra projectPath when provided", async () => {
    await using tmp = await tmpdir()
    const work = path.join(tmp.path, "work")
    await Bun.write(path.join(work, ".keep"), "x", { createPath: true })

    const res = await run(tmp.path, { command: "view" }, { projectPath: "work" })
    expect(res.result.output).toContain("暂无记录")

    const main = await Bun.file(path.join(tmp.path, ".memory_bank.md")).exists()
    const sub = await Bun.file(path.join(work, ".memory_bank.md")).exists()
    expect(main).toBe(false)
    expect(sub).toBe(true)
  })
})
