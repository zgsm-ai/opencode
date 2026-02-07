import { Log } from "../util/log"
import path from "node:path"
import fs from "node:fs/promises"
import * as fsSync from "node:fs"
import z from "zod"
import { NamedError } from "@opencode-ai/util/error"
import { $ } from "bun"

export namespace AgentGitInitializer {

    export const AGENT_GIT_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024

    export const Config = z
        .object({
            project_path: z.string().describe("Path to the project directory"),
            agent_name: z.string().describe("Name of the agent"),
            continue_run: z.boolean().describe("Whether to continue running"),
        })
        .strict()
        .meta({
            ref: "AgentGitInitializerConfig",
        })

    export type Config = z.infer<typeof Config>

    export const ShellInfo = z
        .object({
            is_windows: z.boolean().describe("Whether the platform is Windows"),
            shell_type: z.string().describe("Type of shell (PowerShell or Bash)"),
            agent_git_hint: z.string().describe("agent-git hint string for shell configuration"),
        })
        .strict()
        .meta({
            ref: "AgentGitInitializerShellInfo",
        })

    export type ShellInfo = z.infer<typeof ShellInfo>

    export const AgentGitInitError = NamedError.create(
        "AgentGitInitError",
        z.object({
            message: z.string().describe("Error message"),
        }),
    )

    function removeReadonly(e: { code?: string; errno?: number; path: string }): void {
        if (e.code !== "EPERM" && e.errno !== 13) {
            throw e
        }
        try {
            fsSync.chmodSync(e.path, 0o666)
        } catch {
            throw e
        }
    }

    export class AgentGitInitializer {
        private projectPath: string
        private agentName: string
        private continueRun: boolean
        private logger: Log.Logger
        private readonly agentGitDir: string

        constructor(config: Config) {
            this.projectPath = config.project_path
            this.agentName = config.agent_name
            this.continueRun = config.continue_run
            this.logger = Log.create({ service: "agent-git-initializer" })
            this.agentGitDir = path.join(this.projectPath, ".agent-git")
        }

        private _isWindows(): boolean {
            return process.platform === "win32"
        }

        private _getShellInfo(): ShellInfo {
            const isWindows = this._isWindows()
            this.logger.debug("Platform detected", { is_windows: isWindows })

            const shellType = isWindows ? "PowerShell" : "Bash"
            const agentGitHint = isWindows
                ? 'function agent-git { $env:GIT_DIR=".agent-git"; $env:GIT_WORK_TREE="."; git @args }'
                : "alias agent-git='GIT_DIR=.agent-git GIT_WORK_TREE=. git'"

            return {
                is_windows: isWindows,
                shell_type: shellType,
                agent_git_hint: agentGitHint,
            }
        }

        private async _runGit(options: {
            args: string[]
            cwd?: string
            env?: NodeJS.ProcessEnv
            timeout?: number
        }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
            const { args, cwd, env } = options
            const stderrList: string[] = []

            try {
                const result = await $`git ${args}`
                    .cwd(cwd ?? this.projectPath)
                    .env(env ?? process.env)
                    .quiet()
                    .nothrow()

                const stdout = await result.text()
                const stderr = result.stderr ? Buffer.from(result.stderr).toString() : ""
                if (stderr.length > 0) {
                    stderrList.push(stderr)
                }
                const exitCode = result.exitCode

                if (exitCode !== 0) {
                    this.logger.error("Git command failed", {
                        args: args.join(" "),
                        exitCode,
                        stdout: stdout.slice(0, 200),
                        stderr: stderrList.slice(0, 200).join("\n"),
                    })
                }

                return {
                    stdout,
                    stderr: stderrList.join("\n"),
                    exitCode,
                }
            } catch (e) {
                if (e instanceof $.ShellError) {
                    const stderr = e.stderr.toString()
                    stderrList.push(stderr)
                    this.logger.error("Git command error", {
                        args: args.join(" "),
                        stderr: stderr.slice(0, 500),
                    })
                    return {
                        stdout: "",
                        stderr,
                        exitCode: e.exitCode,
                    }
                }
                throw e
            }
        }

