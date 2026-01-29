import { test, expect, describe } from "bun:test"
import { TestGuide } from "../../src/util/testGuideDiscovery"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import path from "path"
import fs from "fs/promises"
import os from "os"

describe("TestGuide.load", () => {
  test("returns empty content when no TEST_GUIDE.md exists", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await TestGuide.load()
        expect(result.content).toBe("")
        expect(result.fileCount).toBe(0)
        expect(result.filePaths).toEqual([])
      },
    })
  })

  test("loads TEST_GUIDE.md from project root", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await fs.writeFile(path.join(dir, "TEST_GUIDE.md"), "# Test Guide\n\nProject test guide content")
        // Create .git directory to mark as project root
        await fs.mkdir(path.join(dir, ".git"))
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await TestGuide.load()
        expect(result.fileCount).toBe(1)
        expect(result.content).toContain("Project test guide content")
        expect(result.content).toContain("--- Test Guide from:")
      },
    })
  })

  test("loads TEST_GUIDE.md from .cospec directory", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await fs.mkdir(path.join(dir, ".cospec"))
        await fs.writeFile(path.join(dir, ".cospec", "TEST_GUIDE.md"), "# Cospec Test Guide\n\nCospec guide content")
        await fs.mkdir(path.join(dir, ".git"))
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await TestGuide.load()
        expect(result.fileCount).toBe(1)
        expect(result.content).toContain("Cospec guide content")
      },
    })
  })

  test("merges multiple TEST_GUIDE.md files", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        // Project root guide
        await fs.writeFile(path.join(dir, "TEST_GUIDE.md"), "# Root Guide\n\nRoot content")
        // .cospec guide
        await fs.mkdir(path.join(dir, ".cospec"))
        await fs.writeFile(path.join(dir, ".cospec", "TEST_GUIDE.md"), "# Cospec Guide\n\nCospec content")
        await fs.mkdir(path.join(dir, ".git"))
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await TestGuide.load()
        expect(result.fileCount).toBe(2)
        expect(result.content).toContain("Root content")
        expect(result.content).toContain("Cospec content")
        expect(result.content).toContain("--- Test Guide from:")
        expect(result.content).toContain("--- End of Test Guide from:")
      },
    })
  })

  test("loads TEST_GUIDE.md from current working directory", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        // Create subdirectory with its own TEST_GUIDE.md
        const subdir = path.join(dir, "src")
        await fs.mkdir(subdir, { recursive: true })
        await fs.writeFile(path.join(subdir, "TEST_GUIDE.md"), "# Local Guide\n\nLocal content")
        await fs.mkdir(path.join(dir, ".git"))
      },
    })
    const subdir = path.join(tmp.path, "src")
    await Instance.provide({
      directory: subdir,
      fn: async () => {
        const result = await TestGuide.load()
        expect(result.fileCount).toBeGreaterThanOrEqual(1)
        expect(result.content).toContain("Local content")
      },
    })
  })

  test("hierarchical search finds TEST_GUIDE.md in parent directories", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        // Root guide
        await fs.writeFile(path.join(dir, "TEST_GUIDE.md"), "# Root Guide")
        // Nested directory structure
        const nested = path.join(dir, "a", "b", "c")
        await fs.mkdir(nested, { recursive: true })
        // Add guide in middle directory
        await fs.writeFile(path.join(dir, "a", "b", "TEST_GUIDE.md"), "# Middle Guide")
        await fs.mkdir(path.join(dir, ".git"))
      },
    })
    const nestedDir = path.join(tmp.path, "a", "b", "c")
    await Instance.provide({
      directory: nestedDir,
      fn: async () => {
        const result = await TestGuide.load()
        expect(result.fileCount).toBeGreaterThanOrEqual(2)
        expect(result.content).toContain("Root Guide")
        expect(result.content).toContain("Middle Guide")
      },
    })
  })

  test("deduplicates TEST_GUIDE.md files by path", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await fs.writeFile(path.join(dir, "TEST_GUIDE.md"), "# Guide Content")
        await fs.mkdir(path.join(dir, ".git"))
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await TestGuide.load()
        expect(result.fileCount).toBe(1)
        // Verify no duplicate content
        const occurrences = (result.content.match(/Guide Content/g) || []).length
        expect(occurrences).toBe(1)
      },
    })
  })

  test("ignores empty TEST_GUIDE.md files", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        // Create empty file
        await fs.writeFile(path.join(dir, "TEST_GUIDE.md"), "   \n   \n   ")
        await fs.mkdir(path.join(dir, ".git"))
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await TestGuide.load()
        expect(result.content).toBe("")
        expect(result.fileCount).toBe(1) // File exists but content is empty
      },
    })
  })

  test("finds project root by package.json", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await fs.writeFile(path.join(dir, "package.json"), "{}")
        await fs.writeFile(path.join(dir, "TEST_GUIDE.md"), "# Package Root Guide")
        const subdir = path.join(dir, "src")
        await fs.mkdir(subdir)
      },
    })
    const subdir = path.join(tmp.path, "src")
    await Instance.provide({
      directory: subdir,
      fn: async () => {
        const result = await TestGuide.load()
        expect(result.content).toContain("Package Root Guide")
      },
    })
  })

  test("preserves relative path information in merged content", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await fs.writeFile(path.join(dir, "TEST_GUIDE.md"), "Root content")
        await fs.mkdir(path.join(dir, ".cospec"))
        await fs.writeFile(path.join(dir, ".cospec", "TEST_GUIDE.md"), "Cospec content")
        await fs.mkdir(path.join(dir, ".git"))
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await TestGuide.load()
        expect(result.content).toContain("--- Test Guide from: TEST_GUIDE.md ---")
        expect(result.content).toContain("--- Test Guide from: .cospec")
      },
    })
  })

  test("returns file paths in result", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await fs.writeFile(path.join(dir, "TEST_GUIDE.md"), "Content")
        await fs.mkdir(path.join(dir, ".cospec"))
        await fs.writeFile(path.join(dir, ".cospec", "TEST_GUIDE.md"), "More content")
        await fs.mkdir(path.join(dir, ".git"))
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await TestGuide.load()
        expect(result.filePaths.length).toBe(2)
        expect(result.filePaths.some((p) => p.includes("TEST_GUIDE.md"))).toBe(true)
        expect(result.filePaths.some((p) => p.includes(".cospec"))).toBe(true)
      },
    })
  })
})
