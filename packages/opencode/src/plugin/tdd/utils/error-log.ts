import fs from "fs/promises"
import path from "path"
import { Global } from "@/global"

export namespace ErrorLog {
  const ERROR_LOG_FILE = "llm-errors.log"
  const REQUEST_LOG_DIR = "llm-requests"
  const MAX_LOG_SIZE = 10 * 1024 * 1024
  const MAX_LOG_FILES = 5
  const MAX_REQUEST_LOGS = 20

  /**
   * Check if error logging is enabled via environment variable
   * Default: enabled (true)
   */
  function isEnabled(): boolean {
    const envValue = process.env.COSTRICT_ERROR_LOG_ENABLED
    if (envValue === undefined || envValue === "") return true
    return envValue !== "false" && envValue !== "0"
  }

  /**
   * Format error with full stack trace and context
   */
  function formatErrorEntry(error: Error | unknown, context?: Record<string, any>): string {
    const timestamp = new Date().toISOString()
    let errorObj: Error
    let originalError = error

    if (error instanceof Error) {
      errorObj = error
    } else if (error && typeof error === "object") {
      const errorPlain = error as Record<string, any>
      const message = errorPlain.message ? String(errorPlain.message) : JSON.stringify(errorPlain)
      const constructedError = new Error(message)

      if (errorPlain.stack) {
        constructedError.stack = String(errorPlain.stack)
      }
      if (errorPlain.cause) {
        constructedError.cause = errorPlain.cause
      }

      errorObj = constructedError
    } else {
      errorObj = new Error(String(error))
    }

    const parts: string[] = [`\n${"=".repeat(80)}`, `Timestamp: ${timestamp}`, `Error: ${errorObj.message}`]

    if (errorObj.stack) {
      parts.push(`\nStack Trace:\n${errorObj.stack}`)
    }

    if (errorObj.cause) {
      const cause = errorObj.cause instanceof Error ? errorObj.cause : new Error(String(errorObj.cause))
      parts.push(`\nCaused By:\n  ${cause.message}`)
      if (cause.stack) {
        parts.push(
          `  Stack:\n${cause.stack
            .split("\n")
            .map((line) => "    " + line)
            .join("\n")}`,
        )
      }
    }

    if (context && Object.keys(context).length > 0) {
      parts.push(`\nContext:\n${JSON.stringify(context, null, 2)}`)
    }

    parts.push(`${"=".repeat(80)}`)

    return parts.join("\n")
  }