        private _agentEnv(): NodeJS.ProcessEnv {
            return {
                ...process.env,
                GIT_DIR: this.agentGitDir,
                GIT_WORK_TREE: this.projectPath,
            }
        }

        private _runAgentGit(options: {
            args: string[]
            cwd?: string
            env?: NodeJS.ProcessEnv
            timeout?: number
        }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
            const base = this._agentEnv()
            const env = options.env ? { ...base, ...options.env } : base
            return this._runGit({
                args: options.args,
                cwd: options.cwd,
                env,
                timeout: options.timeout,
            })
        }

        private async _removeDir(dir: string): Promise<Error | undefined> {
            try {
                await fs.rm(dir, { recursive: true, force: true })
                return
            } catch (e) {
                const info = e as { code?: string; errno?: number; path?: string }
                if (!info.path) {
                    return info as Error
                }
                try {
                    removeReadonly({ code: info.code, errno: info.errno, path: info.path })
                } catch {
                    return info as Error
                }
                try {
                    await fs.rm(dir, { recursive: true, force: true })
                    return
                } catch {
                    return info as Error
                }
            }
        }

        private async _ensureAgentGitCommand(): Promise<string> {
            const isWindows = this._isWindows()
            const agentGitPath = path.join(this.projectPath, "agent-git")

            try {
                if (isWindows) {
                    // Create agent-git.bat for PowerShell/CMD
                    const batContent = `@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "GIT_DIR=%SCRIPT_DIR%.agent-git"
set "GIT_WORK_TREE=%SCRIPT_DIR%"
git %*
endlocal
`
                    const batPath = path.join(this.projectPath, "agent-git.bat")
                    await Bun.write(batPath, batContent)

                    // Create agent-git for Git Bash
                    const bashContent = `#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
GIT_DIR="$SCRIPT_DIR/.agent-git"
GIT_WORK_TREE="$SCRIPT_DIR"
export GIT_DIR GIT_WORK_TREE
exec git "$@"
`
                    await Bun.write(agentGitPath, bashContent)
                } else {
                    // Create agent-git for Unix systems
                    const bashContent = `#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
GIT_DIR="$SCRIPT_DIR/.agent-git"
GIT_WORK_TREE="$SCRIPT_DIR"
export GIT_DIR GIT_WORK_TREE
exec git "$@"
`
                    await Bun.write(agentGitPath, bashContent)
                }

                // Set executable permission (best-effort)
                try {
                    await fs.chmod(agentGitPath, 0o755)
                } catch (e) {
                    // Ignore chmod failures
                }

                // Add project path to PATH
                if (!process.env.PATH?.includes(this.projectPath)) {
                    process.env.PATH = `${this.projectPath}${path.delimiter}${process.env.PATH ?? ""}`
                }

                this.logger.info("agent-git command created", { path: agentGitPath })
                return agentGitPath
            } catch (e) {
                this.logger.error("Failed to create agent-git command", { error: e })
                throw new AgentGitInitError({ message: `Failed to create agent-git command: ${e}` })
            }
        }

        private async _ensureTextFileContainsLines(
            filePath: string,
            lines: string[],
        ): Promise<void> {
            const exists = await Bun.file(filePath).exists()

            if (exists) {
                const content = await Bun.file(filePath).text()
                // Handle both Unix (\n) and Windows (\r\n) line endings
                const existingLines = content.split("\n").map((line) => line.replace(/\r$/, ""))
                const linesToAdd = lines.filter((line) => !existingLines.includes(line))

                if (linesToAdd.length > 0) {
                    const newContent = content.endsWith("\n") ? `${content}${linesToAdd.join("\n")}\n` : `${content}\n${linesToAdd.join("\n")}\n`
                    await Bun.write(filePath, newContent)
                }
            } else {
                const parentDir = path.dirname(filePath)
                await fs.mkdir(parentDir, { recursive: true })
                await Bun.write(filePath, `${lines.join("\n")}\n`)
            }
        }

