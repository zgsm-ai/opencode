/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * DEPRECATED: This tool has been superseded by an enhanced shell tool implementation
 * with improved shell detection, parent process tracking, and background process support.
 *
 * New implementation available at: src/plugin/tdd/tools/bash.ts (with src/plugin/tdd/tools/shell/)
 *
 * Key improvements in the new implementation:
 * - Shell priority selection (bash/PowerShell/cmd) based on environment
 * - Parent process detection for accurate shell identification
 * - Dynamic prompt injection with shell-specific guidance
 * - Background process support with shell-specific syntax
 * - Cross-platform shell utilities from costrict-cli
 *
 * To migrate to the enhanced tool, update tool registration to use the new BashTool from
 * @/plugin/tdd/tools/bash instead of @/tool/bash
 */

export { BashTool } from "../plugin/tdd/tools/bash"
