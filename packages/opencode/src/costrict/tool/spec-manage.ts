/**
 * Spec Manage Tool - 内置插件版本
 * 管理 CoSpec 规范变更列表和任务进度
 */

import { Tool } from '@/tool/tool';
import { z } from 'zod';
import { existsSync } from 'fs';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import { Log } from '@/util/log';

const log = Log.create({ service: 'spec-manage' });

/**
 * 参数Schema定义
 */
const parametersSchema = z.object({
  mode: z.string().describe('模式，spec模式下展示.cospec/spec下文件和文件夹'),
  path: z.string().describe('当前工程路径'),
});

interface ChangeInfo {
  name: string;
  completedTasks: number;
  totalTasks: number;
}

const TASK_PATTERN = /^ {0,5}[-*]\s+\[[\sx]\]/i;
const COMPLETED_TASK_PATTERN = /^ {0,5}[-*]\s+\[x\]/i;

interface TaskProgress {
  total: number;
  completed: number;
}

/**
 * 从内容中统计任务进度
 */
function countTasksFromContent(content: string): TaskProgress {
  const lines = content.split('\n');
  let total = 0;
  let completed = 0;
  for (const line of lines) {
    if (line.match(TASK_PATTERN)) {
      total++;
      if (line.match(COMPLETED_TASK_PATTERN)) {
        completed++;
      }
    }
  }
  return { total, completed };
}

/**
 * 获取单个变更的任务进度
 */
async function getTaskProgressForChange(changesDir: string, changeName: string): Promise<TaskProgress> {
  const tasksPath = resolve(changesDir, changeName, 'task.md');
  try {
    const content = await Bun.file(tasksPath).text();
    return countTasksFromContent(content);
  } catch {
    return { total: 0, completed: 0 };
  }
}

/**
 * Spec Manage Tool
 */
