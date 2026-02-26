/**
 * Agent 工具配置
 *
 * 统一管理所有 agent 的工具分配和权限
 * 替代之前分散在 registry.ts 和 agent.ts 中的硬编码逻辑
 */

import { PermissionNext } from "@/permission/next"
import type { Config } from "@/config/config"

export namespace AgentToolsConfig {
  /**
   * 不需要用户确认就可以执行的工具（noAskTools）
   *
   * 默认情况下，所有工具都设置为 "ask"，需要用户确认
   * 这个列表中的工具会被设置为 "allow"，可以直接执行
   */
  export const NO_ASK_TOOLS = [
    // 核心工具
    "bash",
    "str_replace_based_edit_tool",
    "sequentialthinking",
    "file-outline",
    "memory_bank",
    "lint",

    // 退出工具
    "task_done",
    "sub_agent_task_done",
    "task_done_with_change_id",
    "show_markdown_to_user",

    // 交互工具
    "question",

    // Agent调用工具
    "sub_coding",
    "quick_explore",
  ] as const

  /**
   * Agent 工具配置
   *
   * 每个 agent 定义：
   * - tools: 允许使用的工具列表（白名单）
   * - exitToolName: 用于标记任务完成的工具
   */
  export interface AgentToolConfig {
    tools: string[]
    exitToolName: string
  }

  /**
   * 所有 agent 的工具配置
   */
  export const AGENT_CONFIGS: Record<string, AgentToolConfig> = {
    // Proposal Agent - 创建技术提案
    proposal: {
      tools: [
        "str_replace_based_edit_tool",
        "sequentialthinking",
        "task_done_with_change_id",
        "show_markdown_to_user",
        "bash",
        "question",
        "file-outline",
        "quick_explore",
      ],
      exitToolName: "task_done_with_change_id",
    },

    // Coding Agent (PlanApply) - 管理开发任务
    coding: {
      tools: [
        "str_replace_based_edit_tool",
        "sequentialthinking",
        "bash",
        "task_done",
        "file-outline",
        "sub_coding",
        "memory_bank",
      ],
      exitToolName: "task_done",
    },

    // SubCodingAgent - 执行具体代码修改
    SubCodingAgent: {
      tools: [
        "str_replace_based_edit_tool",
        "sequentialthinking",
        "bash",
        "lint",
        "sub_agent_task_done",
        "file-outline",
        "memory_bank",
      ],
      exitToolName: "sub_agent_task_done",
    },

    // QuickExplore Agent - 快速探索代码库
    QuickExplore: {
      tools: [
        "str_replace_based_edit_tool",
        "sequentialthinking",
        "bash",
        "sub_agent_task_done",
        "file-outline",
        "memory_bank",
      ],
      exitToolName: "sub_agent_task_done",
    },

    // Fix Agent - 修复代码问题
    FixAgent: {
      tools: [
        "task_done",
        "question",
        "str_replace_based_edit_tool",
        "sub_coding",
        "quick_explore",
        "bash",
        "sequentialthinking",
        "memory_bank",
      ],
      exitToolName: "task_done",
    },

    // TaskCheck Agent - 任务质量检查
    taskcheck: {
      tools: [
        "str_replace_based_edit_tool",
        "sequentialthinking",
        "task_done",
        "bash",
        "file-outline",
        "quick_explore",
      ],
      exitToolName: "task_done",
    },
  }

  /**
   * 创建工具权限配置
   *
   * @param allowedTools - 允许的工具列表
   * @returns PermissionNext.Ruleset
   */
  export function createToolPermission(allowedTools: string[]): PermissionNext.Ruleset {
    const permission: Config.Permission = {}

    // 默认拒绝所有工具
    permission["*"] = "deny"

    // 为允许的工具设置权限
    for (const tool of allowedTools) {
      if (NO_ASK_TOOLS.includes(tool as any)) {
        permission[tool] = "allow"
      } else {
        permission[tool] = "ask"
      }
    }

    return PermissionNext.fromConfig(permission)
  }

  /**
   * 获取 agent 的工具配置
   *
   * @param agentName - agent 名称
   * @returns AgentToolConfig 或 undefined
   */
  export function getConfig(agentName: string): AgentToolConfig | undefined {
    return AGENT_CONFIGS[agentName]
  }
}
