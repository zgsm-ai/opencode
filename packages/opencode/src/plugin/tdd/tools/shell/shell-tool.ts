/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "node:fs"
import path from "node:path"
import os, { EOL } from "node:os"
import crypto from "node:crypto"
import { debugLogger } from "../../utils/logger.js"
import type { ShellExecutionConfig, ShellExecutionResult, ShellOutputEvent } from "./shell-execution"
import { ShellExecutionService } from "./shell-execution"
import {
  getCommandRoots,
  stripShellWrapper,
  getShellConfiguration,
  hasBackgroundSyntax,
  addBackgroundSyntax,
} from "./shell-utils"

export const OUTPUT_UPDATE_INTERVAL_MS = 1000

export interface ShellToolParams {
  command: string
  description?: string
  dir_path?: string
  is_background?: boolean
  timeout?: number
}

export class ShellToolInvocation {
  constructor(
    private readonly params: ShellToolParams,
    private readonly cwd: string,
  ) {}

  getDescription(): string {
    let description = `${this.params.command}`
    if (this.params.dir_path) {
      description += ` [in ${this.params.dir_path}]`
    } else {
      description += ` [current working directory ${process.cwd()}]`
    }
    if (this.params.is_background) {
      description += ` [background]`
    }
    if (this.params.timeout !== undefined) {
      if (this.params.timeout === 0) {
        description += ` [no timeout]`
      } else {
        description += ` [timeout: ${(this.params.timeout / 60000).toFixed(1)}m]`
      }
    }
    if (this.params.description) {
      description += ` (${this.params.description.replace(/\n/g, " ")})`
    }
    return description
  }

  async execute(
    signal: AbortSignal,
    updateOutputChunk?: (chunk: string) => void,
    shellExecutionConfig?: ShellExecutionConfig,
    _setPidCallback?: (pid: number) => void,
  ): Promise<ShellExecutionResult> {
    const strippedCommand = stripShellWrapper(this.params.command)

    const shellConfig = getShellConfiguration()
    const { shell } = shellConfig

    let commandToProcess = strippedCommand
    const alreadyHasBackground = hasBackgroundSyntax(strippedCommand, shell)

    if (this.params.is_background && !alreadyHasBackground) {
      commandToProcess = addBackgroundSyntax(strippedCommand, shell)
    }

    if (signal.aborted) {
      const errorText = "Command was cancelled by user before it could start."
      if (updateOutputChunk) {
        updateOutputChunk(errorText)
      }
      return {
        rawOutput: Buffer.from(errorText),
        output: errorText,
        exitCode: 1,
        signal: null,
        error: new Error(errorText),
        aborted: true,
        pid: undefined,
        executionMethod: "none",
      }
    }

    const isWindows = os.platform() === "win32"
    const tempFileName = `shell_pgrep_${crypto.randomBytes(6).toString("hex")}.tmp`
    const tempFilePath = path.join(os.tmpdir(), tempFileName)

    let timeoutMs = this.params.timeout
    if (timeoutMs === undefined) {
      const timeoutString = process.env["COSTRICT_SHELL_TIMEOUT"]
      if (timeoutString !== undefined) {
        if (timeoutString.toLowerCase() === "no" || timeoutString === "none" || timeoutString === "off") {
          timeoutMs = 0
        } else {
          const timeoutNum = Number(timeoutString)
          if (!isNaN(timeoutNum)) {
            timeoutMs = timeoutNum * 60 * 1000
          }
        }
      }
    }
    if (timeoutMs === undefined) {
      timeoutMs = 5 * 60 * 1000
    }

    const timeoutController = new AbortController()
    let timeoutTimer: NodeJS.Timeout | undefined

    const combinedController = new AbortController()

    const onAbort = () => combinedController.abort()

    try {
      let commandToExecute = commandToProcess.trim()

      const cwd = this.params.dir_path ? path.resolve(this.cwd, this.params.dir_path) : this.cwd

      let isBinaryStream = false

      const resetTimeout = () => {
        if (timeoutMs <= 0) {
          return
        }
        if (timeoutTimer) clearTimeout(timeoutTimer)
        // Inactivity timeout not implemented in this simplified version
      }

      signal.addEventListener("abort", onAbort, { once: true })
      timeoutController.signal.addEventListener("abort", onAbort, {
        once: true,
      })

      resetTimeout()

      const { result: resultPromise, pid } = await ShellExecutionService.execute(
        commandToExecute,
        cwd,
        (event: ShellOutputEvent) => {
          resetTimeout()
          if (!updateOutputChunk) {
            return
          }

          let shouldUpdate = false

          if (!isBinaryStream && event.type === "data") {
            shouldUpdate = true
          }

          if (shouldUpdate) {
            updateOutputChunk(event.chunk)
          }
        },
        combinedController.signal,
        false, // Interactive shell disabled
        {
          ...shellExecutionConfig,
          pager: "cat",
          timeout: timeoutMs,
        },
      )

      const result = await resultPromise

      let timeoutMessage = ""
      if (result.aborted) {
        if (timeoutController.signal.aborted) {
          timeoutMessage = `Command was automatically cancelled because it exceeded the timeout of ${(timeoutMs / 60000).toFixed(1)} minutes.`
        }
      }

      if (timeoutMessage && updateOutputChunk) {
        updateOutputChunk(`\nTimeout: ${timeoutMessage}`)
      }

      return result
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer)
      signal.removeEventListener("abort", onAbort)
      timeoutController.signal.removeEventListener("abort", onAbort)
    }
  }

  getCommandRoots(): string[] {
    const command = stripShellWrapper(this.params.command)
    return getCommandRoots(command)
  }
}

