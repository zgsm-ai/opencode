import fs from "fs/promises"
import path from "path"
import { Global } from "@/global"
import { Instance } from "@/project/instance"
import { Log } from "./log"

export namespace TestGuide {
  const log = Log.create({ service: "testGuide" })

  const TEST_GUIDE_FILENAME = "TEST_GUIDE.md"
  const COSPEC_DIR = ".cospec"

  export interface LoadResult {
    content: string
    fileCount: number
    filePaths: string[]
  }

  /**
   * Find the project root directory by looking for .git directory or package.json
   */
  async function findProjectRoot(startDir: string): Promise<string | null> {
    let currentDir = path.resolve(startDir)

    while (true) {
      // Check for .git directory
      const gitPath = path.join(currentDir, ".git")
      try {
        const stats = await fs.lstat(gitPath)
        if (stats.isDirectory()) {
          return currentDir
        }
      } catch {
        // Continue searching
      }

      // Check for package.json as alternative project root indicator
      const packageJsonPath = path.join(currentDir, "package.json")
      try {
        await fs.access(packageJsonPath)
        return currentDir
      } catch {
        // Continue searching
      }

      const parentDir = path.dirname(currentDir)
      if (parentDir === currentDir) {
        // Reached filesystem root
        return null
      }
      currentDir = parentDir
    }
  }

  /**
   * Load TEST_GUIDE.md files from various locations and merge them
   */
  export async function load(): Promise<LoadResult> {
    const allPaths = new Set<string>()
    const cwd = Instance.directory

    log.debug("Starting TEST_GUIDE.md search", { cwd })

    // 1. Search for global TEST_GUIDE.md in ~/.opencode/
    const globalPath = path.join(Global.Path.home, ".opencode", TEST_GUIDE_FILENAME)
    try {
      await fs.access(globalPath)
      allPaths.add(globalPath)
      log.debug("Found global TEST_GUIDE.md", { path: globalPath })
    } catch {
      // Not found, continue
    }

    // 2. Search for TEST_GUIDE.md in project root
    const projectRoot = await findProjectRoot(cwd)
    if (projectRoot) {
      const projectRootPath = path.join(projectRoot, TEST_GUIDE_FILENAME)
      try {
        await fs.access(projectRootPath)
        allPaths.add(projectRootPath)
        log.debug("Found TEST_GUIDE.md in project root", { path: projectRootPath })
      } catch {
        // Not found, continue
      }

      // 3. Search for TEST_GUIDE.md in project root's .cospec/ directory
      const projectCospecPath = path.join(projectRoot, COSPEC_DIR, TEST_GUIDE_FILENAME)
      try {
        await fs.access(projectCospecPath)
        allPaths.add(projectCospecPath)
        log.debug("Found TEST_GUIDE.md in .cospec/", { path: projectCospecPath })
      } catch {
        // Not found, continue
      }
    }

    // 4. Hierarchical search: search upward from cwd to project root
    const upwardPaths: string[] = []
    let currentDir = cwd
    const ultimateStopDir = projectRoot
      ? path.dirname(projectRoot)
      : path.dirname(Global.Path.home)

    while (currentDir && currentDir !== path.dirname(currentDir)) {
      // Avoid searching in the global .opencode directory
      if (currentDir === path.join(Global.Path.home, ".opencode")) {
        break
      }

      const potentialPath = path.join(currentDir, TEST_GUIDE_FILENAME)
      try {
        await fs.access(potentialPath)
        // Set will automatically handle duplicates
        if (!allPaths.has(potentialPath)) {
          upwardPaths.unshift(potentialPath)
          log.debug("Found TEST_GUIDE.md in upward search", { path: potentialPath })
        }
      } catch {
        // Not found, continue
      }

      if (currentDir === ultimateStopDir) {
        break
      }

      currentDir = path.dirname(currentDir)
    }
    upwardPaths.forEach((p) => allPaths.add(p))

    // Convert Set to Array for processing
    const filePaths = Array.from(allPaths)

    log.info("TEST_GUIDE.md discovery complete", {
      fileCount: filePaths.length,
      filePaths,
    })

    // Read and concatenate all files
    const contents: string[] = []

    for (const filePath of filePaths) {
      try {
        const content = await fs.readFile(filePath, "utf-8")
        if (content.trim()) {
          const relativePath = path.relative(cwd, filePath)
          contents.push(
            `--- Test Guide from: ${relativePath} ---\n${content.trim()}\n--- End of Test Guide from: ${relativePath} ---`
          )
        }
      } catch (error) {
        log.warn("Failed to read TEST_GUIDE.md", { filePath, error })
      }
    }

    const mergedContent = contents.join("\n\n")

    return {
      content: mergedContent,
      fileCount: filePaths.length,
      filePaths,
    }
  }
}
