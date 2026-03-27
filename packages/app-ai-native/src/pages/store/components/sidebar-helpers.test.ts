import { describe, expect, test } from "bun:test"
import {
  NAV_ITEMS,
  REPO_CAPABILITY_PRIORITY,
  navItemsForRepo,
  repoItemClass,
  capabilityItemClass,
} from "./sidebar-helpers"

describe("NAV_ITEMS", () => {
  test("contains exactly 4 items", () => {
    expect(NAV_ITEMS).toHaveLength(4)
  })

  test("has expected types in order", () => {
    expect(NAV_ITEMS.map((i) => i.type)).toEqual(["skill", "subagent", "command", "mcp"])
  })

  test("does not contain console or dashboard entries", () => {
    for (const item of NAV_ITEMS) {
      expect(item.type).not.toBe("console")
      expect(item.type).not.toBe("dashboard")
      expect(item.href).not.toContain("dashboard")
      expect(item.href).not.toContain("console")
    }
  })
})

describe("navItemsForRepo", () => {
  test("null repo returns default NAV_ITEMS order", () => {
    const result = navItemsForRepo(null)
    expect(result).toBe(NAV_ITEMS)
  })

  test("undefined repo returns default NAV_ITEMS order", () => {
    const result = navItemsForRepo(undefined)
    expect(result).toBe(NAV_ITEMS)
  })

  test("normal repo returns normal priority order", () => {
    const result = navItemsForRepo({ repoType: "normal" })
    expect(result.map((i) => i.type)).toEqual(REPO_CAPABILITY_PRIORITY.normal)
  })

  test("sync repo returns sync priority order", () => {
    const result = navItemsForRepo({ repoType: "sync" })
    expect(result.map((i) => i.type)).toEqual(REPO_CAPABILITY_PRIORITY.sync)
  })
})

describe("repoItemClass", () => {
  test("active state includes active classes", () => {
    const cls = repoItemClass(true)
    expect(cls).toContain("bg-surface-base")
    expect(cls).toContain("text-text-strong")
    expect(cls).toContain("font-medium")
  })

  test("inactive state includes hover classes", () => {
    const cls = repoItemClass(false)
    expect(cls).toContain("text-text-weak")
    expect(cls).toContain("hover:text-text-strong")
  })
})

describe("capabilityItemClass", () => {
  test("active state includes active classes", () => {
    const cls = capabilityItemClass(true)
    expect(cls).toContain("bg-surface-base")
    expect(cls).toContain("text-text-strong")
    expect(cls).toContain("font-medium")
  })

  test("inactive state includes hover classes", () => {
    const cls = capabilityItemClass(false)
    expect(cls).toContain("text-text-weak")
    expect(cls).toContain("hover:bg-surface-base-hover")
  })
})
