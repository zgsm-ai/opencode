/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from "node:os"
import { spawn, spawnSync, exec, type SpawnOptionsWithoutStdio } from "node:child_process"
import { promisify } from "node:util"
import type { Node } from "web-tree-sitter"
import { Language, Parser, Query } from "web-tree-sitter"
import { debugLogger } from "../../utils/logger.js"

const execAsync = promisify(exec)

export const SHELL_TOOL_NAMES = ["run_shell_command", "ShellTool"]

export type ShellType = "cmd" | "powershell" | "bash"

export interface ShellConfiguration {
  executable: string
  argsPrefix: string[]
  shell: ShellType
  version?: string
}

let bashLanguage: Language | null = null
let treeSitterInitialization: Promise<void> | null = null
let treeSitterInitializationError: Error | null = null

let cachedShellConfiguration: ShellConfiguration | null = null
let cachedParentProcessShell: ShellConfiguration | null = null

export async function initializeParentProcessDetection(): Promise<void> {
  try {
    const shellConfig = await detectShellFromParentProcess()
    if (shellConfig) {
      const version = getShellVersion(shellConfig.executable, shellConfig.shell)
      cachedParentProcessShell = { ...shellConfig, version }
    } else {
      cachedParentProcessShell = null
    }
    debugLogger.debug("Parent process shell detected", { shellConfig: cachedParentProcessShell })
  } catch (e) {
    debugLogger.debug("Failed to initialize parent process detection", { error: e })
    cachedParentProcessShell = null
  }
}

class ShellParserInitializationError extends Error {
  constructor(cause: Error) {
    super(`Failed to initialize bash parser: ${cause.message}`, { cause })
    this.name = "ShellParserInitializationError"
  }
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value
  }
  if (typeof value === "string") {
    return new Error(value)
  }
  return new Error("Unknown tree-sitter initialization error", {
    cause: value,
  })
}

async function loadBashLanguage(): Promise<void> {
  try {
    treeSitterInitializationError = null
    // Simple stub for WASM loading - in real implementation, load actual WASM binaries
    // using import('web-tree-sitter/tree-sitter.wasm?binary') and similar
    const treeSitterBinary = Buffer.from("")
    const bashBinary = Buffer.from("")

    // This will fail without actual WASM, which is expected
    await Parser.init({ wasmBinary: treeSitterBinary })
    bashLanguage = null // Will fail without actual WASM, can't load
  } catch (error) {
    bashLanguage = null
    const normalized = toError(error)
    const initializationError =
      normalized instanceof ShellParserInitializationError ? normalized : new ShellParserInitializationError(normalized)
    treeSitterInitializationError = initializationError
    throw initializationError
  }
}

export async function initializeShellParsers(): Promise<void> {
  if (!treeSitterInitialization) {
    treeSitterInitialization = loadBashLanguage().catch((error) => {
      treeSitterInitialization = null
      debugLogger.debug("Failed to initialize shell parsers:", error)
    })
  }
  await treeSitterInitialization
}

export interface ParsedCommandDetail {
  name: string
  text: string
}

interface CommandParseResult {
  details: ParsedCommandDetail[]
  hasError: boolean
  hasRedirection?: boolean
}

const POWERSHELL_COMMAND_ENV = "__GCLI_POWERSHELL_COMMAND__"

const POWERSHELL_PARSER_SCRIPT = Buffer.from(
  `
$ErrorActionPreference = 'Stop'
$commandText = $env:${POWERSHELL_COMMAND_ENV}
if ([string]::IsNullOrEmpty($commandText)) {
  Write-Output '{"success":false}'
  exit 0
}
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseInput($commandText, [ref]$tokens, [ref]$errors)
if ($errors -and $errors.Count -gt 0) {
  Write-Output '{"success":false}'
  exit 0
}
$commandAsts = $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.CommandAst] }, $true)
$commandObjects = @()
$hasRedirection = $false
foreach ($commandAst in $commandAsts) {
  if ($commandAst.Redirections.Count -gt 0) {
    $hasRedirection = $true
  }
  $name = $commandAst.GetCommandName()
  if ([string]::IsNullOrWhiteSpace($name)) {
    continue
  }
  $commandObjects += [PSCustomObject]@{
    name = $name
    text = $commandAst.Extent.Text.Trim()
  }
}
[PSCustomObject]@{
  success = $true
  commands = $commandObjects
  hasRedirection = $hasRedirection
} | ConvertTo-Json -Compress
`,
  "utf16le",
).toString("base64")

