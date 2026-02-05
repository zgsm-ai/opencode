import { describe, test, expect } from "bun:test"
import path from "path"
import { Tiktoken } from "js-tiktoken/lite"
import { Truncate } from "../../src/tool/truncation"

describe("Truncate", () => {
  describe("output", () => {
    test("returns content unchanged when under limits", async () => {
      const content = "line1\nline2\nline3"
      const result = await Truncate.output(content)

      expect(result.truncated).toBe(false)
      expect(result.content).toBe(content)
    })

    test("intercepts output when token count exceeds limit", async () => {
      const file = path.resolve(import.meta.dir, "..", "..", "resources", "tokenizer", "o200k_base.json")
      const data = await Bun.file(file).json()
      const enc = new Tiktoken(data)
      const base = "hello"
      const baseCount = enc.encode(base).length
      const repeat = Math.ceil((Truncate.LIMIT + baseCount) / baseCount)
      const content = Array.from({ length: repeat }, () => base).join(" ")
      const size = enc.encode(content).length

      expect(size).toBeGreaterThan(Truncate.LIMIT)
      const result = await Truncate.output(content)

      expect(result.truncated).toBe(true)
      expect(result.content).toContain("8192")
    })

    test("does not include outputPath", async () => {
      const content = "short content"
      const result = await Truncate.output(content)

      expect(result.truncated).toBe(false)
      expect("outputPath" in result).toBe(false)
    })
  })
})
