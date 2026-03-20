/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Enhanced Bash Tool that leverages shell priority selection and dynamic prompt injection.
 *
 * This tool provides:
 * - Shell priority selection (bash, PowerShell, cmd) with parent process detection
 * - Dynamic description injection based on detected shell type
 * - Background process support for long-running commands
 * - Comprehensive command parsing and validation
 *
 * NOTE: The original BashTool implementation in @/tool/bash is preserved for reference.
 * This enhanced version should be used when more robust shell handling is needed.
 */

import { Logger } from "../utils/logger"
import { Instance } from "@/project/instance"
import { Tool } from "@/tool/tool"
import { z } from "zod"
import path from "path"
import { $ } from "bun"
import { getShellConfiguration, ShellToolInvocation, type ShellToolParams } from "./shell"
import { BashArity } from "@/permission/arity"
import { lazy } from "@/util/lazy"
import { Language } from "web-tree-sitter"
import { fileURLToPath } from "url"
import { Truncate } from "@/tool/truncation"
import DESCRIPTION from "@/tool/bash.txt"

const log = Logger.clone().tag("scope", "bash-tool-enhanced")

const MAX_METADATA_LENGTH = 30_000
const MAX_OUTPUT_LENGTH = 10 * 1024 * 1024

const resolveWasm = (asset: string) => {
  if (asset.startsWith("file://")) return fileURLToPath(asset)
  if (asset.startsWith("/") || /^[a-z]:/i.test(asset)) return asset
  const url = new URL(asset, import.meta.url)
  return fileURLToPath(url)
}

const parser = lazy(async () => {
  const { Parser } = await import("web-tree-sitter")
  const { default: treeWasm } = await import("web-tree-sitter/tree-sitter.wasm" as string, {
    with: { type: "wasm" },
  })
  const treePath = resolveWasm(treeWasm)
  await Parser.init({
    locateFile() {
      return treePath
    },
  })
  const { default: bashWasm } = await import("tree-sitter-bash/tree-sitter-bash.wasm" as string, {
    with: { type: "wasm" },
  })
  const bashPath = resolveWasm(bashWasm)
  const bashLanguage = await Language.load(bashPath)
  const p = new Parser()
  p.setLanguage(bashLanguage)
  return p
})

/**
 * Enhanced Bash Tool that leverages shell priority selection and dynamic prompt injection.
 * This tool maintains compatibility with original BashTool while adding advanced features.
 */