function createParser(): Parser | null {
  if (!bashLanguage) {
    if (treeSitterInitializationError) {
      throw treeSitterInitializationError
    }
    return null
  }

  try {
    const parser = new Parser()
    parser.setLanguage(bashLanguage)
    return parser
  } catch {
    return null
  }
}

function parseCommandTree(command: string) {
  const parser = createParser()
  if (!parser || !command.trim()) {
    return null
  }

  try {
    return parser.parse(command)
  } catch {
    return null
  }
}

function normalizeCommandName(raw: string): string {
  if (raw.length >= 2) {
    const first = raw[0]
    const last = raw[raw.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return raw.slice(1, -1)
    }
  }
  const trimmed = raw.trim()
  if (!trimmed) {
    return trimmed
  }
  return trimmed.split(/[\\/]/).pop() ?? trimmed
}

function extractNameFromNode(node: Node): string | null {
  switch (node.type) {
    case "command": {
      const nameNode = node.childForFieldName("name")
      if (!nameNode) {
        return null
      }
      return normalizeCommandName(nameNode.text)
    }
    case "declaration_command":
    case "unset_command":
    case "test_command": {
      const firstChild = node.child(0)
      if (!firstChild) {
        return null
      }
      return normalizeCommandName(firstChild.text)
    }
    default:
      return null
  }
}

function collectCommandDetails(root: Node, source: string): ParsedCommandDetail[] {
  const stack: Node[] = [root]
  const details: ParsedCommandDetail[] = []

  while (stack.length > 0) {
    const current = stack.pop()!

    let name: string | null = null
    let ignoreChildId: number | undefined

    if (current.type === "redirected_statement") {
      const body = current.childForFieldName("body")
      if (body) {
        const bodyName = extractNameFromNode(body)
        if (bodyName) {
          name = bodyName
          ignoreChildId = body.id

          for (let i = body.namedChildCount - 1; i >= 0; i -= 1) {
            const grandChild = body.namedChild(i)
            if (grandChild) {
              stack.push(grandChild)
            }
          }
        }
      }
    }

    if (!name) {
      name = extractNameFromNode(current)
    }

    if (name) {
      details.push({
        name,
        text: source.slice(current.startIndex, current.endIndex).trim(),
      })
    }

    for (let i = current.namedChildCount - 1; i >= 0; i -= 1) {
      const child = current.namedChild(i)
      if (child && child.id !== ignoreChildId) {
        stack.push(child)
      }
    }
  }

  return details
}

function hasPromptCommandTransform(root: Node): boolean {
  const stack: Node[] = [root]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) {
      continue
    }

    if (current.type === "expansion") {
      for (let i = 0; i < current.childCount - 1; i += 1) {
        const operatorNode = current.child(i)
        const transformNode = current.child(i + 1)

        if (operatorNode?.text === "@" && transformNode?.text?.toLowerCase() === "p") {
          return true
        }
      }
    }

    for (let i = current.namedChildCount - 1; i >= 0; i -= 1) {
      const child = current.namedChild(i)
      if (child) {
        stack.push(child)
      }
    }
  }

  return false
}

