import { Log } from "@/util/log"
import { MessageV2 } from "./message-v2"

const log = Log.create({ service: "budget" })

export namespace Budget {
  // 预算警告阈值
  export const WARNING_THRESHOLD = 10

  // 工具白名单（不消耗预算的工具）
  export const BUDGET_FREE_TOOLS = new Set([
    "sequential-thinking",
    "task_done",
    "sub_agent_task_done",
    "task_done_with_change_id"
  ])

  /**
   * 预算状态
   */
  export interface BudgetState {
    total: number | undefined    // 预算总额（undefined表示不限制）
    used: number                  // 已使用次数
    remaining: number | undefined // 剩余预算（undefined表示不限制）
  }

  /**
   * 预算检查结果
   */
  export interface BudgetCheckResult {
    allowed: boolean              // 是否允许执行
    consumeCount: number          // 本次需要消耗的预算数量
    state: BudgetState           // 当前预算状态
    guardMessage?: string         // 预算不足时的拦截消息
  }

  /**
   * 预算通知内容
   */
  export interface BudgetNotice {
    fullContent: string           // 完整内容（包含预算通知）
    displayContent: string        // 显示内容（移除预算通知标签）
  }

  /**
   * 检查工具是否在白名单中
   */
  export function isBudgetFreeTool(toolName: string): boolean {
    return BUDGET_FREE_TOOLS.has(toolName)
  }

  /**
   * 统计需要消耗的预算数量
   */
  export function countConsumableTools(toolParts: MessageV2.ToolPart[]): number {
    return toolParts.filter(part => !isBudgetFreeTool(part.tool)).length
  }

  /**
   * 计算当前预算状态
   */
  export function calculateState(total: number | undefined, used: number): BudgetState {
    const remaining = total !== undefined ? total - used : undefined
    return {
      total,
      used,
      remaining
    }
  }

  /**
   * 执行前检查预算
   */
  export function checkBudget(
    toolParts: MessageV2.ToolPart[],
    budgetState: BudgetState
  ): BudgetCheckResult {
    // 如果没有设置预算限制，直接允许
    if (budgetState.total === undefined) {
      return {
        allowed: true,
        consumeCount: 0,
        state: budgetState
      }
    }

    // 统计本次需要消耗的预算
    const consumeCount = countConsumableTools(toolParts)

    // 检查剩余预算是否充足
    const remaining = budgetState.remaining ?? 0

    if (consumeCount > remaining) {
      // 预算不足，构建拦截消息
      const guardMessage = buildGuardMessage(consumeCount, remaining)

      log.warn("budget insufficient", {
        consumeCount,
        remaining,
        total: budgetState.total,
        used: budgetState.used
      })

      return {
        allowed: false,
        consumeCount,
        state: budgetState,
        guardMessage
      }
    }

    // 预算充足
    return {
      allowed: true,
      consumeCount,
      state: budgetState
    }
  }

  /**
   * 构建预算不足的拦截消息
   */
  function buildGuardMessage(requested: number, remaining: number): string {
    return `<budget_guard>
工具执行已被拦截：工具调用预算不足。
本轮请求 ${requested} 次工具调用，但仅剩 ${remaining} 次预算。
从现在起外部工具已禁用，请直接给出最终探索总结：
- 已发现的证据
- 缺失的信息
- 建议的下一步行动
然后调用任务完成工具结束任务。
</budget_guard>`
  }

  /**
   * 构建预算通知
   * @param originalOutput - 原始输出内容
   * @param budgetState - 预算状态
   * @param warningThreshold - 自定义预警阈值（默认为全局 WARNING_THRESHOLD）
   */
  export function buildBudgetNotice(
    originalOutput: string,
    budgetState: BudgetState,
    warningThreshold: number = WARNING_THRESHOLD
  ): BudgetNotice {
    // 如果没有预算限制，直接返回原始内容
    if (budgetState.total === undefined) {
      return {
        fullContent: originalOutput,
        displayContent: originalOutput
      }
    }

    const remaining = budgetState.remaining ?? 0
    const total = budgetState.total
    const used = budgetState.used

    // 构建预算通知内容
    let noticeText = `<budget_notice>
预算状态：
- 已使用：${used} 次
- 剩余：${remaining} 次
- 总额：${total} 次
`

    // 根据剩余预算添加警告
    if (remaining <= 0) {
      noticeText += `\n【关键】预算已耗尽：禁止再调用任何外部工具。请基于现有证据给出最终总结（已发现证据/缺失信息/建议下一步），然后调用完成工具结束任务。`
    } else if (remaining <= warningThreshold) {
      noticeText += `\n【注意】预算较低（≤${warningThreshold}次）：请停止盲目搜索，开始收敛并准备总结结束。`
    }

    noticeText += `\n</budget_notice>`

    // 完整内容 = 原始输出 + 结束标记 + 预算通知
    const fullContent = `${originalOutput}\n<tool_results_end/>\n${noticeText}`

    // 显示内容 = 移除预算通知部分（用户看不到）
    const displayContent = originalOutput

    return {
      fullContent,
      displayContent
    }
  }

  /**
   * 扣减预算
   */
  export function deductBudget(
    toolParts: MessageV2.ToolPart[],
    budgetState: BudgetState,
    isRetry: boolean
  ): BudgetState {
    // 如果没有预算限制，不扣减
    if (budgetState.total === undefined) {
      return budgetState
    }

    // 如果是重试模式，不扣减
    if (isRetry) {
      log.info("skip budget deduction in retry mode", {
        total: budgetState.total,
        used: budgetState.used
      })
      return budgetState
    }

    // 统计实际执行的工具数量
    const consumeCount = countConsumableTools(toolParts)

    // 扣减预算
    const newUsed = budgetState.used + consumeCount

    log.info("budget deducted", {
      consumeCount,
      previousUsed: budgetState.used,
      newUsed,
      remaining: budgetState.total - newUsed
    })

    return calculateState(budgetState.total, newUsed)
  }
}
