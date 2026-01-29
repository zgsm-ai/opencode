/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Log } from "@/util/log"

/**
 * TDD 插件专用日志记录器
 * 用于 shell 工具、编码检测等 TDD 相关功能的日志记录
 */
export const Logger = Log.create({ service: "tdd" })

/**
 * 调试日志记录器，用于开发时的详细调试信息
 */
export const debugLogger = Logger.tag("scope", "debug")
