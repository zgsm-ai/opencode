import { afterEach, describe, expect, test } from "bun:test"
import { appPath, href, isChromePath, isWorkspacePath } from "./router"

afterEach(() => {
  window.__ENV__ = undefined
})

describe("router helpers", () => {
  test("appPath strips configured base path", () => {
    window.__ENV__ = { VITE_BASE_PATH: "/app" }

    expect(appPath("/app")).toBe("/")
    expect(appPath("/app/workspace/demo")).toBe("/workspace/demo")
    expect(appPath("/workspace/demo")).toBe("/workspace/demo")
  })

  test("href includes the configured base path for a new tab", () => {
    window.__ENV__ = { VITE_BASE_PATH: "/cloud" }
    window.location.href = "https://zgsmtest.cn:30443/cloud/workflow"

    expect(href("/workspace/demo?session=sess-1")).toBe(
      `${window.location.origin}/cloud/workspace/demo?session=sess-1`,
    )
  })

  test("isWorkspacePath matches workspace root and children only", () => {
    expect(isWorkspacePath("/workspace")).toBe(true)
    expect(isWorkspacePath("/workspace/demo/session")).toBe(true)
    expect(isWorkspacePath("/workspaces")).toBe(false)
    expect(isWorkspacePath("/projects")).toBe(false)
  })

  test("isChromePath matches store and projects routes", () => {
    expect(isChromePath("/store")).toBe(true)
    expect(isChromePath("/store/dashboard")).toBe(true)
    expect(isChromePath("/projects/demo")).toBe(true)
    expect(isChromePath("/workspace/demo")).toBe(false)
  })
})
