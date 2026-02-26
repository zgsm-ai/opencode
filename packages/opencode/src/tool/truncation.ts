import type { Agent } from "../agent/agent"
import { Token } from "../util/token"

export namespace Truncate {
  export const LIMIT = 10000
  const MESSAGE =
    "工具返回内容过长（超过 10000 tokens），已被拦截并省略。请尝试调整工具参数以缩小范围（例如：增加过滤条件/限定文件或行范围/分页等）后重试。"
  export type Result = { content: string; truncated: boolean }

  export interface Options {
    /**
     * 工具名称，用于白名单检查
     */
    toolName?: string
  }

  /**
   * 不应该被拦截的工具白名单
   * 这些工具设计为显示长内容给用户
   */
  const WHITELIST_TOOLS = new Set([
    "task_done",
    "sub_agent_task_done",
    "task_done_with_change_id",
  ])

  export function init() {
    void Token.warm().catch(() => {})
  }

  export async function output(text: string, options: Options = {}, _agent?: Agent.Info): Promise<Result> {
    // 检查是否在白名单中
    if (options.toolName && WHITELIST_TOOLS.has(options.toolName)) {
      return { content: text, truncated: false }
    }

    const size = await Token.count(text)
    if (size <= LIMIT) return { content: text, truncated: false }
    return { content: MESSAGE, truncated: true }
  }
}
