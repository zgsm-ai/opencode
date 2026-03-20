/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * File Importance Tool - 文件重要性分析工具
 * 通过多维度评估代码文件的重要性
 */

import { Tool } from '@/tool/tool';
import { z } from 'zod';
import { glob } from 'glob';
import { existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { Log } from '@/util/log';
import { Truncate } from '@/tool/truncation';
import { DEFAULT_WEIGHTS } from './file-importance/types';
import type { FileScore, AnalysisStats } from './file-importance/types';

const log = Log.create({ tool: 'file-importance' });

type Meta = {
  root_directory: string;
  files_analyzed: number;
  error: string;
  files_returned?: number;
  weights_used?: typeof DEFAULT_WEIGHTS;
  truncated?: boolean;
};

declare global {
  const COSTRICT_FILE_IMPORTANCE_WORKER_PATH: string;
}

/**
 * 参数Schema定义
 */
const parametersSchema = z.object({
  root_directory: z.string().describe('要分析的根目录路径'),
  weights: z.object({
    pagerank: z.number().optional(),
    usage: z.number().optional(),
    complexity: z.number().optional(),
    semantic: z.number().optional(),
    git_history: z.number().optional(),
    size: z.number().optional(),
  }).optional().describe('自定义权重配置'),
  top_n: z.number().optional().describe('返回前 N 个最重要的文件'),
  include_details: z.boolean().optional().default(true).describe('是否包含维度详情'),
  include_patterns: z.array(z.string()).optional().describe('包含的文件模式 (glob)'),
  exclude_patterns: z.array(z.string()).optional().describe('排除的文件模式 (glob)'),
});

/**
 * 收集要分析的文件
 */
async function collectFiles(
  rootPath: string,
  includePatterns?: string[],
  excludePatterns?: string[],
): Promise<string[]> {
  const defaultInclude = [
    '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx',
    '**/*.py', '**/*.java', '**/*.go',
    '**/*.c', '**/*.cpp', '**/*.h', '**/*.hpp',
  ];

  const defaultExclude = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/coverage/**',
    '**/*.test.*',
    '**/*.spec.*',
  ];

  const patterns = includePatterns || defaultInclude;
  const ignore = excludePatterns || defaultExclude;

  const files: string[] = [];
  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: rootPath,
      absolute: true,
      ignore,
    });
    files.push(...matches);
  }

  return [...new Set(files)]; // 去重
}

/**
 * 在 Worker 中运行分析
 */
async function runAnalysisInWorker(input: {
  rootPath: string;
  allFiles: string[];
  weights: typeof DEFAULT_WEIGHTS;
}): Promise<{
  fileScores: FileScore[];
  statistics: AnalysisStats;
}> {
  return new Promise((resolve, reject) => {
    // Worker 路径处理
    const workerPath = typeof COSTRICT_FILE_IMPORTANCE_WORKER_PATH !== 'undefined'
      ? COSTRICT_FILE_IMPORTANCE_WORKER_PATH
      : new URL('./file-importance/worker.ts', import.meta.url);

    log.debug('Creating worker', { workerPath });
    const worker = new Worker(workerPath);

    // 发送初始数据
    worker.postMessage(input);

    // 监听消息
    worker.onmessage = (event: MessageEvent) => {
      const message = event.data;

      if (message.type === 'progress') {
        log.debug('Worker progress', { message: message.message });
      } else if (message.type === 'complete') {
        log.info('Worker completed', {
          filesAnalyzed: message.fileScores.length
        });
        resolve({
          fileScores: message.fileScores,
          statistics: message.statistics,
        });
        worker.terminate();
      } else if (message.type === 'error') {
        log.error('Worker error', { error: message.error });
        reject(new Error(message.error));
        worker.terminate();
      }
    };

    // 错误处理
    worker.onerror = (error) => {
      log.error('Worker error event', { error });
      reject(error);
      worker.terminate();
    };
  });
}

/**
 * 格式化输出结果
 */