function parseBashCommandDetails(command: string): CommandParseResult | null {
  if (treeSitterInitializationError) {
    debugLogger.debug("Bash parser not initialized:", treeSitterInitializationError)
    return null
  }

  if (!bashLanguage) {
    initializeShellParsers().catch(() => {})
    return null
  }

  const tree = parseCommandTree(command)
  if (!tree) {
    return null
  }

  const details = collectCommandDetails(tree.rootNode, command)

  const hasError = tree.rootNode.hasError || details.length === 0 || hasPromptCommandTransform(tree.rootNode)

  if (hasError) {
    let query = null
    try {
      query = new Query(bashLanguage, "(ERROR) @error (MISSING) @missing")
      const captures = query.captures(tree.rootNode)
      const syntaxErrors = captures.map((capture) => {
        const { node, name } = capture
        const type = name === "missing" ? "Missing" : "Error"
        return `${type} node: "${node.text}" at ${node.startPosition.row}:${node.startPosition.column}`
      })

      debugLogger.debug("Bash command parsing error detected", { command, syntaxErrors })
    } catch (_e) {
    } finally {
      query?.delete()
    }
  }
  return {
    details,
    hasError,
  }
}

function parsePowerShellCommandDetails(command: string, executable: string): CommandParseResult | null {
  const trimmed = command.trim()
  if (!trimmed) {
    return {
      details: [],
      hasError: true,
    }
  }

  try {
    const result = spawnSync(
      executable,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", POWERSHELL_PARSER_SCRIPT],
      {
        env: {
          ...process.env,
          [POWERSHELL_COMMAND_ENV]: command,
        },
        encoding: "utf-8",
      },
    )

    if (result.error || result.status !== 0) {
      return null
    }

    const output = (result.stdout ?? "").toString().trim()
    if (!output) {
      return { details: [], hasError: true }
    }

    let parsed: {
      success?: boolean
      commands?: Array<{ name?: string; text?: string }>
      hasRedirection?: boolean
    } | null = null
    try {
      parsed = JSON.parse(output)
    } catch {
      return { details: [], hasError: true }
    }

    if (!parsed?.success) {
      return { details: [], hasError: true }
    }

    const details = (parsed.commands ?? [])
      .map((commandDetail) => {
        if (!commandDetail || typeof commandDetail.name !== "string") {
          return null
        }

        const name = normalizeCommandName(commandDetail.name)
        const text = typeof commandDetail.text === "string" ? commandDetail.text.trim() : command

        return {
          name,
          text,
        }
      })
      .filter((detail): detail is ParsedCommandDetail => detail !== null)

    return {
      details,
      hasError: details.length === 0,
      hasRedirection: parsed.hasRedirection,
    }
  } catch {
    return null
  }
}

export function parseCommandDetails(command: string): CommandParseResult | null {
  const configuration = getShellConfiguration()

  if (configuration.shell === "powershell") {
    return parsePowerShellCommandDetails(command, configuration.executable)
  }

  if (configuration.shell === "bash") {
    return parseBashCommandDetails(command)
  }

  return null
}

function getShellVersion(executable: string, shell: ShellType): string | undefined {
  const startTime = Date.now()
  let detectedVersion: string | undefined

  try {
    let result

    switch (shell) {
      case "bash": {
        result = spawnSync(executable, ["--version"], {
          encoding: "utf-8",
          timeout: 2000,
          windowsHide: true,
        })

        if (result.status === 0 && result.stdout) {
          const match = result.stdout.match(/version\s+(\d+\.\d+\.\d+)/i)
          if (match) {
            detectedVersion = match[1]
            debugLogger.debug(`Detected bash version: ${detectedVersion}`)
          }
        }
        break
      }

      case "powershell": {
        result = spawnSync(executable, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], {
          encoding: "utf-8",
          timeout: 2000,
          windowsHide: true,
        })

        if (result.status === 0 && result.stdout) {
          const versionString = result.stdout.trim()
          const match = versionString.match(/^(\d+\.\d+\.\d+)/)
          if (match) {
            detectedVersion = match[1]
            debugLogger.debug(`Detected PowerShell version: ${detectedVersion}`)
          }
        }
        break
      }

      case "cmd": {
        try {
          const testResult = spawnSync("powershell.exe", ["-NoProfile", "-Command", "exit 0"], {
            timeout: 500,
            windowsHide: true,
          })

          if (!testResult.error && testResult.status === 0) {
            result = spawnSync(
              "powershell.exe",
              ["-NoProfile", "-Command", "(Get-Item $env:windir\\system32\\cmd.exe).VersionInfo.ProductVersion"],
              {
                encoding: "utf-8",
                timeout: 2000,
                windowsHide: true,
              },
            )

            if (result.status === 0 && result.stdout) {
              detectedVersion = result.stdout.trim()
              debugLogger.debug(`Detected CMD version: ${detectedVersion}`)
            }
          } else {
            debugLogger.debug("PowerShell not available for CMD version detection")
          }
        } catch (error) {
          debugLogger.debug("Failed to get CMD version via PowerShell", {
            error: error instanceof Error ? error.message : String(error),
          })
        }
        break
      }

      default: {
        debugLogger.debug(`Version detection not implemented for shell: ${shell}`)
        break
      }
    }
  } catch (error) {
    debugLogger.debug("Failed to get shell version", {
      shell,
      error: error instanceof Error ? error.message : String(error),
    })
  } finally {
    const elapsed = Date.now() - startTime
    debugLogger.debug("getShellVersion completed", { shell, elapsedMs: elapsed })
  }

  return detectedVersion
}

