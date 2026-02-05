import type { Agent } from "../agent/agent"
import { Token } from "../util/token"

export namespace Truncate {
  export const LIMIT = 8192
  const MESSAGE =
    "工具返回内容过长（超过 8192 tokens），已被拦截并省略。请尝试调整工具参数以缩小范围（例如：增加过滤条件/限定文件或行范围/分页等）后重试。"
  export type Result = { content: string; truncated: boolean }

  export interface Options {}

  export function init() {
    void Token.warm().catch(() => {})
  }

  export async function output(text: string, _options: Options = {}, _agent?: Agent.Info): Promise<Result> {
    const size = await Token.count(text)
    if (size <= LIMIT) return { content: text, truncated: false }
    return { content: MESSAGE, truncated: true }
  }
}