  async function rotateRequestLogs(): Promise<void> {
    const requestDir = path.join(Global.Path.log, REQUEST_LOG_DIR)

    try {
      const files = await fs.readdir(requestDir)
      const requestFiles = files.filter((file) => file.startsWith("request-") && file.endsWith(".json"))

      if (requestFiles.length <= MAX_REQUEST_LOGS) {
        return
      }

      const stats = await Promise.all(
        requestFiles.map(async (file) => ({
          file,
          mtime: (await fs.stat(path.join(requestDir, file))).mtime,
        })),
      )

      const sortedRequests = stats.sort((a, b) => a.mtime.getTime() - b.mtime.getTime())
      const filesToDelete = sortedRequests.slice(0, requestFiles.length - MAX_REQUEST_LOGS)

      for (const { file } of filesToDelete) {
        try {
          await fs.unlink(path.join(requestDir, file))
        } catch {
          // Ignore individual file deletion failures
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("Failed to rotate request logs:", error)
      }
    }
  }

  async function saveRequestData(requestData: { body: any; headers: Record<string, any> }): Promise<string> {
    if (!isEnabled()) return ""

    await rotateRequestLogs()

    await rotateRequestLogs()

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const fileName = `request-${timestamp}-${Math.random().toString(36).slice(2, 8)}.json`
    const requestDir = path.join(Global.Path.log, REQUEST_LOG_DIR)
    const filePath = path.join(requestDir, fileName)

    try {
      await fs.mkdir(requestDir, { recursive: true })
      const requestJson = JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          body: requestData.body,
          headers: requestData.headers,
        },
        null,
        2,
      )
      await fs.writeFile(filePath, requestJson, { encoding: "utf-8" })
      return filePath
    } catch (error) {
      console.error("Failed to save request data:", error)
      return ""
    }
  }

  /**
   * Get the log file path
   */
  function getLogFilePath(): string {
    return path.join(Global.Path.log, ERROR_LOG_FILE)
  }

  /**
   * Rotate log files if they exceed max size
   */
  async function rotateLogs(): Promise<void> {
    const logPath = getLogFilePath()

    try {
      const stats = await fs.stat(logPath)
      if (stats.size < MAX_LOG_SIZE) {
        return
      }

      // Rotate existing logs
      for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
        const oldFile = path.join(Global.Path.log, `llm-errors.${i}.log`)
        const newFile = path.join(Global.Path.log, `llm-errors.${i + 1}.log`)

        try {
          await fs.rename(oldFile, newFile)
        } catch {
          // Ignore if file doesn't exist
        }
      }

      // Move current log to .1
      await fs.rename(logPath, path.join(Global.Path.log, `llm-errors.1.log`))
    } catch (error) {
      // Ignore if file doesn't exist yet
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("Failed to rotate error logs:", error)
      }
    }
  }

  /**
   * Write error entry to log file
   */
  async function writeLogEntry(entry: string): Promise<void> {
    await rotateLogs()

    const logPath = getLogFilePath()
    // Ensure log directory exists
    await fs.mkdir(Global.Path.log, { recursive: true })
    await fs.appendFile(logPath, entry + "\n", { encoding: "utf-8" })
  }

  /**
   * Log an LLM request error with full stack trace
   *
   * @param error - The error object
   * @param context - Additional context information (provider, model, session, etc.)
   */
  export async function logLLMError(
    error: Error | unknown,
    context?: {
      providerID?: string
      modelID?: string
      sessionID?: string
      agent?: string
      requestType?: "stream" | "chat" | "completion"
      attempt?: number
      request?: { body: any; headers: Record<string, any> }
      [key: string]: any
    },
  ): Promise<void> {
    if (!isEnabled()) return
    let requestFilePath = ""
    if (context?.request) {
      requestFilePath = await saveRequestData(context.request)
    }
    const { request, ...contextWithoutRequest } = context || {}
    const entry = formatErrorEntry(error, {
      ...contextWithoutRequest,
      requestFilePath: requestFilePath || undefined,
    })
    await writeLogEntry(entry)
  }

  /**
   * Log a general application error with full stack trace
   *
   * @param error - The error object
   * @param context - Additional context information
   */
  export async function logError(error: Error | unknown, context?: Record<string, any>): Promise<void> {
    if (!isEnabled()) return
    const entry = formatErrorEntry(error, context)
    await writeLogEntry(entry)
  }

  /**
   * Get the path to the error log file
   */
  export function logPath(): string {
    return getLogFilePath()
  }

  /**
   * Read recent error log entries
   *
   * @param limit - Maximum number of entries to return (default: 10)
   */
  export async function readRecentErrors(limit: number = 10): Promise<string[]> {
    const logPath = getLogFilePath()

    try {
      const content = await fs.readFile(logPath, { encoding: "utf-8" })
      if (!content || content.trim().length === 0) {
        return []
      }

      const separator = "\n" + "=".repeat(80)
      const entries = content
        .split(separator)
        .filter((entry) => {
          const trimmed = entry.trim()
          return trimmed.length > 0 && trimmed.startsWith("Timestamp:")
        })
        .slice(-limit)

      return entries.map((entry) => "=".repeat(80) + entry)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return []
      }
      throw error
    }
  }

  /**
   * Clear all error logs
   */
  export async function clearLogs(): Promise<void> {
    const logDir = Global.Path.log

    try {
      const files = await fs.readdir(logDir)
      await Promise.all(
        files.filter((file) => file.startsWith("llm-errors")).map((file) => fs.unlink(path.join(logDir, file))),
      )

      const requestLogDir = path.join(logDir, REQUEST_LOG_DIR)
      try {
        const requestFiles = await fs.readdir(requestLogDir)
        await Promise.all(requestFiles.map((file) => fs.unlink(path.join(requestLogDir, file))))
        await fs.rmdir(requestLogDir)
      } catch {
        // Ignore if directory doesn't exist
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error
      }
    }
  }
}
