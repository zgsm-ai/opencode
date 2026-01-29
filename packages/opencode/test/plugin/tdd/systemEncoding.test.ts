import { describe, it, expect, beforeAll, afterEach } from "bun:test"
import {
  getCachedEncodingForBuffer,
  getSystemEncoding,
  windowsCodePageToEncoding,
  resetEncodingCache,
} from "@/plugin/tdd/tools/shell/systemEncoding"

describe("systemEncoding", () => {
  afterEach(() => {
    resetEncodingCache()
  })

  describe("getCachedEncodingForBuffer", () => {
    it("should return utf-8 for valid UTF-8 buffer", () => {
      const utf8Buffer = Buffer.from("Hello 世界", "utf-8")
      const encoding = getCachedEncodingForBuffer(utf8Buffer)
      expect(encoding).toBe("utf-8")
    })

    it("should return utf-8 for ASCII buffer", () => {
      const asciiBuffer = Buffer.from("Hello World", "utf-8")
      const encoding = getCachedEncodingForBuffer(asciiBuffer)
      expect(encoding).toBe("utf-8")
    })

    it("should return utf-8 for multi-byte UTF-8 characters", () => {
      const multiByteBuffer = Buffer.from("你好世界", "utf-8")
      const encoding = getCachedEncodingForBuffer(multiByteBuffer)
      expect(encoding).toBe("utf-8")
    })

    it("should handle empty buffer", () => {
      const emptyBuffer = Buffer.from("", "utf-8")
      const encoding = getCachedEncodingForBuffer(emptyBuffer)
      expect(encoding).toBe("utf-8")
    })
  })

  describe("getSystemEncoding", () => {
    it("should return a valid encoding string", () => {
      const encoding = getSystemEncoding()
      // Should return a string or null
      expect(encoding === null || typeof encoding === "string").toBe(true)
    })

    it("should respect LANG environment variable on Unix-like systems if set", () => {
      if (process.platform !== "win32") {
        const originalLang = process.env.LANG
        process.env.LANG = "en_US.UTF-8"
        const encoding = getSystemEncoding()
        process.env.LANG = originalLang
        expect(encoding).toBe("utf-8")
      } else {
        expect(true).toBe(true) // Skip on Windows
      }
    })
  })

  describe("windowsCodePageToEncoding", () => {
    it("should map common Windows code pages", () => {
      expect(windowsCodePageToEncoding(65001)).toBe("utf-8")
      expect(windowsCodePageToEncoding(936)).toBe("gb2312")
      expect(windowsCodePageToEncoding(950)).toBe("big5")
      expect(windowsCodePageToEncoding(932)).toBe("shift_jis")
      expect(windowsCodePageToEncoding(1251)).toBe("windows-1251")
      expect(windowsCodePageToEncoding(1252)).toBe("windows-1252")
    })

    it("should return null for unknown code pages", () => {
      expect(windowsCodePageToEncoding(99999)).toBe(null)
    })

    it("should map CP437", () => {
      expect(windowsCodePageToEncoding(437)).toBe("cp437")
    })

    it("should map UTF-16 variants", () => {
      expect(windowsCodePageToEncoding(1200)).toBe("utf-16le")
      expect(windowsCodePageToEncoding(1201)).toBe("utf-16be")
    })
  })

  describe("resetEncodingCache", () => {
    it("should reset the encoding cache", () => {
      // First call to populate cache
      const buffer = Buffer.from("test", "utf-8")
      getCachedEncodingForBuffer(buffer)

      // Reset cache
      resetEncodingCache()

      // Should work fine after reset
      const encoding = getCachedEncodingForBuffer(buffer)
      expect(encoding).toBe("utf-8")
    })
  })
})