export const BashTool = Tool.define("bash", async () => {
  const shellConfig = getShellConfiguration()
  log.info("Enhanced bash tool using shell configuration", {
    shell: shellConfig.shell,
    executable: shellConfig.executable,
    version: shellConfig.version,
  })

  return {
    description: EnhancedBashToolDescription(shellConfig),
    parameters: z.object({
      command: z.string().describe("The command to execute"),
      timeout: z.number().describe("Optional timeout in milliseconds").optional(),
      workdir: z
        .string()
        .describe(
          `The working directory to run the command in. Defaults to ${Instance.directory}. Use this instead of 'cd' commands.`,
        )
        .optional(),
      description: z
        .string()
        .describe(
          "Clear, concise description of what this command does in 5-10 words. Examples:\nInput: ls\nOutput: Lists files in current directory\n\nInput: git status\nOutput: Shows working tree status\n\nInput: npm install\nOutput: Installs package dependencies\n\nInput: mkdir foo\nOutput: Creates directory 'foo'",
        ),
      is_background: z
        .boolean()
        .describe("Whether to run command in background (for long-running processes like dev servers)")
        .optional(),
    }),
    async execute(params, ctx) {
      const workdir = params.workdir || Instance.directory
      if (params.timeout !== undefined && params.timeout < 0) {
        throw new Error(
          `Invalid timeout value: ${params.timeout}. Timeout must be a non-negative number (0 for no timeout).`,
        )
      }

      // Normalize workdir path for external directory check
      const normalizedWorkdir = path.resolve(workdir)

      // Check instance directory and worktree
      const instanceDir = Instance.directory
      const instanceWorktree = Instance.worktree

      // Parse command for permission requests using tree-sitter
      const tree = await parser().then((p) => p.parse(params.command))

      if (!tree) {
        throw new Error("Failed to parse command")
      }

      const directories = new Set<string>()

      // Check if workdir is external directory
      const isExternal = !Instance.containsPath(normalizedWorkdir)

      if (isExternal) {
        directories.add(workdir)
      }

      const patterns = new Set<string>()
      const always = new Set<string>()

      for (const node of tree.rootNode.descendantsOfType("command")) {
        if (!node) continue
        const command = []
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i)
          if (!child) continue
          if (
            child.type !== "command_name" &&
            child.type !== "word" &&
            child.type !== "string" &&
            child.type !== "raw_string" &&
            child.type !== "concatenation"
          ) {
            continue
          }
          command.push(child.text)
        }

        // not an exhaustive list, but covers most common cases
        if (["cd", "rm", "cp", "mv", "mkdir", "touch", "chmod", "chown"].includes(command[0])) {
          for (const arg of command.slice(1)) {
            if (arg.startsWith("-") || (command[0] === "chmod" && arg.startsWith("+"))) continue
            const resolved = await $`realpath ${arg}`
              .cwd(normalizedWorkdir)
              .quiet()
              .nothrow()
              .text()
              .then((x) => x.trim())
            log.info("resolved path", { arg, resolved })
            if (resolved) {
              // Git Bash on Windows returns Unix-style paths like /c/Users/...
              const normalized =
                process.platform === "win32" && resolved.match(/^\/[a-z]\//)
                  ? resolved.replace(/^\/([a-z])\//, (_, drive) => `${drive.toUpperCase()}:\\`).replace(/\//g, "\\")
                  : resolved
              if (!Instance.containsPath(normalized)) directories.add(normalized)
            }
          }
        }

        // cd covered by above check
        if (command.length && command[0] !== "cd") {
          patterns.add(command.join(" "))
          always.add(BashArity.prefix(command).join(" ") + "*")
        }
      }

      const commandRoots = Array.from(patterns)

      if (directories.size > 0) {
        await ctx.ask({
          permission: "external_directory",
          patterns: Array.from(directories),
          always: Array.from(directories).map((x) => path.dirname(x) + "*"),
          metadata: {},
        })
      }

      if (patterns.size > 0) {
        await ctx.ask({
          permission: "bash",
          patterns: Array.from(patterns),
          always: Array.from(always),
          metadata: {},
        })
      }

      const shellParams: ShellToolParams = {
        command: params.command,
        description: params.description,
        dir_path: normalizedWorkdir,
        is_background: params.is_background,
        timeout: params.timeout,
      }

      const invocation = new ShellToolInvocation(shellParams, normalizedWorkdir)

      log.info("Executing bash command", {
        command: params.command,
        workdir: normalizedWorkdir,
        shell: shellConfig.shell,
        timeout: params.timeout,
        is_background: params.is_background,
      })

      ctx.metadata({
        metadata: {
          command: params.command,
          roots: commandRoots,
          description: params.description,
          workdir: normalizedWorkdir,
          shell: shellConfig.shell,
        },
      })

      const abortController = new AbortController()
      if (ctx.abort.aborted) {
        abortController.abort()
      }

      const abortHandler = () => {
        abortController.abort()
      }
      ctx.abort.addEventListener("abort", abortHandler)

      let cumulativeOutput = ""

      const updateMetadata = (chunk: string) => {
        cumulativeOutput += chunk
        ctx.metadata({
          metadata: {
            output:
              cumulativeOutput.length > MAX_METADATA_LENGTH
                ? "...\n\n" + cumulativeOutput.slice(-MAX_METADATA_LENGTH)
                : cumulativeOutput,
            command: params.command,
            roots: commandRoots,
            description: params.description,
            workdir: normalizedWorkdir,
            shell: shellConfig.shell,
          },
        })
      }

      const result = await invocation.execute(abortController.signal, updateMetadata, undefined)

      // 清理事件监听器
      ctx.abort.removeEventListener("abort", abortHandler)

      const resultMetadata: string[] = []

      if (result.aborted) {
        if (abortController.signal.aborted) {
          resultMetadata.push("bash tool terminated command due to timeout or abort")
        } else {
          resultMetadata.push("User aborted command")
        }
      }

      const formattedOutput: string =
        resultMetadata.length > 0
          ? result.output + "\n\n<bash_metadata>\n" + resultMetadata.join("\n") + "\n</bash_metadata>"
          : result.output

      const truncateResult = await Truncate.output(formattedOutput, {}, undefined)
      const normalizedOutput = truncateResult.content.replace(/\r\n/g, "\n")

      return {
        title: params.description,
        metadata: {
          output: normalizedOutput,
          exit: result.exitCode,
          description: params.description,
          command: params.command,
          roots: commandRoots,
          shell: shellConfig.shell,
          truncated: truncateResult.truncated,
        },
        output: normalizedOutput,
      }
    },
  }
})

/**
 * Generate enhanced tool description with shell-specific guidance
 */
