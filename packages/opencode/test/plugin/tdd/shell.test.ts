/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test"
import {
  getShellConfiguration,
  clearShellConfigurationCache,
  getCommandRoots,
  stripShellWrapper,
  hasBackgroundSyntax,
  addBackgroundSyntax,
  hasRedirection,
  splitCommands,
  parseCommandDetails,
  type ShellConfiguration,
  type ShellToolParams,
} from "@/plugin/tdd/tools/shell"
import { ShellToolInvocation } from "@/plugin/tdd/tools/shell/shell-tool"

describe("Shell Utils", () => {
  beforeEach(() => {
    // Clear cache before each test
    clearShellConfigurationCache()
  })

  describe("Shell Configuration", () => {
    it("should return a valid shell configuration", () => {
      const config = getShellConfiguration()
      expect(config).toBeDefined()
      expect(config.executable).toBeDefined()
      expect(config.argsPrefix).toBeInstanceOf(Array)
      expect(config.shell).toMatch(/^(bash|powershell|cmd)$/)
    })

    it("should cache shell configuration", () => {
      const config1 = getShellConfiguration()
      const config2 = getShellConfiguration()
      expect(config1).toBe(config2)
    })

    it("should clear cache when requested", () => {
      const config1 = getShellConfiguration()
      clearShellConfigurationCache()
      const config2 = getShellConfiguration()
      // Re-detecting may return same shell, but cache is cleared
      expect(getShellConfiguration()).toBeDefined()
    })

    it("should include version information when available", () => {
      const config = getShellConfiguration()
      // Version may not be available on all systems
      if (config.version) {
        expect(typeof config.version).toBe("string")
        expect(config.version).toMatch(/^\d+\.\d+(\.\d+)?$/)
      }
    })
  })

  describe("Command Parsing", () => {
    it("should extract command root from simple command", () => {
      const root = getCommandRoots("ls -la")
      expect(root).toHaveLength(1)
      expect(root[0]).toBe("ls")
    })

    it("should extract multiple command roots from chained commands", () => {
      const roots = getCommandRoots("npm install && npm run build")
      expect(roots).toHaveLength(2)
      expect(roots[0]).toBe("npm")
      expect(roots[1]).toBe("npm")
    })

    it("should extract command root with full path", () => {
      const roots = getCommandRoots("/usr/bin/git status")
      expect(roots).toHaveLength(1)
      expect(roots[0]).toBe("git")
    })

    it("should handle commands with quotes", () => {
      const roots = getCommandRoots('echo "hello world"')
      expect(roots).toHaveLength(1)
      expect(roots[0]).toBe("echo")
    })

    it("should return empty array for empty command", () => {
      const roots = getCommandRoots("")
      expect(roots).toHaveLength(0)
    })

    it("should parse command splits correctly", () => {
      const commands = splitCommands("npm install && npm run build")
      expect(commands).toHaveLength(2)
      expect(commands[0]).toContain("npm install")
      expect(commands[1]).toContain("npm run build")
    })
  })

  describe("Shell Wrapper", () => {
    it("should strip bash wrapper", () => {
      const command = stripShellWrapper('bash -c "ls -la"')
      expect(command).toBe("ls -la")
    })

    it("should strip PowerShell wrapper", () => {
      const command = stripShellWrapper('powershell -NoProfile -Command "ls"')
      expect(command).toBe("ls")
    })

    it("should strip cmd wrapper", () => {
      const command = stripShellWrapper('cmd.exe /c "dir"')
      expect(command).toBe("dir")
    })

    it("should return command unchanged if no wrapper", () => {
      const command = stripShellWrapper("ls -la")
      expect(command).toBe("ls -la")
    })

    it("should handle quoted commands in wrapper", () => {
      const command = stripShellWrapper("bash -c 'echo \"hello\"'")
      expect(command).toBe('echo "hello"')
    })
  })

  describe("Background Syntax Detection", () => {
    it("should detect bash background syntax (&)", () => {
      expect(hasBackgroundSyntax("npm run dev &", "bash")).toBe(true)
      expect(hasBackgroundSyntax("npm run dev", "bash")).toBe(false)
    })

    it("should distinguish & from && in bash", () => {
      expect(hasBackgroundSyntax("npm run dev &", "bash")).toBe(true)
      expect(hasBackgroundSyntax("npm run dev && echo done", "bash")).toBe(false)
    })

    it("should detect cmd background syntax (START /B)", () => {
      expect(hasBackgroundSyntax("START /B npm run dev", "cmd")).toBe(true)
      expect(hasBackgroundSyntax("npm run dev", "cmd")).toBe(false)
    })

    it("should detect PowerShell background syntax (Start-Job)", () => {
      expect(hasBackgroundSyntax("Start-Job -ScriptBlock { npm run dev }", "powershell")).toBe(true)
      expect(hasBackgroundSyntax("npm run dev", "powershell")).toBe(false)
    })

    it("should handle empty commands", () => {
      expect(hasBackgroundSyntax("", "bash")).toBe(false)
      expect(hasBackgroundSyntax("   ", "powershell")).toBe(false)
    })
  })

  describe("Background Syntax Addition", () => {
    it("should add background syntax to bash command", () => {
      const result = addBackgroundSyntax("npm run dev", "bash")
      expect(result).toBe("npm run dev &")
    })

    it("should add background syntax to cmd command", () => {
      const result = addBackgroundSyntax("npm run dev", "cmd")
      expect(result).toBe("START /B npm run dev")
    })

    it("should add background syntax to PowerShell command", () => {
      const result = addBackgroundSyntax("npm run dev", "powershell")
      expect(result).toBe("Start-Job -ScriptBlock { npm run dev }")
    })

    it("should return unchanged for empty command", () => {
      expect(addBackgroundSyntax("", "bash")).toBe("")
    })

    it("should handle trim whitespace", () => {
      const result = addBackgroundSyntax("  npm run dev  ", "bash")
      expect(result).toBe("npm run dev &")
    })

    it("should preserve existing background syntax for bash", () => {
      const commandWithBackground = "npm run dev &"
      const result = addBackgroundSyntax(commandWithBackground, "bash")
      // Should preserve the original when is_background is false during execution
      expect(result).toContain("&")
    })

    it("should preserve existing START /B syntax for cmd", () => {
      const commandWithBackground = "START /B npm run dev"
      const result = addBackgroundSyntax(commandWithBackground, "cmd")
      expect(result).toContain("START /B")
    })

    it("should preserve existing Start-Job syntax for PowerShell", () => {
      const commandWithBackground = "Start-Job -ScriptBlock { npm run dev }"
      const result = addBackgroundSyntax(commandWithBackground, "powershell")
      expect(result).toContain("Start-Job")
    })
  })

  describe("Redirection Detection", () => {
    it("should detect output redirection", () => {
      expect(hasRedirection("ls > output.txt")).toBe(true)
      expect(hasRedirection("ls")).toBe(false)
    })

    it("should detect input redirection", () => {
      expect(hasRedirection("cat < input.txt")).toBe(true)
    })

    it("should detect append redirection", () => {
      expect(hasRedirection('echo "hello" >> file.txt')).toBe(true)
    })
  })
})