function detectShellConfiguration(): ShellConfiguration {
  if (cachedParentProcessShell) {
    debugLogger.debug("Using parent process shell detection:", cachedParentProcessShell)
    return cachedParentProcessShell
  }

  debugLogger.debug("Using environment variable shell detection")
  return detectShellConfigurationFromEnv()
}

function detectShellConfigurationFromEnv(): ShellConfiguration {
  let baseConfig: Omit<ShellConfiguration, "version"> | null = null

  if (isWindows()) {
    if (process.env["PSModulePath"]) {
      const comSpec = process.env["ComSpec"]
      if (comSpec) {
        const executable = comSpec.toLowerCase()
        if (executable.endsWith("powershell.exe") || executable.endsWith("pwsh.exe")) {
          baseConfig = {
            executable: comSpec,
            argsPrefix: ["-NoProfile", "-Command"],
            shell: "powershell",
          }
        }
      }

      if (!baseConfig) {
        try {
          const result = spawnSync("pwsh.exe", ["-NoProfile", "-Command", 'Write-Output "OK"'], {
            encoding: "utf-8",
            timeout: 2000,
            windowsHide: true,
          })
          if (result.status === 0) {
            baseConfig = {
              executable: "pwsh.exe",
              argsPrefix: ["-NoProfile", "-Command"],
              shell: "powershell",
            }
          }
        } catch {}
      }

      if (!baseConfig) {
        baseConfig = {
          executable: "powershell.exe",
          argsPrefix: ["-NoProfile", "-Command"],
          shell: "powershell",
        }
      }
    }

    if (!baseConfig && process.env["MSYSTEM"]) {
      baseConfig = {
        executable: "bash",
        argsPrefix: ["-c"],
        shell: "bash",
      }
    }

    if (!baseConfig && (process.env["WSL_DISTRO_NAME"] || process.env["WSL_INTEROP"])) {
      baseConfig = {
        executable: "bash",
        argsPrefix: ["-c"],
        shell: "bash",
      }
    }

    if (!baseConfig) {
      const shellEnv = process.env["SHELL"]
      if (shellEnv && shellEnv.toLowerCase().includes("bash")) {
        baseConfig = {
          executable: "bash",
          argsPrefix: ["-c"],
          shell: "bash",
        }
      }
    }

    if (!baseConfig) {
      const comSpec = process.env["ComSpec"]
      const executable = comSpec ? comSpec.toLowerCase() : ""

      if (executable.endsWith("powershell.exe") || executable.endsWith("pwsh.exe")) {
        baseConfig = {
          executable: comSpec || executable,
          argsPrefix: ["-NoProfile", "-Command"],
          shell: "powershell",
        }
      } else if (executable.endsWith("cmd.exe")) {
        baseConfig = {
          executable: comSpec || "cmd.exe",
          argsPrefix: ["/c"],
          shell: "cmd",
        }
      } else {
        baseConfig = {
          executable: "powershell.exe",
          argsPrefix: ["-NoProfile", "-Command"],
          shell: "powershell",
        }
      }
    }

    if (!baseConfig) {
      baseConfig = {
        executable: "powershell.exe",
        argsPrefix: ["-NoProfile", "-Command"],
        shell: "powershell",
      }
    }

    if (!baseConfig) {
      baseConfig = {
        executable: "powershell.exe",
        argsPrefix: ["-NoProfile", "-Command"],
        shell: "powershell",
      }
    }
  } else {
    baseConfig = { executable: "bash", argsPrefix: ["-c"], shell: "bash" }
  }

  const version = getShellVersion(baseConfig.executable, baseConfig.shell)
  return { ...baseConfig, version }
}

