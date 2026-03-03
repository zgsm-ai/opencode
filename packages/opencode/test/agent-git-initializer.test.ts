import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { $ } from "bun"
import { AgentGitInitializer } from "../src/util/agentGitInitializer"

const root = path.resolve(process.cwd())
const tmp = path.join(root, ".tmp-agent-git-initializer-test")

const prep = async (name: string) => {
  const dir = path.join(tmp, name)
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
  await Bun.write(path.join(dir, "sample.txt"), "hello\n")
  return dir
}

const isReady = async (dir: string) => {
  const env = {
    ...process.env,
    GIT_DIR: path.join(dir, ".agent-git"),
    GIT_WORK_TREE: dir,
  }
  const result = await $`git status --short`.cwd(dir).env(env).quiet().nothrow()
  return result.exitCode === 0
}

beforeAll(async () => {
  await fs.mkdir(tmp, { recursive: true })
})

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

describe("AgentGitInitializer", () => {
  test("continue_run initializes a missing .agent-git repository", async () => {
    const dir = await prep("continue-missing")
    const init = new AgentGitInitializer.AgentGitInitializer({
      project_path: dir,
      agent_name: "SubCodingAgent-1",
      continue_run: true,
    })

    const ok = await init.initializeAgentGit()
    expect(ok).toBe(true)
    expect(await Bun.file(path.join(dir, ".agent-git", "HEAD")).exists()).toBe(true)
    expect(await isReady(dir)).toBe(true)
  })
})
