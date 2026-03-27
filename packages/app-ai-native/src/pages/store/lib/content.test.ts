import { describe, expect, test } from "bun:test"
import { canArchive, contentValue, usableMode } from "./content"
import { formatBytes, isArchive } from "./constants"

describe("canArchive", () => {
   test("allows skills and mcp servers", () => {
      expect(canArchive("skill")).toBe(true)
      expect(canArchive("mcp")).toBe(true)
   })

   test("rejects subagents and commands", () => {
      expect(canArchive("subagent")).toBe(false)
      expect(canArchive("command")).toBe(false)
   })
})

describe("usableMode", () => {
   test("keeps archive mode for supported types", () => {
      expect(usableMode(true, "archive")).toBe("archive")
   })

   test("forces text mode for unsupported types", () => {
      expect(usableMode(false, "archive")).toBe("text")
   })
})

describe("contentValue", () => {
   test("returns text in text mode", () => {
      expect(contentValue("text", "hello")).toBe("hello")
   })

   test("clears text in archive mode", () => {
      expect(contentValue("archive", "hello")).toBe("")
   })
})

describe("isArchive", () => {
   test("accepts zip and tarball extensions", () => {
      expect(isArchive("skill.zip")).toBe(true)
      expect(isArchive("skill.tar.gz")).toBe(true)
      expect(isArchive("skill.tgz")).toBe(true)
   })

   test("matches case-insensitively", () => {
      expect(isArchive("SKILL.ZIP")).toBe(true)
   })

   test("rejects other file types", () => {
      expect(isArchive("skill.txt")).toBe(false)
   })
})

describe("formatBytes", () => {
   test("formats bytes, kilobytes, and megabytes", () => {
      expect(formatBytes(999)).toBe("999 B")
      expect(formatBytes(1536)).toBe("1.5 KB")
      expect(formatBytes(1_572_864)).toBe("1.5 MB")
   })
})
