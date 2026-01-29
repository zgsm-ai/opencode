/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Re-export everything from shell-utils
export {
  SHELL_TOOL_NAMES,
  initializeParentProcessDetection,
  initializeShellParsers,
  parseCommandDetails,
  getShellConfiguration,
  clearShellConfigurationCache,
  escapeShellArg,
  spawnAsync,
  hasBackgroundSyntax,
  addBackgroundSyntax,
  stripShellWrapper,
  hasRedirection,
  splitCommands,
  getCommandRoot,
  getCommandRoots,
  isWindows,
} from "./shell-utils"

export type { ShellType, ShellConfiguration, ParsedCommandDetail } from "./shell-utils"

// Re-export everything from shell-execution
export {
  ShellExecutionService,
  type ShellOutputEvent,
  type ShellExecutionConfig,
  type ShellExecutionResult,
  type ShellExecutionHandle,
} from "./shell-execution"

// Re-export everything from shell-tool
export { ShellTool, ShellToolInvocation, getShellToolDescription } from "./shell-tool"

export type { ShellToolParams } from "./shell-tool"

// Re-export encoding functions
export {
  initializeEncodingCache,
  getCachedEncodingForBuffer,
  getSystemEncoding,
  windowsCodePageToEncoding,
  resetEncodingCache,
} from "./systemEncoding"