        private async _ensureProjectIgnoreFiles(): Promise<void> {
            const gitignorePath = path.join(this.projectPath, ".gitignore")
            const rgignorePath = path.join(this.projectPath, ".rgignore")
            const fdignorePath = path.join(this.projectPath, ".fdignore")

            // Configure .gitignore
            await this._ensureTextFileContainsLines(gitignorePath, [
                ".agent-git",
                ".agent-worktrees",
                "proposal/",
                ".memory_bank.md",
                "__pycache__/",
                ".pytest_cache/",
                ".venv/",
                "venv/",
            ])

            // Configure .rgignore
            await this._ensureTextFileContainsLines(rgignorePath, [
                "# AI generated temporary data",
                "explore_result",
                ".agent-worktrees",
            ])

            // Configure .fdignore
            await this._ensureTextFileContainsLines(fdignorePath, [
                "# AI generated temporary data",
                "explore_result",
                ".agent-worktrees",
            ])

            this.logger.info("Project ignore files updated", {
                gitignore: gitignorePath,
                rgignore: rgignorePath,
                fdignore: fdignorePath,
            })
        }

        private async _isTargetGitRepo(): Promise<boolean> {
            try {
                const result = await this._runGit({
                    args: ["rev-parse", "--is-inside-work-tree"],
                })
                return result.exitCode === 0 && result.stdout.trim().toLowerCase() === "true"
            } catch (e) {
                return false
            }
        }

        private async _getOriginalGitCommonDir(): Promise<string | undefined> {
            try {
                const rootResult = await this._runGit({
                    args: ["rev-parse", "--show-toplevel"],
                })
                if (rootResult.exitCode !== 0) {
                    return undefined
                }
                const root = rootResult.stdout.trim()
                const result = await this._runGit({
                    args: ["rev-parse", "--git-common-dir"],
                    cwd: root,
                })
                if (result.exitCode !== 0) {
                    return undefined
                }
                const common = result.stdout.trim()
                if (path.isAbsolute(common)) {
                    return common
                }
                return path.resolve(root, common)
            } catch (e) {
                return undefined
            }
        }

        private async _getOriginalHeadCommit(): Promise<string | undefined> {
            try {
                const result = await this._runGit({
                    args: ["rev-parse", "--verify", "HEAD"],
                })
                if (result.exitCode !== 0) {
                    return undefined
                }
                return result.stdout.trim()
            } catch (e) {
                return undefined
            }
        }

        private async _createMemoryBankFile(): Promise<void> {
            const memoryBankPath = path.join(this.projectPath, ".memory_bank.md")
            const exists = await Bun.file(memoryBankPath).exists()

            if (!exists) {
                const content = `# Memory Bank - 已验证经验

本经验库由 MemoryBankTool 自动维护，用于沉淀本项目中已验证的开发经验。

## 索引
- （暂无已验证经验记录）

---

## 经验
`
                await Bun.write(memoryBankPath, content, { createPath: true })
                this.logger.info("Memory bank file created", { path: memoryBankPath })
            }
        }

        private _splitNul(buffer: Buffer): string[] {
            const list: string[] = []
            const state = { start: 0 }
            for (const entry of buffer.entries()) {
                const index = entry[0]
                const byte = entry[1]
                if (byte !== 0) {
                    continue
                }
                if (index > state.start) {
                    list.push(buffer.subarray(state.start, index).toString())
                }
                state.start = index + 1
            }
            if (state.start < buffer.length) {
                list.push(buffer.subarray(state.start).toString())
            }
            return list.filter((item) => item.length > 0)
        }