export const SpecManageTool = Tool.define('spec-manage', async () => {
  return {
    description: `管理 CoSpec 规范变更列表。

功能：
- 列出所有活跃的变更 (changes)
- 查看每个变更的任务进度
- 显示已完成/总任务数

注意：需要在工程根目录下有 .cospec/plan/changes 目录`,

    parameters: parametersSchema,

    async execute(args: z.infer<typeof parametersSchema>, ctx) {
      const { mode, path: projectPath } = args;

      log.info('Starting spec manage', { mode, path: projectPath });

      const resolvedPath = resolve(process.cwd(), projectPath);

      // spec 模式：展示 .cospec/spec 文件和文件夹
      if (mode === 'spec') {
        const specDir = resolve(resolvedPath, '.cospec', 'spec');
        
        if (!existsSync(specDir)) {
          log.error('Spec directory not found', { path: specDir });
          return {
            title: 'CoSpec Spec 目录不存在',
            metadata: {
              path: projectPath,
              error: 'spec_directory_not_found',
              changes_count: 0,
            },
            output: `Error: No CoSpec spec directory found. Path: ${specDir}`,
          };
        }

        try {
          const entries = await fs.readdir(specDir, { withFileTypes: true });
          const dirs: string[] = [];
          
          for (const entry of entries) {
            if (entry.name === '.' || entry.name === '..') continue;
            if (entry.isDirectory()) {
              dirs.push(entry.name);
            }
          }

          dirs.sort();

          log.info('Spec mode completed', { path: projectPath, dirs: dirs.length });

          // 如果没有功能目录，返回空提示
          if (dirs.length === 0) {
            return {
              title: 'CoSpec Spec 为空',
              metadata: {
                path: projectPath,
                error: '',
                changes_count: 0,
              },
              output: '当前spec为空',
            };
          }

          // 构建目录树输出
          const outputLines: string[] = [];
          
          for (const dir of dirs) {
            const dirPath = resolve(specDir, dir);
            const files = await fs.readdir(dirPath);
            files.sort();

            outputLines.push(`.cospec/spec/${dir}/`);
            for (let i = 0; i < files.length; i++) {
              const isLast = i === files.length - 1;
              const prefix = isLast ? '    └── ' : '    ├── ';
              outputLines.push(`${prefix}${files[i]}`);
            }
            outputLines.push('');
          }

          return {
            title: `CoSpec Spec: ${dirs.length} 个功能`,
            metadata: {
              path: projectPath,
              error: '',
              changes_count: 0,
            },
            output: outputLines.join('\n'),
          };
        } catch (error) {
          log.error('Spec mode failed', {
            error: error instanceof Error ? error.message : String(error),
            path: projectPath,
          });
          return {
            title: '获取 Spec 目录失败',
            metadata: {
              path: projectPath,
              error: error instanceof Error ? error.message : String(error),
              changes_count: 0,
            },
            output: `Error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }else if (mode === 'specpath') {
        const specDir = resolve(resolvedPath, '.cospec', 'spec');
        
        try {
          const entries = await fs.readdir(specDir, { withFileTypes: true });
          const dirs: string[] = [];
          
          for (const entry of entries) {
            if (entry.isDirectory()) dirs.push(entry.name);
          }

          dirs.sort();

          log.info('Spec mode completed', { path: projectPath, dirs: dirs.length });

          if (dirs.length === 0) {
            return {
              title: 'CoSpec Spec 为空',
              metadata: {
                path: projectPath,
                error: '',
                changes_count: 0,
              },
              output: '当前spec为空',
            };
          }

          const paths = dirs.map(dir => `.cospec/spec/${dir}/spec.md`);

          return {
            title: `CoSpec Spec: ${dirs.length} 个功能`,
            metadata: {
              path: projectPath,
              error: '',
              changes_count: 0,
            },
            output: paths.join('\n'),
          };
        } catch (error) {
          log.error('Spec mode failed', {
            error: error instanceof Error ? error.message : String(error),
            path: projectPath,
          });
          return {
            title: '获取 Spec 目录失败',
            metadata: {
              path: projectPath,
              error: error instanceof Error ? error.message : String(error),
              changes_count: 0,
            },
            output: `Error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }else if (mode === 'techpath') {
        const specDir = resolve(resolvedPath, '.cospec', 'spec');
        
        try {
          const entries = await fs.readdir(specDir, { withFileTypes: true });
          const dirs: string[] = [];
          
          for (const entry of entries) {
            if (entry.isDirectory()) dirs.push(entry.name);
          }

          dirs.sort();

          log.info('Spec mode completed', { path: projectPath, dirs: dirs.length });

          if (dirs.length === 0) {
            return {
              title: 'CoSpec Spec 为空',
              metadata: {
                path: projectPath,
                error: '',
                changes_count: 0,
              },
              output: '当前spec为空',
            };
          }

          const paths = dirs.map(dir => `.cospec/spec/${dir}/tech.md`);

          return {
            title: `CoSpec Spec: ${dirs.length} 个功能`,
            metadata: {
              path: projectPath,
              error: '',
              changes_count: 0,
            },
            output: paths.join('\n'),
          };
        } catch (error) {
          log.error('Spec mode failed', {
            error: error instanceof Error ? error.message : String(error),
            path: projectPath,
          });
          return {
            title: '获取 Spec 目录失败',
            metadata: {
              path: projectPath,
              error: error instanceof Error ? error.message : String(error),
              changes_count: 0,
            },
            output: `Error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      } else if (mode === 'planpath') {
        const specDir = resolve(resolvedPath, '.cospec', 'spec');
        
        try {
          const entries = await fs.readdir(specDir, { withFileTypes: true });
          const dirs: string[] = [];
          
          for (const entry of entries) {
            if (entry.isDirectory()) dirs.push(entry.name);
          }

          dirs.sort();

          log.info('Spec mode completed', { path: projectPath, dirs: dirs.length });

          if (dirs.length === 0) {
            return {
              title: 'CoSpec Spec 为空',
              metadata: {
                path: projectPath,
                error: '',
                changes_count: 0,
              },
              output: '当前spec为空',
            };
          }

          const paths = dirs.map(dir => `.cospec/spec/${dir}/plan.md`);

          return {
            title: `CoSpec Spec: ${dirs.length} 个功能`,
            metadata: {
              path: projectPath,
              error: '',
              changes_count: 0,
            },
            output: paths.join('\n'),
          };
        } catch (error) {
          log.error('Spec mode failed', {
            error: error instanceof Error ? error.message : String(error),
            path: projectPath,
          });
          return {
            title: '获取 Spec 目录失败',
            metadata: {
              path: projectPath,
              error: error instanceof Error ? error.message : String(error),
              changes_count: 0,
            },
            output: `Error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      } else if (mode === 'readspec') {
        const specDir = resolve(resolvedPath, '.cospec', 'spec');
        
        try {
          const entries = await fs.readdir(specDir, { withFileTypes: true });
          const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

          log.info('Readspec mode completed', { path: projectPath, dirs: dirs.length });

          if (dirs.length === 0) {
            return {
              title: 'CoSpec Spec 为空',
              metadata: {
                path: projectPath,
                error: '',
                changes_count: 0,
              },
              output: '当前spec为空',
            };
          }

          const contents = await Promise.all(
            dirs.map(async dir => {
              const path = resolve(specDir, dir, 'spec.md');
              try {
                const file = Bun.file(path);
                const text = await file.text();
                return `${text}`;
              } catch {
                return `=== ${dir} ===\n[无法读取文件]`;
              }
            })
          );

          return {
            title: `CoSpec Spec: ${dirs.length} 个功能`,
            metadata: {
              path: projectPath,
              error: '',
              changes_count: 0,
            },
            output: contents.join('\n\n'),
          };
        } catch (error) {
          log.error('Readspec mode failed', {
            error: error instanceof Error ? error.message : String(error),
            path: projectPath,
          });
          return {
            title: '获取 Spec 目录失败',
            metadata: {
              path: projectPath,
              error: error instanceof Error ? error.message : String(error),
              changes_count: 0,
            },
            output: `Error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      } else if (mode === 'readtech') {
        const specDir = resolve(resolvedPath, '.cospec', 'spec');
        
        try {
          const entries = await fs.readdir(specDir, { withFileTypes: true });
          const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

          log.info('Readspec mode completed', { path: projectPath, dirs: dirs.length });

          if (dirs.length === 0) {
            return {
              title: 'CoSpec Spec 为空',
              metadata: {
                path: projectPath,
                error: '',
                changes_count: 0,
              },
              output: '当前spec为空',
            };
          }

          const contents = await Promise.all(
            dirs.map(async dir => {
              const path = resolve(specDir, dir, 'tech.md');
              try {
                const file = Bun.file(path);
                const text = await file.text();
                return `${text}`;
              } catch {
                return `=== ${dir} ===\n[无法读取文件]`;
              }
            })
          );

          return {
            title: `CoSpec Spec: ${dirs.length} 个功能`,
            metadata: {
              path: projectPath,
              error: '',
              changes_count: 0,
            },
            output: contents.join('\n\n'),
          };
        } catch (error) {
          log.error('Readspec mode failed', {
            error: error instanceof Error ? error.message : String(error),
            path: projectPath,
          });
          return {
            title: '获取 Spec 目录失败',
            metadata: {
              path: projectPath,
              error: error instanceof Error ? error.message : String(error),
              changes_count: 0,
            },
            output: `Error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      } else if (mode === 'specstage') {
        const specDir = resolve(resolvedPath, '.cospec', 'spec');

        try {
          const fileExists = async (dir: string, name: string): Promise<boolean> => {
            if (!existsSync(dir)) return false;
            const files = await fs.readdir(dir, { recursive: true });
            return files.some(f => f === name || f.endsWith('/' + name) || f.endsWith('\\' + name));
          };

          const hasPlan = await fileExists(specDir, 'plan.md');
          const hasTech = await fileExists(specDir, 'tech.md');
          const hasSpec = await fileExists(specDir, 'spec.md');
          const hasUser = await fileExists(specDir, 'user.md');

          log.info('Specstage check', { path: projectPath, hasPlan, hasTech, hasSpec, hasUser });

          let stage: string;
          let title: string;

          if (hasPlan) {
            stage = 'implementation';
            title = '方案执行阶段';
          } else if (hasTech) {
            stage = 'task';
            title = '开发任务拆分阶段->方案执行阶段';
          } else if (hasSpec) {
            stage = 'design';
            title = '架构设计阶段->开发任务拆分阶段->方案执行阶段';
          } else if (hasUser) {
            stage = 'explore';
            title = '需求明确阶段->架构设计阶段->开发任务拆分阶段->方案执行阶段';
          } else {
            stage = 'input';
            title = '需求明确阶段->架构设计阶段->开发任务拆分阶段->方案执行阶段';
          }

          return {
            title: `当前阶段: ${title}`,
            metadata: {
              path: projectPath,
              error: '',
              changes_count: 0,
            },
            output: title,
          };
        } catch (error) {
          log.error('Specstage mode failed', {
            error: error instanceof Error ? error.message : String(error),
            path: projectPath,
          });
          return {
            title: '获取阶段信息失败',
            metadata: {
              path: projectPath,
              error: error instanceof Error ? error.message : String(error),
              changes_count: 0,
            },
            output: `Error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }

      // 默认模式：展示 changes 目录下的变更
      const changesDir = resolve(resolvedPath, '.cospec', 'plan', 'changes');

      // 检查 changes 目录是否存在
      if (!existsSync(changesDir)) {
        log.error('Changes directory not found', { path: changesDir });
        return {
          title: 'CoSpec 变更目录不存在',
          metadata: {
            path: projectPath,
            error: 'directory_not_found',
            changes_count: 0,
          },
          output: `Error: No CoSpec changes directory found.  Path: ${changesDir}`,
        };
      }

      try {
        // 获取所有变更目录（排除 archive）
        const entries = await fs.readdir(changesDir, { withFileTypes: true });
        const changeDirs = entries
          .filter(entry => entry.isDirectory() && entry.name !== 'archive')
          .map(entry => entry.name);

        if (changeDirs.length === 0) {
          log.info('No active changes found', { path: projectPath });
          return {
            title: '无活跃变更',
            metadata: {
              path: projectPath,
              error: '',
              changes_count: 0,
            },
            output: 'No active changes found.',
          };
        }

        // 收集每个变更的任务进度
        const changes: ChangeInfo[] = [];
        
        for (const changeDir of changeDirs) {
          const progress = await getTaskProgressForChange(changesDir, changeDir);
          changes.push({
            name: changeDir,
            completedTasks: progress.completed,
            totalTasks: progress.total,
          });
        }

        // 按名称字母顺序排序
        changes.sort((a, b) => a.name.localeCompare(b.name));

        log.info('Spec manage completed', {
          path: projectPath,
          changesCount: changes.length
        });

        // 格式化输出
        const outputLines = ['# CoSpec Active Changes\n'];
        outputLines.push(`Total: ${changes.length} change(s)\n`);
        
        for (const change of changes) {
          const progress = change.totalTasks > 0
            ? `[${change.completedTasks}/${change.totalTasks}]`
            : '[no tasks]';
          outputLines.push(`- ${change.name} ${progress}`);
        }

        return {
          title: `CoSpec Changes: ${changes.length} active`,
          metadata: {
            path: projectPath,
            error: '',
            changes_count: changes.length,
          },
          output: outputLines.join('\n'),
        };
      } catch (error) {
        log.error('Spec manage failed', {
          error: error instanceof Error ? error.message : String(error),
          path: projectPath,
        });
        return {
          title: '获取变更列表失败',
          metadata: {
            path: projectPath,
            error: error instanceof Error ? error.message : String(error),
            changes_count: 0,
          },
          output: `Error: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}, { visible: false });