export function getShellConfiguration(): ShellConfiguration {
  if (cachedShellConfiguration === null) {
    cachedShellConfiguration = detectShellConfiguration()
  }
  return cachedShellConfiguration
}

export function clearShellConfigurationCache(): void {
  cachedShellConfiguration = null
}

async function getProcessTableWindows(): Promise<
  Map<number, { pid: number; parentPid: number; name: string; command: string }>
> {
  const processMap = new Map<number, { pid: number; parentPid: number; name: string; command: string }>()
  try {
    const powershellCommand =
      "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress"

    const { stdout } = await execAsync(`powershell -NoProfile -Command "${powershellCommand}"`, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 5000,
      windowsHide: true,
    })

    if (!stdout.trim()) {
      return processMap
    }

    let processes: Array<{
      ProcessId?: number
      ParentProcessId?: number
      Name?: string
      CommandLine?: string
    }>

    try {
      const parsed = JSON.parse(stdout.trim())
      processes = Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      return processMap
    }

    for (const p of processes) {
      if (p && typeof p.ProcessId === "number") {
        processMap.set(p.ProcessId, {
          pid: p.ProcessId,
          parentPid: p.ParentProcessId || 0,
          name: p.Name?.toLowerCase() || "",
          command: p.CommandLine || "",
        })
      }
    }
  } catch (e) {
    debugLogger.debug("Failed to get process table on Windows", { error: e instanceof Error ? e.message : String(e) })
  }
  return processMap
}

async function getProcessInfoUnix(pid: number): Promise<{
  parentPid: number
  name: string
  command: string
} | null> {
  try {
    const { stdout } = await execAsync(`ps -o ppid=,comm= -p ${pid}`, {
      timeout: 2000,
    })

    const trimmed = stdout.trim()
    if (!trimmed) {
      return null
    }

    const parts = trimmed.split(/\s+/)
    const ppidString = parts[0]
    const parentPid = parseInt(ppidString, 10)
    const name = parts[1]?.toLowerCase() || ""

    return {
      parentPid: isNaN(parentPid) ? 0 : parentPid,
      name,
      command: name,
    }
  } catch (e) {
    debugLogger.debug("Failed to get process info for PID", { pid, error: e instanceof Error ? e.message : String(e) })
    return null
  }
}

const SHELL_PROCESSES = new Set([
  "pwsh",
  "pwsh.exe",
  "powershell",
  "powershell.exe",
  "bash",
  "bash.exe",
  "sh",
  "zsh",
  "fish",
  "ksh",
  "tcsh",
  "csh",
  "dash",
])

function isShellProcess(name: string): boolean {
  const normalized = name.toLowerCase()
  return SHELL_PROCESSES.has(normalized)
}

