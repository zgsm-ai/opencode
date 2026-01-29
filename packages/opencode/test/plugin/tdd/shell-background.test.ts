/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from "bun:test"
import { ShellExecutionService, type ShellExecutionConfig } from "@/plugin/tdd/tools/shell/shell-execution"
import { getShellConfiguration, clearShellConfigurationCache } from "@/plugin/tdd/tools/shell/shell-utils"

describe("ShellExecutionService Background Execution", () => {
  beforeEach(() => {
    clearShellConfigurationCache()
  })

  describe("Background Command Detection", () => {
    it("should detect bash background command with &", async () => {
      const outputCallback = () => {}

      const config: ShellExecutionConfig = { timeout: 5000 }

      const { result: resultPromise, pid } = await ShellExecutionService.execute(
        "echo test &",
        process.cwd(),
        outputCallback,
        new AbortController().signal,
        false,
        config,
      )

      // Should get a PID for the process
      expect(pid).toBeDefined()
      const result = await resultPromise
      expect(result).toBeDefined()
    }, 10000)

    it("should detect cmd background command with START /B", async () => {
      const outputCallback = () => {}

      const config: ShellExecutionConfig = { timeout: 5000 }

      const { result: resultPromise, pid } = await ShellExecutionService.execute(
        "START /B echo test",
        process.cwd(),
        outputCallback,
        new AbortController().signal,
        false,
        config,
      )

      expect(pid).toBeDefined()
      const result = await resultPromise
      expect(result).toBeDefined()
    }, 10000)

    it("should detect PowerShell background command with Start-Job", async () => {
      const outputCallback = () => {}

      const config: ShellExecutionConfig = { timeout: 5000 }

      const { result: resultPromise, pid } = await ShellExecutionService.execute(
        'Start-Job -ScriptBlock { echo "test" }',
        process.cwd(),
        outputCallback,
        new AbortController().signal,
        false,
        config,
      )

      expect(pid).toBeDefined()
      const result = await resultPromise
      expect(result).toBeDefined()
    }, 10000)
  })

  describe("Foreground Command Execution", () => {
    it("should execute simple foreground command", async () => {
      let outputData = ""
      const outputCallback = (event: { type: string; chunk: string }) => {
        outputData += event.chunk
      }

      const config: ShellExecutionConfig = { timeout: 5000 }

      const { result: resultPromise } = await ShellExecutionService.execute(
        process.platform === "win32" ? 'echo "foreground"' : 'echo "foreground"',
        process.cwd(),
        outputCallback,
        new AbortController().signal,
        false,
        config,
      )

      const result = await resultPromise
      expect(result.exitCode).toBe(0)
      expect(result.aborted).toBe(false)
      expect(outputData).toContain("foreground")
    })

    it("should handle foreground command that fails", async () => {
      const outputCallback = () => {}

      const config: ShellExecutionConfig = { timeout: 5000 }

      const { result: resultPromise } = await ShellExecutionService.execute(
        "nonexistent-command-xyz",
        process.cwd(),
        outputCallback,
        new AbortController().signal,
        false,
        config,
      )

      const result = await resultPromise
      // Should have non-zero exit code
      expect(result.exitCode === null || result.exitCode !== 0).toBe(true)
    })

    it("should return complete output for foreground command", async () => {
      let outputChunks: string[] = []
      const outputCallback = (event: { type: string; chunk: string }) => {
        outputChunks.push(event.chunk)
      }

      const config: ShellExecutionConfig = { timeout: 5000 }

      const { result: resultPromise } = await ShellExecutionService.execute(
        process.platform === "win32" ? "echo line1 && echo line2" : "echo line1 && echo line2",
        process.cwd(),
        outputCallback,
        new AbortController().signal,
        false,
        config,
      )

      const result = await resultPromise
      expect(result.exitCode).toBe(0)
      // Should have received output chunks
      expect(outputChunks.length).toBeGreaterThan(0)
    })
  })

  describe("Shell-Specific Background Behavior", () => {
    it("should handle bash background syntax correctly", async () => {
      const shellConfig = getShellConfiguration()
      if (shellConfig.shell !== "bash") {
        // Skip test if not using bash
        return
      }

      const outputCallback = () => {}

      const config: ShellExecutionConfig = { timeout: 5000 }

      const { result: resultPromise } = await ShellExecutionService.execute(
        "sleep 1 &",
        process.cwd(),
        outputCallback,
        new AbortController().signal,
        false,
        config,
      )

      const result = await resultPromise
      expect(result).toBeDefined()
    }, 10000)

    it("should handle PowerShell background syntax correctly", async () => {
      const shellConfig = getShellConfiguration()
      if (shellConfig.shell !== "powershell") {
        // Skip test if not using PowerShell
        return
      }

      const outputCallback = () => {}

      const config: ShellExecutionConfig = { timeout: 5000 }

      const { result: resultPromise } = await ShellExecutionService.execute(
        "Start-Job -ScriptBlock { Start-Sleep -Seconds 1 }",
        process.cwd(),
        outputCallback,
        new AbortController().signal,
        false,
        config,
      )

      const result = await resultPromise
      expect(result).toBeDefined()
    }, 10000)
  })

  describe("Abort with Background Commands", () => {
    it("should abort background command when signal is received", async () => {
      const outputCallback = () => {}

      const config: ShellExecutionConfig = { timeout: 10000 }

      const abortController = new AbortController()

      const { result: resultPromise, pid } = await ShellExecutionService.execute(
        process.platform === "win32" ? 'powershell -Command "Start-Sleep -Seconds 10"' : "sleep 10 &",
        process.cwd(),
        outputCallback,
        abortController.signal,
        false,
        config,
      )

      expect(pid).toBeDefined()

      // Abort after 500ms
      setTimeout(() => abortController.abort(), 500)

      const result = await resultPromise
      expect(result.aborted).toBe(true)
    }, 15000)

    it("should handle clean abort without error", async () => {
      const outputCallback = () => {}

      const config: ShellExecutionConfig = { timeout: 10000 }

      const abortController = new AbortController()
      abortController.abort()

      const { result: resultPromise } = await ShellExecutionService.execute(
        "echo test",
        process.cwd(),
        outputCallback,
        abortController.signal,
        false,
        config,
      )

      const result = await resultPromise
      expect(result.aborted).toBe(true)
    })
  })
})