export function getShellToolDescription(): string {
  const shellConfig = getShellConfiguration()
  const { shell, executable, argsPrefix } = shellConfig

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
- Git operations: \`git commit\`, \`git push\`, \`git clone\`
- Test runs: \`npm test\`, \`pytest\`, \`cargo test\`
- Scripts with defined end points

**Background Implementation by Shell:**
- bash: Appends \` &\` to run command in background
- cmd.exe: Wraps with \`START /B <command>\` to run without new window
- PowerShell: Wraps with \`Start-Job -ScriptBlock { <command> }\` to run as background job

**Note**: If your command already contains background syntax (e.g., ends with &, starts with START /B,
or uses Start-Job), it will be preserved regardless of the is_background parameter value.
`

  const returnedInfo = `
The following information is returned:
Command: Executed command.
Directory: Directory where command was executed, or \`(root)\`.
Output: Combined stdout and stderr. Can be \`(empty)\` or partial on error and for any unwaited background processes.
Error: Error or \`(none)\` if no error was reported for the subprocess.
Exit Code: Exit code or \`(none)\` if terminated by signal.
Signal: Signal number or \`(none)\` if no signal was received.
`

  const commandExecution = `\`${executable} ${argsPrefix.join(" ")} <command>\``

  let shellNotes = ""

  if (shell === "bash") {
    shellNotes = `
Shell Environment: bash (Unix-like shell)
Path Separators: ALWAYS use forward slash (/) for file paths. NEVER use backslash (\\)
Command Chaining: Supports && and || operators
Background Processes: Set is_background: true, or manually use & to run commands in background
`
  } else if (shell === "powershell") {
    shellNotes = `
Shell Environment: PowerShell (pwsh or powershell.exe)
Path Separators: Use forward slash (/) or backslash (\\)
Command Chaining: Supports && and || operators (pwsh/PowerShell 7+) or ; for all versions
Background Processes: Set is_background: true to use Start-Job
`
  } else if (shell === "cmd") {
    shellNotes = `
Shell Environment: Windows Command Prompt (cmd.exe)
Path Separators: Use backslash (\\) for file paths
Command Chaining: Supports && and || operators
Background Processes: Set is_background: true to use START /B
`
  }

  return `This tool executes a given shell command as ${commandExecution}.${backgroundGuidance}${shellNotes}${returnedInfo}`
}

export const ShellTool = {
  Name: "ShellTool",
  create: (cwd: string) => ({
    description: getShellToolDescription(),
    execute: async (params: ShellToolParams, signal?: AbortSignal, updateOutput?: (output: string) => void) => {
      const invocation = new ShellToolInvocation(params, cwd)
      return invocation.execute(signal || new AbortController().signal, updateOutput)
    },
    createInvocation: (params: ShellToolParams) => new ShellToolInvocation(params, cwd),
  }),
}