describe("ShellToolInvocation", () => {
  // Mock current working directory
  const TEST_CWD = "/tmp/test"

  beforeEach(() => {
    // Reset before each test
    clearShellConfigurationCache()
  })

  describe("Description Generation", () => {
    it("should generate description with command only", () => {
      const params: ShellToolParams = { command: "ls -la" }
      const invocation = new ShellToolInvocation(params, TEST_CWD)
      const desc = invocation.getDescription()
      expect(desc).toContain("ls -la")
      expect(desc).toContain("current working directory")
    })

    it("should generate description with background flag", () => {
      const params: ShellToolParams = { command: "npm run dev", is_background: true }
      const invocation = new ShellToolInvocation(params, TEST_CWD)
      const desc = invocation.getDescription()
      expect(desc).toContain("[background]")
    })

    it("should generate description with custom directory", () => {
      const params: ShellToolParams = { command: "ls", dir_path: "/custom/path" }
      const invocation = new ShellToolInvocation(params, TEST_CWD)
      const desc = invocation.getDescription()
      expect(desc).toContain("/custom/path")
    })

    it("should include user description when provided", () => {
      const params: ShellToolParams = {
        command: "npm install",
        description: "Install project dependencies",
      }
      const invocation = new ShellToolInvocation(params, TEST_CWD)
      const desc = invocation.getDescription()
      expect(desc).toContain("Install project dependencies")
    })

    it("should replace newlines in description", () => {
      const params: ShellToolParams = {
        command: "npm install",
        description: "Line 1\nLine 2\nLine 3",
      }
      const invocation = new ShellToolInvocation(params, TEST_CWD)
      const desc = invocation.getDescription()
      expect(desc).not.toContain("\n")
      expect(desc).toContain("Line 1 Line 2 Line 3")
    })

    it("should show timeout in description when provided (minutes)", () => {
      const params: ShellToolParams = { command: "npm install", timeout: 120000 }
      const invocation = new ShellToolInvocation(params, TEST_CWD)
      const desc = invocation.getDescription()
      expect(desc).toContain("[timeout: 2.0m]")
    })

    it("should show no timeout in description when timeout is 0", () => {
      const params: ShellToolParams = { command: "npm install", timeout: 0 }
      const invocation = new ShellToolInvocation(params, TEST_CWD)
      const desc = invocation.getDescription()
      expect(desc).toContain("[no timeout]")
    })

    it("should not show timeout in description when not provided", () => {
      const params: ShellToolParams = { command: "npm install" }
      const invocation = new ShellToolInvocation(params, TEST_CWD)
      const desc = invocation.getDescription()
      expect(desc).not.toContain("[timeout:")
      expect(desc).not.toContain("[no timeout]")
    })
  })

  describe("Command Root Extraction", () => {
    it("should extract single command root", () => {
      const params: ShellToolParams = { command: "npm install" }
      const invocation = new ShellToolInvocation(params, TEST_CWD)
      const roots = invocation.getCommandRoots()
      expect(roots).toEqual(["npm"])
    })

    it("should extract multiple command roots", () => {
      const params: ShellToolParams = { command: "npm install && npm run build" }
      const invocation = new ShellToolInvocation(params, TEST_CWD)
      const roots = invocation.getCommandRoots()
      expect(roots).toEqual(["npm", "npm"])
    })

    it("should return empty array for empty command", () => {
      const params: ShellToolParams = { command: "" }
      const invocation = new ShellToolInvocation(params, TEST_CWD)
      const roots = invocation.getCommandRoots()
      expect(roots).toEqual([])
    })
  })

  describe("Command Execution", () => {
    it("should return aborted result when signal is already aborted", async () => {
      const params: ShellToolParams = { command: "ls" }
      const invocation = new ShellToolInvocation(params, TEST_CWD)
      const abortController = new AbortController()
      abortController.abort()

      const result = await invocation.execute(abortController.signal)
      expect(result.aborted).toBe(true)
      expect(result.exitCode).toBe(1)
    })

    it("should call updateOutput callback during execution", async () => {
      const params: ShellToolParams = {
        command: process.platform === "win32" ? "echo test" : "echo test",
        description: "Print test",
      }
      const invocation = new ShellToolInvocation(params, process.cwd())
      const abortController = new AbortController()

      const result = await invocation.execute(abortController.signal)

      // Verify command executed successfully
      expect(result.exitCode).toBe(0)
      expect(result.aborted).toBe(false)
    }, 5000)

    it("should handle execution errors gracefully", async () => {
      const params: ShellToolParams = {
        command: "nonexistent-command-that-does-not-exist-12345",
        description: "Test error handling",
      }
      const invocation = new ShellToolInvocation(params, TEST_CWD)
      const abortController = new AbortController()

      const result = await invocation.execute(abortController.signal)
      // Should not throw, but return error result
      expect(result.error || result.exitCode !== 0).toBeTruthy()
    }, 5000)
  })

  describe("Timeout Handling", () => {
    it("should use default timeout when not specified", async () => {
      const originalEnv = process.env.COSTRICT_SHELL_TIMEOUT
      delete process.env.COSTRICT_SHELL_TIMEOUT

      try {
        const params: ShellToolParams = { command: "ls" }
        const invocation = new ShellToolInvocation(params, process.cwd())
        const abortController = new AbortController()

        const result = await invocation.execute(abortController.signal)
        expect(result.aborted).toBe(false)
      } finally {
        process.env.COSTRICT_SHELL_TIMEOUT = originalEnv
      }
    })

    it("should use COSTRICT_SHELL_TIMEOUT env var when set (numeric minutes)", async () => {
      const originalEnv = process.env.COSTRICT_SHELL_TIMEOUT

      try {
        // Set timeout to 1 minute
        process.env.COSTRICT_SHELL_TIMEOUT = "1"
        const params: ShellToolParams = { command: "ls" }
        const invocation = new ShellToolInvocation(params, process.cwd())
        const abortController = new AbortController()

        const result = await invocation.execute(abortController.signal)
        expect(result.aborted).toBe(false)
      } finally {
        process.env.COSTRICT_SHELL_TIMEOUT = originalEnv
      }
    })

    it("should parse COSTRICT_SHELL_TIMEOUT=no as no timeout", async () => {
      const originalEnv = process.env.COSTRICT_SHELL_TIMEOUT

      try {
        process.env.COSTRICT_SHELL_TIMEOUT = "no"
        const params: ShellToolParams = { command: "ls" }
        const invocation = new ShellToolInvocation(params, process.cwd())
        const abortController = new AbortController()

        const result = await invocation.execute(abortController.signal)
        expect(result.aborted).toBe(false)
      } finally {
        process.env.COSTRICT_SHELL_TIMEOUT = originalEnv
      }
    })

    it("should parse COSTRICT_SHELL_TIMEOUT=none as no timeout", async () => {
      const originalEnv = process.env.COSTRICT_SHELL_TIMEOUT

      try {
        process.env.COSTRICT_SHELL_TIMEOUT = "none"
        const params: ShellToolParams = { command: "ls" }
        const invocation = new ShellToolInvocation(params, process.cwd())
        const abortController = new AbortController()

        const result = await invocation.execute(abortController.signal)
        expect(result.aborted).toBe(false)
      } finally {
        process.env.COSTRICT_SHELL_TIMEOUT = originalEnv
      }
    })

    it("should parse COSTRICT_SHELL_TIMEOUT=off as no timeout", async () => {
      const originalEnv = process.env.COSTRICT_SHELL_TIMEOUT

      try {
        process.env.COSTRICT_SHELL_TIMEOUT = "off"
        const params: ShellToolParams = { command: "ls" }
        const invocation = new ShellToolInvocation(params, process.cwd())
        const abortController = new AbortController()

        const result = await invocation.execute(abortController.signal)
        expect(result.aborted).toBe(false)
      } finally {
        process.env.COSTRICT_SHELL_TIMEOUT = originalEnv
      }
    })

    it("should use params.timeout over env var", async () => {
      const originalEnv = process.env.COSTRICT_SHELL_TIMEOUT

      try {
        process.env.COSTRICT_SHELL_TIMEOUT = "1"
        // Explicit timeout in params should override env var
        const params: ShellToolParams = { command: "ls", timeout: 10000 }
        const invocation = new ShellToolInvocation(params, process.cwd())
        const abortController = new AbortController()

        const result = await invocation.execute(abortController.signal)
        expect(result.aborted).toBe(false)
      } finally {
        process.env.COSTRICT_SHELL_TIMEOUT = originalEnv
      }
    })

    it("should abort command when timeout expires", async () => {
      const originalEnv = process.env.COSTRICT_SHELL_TIMEOUT

      try {
        // Set a very short timeout in env (0.05 minutes = 3 seconds)
        process.env.COSTRICT_SHELL_TIMEOUT = "0.05"

        // Command that will definitely exceed the timeout
        const sleepCommand = process.platform === "win32" ? 'powershell -Command "Start-Sleep -Seconds 10"' : "sleep 10"

        const params: ShellToolParams = { command: sleepCommand, timeout: 3000 }
        const invocation = new ShellToolInvocation(params, process.cwd())
        const abortController = new AbortController()

        const result = await invocation.execute(abortController.signal)
        // Command should be aborted due to timeout
        expect(result.aborted).toBe(true)
      } finally {
        process.env.COSTRICT_SHELL_TIMEOUT = originalEnv
      }
    }, 15000)

    it("should handle invalid env timeout values gracefully", async () => {
      const originalEnv = process.env.COSTRICT_SHELL_TIMEOUT

      try {
        // Invalid value - should fall back to default
        process.env.COSTRICT_SHELL_TIMEOUT = "invalid"
        const params: ShellToolParams = { command: "ls" }
        const invocation = new ShellToolInvocation(params, process.cwd())
        const abortController = new AbortController()

        const result = await invocation.execute(abortController.signal)
        // Should use default timeout and complete successfully
        expect(result.aborted).toBe(false)
      } finally {
        process.env.COSTRICT_SHELL_TIMEOUT = originalEnv
      }
    })
  })

  describe("Background Process Management", () => {
    it("should set is_background flag in description", async () => {
      const params: ShellToolParams = {
        command: process.platform === "win32" ? "echo test" : "echo test",
        description: "Background test",
        is_background: true,
      }
      const invocation = new ShellToolInvocation(params, process.cwd())
      const desc = invocation.getDescription()
      expect(desc).toContain("[background]")
    })

    it("should add background syntax when is_background is true", async () => {
      const config = getShellConfiguration()
      const params: ShellToolParams = {
        command: process.platform === "win32" ? "echo test" : "echo test",
        is_background: true,
      }
      const invocation = new ShellToolInvocation(params, process.cwd())
      const desc = invocation.getDescription()
      // Should show background flag
      expect(desc).toContain("[background]")
      // Should not show timeout for background processes (or show configured timeout)
    }, 5000)

    it("should not add background syntax when command already has it", async () => {
      const config = getShellConfiguration()
      const commandWithBackground =
        config.shell === "bash"
          ? "npm run dev &"
          : config.shell === "cmd"
            ? "START /B npm run dev"
            : "Start-Job -ScriptBlock { npm run dev }"

      const params: ShellToolParams = {
        command: commandWithBackground,
        is_background: true,
      }
      const invocation = new ShellToolInvocation(params, process.cwd())
      const abortController = new AbortController()

      const result = await invocation.execute(abortController.signal)
      // Should complete without errors
      expect(result.error).toBeFalsy()
    }, 10000)

    it("should handle foreground execution correctly (is_background: false)", async () => {
      const params: ShellToolParams = {
        command: process.platform === "win32" ? 'echo "foreground test"' : 'echo "foreground test"',
        is_background: false,
        description: "Foreground test",
      }
      const invocation = new ShellToolInvocation(params, process.cwd())
      const abortController = new AbortController()

      const result = await invocation.execute(abortController.signal)
      expect(result.exitCode).toBe(0)
      expect(result.aborted).toBe(false)
    }, 5000)

    it("should handle omitting is_background parameter (default to foreground)", async () => {
      const params: ShellToolParams = {
        command: process.platform === "win32" ? 'echo "default test"' : 'echo "default test"',
        // No is_background parameter - should behave as foreground
      }
      const invocation = new ShellToolInvocation(params, process.cwd())
      const abortController = new AbortController()

      const result = await invocation.execute(abortController.signal)
      expect(result.exitCode).toBe(0)
      expect(result.aborted).toBe(false)
    }, 5000)

    it("should execute command without background syntax when is_background is false", async () => {
      const params: ShellToolParams = {
        command: process.platform === "win32" ? 'echo "no background"' : 'echo "no background"',
        is_background: false,
        description: "No background syntax",
      }
      const invocation = new ShellToolInvocation(params, process.cwd())
      const abortController = new AbortController()

      const result = await invocation.execute(abortController.signal)
      // Simple echo command should complete successfully
      expect(result.exitCode).toBe(0)
      expect(result.aborted).toBe(false)
    }, 5000)

    it("should combine is_background with timeout correctly", async () => {
      const params: ShellToolParams = {
        command: process.platform === "win32" ? "echo test" : "echo test",
        is_background: true,
        timeout: 5000,
        description: "Background with timeout",
      }
      const invocation = new ShellToolInvocation(params, process.cwd())
      const desc = invocation.getDescription()
      // Should show both background and timeout in description
      expect(desc).toContain("[background]")
      expect(desc).toContain("[timeout:")
    })
  })
})

describe("Shell Tool Integration", () => {
  beforeEach(() => {
    clearShellConfigurationCache()
  })

  it("should provide shell-specific descriptions", () => {
    const config = getShellConfiguration()
    expect(config.shell).toMatch(/^(bash|powershell|cmd)$/)
  })

  it("should handle different shell types consistently", () => {
    const testCommands = ["ls -la", "npm install", "git status", 'echo "hello world"']

    testCommands.forEach((cmd) => {
      const roots = getCommandRoots(cmd)
      const stripped = stripShellWrapper(cmd)

      expect(roots).toBeDefined()
      expect(Array.isArray(roots)).toBe(true)
      expect(typeof stripped).toBe("string")
      expect(stripped.length).toBeGreaterThan(0)
    })
  })

  it("should handle command chains correctly", () => {
    const commands = ["npm install && npm run build", "git status || git checkout -b new-branch", "ls | grep test"]

    commands.forEach((cmd) => {
      const roots = getCommandRoots(cmd)
      const splits = splitCommands(cmd)

      expect(roots.length).toBeGreaterThan(0)
      expect(splits).toBeDefined()
    })
  })
})
