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

import { Log } from "@/util/log"
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

const log = Log.create({ service: "bash-tool-enhanced" })

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

      ctx.abort.addEventListener("abort", () => {
        abortController.abort()
      })

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
          ...(truncateResult.truncated && { outputPath: truncateResult.outputPath }),
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
    .replaceAll("${maxLines}", String(Truncate.MAX_LINES))
    .replaceAll("${maxBytes}", String(Truncate.MAX_BYTES))

  const shellSpecific =
    shellConfig.shell === "bash"
      ? `
**Shell-Specific Notes (bash):**
- Use forward slashes (/) for file paths
- Use && to chain commands (only runs next if previous succeeds)
- Use || for command fallback (runs next if previous fails)
- Use & at end to run in background
- For multi-line commands, use backslash (\\) to continue on next line
  Example: \\
  command1 \\
    && command2 \\
    && command3
`
      : shellConfig.shell === "powershell"
        ? `
**Shell-Specific Notes (PowerShell):**
- Both forward slashes (/) and backslashes (\\) work for paths
- PowerShell 7+ (pwsh.exe) supports && and || operators
- PowerShell 5.x (powershell.exe) does NOT support && or ||; use semicolon (;) instead
- Use Start-Job for background processes
- For multi-line commands, use backtick (\`) to continue on next line
  Example: \\
  command1 \` \\
    -and command2 \` \\
    -and command3
`
        : `
**Shell-Specific Notes (cmd):**
- Use backslashes (\\) for file paths
- Use && to chain commands and || for fallback
- Use START /B to run in background
- For multi-line commands, use caret (^) to continue on next line
  Example: \\
  command1 ^ \\
  && command2 ^ \\
  && command3
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

  return `${baseDescription}

**Detected Shell:** ${shellConfig.shell} (${shellConfig.executable})${shellSpecific}${parameters}`
}
