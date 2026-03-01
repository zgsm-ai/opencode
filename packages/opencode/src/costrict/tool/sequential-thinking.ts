import z from "zod"
import { Tool } from "@/tool/tool"

type ThoughtData = {
  thought: string
  thought_number: number
  total_thoughts: number
  next_thought_needed: boolean
  is_revision: boolean | null
  revises_thought: number | null
  branch_from_thought: number | null
  branch_id: string | null
  needs_more_thoughts: boolean | null
}

type SequentialThinkingMetadata = {
  thought_number?: number
  total_thoughts?: number
  next_thought_needed?: boolean
  branches?: string[]
  thought_history_length?: number
  error?: string
  status?: string
  hint?: string
}

class SequentialThinkingValidationError extends Error {}

const thoughtHistoryBySession = new Map<string, ThoughtData[]>()
const branchesBySession = new Map<string, Map<string, ThoughtData[]>>()

const description = `用于复杂问题解决的结构化思考。逐步分解问题。

使用场景：
- 需要复杂的多步骤分析
- 需要修订的规划/设计
- 问题范围初始不明确
- 需要在步骤间保持上下文

特性：
- 随着进展动态调整 total_thoughts
- 随时修订/质疑之前的想法
- 分支到替代方案
- 根据复杂度将 total_thoughts 设为 5-25

指南：
- 仅在真正完成时设置 next_thought_needed=false
- 重新考虑之前步骤时使用 is_revision
- 需要时在思考步骤之间运行 bash 命令（测试、grep）`

const parametersSchema = z
  .object({
    thought: z.unknown().optional().describe("当前思考步骤的内容。"),
    next_thought_needed: z.unknown().optional().describe("如需继续思考则为 true；完成时为 false。"),
    thought_number: z.unknown().optional().describe("当前步骤编号（≥1）。"),
    total_thoughts: z.unknown().optional().describe("预估总步骤数（≥1，可调整）。"),
    is_revision: z.unknown().optional().describe("如果是修订之前的思考则为 true。"),
    revises_thought: z.unknown().optional().describe("正在修订的思考步骤编号（≥1）。"),
    branch_from_thought: z.unknown().optional().describe("从哪个思考步骤分支（≥1）。"),
    branch_id: z.unknown().optional().describe("此分支的标识符。"),
    needs_more_thoughts: z.unknown().optional().describe("如需超出总数的更多思考则为 true。"),
  })
  .passthrough()

function coerceToInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isInteger(parsed) ? parsed : null
  }
  return null
}

function coerceToBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value
  if (value === "true") return true
  if (value === "false") return false
  return null
}

const typeName = (value: unknown) => {
  if (value === null) return "NoneType"
  if (Array.isArray(value)) return "list"
  if (typeof value === "string") return "str"
  if (typeof value === "boolean") return "bool"
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float"
  if (typeof value === "object") return "dict"
  if (typeof value === "undefined") return "undefined"
  return typeof value
}

