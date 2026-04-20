import { describe, expect, test } from "bun:test"
import type { ContentTab } from "@/context/content-tabs"
import { activeSession, shouldRestore } from "./workspace-content-layout-sync"

const sessionTab = (sessionID: string): ContentTab => ({
  id: `session::${sessionID}`,
  kind: "session",
  title: sessionID,
  icon: "message",
  meta: { sessionID },
})

const fileTab = (path: string): ContentTab => ({
  id: `file::${path}`,
  kind: "file",
  title: path,
  icon: "file-tree",
  meta: { path },
})

describe("activeSession", () => {
  test("reads the active session tab id", () => {
    const tabs = [sessionTab("ses_1")]
    expect(activeSession(tabs, tabs[0].id)).toBe("ses_1")
  })

  test("ignores non-session active tabs", () => {
    const tabs = [fileTab("src/index.ts")]
    expect(activeSession(tabs, tabs[0].id)).toBeUndefined()
  })
})

describe("shouldRestore", () => {
  test("waits for an unseen URL session", () => {
    expect(shouldRestore("ses_1", undefined)).toBe(true)
  })

  test("waits when the URL session changes", () => {
    expect(shouldRestore("ses_2", "ses_1")).toBe(true)
  })

  test("stops waiting after the URL session is handled", () => {
    expect(shouldRestore("ses_1", "ses_1")).toBe(false)
  })

  test("does not wait without a URL session", () => {
    expect(shouldRestore(undefined, "ses_1")).toBe(false)
  })
})