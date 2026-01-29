import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test"
import { TestGuide } from "../../../../src/plugin/tdd/utils/test-guide-discovery"
import { Instance } from "../../../../src/project/instance"
import { Global } from "../../../../src/global"
import fs from "fs/promises"
import path from "path"
import { tmpdir } from "os"

// Mock modules
let mockInstanceDirectory: string
let mockHomeDir: string

describe("Test Guide Discovery", () => {
  let testDir: string

  beforeEach(() => {
    // Create a temporary directory for testing
    testDir = Bun.file(tmpdir()).name + "/test-guide-discovery-" + Date.now()
  })

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe("文件不存在场景", () => {
    test("should return empty result when no TEST_GUIDE.md files exist", async () => {
      // Create temporary directory structure without TEST_GUIDE.md
      await fs.mkdir(testDir, { recursive: true })

      // Mock Instance.directory
      mockInstanceDirectory = testDir
      mock.module("../../../../src/project/instance", () => ({
        Instance: {
          get directory() {
            return mockInstanceDirectory
          },
        },
      }))

      // Mock Global.Path.home
      mockHomeDir = testDir
      mock.module("../../../../src/global", () => ({
        Global: {
          Path: {
            home: mockHomeDir,
          },
        },
      }))

      // Call TestGuide.load
      const result = await TestGuide.load()

      // Verify empty result
      expect(result.content).toBe("")
      expect(result.fileCount).toBe(0)
      expect(result.filePaths).toEqual([])
    })
  })

  describe("正常场景", () => {
    test("should load TEST_GUIDE.md from .cospec directory", async () => {
      // Create test directory structure
      await fs.mkdir(testDir, { recursive: true })
      const cospecDir = path.join(testDir, ".cospec")
      await fs.mkdir(cospecDir, { recursive: true })

      // Create a .git directory to simulate project root
      await fs.mkdir(path.join(testDir, ".git"), { recursive: true })

      // Create TEST_GUIDE.md in .cospec
      const testGuidePath = path.join(cospecDir, "TEST_GUIDE.md")
      const testGuideContent = "# Test Guide\n\nThis is a test guide."
      await fs.writeFile(testGuidePath, testGuideContent)

      // Mock Instance.directory
      mockInstanceDirectory = testDir
      mock.module("../../../../src/project/instance", () => ({
        Instance: {
          get directory() {
            return mockInstanceDirectory
          },
        },
      }))

      // Mock Global.Path.home
      mockHomeDir = testDir
      mock.module("../../../../src/global", () => ({
        Global: {
          Path: {
            home: mockHomeDir,
          },
        },
      }))

      // Call TestGuide.load
      const result = await TestGuide.load()

      // Verify result
      expect(result.content).toContain("# Test Guide")
      expect(result.content).toContain("This is a test guide.")
      expect(result.fileCount).toBeGreaterThanOrEqual(1)
      expect(result.filePaths).toContain(testGuidePath)
    })

    test("should merge multiple TEST_GUIDE.md files", async () => {
      // Create test directory structure
      await fs.mkdir(testDir, { recursive: true })
      const cospecDir = path.join(testDir, ".cospec")
      await fs.mkdir(cospecDir, { recursive: true })
      const globalOpencodeDir = path.join(testDir, ".opencode")
      await fs.mkdir(globalOpencodeDir, { recursive: true })

      // Create a .git directory to simulate project root
      await fs.mkdir(path.join(testDir, ".git"), { recursive: true })

      // Create TEST_GUIDE.md in .cospec
      const cospecGuidePath = path.join(cospecDir, "TEST_GUIDE.md")
      await fs.writeFile(cospecGuidePath, "# Cospec Guide\n\nCospec content.")

      // Create TEST_GUIDE.md in global .opencode
      const globalGuidePath = path.join(globalOpencodeDir, "TEST_GUIDE.md")
      await fs.writeFile(globalGuidePath, "# Global Guide\n\nGlobal content.")

      // Mock Instance.directory
      mockInstanceDirectory = testDir
      mock.module("../../../../src/project/instance", () => ({
        Instance: {
          get directory() {
            return mockInstanceDirectory
          },
        },
      }))

      // Mock Global.Path.home
      mockHomeDir = testDir
      mock.module("../../../../src/global", () => ({
        Global: {
          Path: {
            home: mockHomeDir,
          },
        },
      }))

      // Call TestGuide.load
      const result = await TestGuide.load()

      // Verify merged content
      expect(result.content).toContain("# Cospec Guide")
      expect(result.content).toContain("Cospec content.")
      expect(result.content).toContain("# Global Guide")
      expect(result.content).toContain("Global content.")
      expect(result.content).toContain("--- Test Guide from:")
    })

    test("should handle files with correct separators", async () => {
      // Create test directory structure
      await fs.mkdir(testDir, { recursive: true })
      const cospecDir = path.join(testDir, ".cospec")
      await fs.mkdir(cospecDir, { recursive: true })

      // Create a .git directory to simulate project root
      await fs.mkdir(path.join(testDir, ".git"), { recursive: true })

      // Create TEST_GUIDE.md
      const testGuidePath = path.join(cospecDir, "TEST_GUIDE.md")
      const testGuideContent = "# Test Guide\n\nContent."
      await fs.writeFile(testGuidePath, testGuideContent)

      // Mock Instance.directory
      mockInstanceDirectory = testDir
      mock.module("../../../../src/project/instance", () => ({
        Instance: {
          get directory() {
            return mockInstanceDirectory
          },
        },
      }))

      // Mock Global.Path.home
      mockHomeDir = testDir
      mock.module("../../../../src/global", () => ({
        Global: {
          Path: {
            home: mockHomeDir,
          },
        },
      }))

      // Call TestGuide.load
      const result = await TestGuide.load()

      // Verify separators
      expect(result.content).toMatch(/--- Test Guide from: .* ---/)
      expect(result.content).toMatch(/--- End of Test Guide from: .* ---/)
    })
  })
})