function validateThoughtData(args: z.infer<typeof parametersSchema>): ThoughtData {
  if (!("thought" in args) || typeof args.thought !== "string") {
    throw new SequentialThinkingValidationError(
      "Missing or invalid 'thought' parameter: must be a non-empty string. " +
        "Provide the content of your current thinking step. " +
        "Example: {'thought': 'First, I need to analyze the problem structure...', ...}",
    )
  }

  const thoughtNumber = "thought_number" in args ? coerceToInteger(args.thought_number) : null
  if (thoughtNumber === null || thoughtNumber < 1) {
    throw new SequentialThinkingValidationError(
      "Missing or invalid 'thought_number' parameter: must be a positive integer. " +
        `Received: ${args.thought_number} (type: ${typeName(args.thought_number)}). ` +
        "This should be the current step number starting from 1.",
    )
  }

  const totalThoughts = "total_thoughts" in args ? coerceToInteger(args.total_thoughts) : null
  if (totalThoughts === null || totalThoughts < 1) {
    throw new SequentialThinkingValidationError(
      "Missing or invalid 'total_thoughts' parameter: must be a positive integer. " +
        `Received: ${args.total_thoughts} (type: ${typeName(args.total_thoughts)}). ` +
        "Estimate total steps needed (can be adjusted later with needs_more_thoughts).",
    )
  }

  const nextThoughtNeeded = "next_thought_needed" in args ? coerceToBoolean(args.next_thought_needed) : null
  if (nextThoughtNeeded === null) {
    throw new SequentialThinkingValidationError(
      "Missing or invalid 'next_thought_needed' parameter: must be a boolean. " +
        `Received: ${args.next_thought_needed} (type: ${typeName(args.next_thought_needed)}). ` +
        "Set to true if more thinking steps are needed, false when analysis is complete.",
    )
  }


  const revisesThought =
    "revises_thought" in args && args.revises_thought !== null && args.revises_thought !== 0
      ? (() => {
          const val = coerceToInteger(args.revises_thought)
          if (val === null || val < 1) {
            throw new SequentialThinkingValidationError(
              `Invalid revises_thought: ${args.revises_thought}. ` +
                "Must be a positive integer referring to a previous thought number. " +
                "Use this when you want to revise or correct a previous thinking step.",
            )
          }
          return val
        })()
      : null

  const branchFromThought =
    "branch_from_thought" in args && args.branch_from_thought !== null && args.branch_from_thought !== 0
      ? (() => {
          const val = coerceToInteger(args.branch_from_thought)
          if (val === null || val < 1) {
            throw new SequentialThinkingValidationError(
              `Invalid branch_from_thought: ${args.branch_from_thought}. ` +
                "Must be a positive integer referring to a thought number to branch from. " +
                "Use this with branch_id to explore alternative approaches from a previous step.",
            )
          }
          return val
        })()
      : null

  const isRevision = "is_revision" in args && args.is_revision !== null ? Boolean(args.is_revision) : null
  const branchID = "branch_id" in args && args.branch_id !== null ? String(args.branch_id) : null
  const needsMoreThoughts =
    "needs_more_thoughts" in args && args.needs_more_thoughts !== null ? Boolean(args.needs_more_thoughts) : null

  return {
    thought: String(args.thought),
    thought_number: thoughtNumber,
    total_thoughts: totalThoughts,
    next_thought_needed: nextThoughtNeeded,
    is_revision: isRevision,
    revises_thought: revisesThought,
    branch_from_thought: branchFromThought,
    branch_id: branchID,
    needs_more_thoughts: needsMoreThoughts,
  }
}

export const SequentialThinkingTool = Tool.define<typeof parametersSchema, SequentialThinkingMetadata>(
  "sequentialthinking",
  {
    description,
    parameters: parametersSchema,
    async execute(args, ctx) {
      try {
        const data = validateThoughtData(args)
        const thoughtData =
          data.thought_number > data.total_thoughts ? { ...data, total_thoughts: data.thought_number } : data

        const thoughtHistory = thoughtHistoryBySession.get(ctx.sessionID) ?? []
        thoughtHistory.push(thoughtData)
        thoughtHistoryBySession.set(ctx.sessionID, thoughtHistory)

        const branches = branchesBySession.get(ctx.sessionID) ?? new Map<string, ThoughtData[]>()
        if (thoughtData.branch_from_thought && thoughtData.branch_id) {
          const history = branches.get(thoughtData.branch_id) ?? []
          history.push(thoughtData)
          branches.set(thoughtData.branch_id, history)
          branchesBySession.set(ctx.sessionID, branches)
        }

        const responseData = {
          thought_number: thoughtData.thought_number,
          total_thoughts: thoughtData.total_thoughts,
          next_thought_needed: thoughtData.next_thought_needed,
          branches: Array.from(branches.keys()),
          thought_history_length: thoughtHistory.length,
        }

        return {
          title: "",
          metadata: {
            ...responseData,
            error: "",
          },
          output: `Sequential thinking step completed.\n\nStatus:\n${JSON.stringify(responseData, null, 2)}`,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (error instanceof SequentialThinkingValidationError) {
          throw new Error(`Sequential thinking validation failed: ${message}`)
        }
        throw new Error(
          `Sequential thinking failed: ${message}\n\nHint: Check that all required parameters ` +
            `(thought, thought_number, total_thoughts, next_thought_needed) are provided with correct types.`,
        )
      }
    },
  },
)