async function detectShellFromParentProcess(): Promise<ShellConfiguration | null> {
  const isWin = isWindows()
  const MAX_TRAVERSAL_DEPTH = 10

  let foundCmdExe = false

  if (isWin) {
    const processMap = await getProcessTableWindows()
    if (processMap.size === 0) {
      debugLogger.debug("Failed to get process table on Windows")
      return null
    }

    let currentPid = process.pid
    let depth = 0

    while (depth < MAX_TRAVERSAL_DEPTH) {
      const proc = processMap.get(currentPid)
      if (!proc) {
        debugLogger.debug(`Process ${currentPid} not found in process table`)
        break
      }

      debugLogger.debug(`Checking process: ${proc.name} (PID: ${proc.pid})`)

      if (isCmdProcess(proc.name)) {
        debugLogger.debug("Found cmd.exe, but continuing search for better shell")
        foundCmdExe = true
      } else if (isShellProcess(proc.name)) {
        debugLogger.debug(`Found shell process: ${proc.name}`)
        return createShellConfigFromName(proc.name, proc.command, isWin)
      }

      if (proc.parentPid === 0 || !processMap.has(proc.parentPid)) {
        debugLogger.debug("Reached root of process tree")
        break
      }

      currentPid = proc.parentPid
      depth++
    }

    if (foundCmdExe) {
      debugLogger.debug("Only found cmd.exe, falling back to PowerShell for better compatibility")
      return getFallbackPowerShellConfig()
    }
  } else {
    let currentPid = process.pid
    let depth = 0

    while (depth < MAX_TRAVERSAL_DEPTH) {
      const procInfo = await getProcessInfoUnix(currentPid)
      if (!procInfo) {
        debugLogger.debug(`Failed to get process info for PID ${currentPid}`)
        break
      }

      debugLogger.debug(`Checking process: ${procInfo.name} (PID: ${currentPid})`)

      if (isShellProcess(procInfo.name)) {
        debugLogger.debug(`Found shell process: ${procInfo.name}`)
        return createShellConfigFromName(procInfo.name, procInfo.command, isWin)
      }

      if (procInfo.parentPid <= 1) {
        debugLogger.debug("Reached root of process tree")
        break
      }

      currentPid = procInfo.parentPid
      depth++
    }
  }

  debugLogger.debug("No shell process found in process tree")
  return null
}

function isCmdProcess(name: string): boolean {
  const normalized = name.toLowerCase()
  return normalized.includes("cmd.exe") || normalized === "cmd"
}

function getFallbackPowerShellConfig(): ShellConfiguration {
  return {
    executable: "powershell.exe",
    argsPrefix: ["-NoProfile", "-Command"],
    shell: "powershell",
  }
}

function createShellConfigFromName(name: string, command: string, isWin: boolean): ShellConfiguration | null {
  const normalized = name.toLowerCase()

  if (normalized.includes("pwsh.exe") || normalized === "pwsh") {
    return {
      executable: isWin ? "pwsh.exe" : "pwsh",
      argsPrefix: ["-NoProfile", "-Command"],
      shell: "powershell",
    }
  }

  if (normalized.includes("powershell.exe") || normalized === "powershell") {
    return {
      executable: isWin ? "powershell.exe" : "powershell",
      argsPrefix: ["-NoProfile", "-Command"],
      shell: "powershell",
    }
  }

  if (normalized.includes("bash") || normalized === "bash") {
    return {
      executable: "bash",
      argsPrefix: ["-c"],
      shell: "bash",
    }
  }

  const unixShells = ["zsh", "sh", "fish", "ksh", "tcsh", "csh", "dash"]
  for (const shell of unixShells) {
    if (normalized.includes(shell) || normalized === shell) {
      return {
        executable: "bash",
        argsPrefix: ["-c"],
        shell: "bash",
      }
    }
  }

  debugLogger.debug(`Unrecognized shell process: ${name}`)
  return null
}

export const isWindows = () => os.platform() === "win32"

export function escapeShellArg(arg: string, shell: ShellType): string {
  if (!arg) {
    return ""
  }

  switch (shell) {
    case "powershell":
      return `'${arg.replace(/'/g, "''")}'`
    case "cmd":
      return `"${arg.replace(/"/g, '""')}"`
    case "bash":
    default:
      // POSIX shell escaping
      return arg.replace(/([\$&*()+])/g, "\\$1")
  }
}

function hasPromptExpansion(command: string): boolean {
  const bashExpansion = /\$\{[^}]*:p\}/
  return bashExpansion.test(command)
}

