/**
 * Sequential Thinking Tool - Bun适配版本
 * 结构化思考工具，支持分步骤思考、修订和分支
 */

import { Tool } from '@/tool/tool';
import { z } from 'zod';

/**
 * 思考步骤数据结构
 */
interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
}

/**
 * 全局思考历史（会话级别）
 */
const thoughtHistory: ThoughtData[] = [];
const branches = new Map<string, ThoughtData[]>();

/**
 * 格式化思考步骤
 */
function formatThought(thoughtData: ThoughtData): string {
  let prefix = '';
  let context = '';

  if (thoughtData.isRevision && thoughtData.branchFromThought) {
    prefix = '🔄 Revision';
    context = ` (revising thought ${thoughtData.revisesThought}) (from thought ${thoughtData.branchFromThought}, ID: ${thoughtData.branchId})`;
  } else if (thoughtData.isRevision) {
    prefix = '🔄 Revision';
    context = ` (revising thought ${thoughtData.revisesThought})`;
  } else if (thoughtData.branchFromThought) {
    prefix = '🌿 Branch';
    context = ` (from thought ${thoughtData.branchFromThought}, ID: ${thoughtData.branchId})`;
  } else {
    prefix = '💭 Thought';
    context = '';
  }

  const header = `${prefix} ${thoughtData.thoughtNumber}/${thoughtData.totalThoughts}${context}`;

  return `${header}\n\n${thoughtData.thought}`;
}

/**
 * 格式化思考历史
 */
function formatHistory(): string {
  if (thoughtHistory.length === 0) {
    return 'No thoughts recorded yet.';
  }

  const lines: string[] = ['## Thinking History\n'];

  for (const thought of thoughtHistory) {
    lines.push(formatThought(thought));
    lines.push(''); // 空行分隔
  }

  return lines.join('\n');
}

/**
 * 验证参数
 */
function validateParams(params: z.infer<typeof parametersSchema>): string | null {
  const { thoughtNumber, totalThoughts, isRevision, revisesThought, branchFromThought, branchId } = params;

  // 验证思考编号
  if (thoughtNumber < 1) {
    return 'thoughtNumber must be at least 1';
  }

  if (totalThoughts < thoughtNumber) {
    return 'totalThoughts must be >= thoughtNumber';
  }

  // 验证修订
  if (isRevision) {
    if (!revisesThought) {
      return 'revisesThought is required when isRevision is true';
    }
    if (revisesThought < 1 || revisesThought > thoughtHistory.length) {
      return `revisesThought must be between 1 and ${thoughtHistory.length}`;
    }
  }

  // 验证分支
  if (branchFromThought) {
    if (!branchId) {
      return 'branchId is required when branchFromThought is specified';
    }
    if (branchFromThought < 1 || branchFromThought > thoughtHistory.length) {
      return `branchFromThought must be between 1 and ${thoughtHistory.length}`;
    }
  }

  return null;
}

/**
 * 参数Schema定义
 */
const parametersSchema = z.object({
  thought: z.string().describe('当前思考步骤的内容'),
  nextThoughtNeeded: z.boolean().describe('如需继续思考则为 true；完成时为 false。'),
  thoughtNumber: z.number().int().min(1).describe('当前步骤编号（≥1）'),
  totalThoughts: z.number().int().min(1).describe('预估总步骤数（≥1，可调整）。'),
  isRevision: z.boolean().optional().describe('如果是修订之前的思考则为 true。'),
  revisesThought: z.number().int().optional().describe('正在修订的思考步骤编号（≥1）'),
  branchFromThought: z.number().int().optional().describe('从哪个思考步骤分支（≥1）。'),
  branchId: z.string().optional().describe('此分支的标识符。'),
  needsMoreThoughts: z.boolean().optional().describe('如需超出总数的更多思考则为 true。'),
});

/**
 * Sequential Thinking Tool
 */
export const SequentialThinkingTool = Tool.define('sequential-thinking', async (ctx) => {
  return {
    description: `用于复杂问题解决的结构化思考。逐步分解问题。

使用场景：
- 需要复杂的多步骤分析
- 需要修订的规划/设计
- 问题范围初始不明确
- 需要在步骤间保持上下文

特性：
- 随着进展动态调整 totalThoughts
- 随时修订/质疑之前的想法
- 分支到替代方案
- 根据复杂度将 totalThoughts 设为 5-25

指南：
- 仅在真正完成时设置 nextThoughtNeeded=false
- 重新考虑之前步骤时使用 isRevision
- 需要时在思考步骤之间运行 bash 命令（测试、grep）`,

    parameters: parametersSchema,

    async execute(args: z.infer<typeof parametersSchema>, ctx) {
      // 验证参数
      const validationError = validateParams(args);
      if (validationError) {
        return {
          title: '参数验证失败',
          metadata: {
            thoughtNumber: args.thoughtNumber,
            totalThoughts: args.totalThoughts,
            nextThoughtNeeded: args.nextThoughtNeeded,
            error: validationError,
          },
          output: `Error: ${validationError}`,
        };
      }

      // 创建思考数据
      const thoughtData: ThoughtData = {
        thought: args.thought,
        thoughtNumber: args.thoughtNumber,
        totalThoughts: args.totalThoughts,
        nextThoughtNeeded: args.nextThoughtNeeded,
        isRevision: args.isRevision,
        revisesThought: args.revisesThought,
        branchFromThought: args.branchFromThought,
        branchId: args.branchId,
        needsMoreThoughts: args.needsMoreThoughts,
      };

      // 处理分支
      if (args.branchFromThought && args.branchId) {
        if (!branches.has(args.branchId)) {
          // 创建新分支：复制到分支点的历史
          const branchHistory = thoughtHistory.slice(0, args.branchFromThought);
          branches.set(args.branchId, branchHistory);
        }
        // 添加到分支历史
        branches.get(args.branchId)!.push(thoughtData);
      } else {
        // 添加到主历史
        thoughtHistory.push(thoughtData);
      }

      // 格式化输出
      const formattedThought = formatThought(thoughtData);
      const status = args.nextThoughtNeeded ? '继续思考...' : '思考完成';

      return {
        title: `Sequential Thinking ${args.thoughtNumber}/${args.totalThoughts}`,
        metadata: {
          thoughtNumber: args.thoughtNumber,
          totalThoughts: args.totalThoughts,
          nextThoughtNeeded: args.nextThoughtNeeded,
          error: '',
        },
        output: `${formattedThought}\n\n---\n状态: ${status}`,
      };
    },
  };
});
