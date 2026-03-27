/**
 * Workflow Tool - 工作流模式提示词工具
 * 提供3种专业工作模式的提示词：build(构建), plan(规划), spec(规格)
 */

import { Tool } from '@/tool/tool';
import { z } from 'zod';
import BUILD_PROMPT from "./workflow/build.txt"
import PLANNING_PROMPT from "./workflow/plan.txt"
import SPEC_PROMPT from "./workflow/spec.txt"
/**
 * 工作流模式类型
 */
type WorkflowMode = 'build' | 'plan' | 'spec' ;

/**
 * 所有工作流模式的映射
 */
const WORKFLOW_PROMPTS: Record<WorkflowMode, string> = {
  build: BUILD_PROMPT,
  plan: PLANNING_PROMPT,
  spec: SPEC_PROMPT,
};

/**
 * 有效模式列表
 */
const VALID_MODES: WorkflowMode[] = ['build', 'plan', 'spec'];

/**
 * 参数Schema定义
 */
const parametersSchema = z.object({
  mode: z
    .enum(['build', 'plan', 'spec'])
    .describe('工作流模式：build(构建), plan(规划), spec(规格)'),
});

/**
 * Workflow Tool
 * 提供不同工作模式的提示词
 */
export const WorkflowTool = Tool.define('workflow', async () => {
  return {
    description: `工作流模式提示词工具，提供3种专业工作模式的提示词。

支持的模式：
- build: 构建模式 - 软件工程任务执行，遵循代码规范、工具使用策略和响应风格要求
- spec: 规格模式(0-1需求) - 从无到有创建新功能/系统的完整规格，通过五个阶段（记录→需求→架构→拆分→执行）确保高质量交付
- plan: 规划模式(增量需求) - 在现有系统基础上规划和添加新功能，创建结构化需求提案

使用方式：调用 workflow 工具，传入 mode 参数获取对应模式的完整提示词。`,

    parameters: parametersSchema,

    async execute(args: z.infer<typeof parametersSchema>, ctx) {
      const { mode } = args;

      // 获取对应模式的提示词
      const prompt = WORKFLOW_PROMPTS[mode];

      if (!prompt) {
        return {
          title: '无效的工作流模式',
          metadata: { mode, error: 'Invalid mode' },
          output: `错误：无效的工作流模式 "${mode}"\n\n有效的模式包括：\n${VALID_MODES.map((m) => `- ${m}`).join('\n')}`,
        };
      }

      return {
        title: `Workflow: ${mode} 模式`,
        metadata: { mode, error: '' },
        output: prompt,
      };
    },
  };
}, { visible: false });
