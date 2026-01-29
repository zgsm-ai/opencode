import { $ } from "bun"
import path from "path"
import fs from "fs/promises"
import { Global } from "@/global"
import { Instance } from "@/project/instance"
import { Log } from "@/util/log"
import { existsSync } from "fs"

const log = Log.create({ service: "git-service" })

export interface CommitInfo {
  hash: string
  message: string
  date: string
}

export class GitService {
  private shadowRepoPath: string
  private projectRoot: string
  private available: boolean = false

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot
    // Create a hash of the project path to use as the shadow repo directory name
    const projectHash = this.hashProjectPath(projectRoot)
    this.shadowRepoPath = path.join(Global.Path.data, "checkpoint", projectHash)
  }

  private hashProjectPath(projectPath: string): string {
    // Simple hash function using Bun's built-in hashing
    const normalized = path.normalize(projectPath).toLowerCase()
    return Bun.hash(normalized).toString(36)
  }

  /**
   * Initialize the shadow Git repository
   */
  async initialize(): Promise<void> {
    try {
      // Check if git is available
      await this.checkGitAvailable()

      // Create shadow repo directory
      await fs.mkdir(this.shadowRepoPath, { recursive: true })

      // Check if already initialized
      const gitDir = path.join(this.shadowRepoPath, ".git")
      if (existsSync(gitDir)) {
        log.info("Shadow repository already initialized", { path: this.shadowRepoPath })
        this.available = true
        return
      }

      // Create dedicated .gitconfig for shadow repo
      const gitConfig = path.join(this.shadowRepoPath, ".gitconfig")
      await fs.writeFile(
        gitConfig,
        `[user]
\tname = Costrict Agent
\temail = agent@costrict.ai
[commit]
\tgpgsign = false
[core]
\tautocrlf = false
`,
      )

      log.info("Initializing shadow repository", { path: this.shadowRepoPath })

      // Initialize git repository (run directly in shadowRepoPath, not using execGit)
      // because git init doesn't work with GIT_DIR pre-set
      await $`git init`.cwd(this.shadowRepoPath).quiet()

      // Try to set initial branch to main (Git 2.28.0+)
      try {
        await this.execGit(["branch", "-M", "main"])
      } catch (e) {
        // Fallback for older Git versions
        log.warn("Could not set main branch, using default", { error: e })
      }

      // Copy .gitignore from project root if exists
      const projectGitignore = path.join(this.projectRoot, ".gitignore")
      if (existsSync(projectGitignore)) {
        const shadowGitignore = path.join(this.shadowRepoPath, ".gitignore")
        await fs.copyFile(projectGitignore, shadowGitignore)
      }

      // Create initial commit to establish main branch
      await this.createInitialCommit()

      this.available = true
      log.info("Shadow repository initialized successfully")
    } catch (error) {
      // Don't throw error, just log warning so CLI can continue to work
      log.warn("Checkpoint feature unavailable", {
        error: error instanceof Error ? error.message : String(error),
        hint: "Git is required for checkpoint functionality. Install Git to enable this feature."
      })
      this.available = false
    }
  }

  private async checkGitAvailable(): Promise<void> {
    try {
      await $`git --version`.quiet()
    } catch (error) {
      throw new Error("Git is not installed or not available in PATH")
    }
  }

  private ensureAvailable(): void {
    if (!this.available) {
      throw new Error("Checkpoint feature is unavailable. Git is required for this functionality.")
    }
  }

  private async createInitialCommit(): Promise<void> {
    const readmePath = path.join(this.shadowRepoPath, ".checkpoint-readme")
    await fs.writeFile(
      readmePath,
      `# Checkpoint Shadow Repository

This is a shadow Git repository used by Costrict for checkpoint functionality.
It tracks changes to your project without affecting your main repository.

Project: ${this.projectRoot}
Created: ${new Date().toISOString()}
`,
    )

    await this.execGit(["add", ".checkpoint-readme"])
    await this.execGit(["commit", "-m", "Initialize checkpoint repository"])
  }

  /**
   * Execute git command in shadow repository context
   */
  private async execGit(args: string[]): Promise<string> {
    const env = {
      GIT_DIR: path.join(this.shadowRepoPath, ".git"),
      GIT_WORK_TREE: this.projectRoot,
      GIT_CONFIG_GLOBAL: path.join(this.shadowRepoPath, ".gitconfig"),
      HOME: this.shadowRepoPath,
      XDG_CONFIG_HOME: this.shadowRepoPath,
    }

    try {
      const result = await $`git ${args}`.env(env).text()
      return result
    } catch (error: any) {
      log.error("Git command failed", { args, error: error.stderr?.toString() || error.message })
      throw error
    }
  }

  /**
   * Get current commit hash
   */
  async getCurrentCommitHash(): Promise<string> {
    try {
      const hash = await this.execGit(["rev-parse", "HEAD"])
      return hash.trim()
    } catch (error) {
      log.warn("Could not get current commit hash", { error })
      return ""
    }
  }

  /**
   * Create a checkpoint (snapshot) of the current project state
   */
  async createCheckpoint(message: string): Promise<string> {
    this.ensureAvailable()
    try {
      // Stage all changes
      await this.execGit(["add", "."])

      // Check if there are any changes to commit
      const status = await this.execGit(["status", "--porcelain"])
      if (!status.trim()) {
        log.info("No changes to checkpoint")
        return await this.getCurrentCommitHash()
      }

      // Create commit
      await this.execGit(["commit", "-m", message])

      // Get the new commit hash
      const hash = await this.getCurrentCommitHash()
      log.info("Checkpoint created", { hash, message })
      return hash
    } catch (error) {
      log.error("Failed to create checkpoint", { message, error })
      throw new Error(`Failed to create checkpoint: ${error}`)
    }
  }

  /**
   * Get list of all checkpoints
   */
  async listCheckpoints(limit: number = 50): Promise<CommitInfo[]> {
    this.ensureAvailable()
    try {
      const logOutput = await this.execGit([
        "log",
        `--max-count=${limit}`,
        "--pretty=format:%H%n%s%n%b%n%aI%n---END---",
      ])

      const commits: CommitInfo[] = []
      const entries = logOutput.split("---END---\n").filter((e) => e.trim())

      for (const entry of entries) {
        const lines = entry.split("\n")
        if (lines.length >= 3) {
          const hash = lines[0].trim()
          // Combine subject and body, remove empty lines
          const messageParts = lines.slice(1, -1).filter((l) => l.trim())
          let message = messageParts.join(" ").trim()

          // Truncate long messages
          if (message.length > 200) {
            message = message.substring(0, 197) + "..."
          }

          const date = lines[lines.length - 1].trim()

          commits.push({ hash, message, date })
        }
      }

      return commits
    } catch (error) {
      log.error("Failed to list checkpoints", { error })
      throw new Error(`Failed to list checkpoints: ${error}`)
    }
  }

  /**
   * Show diff for a specific checkpoint
   */
  async showCheckpointDiff(commitHash: string): Promise<string> {
    this.ensureAvailable()
    try {
      // First, check if this commit has a parent
      let hasParent = true
      try {
        await this.execGit(["rev-parse", `${commitHash}^`])
      } catch (error) {
        // No parent, this is the first commit
        hasParent = false
      }

      let diff: string
      if (hasParent) {
        // Show diff between commit and its parent
        diff = await this.execGit(["diff", `${commitHash}^`, commitHash])
      } else {
        // For the first commit, show all changes introduced by this commit
        diff = await this.execGit(["show", "--format=", commitHash])
      }

      return diff
    } catch (error) {
      log.error("Failed to show checkpoint diff", { commitHash, error })
      throw new Error(`Failed to show diff for checkpoint ${commitHash}: ${error}`)
    }
  }

  /**
   * Restore project to a specific checkpoint
   */
  async restoreCheckpoint(commitHash: string, files?: string[]): Promise<void> {
    this.ensureAvailable()
    try {
      if (files && files.length > 0) {
        // Restore specific files
        for (const file of files) {
          await this.execGit(["restore", "--source", commitHash, file])
        }
        log.info("Restored specific files from checkpoint", { commitHash, files })
      } else {
        // Restore entire project (only tracked files)
        await this.execGit(["restore", "--source", commitHash, "."])

        log.info("Restored entire project from checkpoint", { commitHash })
      }
    } catch (error) {
      log.error("Failed to restore checkpoint", { commitHash, files, error })
      throw new Error(`Failed to restore checkpoint ${commitHash}: ${error}`)
    }
  }

  /**
   * Revert a specific checkpoint (create a new commit that undoes the changes)
   */
  async revertCheckpoint(commitHash: string): Promise<string> {
    this.ensureAvailable()
    try {
      await this.execGit(["revert", "--no-edit", commitHash])
      const newHash = await this.getCurrentCommitHash()
      log.info("Checkpoint reverted", { originalHash: commitHash, newHash })
      return newHash
    } catch (error) {
      log.error("Failed to revert checkpoint", { commitHash, error })
      throw new Error(`Failed to revert checkpoint ${commitHash}: ${error}`)
    }
  }

  /**
   * Check if shadow repository is initialized
   */
  isInitialized(): boolean {
    const gitDir = path.join(this.shadowRepoPath, ".git")
    return existsSync(gitDir)
  }

  /**
   * Check if the service is available (Git is installed and initialized)
   */
  isAvailable(): boolean {
    return this.available
  }

  /**
   * Get the shadow repository path
   */
  getShadowRepoPath(): string {
    return this.shadowRepoPath
  }
}

// Singleton instance for the current project
let instance: GitService | null = null

export namespace GitService {
  export async function getInstance(): Promise<GitService> {
    if (!instance) {
      instance = new GitService(Instance.directory)
      if (!instance.isInitialized()) {
        await instance.initialize()
      } else {
        // Mark as available if already initialized
        instance["available"] = true
      }
    }
    return instance
  }

  /**
   * Get instance safely, returns null if service is not available
   */
  export async function getInstanceSafe(): Promise<GitService | null> {
    try {
      const service = await getInstance()
      return service.isAvailable() ? service : null
    } catch (error) {
      log.warn("Failed to get GitService instance", { error })
      return null
    }
  }

  export function reset(): void {
    instance = null
  }
}
