/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { ShellExecutionService, type ShellExecutionConfig } from "@/plugin/tdd/tools/shell/shell-execution"

describe("ShellExecutionService Timeout", () => {
  describe("Timeout Configuration", () => {
    it("should handle undefined timeout (use default behavior)", async () => {
      const config: ShellExecutionConfig = {}

      let outputData = ""
      const outputCallback = (event: { type: string; chunk: string }) => {
        outputData += event.chunk
      }

      const { result: resultPromise } = await ShellExecutionService.execute(
        "echo 'test'",
        process.cwd(),
        outputCallback,
        new AbortController().signal,
        false,
        config,
      )

      const result = await resultPromise
      expect(result.aborted).toBe(false)
      expect(result.exitCode).toBe(0)
    })

    it("should handle timeout: 0 (no timeout)", async () => {
      const config: ShellExecutionConfig = { timeout: 0 }

      const outputCallback = () => {}

      const { result: resultPromise } = await ShellExecutionService.execute(
        "echo 'test'",
        process.cwd(),
        outputCallback,
        new AbortController().signal,
        false,
        config,
      )

      const result = await resultPromise
      expect(result.aborted).toBe(false)
      expect(result.exitCode).toBe(0)
    })

    it("should set timeout when configured", async () => {
      const config: ShellExecutionConfig = { timeout: 5000 }

      const outputCallback = () => {}

      const { result: resultPromise, pid } = await ShellExecutionService.execute(
        "echo 'test'",
        process.cwd(),
        outputCallback,
        new AbortController().signal,
        false,
        config,
      )

      expect(pid).toBeDefined()
      const result = await resultPromise
      expect(result.aborted).toBe(false)
      expect(result.exitCode).toBe(0)
    })
  })

  describe("Timeout Triggering", () => {
    it("should abort command when timeout expires", async () => {
      const config: ShellExecutionConfig = { timeout: 1000 }

      const outputCallback = () => {}

      // Command that will exceed timeout
      const sleepCommand = process.platform === "win32" ? 'powershell -Command "Start-Sleep -Seconds 10"' : "sleep 10"

      const abortController = new AbortController()

      const { result: resultPromise } = await ShellExecutionService.execute(
        sleepCommand,
        process.cwd(),
        outputCallback,
        abortController.signal,
        false,
        config,
      )

      const result = await resultPromise
      // Command should be aborted due to timeout
      expect(result.aborted).toBe(true)
    }, 15000)

    it("should complete quickly before timeout expires", async () => {
      const config: ShellExecutionConfig = { timeout: 10000 }

      let outputData = ""
      const outputCallback = (event: { type: string; chunk: string }) => {
        outputData += event.chunk
      }

      const { result: resultPromise } = await ShellExecutionService.execute(
        "echo 'test'",
        process.cwd(),
        outputCallback,
        new AbortController().signal,
        false,
        config,
      )

      const result = await resultPromise
      expect(result.aborted).toBe(false)
      expect(result.exitCode).toBe(0)
    })

    it("should handle timeout: 0 correctly (no timeout for long command)", async () => {
      const config: ShellExecutionConfig = { timeout: 0 }

      let outputData = ""
      const outputCallback = (event: { type: string; chunk: string }) => {
        outputData += event.chunk
      }

      // Command that takes a short time but would timeout if timeout was set
      const sleepCommand =
        process.platform === "win32" ? 'powershell -Command "Start-Sleep -Milliseconds 100"' : "sleep 0.1"

      const abortController = new AbortController()

      const { result: resultPromise } = await ShellExecutionService.execute(
        sleepCommand,
        process.cwd(),
        outputCallback,
        abortController.signal,
        false,
        config,
      )

      const result = await resultPromise
      expect(result.aborted).toBe(false)
    })
  })

  describe("Timeout with AbortSignal", () => {
    it("should prioritize AbortSignal over timeout", async () => {
      const config: ShellExecutionConfig = { timeout: 10000 }

      const outputCallback = () => {}

      const abortController = new AbortController()

      // Abort immediately before executing command
      abortController.abort()

      // Use a simple echo command that should complete quickly
      const testCommand = process.platform === "win32" ? "echo test" : "echo test"

      const { result: resultPromise } = await ShellExecutionService.execute(
        testCommand,
        process.cwd(),
        outputCallback,
        abortController.signal,
        false,
        config,
      )

      const result = await resultPromise
      expect(result.aborted).toBe(true)
    }, 10000)

    it("should combine timeout and AbortSignal correctly", async () => {
      const config: ShellExecutionConfig = { timeout: 10000 }

      const outputCallback = () => {}

      const abortController = new AbortController()

      // Abort after 500ms (before timeout)
      const abortTimer = setTimeout(() => abortController.abort(), 500)

      // Use a command that will be aborted
      const sleepCommand = process.platform === "win32" ? 'powershell -Command "Start-Sleep -Seconds 10"' : "sleep 10"

      const { result: resultPromise } = await ShellExecutionService.execute(
        sleepCommand,
        process.cwd(),
        outputCallback,
        abortController.signal,
        false,
        config,
      )

      const result = await resultPromise
      expect(result.aborted).toBe(true)

      clearTimeout(abortTimer)
    }, 10000)
  })
})
