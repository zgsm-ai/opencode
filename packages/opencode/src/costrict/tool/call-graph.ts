/**
 * Call Graph Tool - Bun适配版本
 * 提供调用图和继承链分析功能
 */

import { Tool } from '@/tool/tool';
import { z } from 'zod';
import { glob } from 'glob';
import { existsSync, statSync } from 'fs';
import { resolve } from 'path';
import type { CallChainResult, InheritanceChainResult } from './call-graph/chain-analyzer';
import { Log } from '@/util/log';

const log = Log.create({ service: 'call-graph' });

declare global {
  const COSTRICT_CALL_GRAPH_WORKER_PATH: string;
}

/**
 * 参数Schema定义
 */
const parametersSchema = z.object({
  analysis_type: z.enum(['call_chain', 'inheritance_chain']).describe('分析类型：call_chain（调用链）或 inheritance_chain（继承链）'),
  root_directory: z.string().describe('要分析的根目录路径'),
  target_name: z.string().describe('目标函数或类名'),
  chain_direction: z.enum(['callers', 'callees', 'both', 'parents', 'children']).optional().default('both').describe('链方向'),
  chain_depth: z.number().optional().default(3).describe('最大链深度'),
  exact_match: z.boolean().optional().default(true).describe('是否精确匹配'),
  include_patterns: z.array(z.string()).optional().describe('包含的文件模式'),
  exclude_patterns: z.array(z.string()).optional().describe('排除的文件模式'),
});

/**
 * Call Graph Tool
 */