        private async _listFiles(): Promise<string[] | undefined> {
            try {
                const proc = Bun.spawn(["rg", "--files", "--hidden", "-0"], {
                    cwd: this.projectPath,
                    stdout: "pipe",
                    stderr: "ignore",
                })
                await proc.exited
                if (proc.exitCode !== 0) {
                    this.logger.debug("rg failed to list files", { exitCode: proc.exitCode })
                    return undefined
                }
                const buf = await Bun.readableStreamToArrayBuffer(proc.stdout)
                return this._splitNul(Buffer.from(buf))
            } catch (e) {
                this.logger.debug("Failed to list files", { error: e })
                return undefined
            }
        }

        private _fastImportQuotePath(p: string): string {
            let result = ""
            for (let i = 0; i < p.length; i++) {
                const c = p[i]
                const code = p.charCodeAt(i)
                if (c === "\\") {
                    result += "\\\\"
                } else if (c === '"') {
                    result += "\\\""
                } else if (c === "\t") {
                    result += "\\t"
                } else if (c === "\n") {
                    result += "\\n"
                } else if (c === "\r") {
                    result += "\\r"
                } else if (code < 32) {
                    result += `\\x${code.toString(16).padStart(2, "0")}`
                } else {
                    result += c
                }
            }
            return result
        }

        private async _createInitialSnapshotFastImport(commitMessage: string = "Initial snapshot"): Promise<boolean> {
            try {
                const branchRef = "refs/heads/agent-git"
                const setResult = await this._runAgentGit({ args: ["symbolic-ref", "HEAD", branchRef] })
                if (setResult.exitCode !== 0) {
                    this.logger.error("Failed to set default branch")
                    return false
                }

                const files = await this._listFiles()
                if (!files) {
                    this.logger.error("Failed to list files for snapshot")
                    return false
                }

                const excludedRelGitPaths: string[] = []
                const timestamp = Math.floor(Date.now() / 1000)
                const authorLine = `${this.agentName} <agent@local> ${timestamp} +0000`

                const messageBuffer = Buffer.from(commitMessage)
                const importProc = Bun.spawn(["git", "fast-import", "--quiet"], {
                    cwd: this.projectPath,
                    env: this._agentEnv(),
                    stdin: "pipe",
                    stdout: "ignore",
                    stderr: "pipe",
                })
                const header = `commit ${branchRef}\n` +
                    `author ${authorLine}\n` +
                    `committer ${authorLine}\n` +
                    `data ${messageBuffer.length}\n`
                await importProc.stdin.write(Buffer.from(header))
                await importProc.stdin.write(messageBuffer)
                await importProc.stdin.write(Buffer.from("\n"))

                for (const relPath of files) {
                    const fullPath = path.join(this.projectPath, relPath)
                    const stat = await Bun.file(fullPath).stat()
                    const gitPath = path.sep === "\\" ? relPath.split(path.sep).join("/") : relPath

                    if (stat.size > AGENT_GIT_MAX_FILE_SIZE_BYTES) {
                        excludedRelGitPaths.push(gitPath)
                        continue
                    }

                    const quotedPath = `"${this._fastImportQuotePath(gitPath)}"`

                    try {
                        const linkTarget = await fs.readlink(fullPath)
                        const linkBuffer = Buffer.from(linkTarget)
                        await importProc.stdin.write(Buffer.from(`M 120000 inline ${quotedPath}\n`))
                        await importProc.stdin.write(Buffer.from(`data ${linkBuffer.length}\n`))
                        await importProc.stdin.write(linkBuffer)
                        await importProc.stdin.write(Buffer.from("\n"))
                    } catch {
                        const mode = stat.mode & 0o111 ? 0o100755 : 0o100644
                        const data = await Bun.file(fullPath).arrayBuffer()
                        const modeStr = mode.toString(8)
                        const buf = Buffer.from(data)
                        await importProc.stdin.write(Buffer.from(`M ${modeStr} inline ${quotedPath}\n`))
                        await importProc.stdin.write(Buffer.from(`data ${buf.length}\n`))
                        await importProc.stdin.write(buf)
                        await importProc.stdin.write(Buffer.from("\n"))
                    }
                }

                await importProc.stdin.write(Buffer.from("done\n"))
                await importProc.stdin.flush()
                await importProc.stdin.end()

                await importProc.exited
                if (importProc.exitCode !== 0) {
                    const stderr = await Bun.readableStreamToText(importProc.stderr)
                    this.logger.error("fast-import failed", { stderr: stderr.slice(0, 500) })
                    return false
                }

                if (excludedRelGitPaths.length > 0) {
                    const excludePath = path.join(this.agentGitDir, "info", "exclude")
                    await this._ensureTextFileContainsLines(excludePath, excludedRelGitPaths)
                }

                const resetResult = await this._runAgentGit({ args: ["reset", "--mixed", "--quiet", "HEAD"] })
                if (resetResult.exitCode !== 0) {
                    this.logger.error("Failed to reset index")
                    return false
                }

                this.logger.info("Initial snapshot created (fast-import)", { fileCount: files.length - excludedRelGitPaths.length })
                return true
            } catch (e) {
                this.logger.error("Failed to create initial snapshot (fast-import)", { error: e })
                return false
            }
        }

