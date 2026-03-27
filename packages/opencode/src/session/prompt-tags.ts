/**
 * Prompt Tags Detection
 *
 * 检测用户 prompt 自定义情况，生成 tag 集合。
 * 用于 CoStrict provider 请求中标记用户定制程度，方便后端分流。
 */

import { Log } from "@/util/log"
import type { Agent } from "@/agent/agent"

const log = Log.create({ service: "prompt-tags" })

export namespace PromptTags {
  export interface Input {
    /** 当前 agent 信息 */
    agent: Agent.Info
    /** 当前激活的 provider */
    providerID: string
    /** 组装后的 agent prompt (可能为 undefined 表示使用默认) */
    agentPrompt: string | undefined
    /** user message 附带的 system prompt */
    userSystem: string | undefined
    /** 加载到 system prompt 的指令来源（文件路径或 URL） */
    instructionRefs: Set<string>
    /** 当前消息触发命令的来源 */
    commandSource: string | undefined
  }

  /**
   * 收集 prompt tags
   *
   * 根据当前请求上下文判断用户有哪些 prompt 自定义行为，返回 tag 数组。
   * Tag 集合为开放集合，后端对未知 tag 忽略。
   */
  export function collect(input: Input): string[] {
    const tags: string[] = []

    // 1. rulesmodified: 加载了规则/指令文件
    if (input.instructionRefs.size > 0) {
      tags.push("rulesmodified")
    }

    // 2. systempromptmodified: system prompt 被用户覆盖
    //    - 使用了非内置 Agent 且有自定义 prompt
    //    - 或内置 Agent 的 prompt 被用户 config 覆盖
    //    - 或消息附带了 user.system
    const isCustomAgent = input.agent.native !== true && !!input.agentPrompt
    const isOverriddenNative =
      input.agent.native === true &&
      (input.agent.promptOverridden === true || input.agent.promptOverriddenProviders?.includes(input.providerID))
    if (isCustomAgent || isOverriddenNative) {
      tags.push("systempromptmodified")
    } else if (input.userSystem) {
      tags.push("systempromptmodified")
    }

    // 3. commandcustomized: 使用了用户自定义 command 模板
    if (input.commandSource === "config") {
      tags.push("commandcustomized")
    }

    // 4. promptcustomized: 总开关，命中任一上述 tag 时自动附加
    if (tags.length > 0) {
      tags.push("promptcustomized")
    }

    if (tags.length > 0) {
      log.info("prompt tags collected", { tags })
    }

    return tags
  }
}