export const CallGraphTool = Tool.define('call-graph', async (ctx) => {
  return {
    description: `分析代码的调用图和继承链。

支持的分析类型：
- call_chain: 分析函数调用链（callers/callees）
- inheritance_chain: 分析类继承链（parents/children）

支持的语言：
- Python (.py)
- JavaScript (.js, .jsx)
- TypeScript (.ts, .tsx)
- Go (.go)
- Java (.java)
- C (.c, .h)
- C++ (.cpp, .hpp)`,

    parameters: parametersSchema,

    async execute(args: z.infer<typeof parametersSchema>, ctx) {
      const {
        analysis_type,
        root_directory,
        target_name,
        chain_direction,
        chain_depth,
        exact_match,
        include_patterns,
        exclude_patterns,
      } = args;

      log.info('Starting call graph analysis', {
        type: analysis_type,
        target: target_name,
        directory: root_directory,
        direction: chain_direction,
        depth: chain_depth
      });

      // 解析并验证路径
      const resolvedPath = resolve(process.cwd(), root_directory);

      if (!existsSync(resolvedPath)) {
        log.error('Directory not found', { path: resolvedPath });
        return {
          title: '目录不存在',
          metadata: {
            root_directory,
            target_name,
            analysis_type,
            files_analyzed: 0,
            error: 'directory_not_found',
          },
          output: `Error: Directory ${root_directory} does not exist`,
        };
      }

      const stat = statSync(resolvedPath);
      if (!stat.isDirectory()) {
        return {
          title: '路径不是目录',
          metadata: {
            root_directory,
            target_name,
            analysis_type,
            files_analyzed: 0,
            error: 'not_a_directory',
          },
          output: `Error: Path ${root_directory} is not a directory`,
        };
      }

      // 收集文件
      let files: string[];
      try {
        files = await collectFiles(resolvedPath, include_patterns, exclude_patterns);
        log.debug('Files collected', { count: files.length });
      } catch (error) {
        log.error('File collection failed', { error: error instanceof Error ? error.message : String(error) });
        return {
          title: '文件收集失败',
          metadata: {
            root_directory,
            target_name,
            analysis_type,
            files_analyzed: 0,
            error: error instanceof Error ? error.message : String(error),
          },
          output: `Error collecting files: ${error instanceof Error ? error.message : String(error)}`,
        };
      }

      if (files.length === 0) {
        return {
          title: '未找到文件',
          metadata: {
            root_directory,
            target_name,
            analysis_type,
            files_analyzed: 0,
            error: 'no_files_found',
          },
          output: `No files found in ${root_directory}`,
        };
      }

      // 使用 Worker 运行分析
      try {
        log.debug('Starting worker analysis', { filesCount: files.length });
        const result = await runAnalysisInWorker({
          analysisType: analysis_type,
          files,
          targetName: target_name,
          chainDirection: chain_direction || 'both',
          chainDepth: chain_depth || 3,
          exactMatch: exact_match !== false,
        });

        // 格式化输出
        const output = formatAnalysisResult(result, analysis_type);

        const resultCount = analysis_type === 'call_chain'
          ? (result as CallChainResult).matches?.length || 0
          : (result as InheritanceChainResult).matches?.length || 0;

        log.info('Analysis completed', {
          filesAnalyzed: files.length,
          resultCount
        });

        return {
          title: `Call Graph Analysis: ${target_name}`,
          metadata: {
            root_directory,
            target_name,
            analysis_type,
            files_analyzed: files.length,
            error: '',
          },
          output,
        };
      } catch (error) {
        log.error('Analysis failed', {
          error: error instanceof Error ? error.message : String(error),
          filesCount: files.length
        });
        return {
          title: '分析失败',
          metadata: {
            root_directory,
            target_name,
            analysis_type,
            files_analyzed: files.length,
            error: error instanceof Error ? error.message : String(error),
          },
          output: `Error: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
});

/**
 * 收集要分析的文件
 */
async function collectFiles(
  rootPath: string,
  includePatterns?: string[],
  excludePatterns?: string[],
): Promise<string[]> {
  const defaultInclude = ['**/*.py', '**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx', '**/*.go', '**/*.java', '**/*.c', '**/*.cpp', '**/*.h', '**/*.hpp'];
  const defaultExclude = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/venv/**', '**/__pycache__/**'];

  const patterns = includePatterns && includePatterns.length > 0 ? includePatterns : defaultInclude;
  const exclude = [...defaultExclude, ...(excludePatterns || [])];

  const files: string[] = [];
  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: rootPath,
      absolute: true,
      ignore: exclude,
      nodir: true,
    });
    files.push(...matches);
  }

  // 去重
  return Array.from(new Set(files));
}

/**
 * 在 Worker 中运行分析
 */
async function runAnalysisInWorker(input: {
  analysisType: string;
  files: string[];
  targetName: string;
  chainDirection: string;
  chainDepth: number;
  exactMatch: boolean;
}): Promise<CallChainResult | InheritanceChainResult> {
  return new Promise((resolve, reject) => {
    // 使用全局常量路径，如果未定义则回退到相对路径
    const workerPath = typeof COSTRICT_CALL_GRAPH_WORKER_PATH !== 'undefined'
      ? COSTRICT_CALL_GRAPH_WORKER_PATH
      : new URL('./call-graph/worker.ts', import.meta.url);

    const worker = new Worker(workerPath);

    worker.postMessage(input);

    worker.onmessage = (event) => {
      const message = event.data;
      if (message.type === 'complete') {
        resolve(message.result);
        worker.terminate();
      } else if (message.type === 'error') {
        reject(new Error(message.error));
        worker.terminate();
      }
      // 忽略 progress 消息
    };

    worker.onerror = (error) => {
      const errorMessage = error.message || error.error?.message || String(error);
      reject(new Error(`Worker error: ${errorMessage}`));
      worker.terminate();
    };
  });
}

/**
 * 格式化分析结果
 */
function formatAnalysisResult(
  result: CallChainResult | InheritanceChainResult,
  analysisType: string,
): string {
  if (!result.found) {
    return `No matches found for: ${result.target}`;
  }

  const lines: string[] = [`# Analysis Results for: ${result.target}\n`];
  lines.push(`Found ${result.matches.length} match(es)\n`);

  for (let i = 0; i < result.matches.length; i++) {
    const match = result.matches[i];
    lines.push(`## Match ${i + 1}: ${match.targetName}`);
    lines.push(`- Type: ${match.targetType}`);
    lines.push(`- Location: ${match.filePath}:${match.line}\n`);

    if (analysisType === 'call_chain') {
      const callMatch = match as CallChainResult['matches'][0];

      if (callMatch.callers) {
        lines.push('### Callers:');
        for (const [depth, nodes] of Object.entries(callMatch.callers)) {
          lines.push(`\n**Depth ${depth}:**`);
          for (const node of nodes) {
            lines.push(`- ${node.name} (${node.file}:${node.line})`);
            lines.push(`  Path: ${node.path}`);
          }
        }
        lines.push('');
      }

      if (callMatch.callees) {
        lines.push('### Callees:');
        for (const [depth, nodes] of Object.entries(callMatch.callees)) {
          lines.push(`\n**Depth ${depth}:**`);
          for (const node of nodes) {
            lines.push(`- ${node.name} (${node.file}:${node.line})`);
            lines.push(`  Path: ${node.path}`);
          }
        }
        lines.push('');
      }
    } else {
      const inheritMatch = match as InheritanceChainResult['matches'][0];

      if (inheritMatch.parents && inheritMatch.parents.length > 0) {
        lines.push('### Parent Classes:');
        for (const parent of inheritMatch.parents) {
          lines.push(`- [Depth ${parent.depth}] ${parent.name} (${parent.file}:${parent.line})`);
        }
        lines.push('');
      }

      if (inheritMatch.children && inheritMatch.children.length > 0) {
        lines.push('### Child Classes:');
        for (const child of inheritMatch.children) {
          lines.push(`- [Depth ${child.depth}] ${child.name} (${child.file}:${child.line})`);
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}