        private async _createInitialSnapshotRepoFast(
            commitMessage: string = "Initial snapshot",
            originalCommit: string,
        ): Promise<boolean> {
            try {
                const originalCommonDir = await this._getOriginalGitCommonDir()
                if (!originalCommonDir) {
                    this.logger.error("Failed to get original git common dir")
                    return false
                }
                const rootResult = await this._runGit({
                    args: ["rev-parse", "--show-toplevel"],
                })
                if (rootResult.exitCode !== 0) {
                    this.logger.error("Failed to get original git root")
                    return false
                }
                const root = rootResult.stdout.trim()
                const rootRel = path.relative(root, this.projectPath)
                const rootPath = rootRel === "" || rootRel === "." ? "" : rootRel.split(path.sep).join("/")
                const rootPrefix = rootPath.length > 0 ? `${rootPath}/` : ""

                const infoDir = path.join(this.agentGitDir, "objects", "info")
                await fs.mkdir(infoDir, { recursive: true })
                const alternatesPath = path.join(infoDir, "alternates")
                const objectsPath = path.join(originalCommonDir, "objects")
                await Bun.write(alternatesPath, objectsPath + "\n")

                const indexFilePath = path.join(this.agentGitDir, "index")
                const readTreeResult = await this._runAgentGit({
                    args: ["read-tree", `${originalCommit}^{tree}`],
                    env: { GIT_INDEX_FILE: indexFilePath },
                })
                if (readTreeResult.exitCode !== 0) {
                    this.logger.error("Failed to read original tree")
                    return false
                }

                const diffProc = Bun.spawn(["git", "diff", "--name-only", "-z", "HEAD"], {
                    cwd: root,
                    stdout: "pipe",
                    stderr: "ignore",
                })
                await diffProc.exited
                const diffBuffer = await Bun.readableStreamToArrayBuffer(diffProc.stdout)
                const diffFiles = this._splitNul(Buffer.from(diffBuffer))

                const lsProc = Bun.spawn(["git", "ls-files", "-o", "--exclude-standard", "-z"], {
                    cwd: root,
                    stdout: "pipe",
                    stderr: "ignore",
                })
                await lsProc.exited
                const lsBuffer = await Bun.readableStreamToArrayBuffer(lsProc.stdout)
                const untrackedFiles = this._splitNul(Buffer.from(lsBuffer))

                const changedFiles = Array.from(new Set([...diffFiles, ...untrackedFiles]))
                const repoFiles = rootPrefix.length > 0
                    ? changedFiles.filter((file) => file.startsWith(rootPrefix))
                    : changedFiles

                let ignoredFiles: string[] = []
                if (repoFiles.length > 0) {
                    const checkIgnoreProc = Bun.spawn(["git", "check-ignore", "-z", "--stdin"], {
                        cwd: root,
                        stdin: "pipe",
                        stdout: "pipe",
                        stderr: "ignore",
                    })

                    const encoder = new TextEncoder()
                    for (const file of repoFiles) {
                        await checkIgnoreProc.stdin.write(encoder.encode(file + "\x00"))
                    }
                    await checkIgnoreProc.stdin.end()

                    await checkIgnoreProc.exited
                    const ignoreOutput = await Bun.readableStreamToText(checkIgnoreProc.stdout)
                    ignoredFiles = this._splitNul(Buffer.from(ignoreOutput))
                }

                const ignoredSet = new Set(ignoredFiles)
                const filesToAdd = repoFiles
                    .filter((file) => !ignoredSet.has(file))
                    .map((file) => (rootPrefix.length > 0 ? file.slice(rootPrefix.length) : file))

                if (filesToAdd.length > 0) {
                    const addResult = await this._runAgentGit({
                        args: ["add", ...filesToAdd],
                        env: { GIT_INDEX_FILE: indexFilePath },
                    })
                    if (addResult.exitCode !== 0) {
                        this.logger.error("Failed to add files to index")
                        return false
                    }
                }

                const writeTreeResult = await this._runAgentGit({
                    args: ["write-tree"],
                    env: { GIT_INDEX_FILE: indexFilePath },
                })
                if (writeTreeResult.exitCode !== 0) {
                    this.logger.error("Failed to write tree")
                    return false
                }
                const treeId = writeTreeResult.stdout.trim()

                const commitTreeResult = await this._runAgentGit({
                    args: ["commit-tree", treeId, "-m", commitMessage],
                    env: {
                        GIT_AUTHOR_NAME: this.agentName,
                        GIT_AUTHOR_EMAIL: "agent@local",
                        GIT_INDEX_FILE: indexFilePath,
                    },
                })
                if (commitTreeResult.exitCode !== 0) {
                    this.logger.error("Failed to create commit")
                    return false
                }
                const commitId = commitTreeResult.stdout.trim()

                const updateRefResult = await this._runAgentGit({
                    args: ["update-ref", "refs/heads/agent-git", commitId],
                })
                if (updateRefResult.exitCode !== 0) {
                    this.logger.error("Failed to update ref")
                    return false
                }

                const resetResult = await this._runAgentGit({ args: ["reset", "--mixed", "--quiet", "HEAD"] })
                if (resetResult.exitCode !== 0) {
                    this.logger.error("Failed to reset working tree")
                    return false
                }

                this.logger.info("Initial snapshot created (alternates)", { fileCount: filesToAdd.length, baseCommit: originalCommit })
                return true
            } catch (e) {
                this.logger.error("Failed to create initial snapshot (alternates)", { error: e })
                return false
            }
        }