export const spawnAsync = (
  command: string,
  args: string[],
  options?: SpawnOptionsWithoutStdio,
): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, options)
    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (data) => {
      stdout += data.toString()
    })

    child.stderr.on("data", (data) => {
      stderr += data.toString()
    })

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        reject(new Error(`Command failed with exit code ${code}:\n${stderr}`))
      }
    })

    child.on("error", (err) => {
      reject(err)
    })
  })

export function hasBackgroundSyntax(command: string, shell: ShellType): boolean {
  if (!command || !command.trim()) {
    return false
  }

  const trimmed = command.trim()

  switch (shell) {
    case "bash": {
      if (trimmed.endsWith("&")) {
        const secondToLast = trimmed.length >= 2 ? trimmed[trimmed.length - 2] : ""
        return secondToLast !== "&"
      }
      return false
    }

    case "cmd": {
      return /^\s*START\s+\/B\s+/i.test(trimmed)
    }

    case "powershell": {
      return /Start-Job|Start-Process\s+[^&]*-NoNewWindow/i.test(trimmed)
    }

    default:
      return false
  }
}

export function addBackgroundSyntax(command: string, shell: ShellType): string {
  if (!command || !command.trim()) {
    return command
  }

  const trimmed = command.trim()

  switch (shell) {
    case "bash":
      return `${trimmed} &`

    case "cmd":
      return `START /B ${trimmed}`

    case "powershell":
      return `Start-Job -ScriptBlock { ${trimmed} }`

    default:
      return command
  }
}

export function stripShellWrapper(command: string): string {
  const pattern =
    /^\s*(?:(?:sh|bash|zsh)\s+-c|cmd\.exe\s+\/c|powershell(?:\.exe)?\s+(?:-NoProfile\s+)?-Command|pwsh(?:\.exe)?\s+(?:-NoProfile\s+)?-Command)\s+/i
  const match = command.match(pattern)
  if (match) {
    let newCommand = command.substring(match[0].length).trim()
    if (
      (newCommand.startsWith('"') && newCommand.endsWith('"')) ||
      (newCommand.startsWith("'") && newCommand.endsWith("'"))
    ) {
      newCommand = newCommand.substring(1, newCommand.length - 1)
    }
    return newCommand
  }
  return command.trim()
}

export function hasRedirection(command: string): boolean {
  const fallbackCheck = () => /[><]/.test(command)
  const configuration = getShellConfiguration()

  if (configuration.shell === "powershell") {
    const parsed = parsePowerShellCommandDetails(command, configuration.executable)
    return parsed && !parsed.hasError ? !!parsed.hasRedirection : fallbackCheck()
  }

  if (configuration.shell === "bash" && bashLanguage) {
    const tree = parseCommandTree(command)
    if (!tree) return fallbackCheck()

    const stack: Node[] = [tree.rootNode]
    while (stack.length > 0) {
      const current = stack.pop()!
      if (
        current.type === "redirected_statement" ||
        current.type === "file_redirect" ||
        current.type === "heredoc_redirect" ||
        current.type === "herestring_redirect"
      ) {
        return true
      }
      for (let i = current.childCount - 1; i >= 0; i -= 1) {
        const child = current.child(i)
        if (child) stack.push(child)
      }
    }
    return false
  }

  return fallbackCheck()
}

export function splitCommands(command: string): string[] {
  const parsed = parseCommandDetails(command)
  if (!parsed || parsed.hasError) {
    return []
  }

  return parsed.details.map((detail) => detail.text).filter(Boolean)
}

export function getCommandRoot(command: string): string | undefined {
  const parsed = parseCommandDetails(command)
  if (!parsed || parsed.hasError || parsed.details.length === 0) {
    return undefined
  }

  return parsed.details[0]?.name
}

export function getCommandRoots(command: string): string[] {
  if (!command) {
    return []
  }

  const parsed = parseCommandDetails(command)
  if (!parsed || parsed.hasError) {
    return []
  }

  return parsed.details.map((detail) => detail.name ?? detail.text).filter(Boolean)
}