function EnhancedBashToolDescription(shellConfig: {
  shell: string
  executable: string
  argsPrefix: string[]
  version?: string
}): string {
  const baseDescription = DESCRIPTION.replaceAll("${directory}", Instance.directory)

  const shellSpecific =
    shellConfig.shell === "bash"
      ? `
**Shell Environment:** bash (Unix-like shell)
**Path Separators:** ALWAYS use forward slash (/) for file paths. NEVER use backslash (\\)
**Command Chaining:** Supports && and || operators
**Background Processes:** Set is_background: true, or manually use & to run commands in background
**Multi-line Commands:** Use backslash (\\) to continue on next line
  Example: \\
  command1 \\
    && command2 \\
    && command3
`
      : shellConfig.shell === "powershell"
        ? `
**Shell Environment:** PowerShell (pwsh or powershell.exe)
**Path Separators:** Use forward slash (/) or backslash (\\)
**Command Chaining:** Supports && and || operators (pwsh/PowerShell 7+) or ; for all versions
**Background Processes:** Set is_background: true to use Start-Job
**Directory Listing:** Use \`ls\` to list directory contents. In PowerShell, \`ls\` is an alias for Get-ChildItem. Note that PowerShell does not support Unix-style flags like \`-la\`. Use \`ls -Force\` to show hidden files instead.
**Multi-line Commands:** Use backtick (\`) to continue on next line
  Example: \\
  command1 \` \\
    -and command2 \` \\
    -and command3
`
        : `
**Shell Environment:** Windows Command Prompt (cmd.exe)
**Path Separators:** Use backslash (\\) for file paths
**Command Chaining:** Supports && and || operators
**Background Processes:** Set is_background: true to use START /B
**Multi-line Commands:** Use caret (^) to continue on next line
  Example: \\
  command1 ^ \\
  && command2 ^ \\
  && command3
`

  const backgroundGuidance = `
**Background vs Foreground Execution:**
You should decide whether commands should run in background or foreground based on their nature:

**Use background execution (is_background: true) for:**
- Long-running development servers: \`npm run start\`, \`npm run dev\`, \`yarn dev\`, \`python manage.py runserver\`
- Build watchers: \`npm run watch\`, \`webpack --watch\`, \`tsc --watch\`
- Database servers: \`mongod\`, \`mysql\`, \`redis-server\`, \`postgres\`
- Web servers: \`python -m http.server\`, \`php -S localhost:8000\`
- Any command expected to run indefinitely until manually stopped

**Use foreground execution (is_background: false, default) for:**
- One-time commands: \`ls\`, \`cat\`, \`grep\`, \`find\`
- Build commands: \`npm run build\`, \`make\`, \`cargo build\`
- Installation commands: \`npm install\`, \`pip install\`, \`apt-get install\`
- Git operations: \`git commit\`, \`git push\`, \`git clone\`, \`git checkout\`, \`git add\`
- Test runs: \`npm test\`, \`pytest\`, \`cargo test\`
- Scripts with defined end points

**Important: Git Operations and Line Endings**
When executing git commands that may trigger line ending conversion, ALWAYS add \`-c core.autocrlf=false\` to prevent unexpected line ending changes. This is especially important on Windows.

Required for these git operations:
- \`git add\`, \`git commit\` - add \`-c core.autocrlf=false\` before the command
- \`git checkout\` - add \`-c core.autocrlf=false\` before the command
- \`git reset --hard\` - add \`-c core.autocrlf=false\` before the command
- \`git clone\` - add \`-c core.autocrlf=false\` before the command

Correct usage:
- \`git -c core.autocrlf=false add .\`
- \`git -c core.autocrlf=false commit -m "message"\`
- \`git -c core.autocrlf=false checkout main\`
- \`git -c core.autocrlf=false reset --hard HEAD\`
- \`git -c core.autocrlf=false clone https://github.com/user/repo.git\`

**Background Implementation by Shell:**
- bash: Appends \` &\` to run command in background
- cmd.exe: Wraps with \`START /B <command>\` to run without new window
- PowerShell: Wraps with \`Start-Job -ScriptBlock { <command> }\` to run as background job

**Note**: If your command already contains background syntax (e.g., ends with &, starts with START /B,
or uses Start-Job), it will be preserved regardless of the is_background parameter value.
`

  const parameters = `
**Parameters:**
- command: The shell command to execute
- workdir: Working directory (defaults to project root)
- description: Brief description of what command does
- timeout: Optional timeout in milliseconds (default: 5 minutes)
- is_background: Run as background process (for dev servers, watchers, etc.)

**Output Truncation:**
- Output longer than ${MAX_OUTPUT_LENGTH} bytes will be truncated
- Output longer than ${MAX_METADATA_LENGTH} characters in metadata will be truncated
`

  const versionInfo = shellConfig.version ? ` (version ${shellConfig.version})` : ""

  return `${baseDescription}

**Detected Shell:** ${shellConfig.shell} (${shellConfig.executable})${versionInfo}${shellSpecific}${backgroundGuidance}${parameters}`
}