function formatOutput(
  fileScores: FileScore[],
  includeDetails: boolean,
  statistics: AnalysisStats,
): string {
  const lines: string[] = [];

  lines.push('# File Importance Analysis Results\n');
  lines.push(`Total files analyzed: ${statistics.files_parsed}`);
  lines.push(`Files with scores: ${fileScores.length}\n`);

  lines.push('## Top Files by Importance\n');

  for (let i = 0; i < fileScores.length; i++) {
    const file = fileScores[i];
    const rank = i + 1;

    lines.push(`### ${rank}. ${file.file}`);
    lines.push(`**Total Score**: ${file.total_score.toFixed(4)}`);
    lines.push(`**Path**: ${file.absolute_path}`);

    if (includeDetails) {
      lines.push('\n**Dimension Scores**:');
      lines.push(`- PageRank: ${file.pagerank_score.toFixed(4)}`);
      lines.push(`- Usage: ${file.usage_score.toFixed(4)}`);
      lines.push(`- Complexity: ${file.complexity_score.toFixed(4)}`);
      lines.push(`- Semantic: ${file.semantic_score.toFixed(4)}`);
      lines.push(`- Git History: ${file.git_history_score.toFixed(4)}`);
      lines.push(`- Size: ${file.size_score.toFixed(4)}`);
    }

    lines.push('');
  }

  lines.push('\n## Statistics\n');
  lines.push(`- Files parsed: ${statistics.files_parsed}`);
  lines.push(`- Files skipped: ${statistics.files_skipped}`);
  lines.push(`- Total definitions: ${statistics.total_definitions}`);
  lines.push(`- Total references: ${statistics.total_references}`);
  lines.push(`- Git available: ${statistics.git_available}`);

  return lines.join('\n');
}

/**
 * File Importance Tool
 */
export const FileImportanceTool = Tool.define('file-importance', async (initCtx) => {
  return {
    description: `分析代码文件的重要性,通过 6 个维度评估:
- PageRank: 基于依赖图的重要性
- Usage: 导入/引用计数
- Complexity: 代码复杂度
- Semantic: 语义重要性
- Git History: 提交历史
- Size: 代码行数

返回按重要性排序的文件列表。

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
        root_directory,
        weights,
        top_n,
        include_details,
        include_patterns,
        exclude_patterns,
      } = args;

      log.info('Starting file importance analysis', { root_directory });

      // 1. 路径验证
      const resolvedPath = resolve(process.cwd(), root_directory);
      if (!existsSync(resolvedPath)) {
        log.error('Directory not found', { path: resolvedPath });
        const metadata: Meta = {
          root_directory,
          files_analyzed: 0,
          error: 'directory_not_found',
        };
        return {
          title: '目录不存在',
          metadata,
          output: `错误: 目录不存在: ${resolvedPath}`,
        };
      }

      if (!statSync(resolvedPath).isDirectory()) {
        log.error('Not a directory', { path: resolvedPath });
        const metadata: Meta = {
          root_directory,
          files_analyzed: 0,
          error: 'not_a_directory',
        };
        return {
          title: '路径不是目录',
          metadata,
          output: `错误: 路径不是目录: ${resolvedPath}`,
        };
      }

      // 2. 文件收集
      log.debug('Collecting files', { resolvedPath });
      const files = await collectFiles(
        resolvedPath,
        include_patterns,
        exclude_patterns,
      );

      if (files.length === 0) {
        log.warn('No source files found');
        const metadata: Meta = {
          root_directory,
          files_analyzed: 0,
          error: 'no_files_found',
        };
        return {
          title: '未找到源文件',
          metadata,
          output: '未找到符合条件的源文件',
        };
      }

      log.info('Files collected', { count: files.length });

      // 3. Worker 分析
      try {
        const mergedWeights = { ...DEFAULT_WEIGHTS, ...weights };
        log.debug('Starting worker analysis', { weights: mergedWeights });

        const result = await runAnalysisInWorker({
          rootPath: resolvedPath,
          allFiles: files,
          weights: mergedWeights,
        });

        // 4. 结果处理
        const { fileScores, statistics } = result;
        fileScores.sort((a, b) => b.total_score - a.total_score);

        const topFiles = top_n ? fileScores.slice(0, top_n) : fileScores;
        log.info('Analysis completed', { topFilesCount: topFiles.length });

        // 5. 格式化输出
        const output = formatOutput(topFiles, include_details ?? true, statistics);

        // 6. 输出截断
        const truncated = await Truncate.output(output, {}, initCtx?.agent);

        const metadata: Meta = {
          root_directory,
          files_analyzed: files.length,
          files_returned: topFiles.length,
          weights_used: mergedWeights,
          truncated: truncated.truncated,
          error: '',
        };
        return {
          title: `File Importance Analysis: ${root_directory}`,
          metadata,
          output: truncated.content,
        };
      } catch (error) {
        log.error('Analysis failed', {
          error: error instanceof Error ? error.message : String(error),
          filesCount: files.length
        });
        const metadata: Meta = {
          root_directory,
          files_analyzed: files.length,
          error: error instanceof Error ? error.message : String(error),
        };
        return {
          title: '分析失败',
          metadata,
          output: `Error: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
});