        private async _estimateFileCount(): Promise<number | undefined> {
            try {
                const files = await this._listFiles()
                if (!files) {
                    return undefined
                }
                return files.length
            } catch (e) {
                this.logger.debug("Failed to estimate file count", { error: e })
                return undefined
            }
        }

        public async initializeAgentGit(): Promise<boolean> {
            try {
                const projectExists = await fs
                    .stat(this.projectPath)
                    .then((stat) => stat.isDirectory())
                    .catch(() => false)
                if (!projectExists) {
                    this.logger.error("Project path does not exist", { path: this.projectPath })
                    return false
                }

                const shellInfo = this._getShellInfo()
                this.logger.debug("Shell info", shellInfo)

                if (this.continueRun) {
                    this.logger.info("Continuing from previous run - keeping existing agent-git history")
                    await this._ensureAgentGitCommand()
                    await this._ensureProjectIgnoreFiles()
                    const statusResult = await this._runAgentGit({ args: ["status"] })
                    if (statusResult.exitCode === 0) {
                        this.logger.info("agent-git is ready")
                        return true
                    } else {
                        this.logger.error("Failed to verify agent-git status")
                        return false
                    }
                }

                const agentGitDirExists = await Bun.file(this.agentGitDir).exists()
                if (agentGitDirExists) {
                    const err = await this._removeDir(this.agentGitDir)
                    if (err) {
                        this.logger.warn("Failed to remove .agent-git directory", { error: err })
                    } else {
                        this.logger.info("Removed existing .agent-git directory")
                    }
                }

                const initResult = await this._runAgentGit({
                    args: ["init"],
                })
                if (initResult.exitCode !== 0) {
                    this.logger.error("Failed to initialize git repository")
                    throw new AgentGitInitError({ message: "Failed to initialize git repository" })
                }

                const worktreeResult = await this._runAgentGit({
                    args: ["config", "core.worktree", this.projectPath],
                })
                if (worktreeResult.exitCode !== 0) {
                    this.logger.warn("Failed to configure core.worktree")
                }

                const autocrlfResult = await this._runAgentGit({
                    args: ["config", "core.autocrlf", "input"],
                })
                if (autocrlfResult.exitCode !== 0) {
                    this.logger.warn("Failed to configure core.autocrlf")
                }

                await this._ensureAgentGitCommand()
                await this._ensureProjectIgnoreFiles()
                await this._createMemoryBankFile()

                const fileCount = await this._estimateFileCount()
                const commitMessage = fileCount !== undefined ? `Initial snapshot (${fileCount} files)` : "Initial snapshot"

                const isGitRepo = await this._isTargetGitRepo()
                let snapshotCreated = false

                if (isGitRepo) {
                    const originalCommit = await this._getOriginalHeadCommit()
                    if (originalCommit) {
                        snapshotCreated = await this._createInitialSnapshotRepoFast(commitMessage, originalCommit)
                    } else {
                        snapshotCreated = await this._createInitialSnapshotFastImport(commitMessage)
                    }
                } else {
                    snapshotCreated = await this._createInitialSnapshotFastImport(commitMessage)
                }

                if (!snapshotCreated) {
                    this.logger.warn("Optimized snapshot creation failed, falling back to git add -A")
                    const addResult = await this._runAgentGit({ args: ["add", "-A"] })
                    if (addResult.exitCode !== 0) {
                        this.logger.warn("Failed to add files")
                        return false
                    }
                    const commitResult = await this._runAgentGit({
                        args: ["commit", "--allow-empty", "--no-verify", `--author=${this.agentName} <agent@local>`, `-m=${commitMessage}`],
                    })
                    if (commitResult.exitCode !== 0) {
                        this.logger.warn("Failed to create initial commit")
                        return false
                    }
                }

                const verifyResult = await this._runAgentGit({ args: ["status"] })
                if (verifyResult.exitCode === 0) {
                    this.logger.info("agent-git initialization completed successfully")
                    return true
                } else {
                    this.logger.error("Failed to verify agent-git initialization")
                    return false
                }
            } catch (e) {
                if (e instanceof AgentGitInitError) {
                    throw e
                }
                this.logger.error("Unexpected error during agent-git initialization", { error: e })
                return false
            }
        }

        public async initializeExploreResultFolder(): Promise<boolean> {
            try {
                const exploreResultDir = path.join(this.projectPath, "explore_result")

                if (this.continueRun) {
                    const exists = await Bun.file(exploreResultDir).exists()
                    if (exists) {
                        this.logger.info("Continuing from previous run - keeping existing explore_result folder")
                        return true
                    }
                }

                const exists = await Bun.file(exploreResultDir).exists()
                if (exists) {
                    const err = await this._removeDir(exploreResultDir)
                    if (err) {
                        this.logger.warn("Failed to remove explore_result directory", { error: err })
                    } else {
                        this.logger.info("Removed existing explore_result directory")
                    }
                }

                const dirExists = await Bun.file(exploreResultDir).exists()
                if (!dirExists) {
                    await fs.mkdir(exploreResultDir, { recursive: true })
                    this.logger.info("Created fresh explore_result directory")
                }

                return true
            } catch (e) {
                this.logger.warn("Failed to initialize explore_result folder", { error: e })
                return false
            }
        }
    }
}