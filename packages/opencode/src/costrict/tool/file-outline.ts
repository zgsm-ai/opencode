/**
 * File Outline Tool - Bun适配版本
 * 提取代码文件的结构信息（类、函数、方法定义）
 */

import { Tool } from '@/tool/tool';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { treeSitterService } from './service/tree-sitter';
import { loadScmQuery, detectLanguageFromFilename } from './util/scm-loader';
import { Query } from 'web-tree-sitter';
import { Log } from '@/util/log';

const log = Log.create({ service: 'file-outline' });

/**
 * 定义信息
 */
interface Definition {
  line: number;
  name: string;
  signature: string;
  docstring?: string;
}

/**
 * 语言特定的文档字符串配置
 */
interface DocstringPattern {
  docstringTypes: Set<string>;
  definitionTypes: Set<string>;
  position: 'first_child' | 'preceding';
  docPrefix?: string;
}

/**
 * 语言特定的文档字符串模式
 */
const DOCSTRING_PATTERNS: Record<string, DocstringPattern> = {
  python: {
    docstringTypes: new Set(['string', 'string_content']),
    definitionTypes: new Set(['function_definition', 'class_definition']),
    position: 'first_child',
  },
  javascript: {
    docstringTypes: new Set(['comment']),
    definitionTypes: new Set([
      'function_declaration',
      'class_declaration',
      'method_definition',
      'arrow_function',
      'function',
    ]),
    position: 'preceding',
  },
  typescript: {
    docstringTypes: new Set(['comment']),
    definitionTypes: new Set([
      'function_declaration',
      'class_declaration',
      'method_definition',
      'arrow_function',
      'function',
    ]),
    position: 'preceding',
  },
  go: {
    docstringTypes: new Set(['comment']),
    definitionTypes: new Set(['function_declaration', 'method_declaration', 'type_declaration']),
    position: 'preceding',
  },
  java: {
    docstringTypes: new Set(['block_comment', 'line_comment']),
    definitionTypes: new Set(['class_declaration', 'method_declaration', 'constructor_declaration']),
    position: 'preceding',
    docPrefix: '/**',
  },
  c: {
    docstringTypes: new Set(['comment']),
    definitionTypes: new Set(['function_definition', 'struct_specifier']),
    position: 'preceding',
  },
  cpp: {
    docstringTypes: new Set(['comment']),
    definitionTypes: new Set(['function_definition', 'class_specifier', 'struct_specifier']),
    position: 'preceding',
  },
};

/**
 * 提取文档字符串
 */
function extractDocstring(
  node: any,
  sourceCode: string,
  pattern: DocstringPattern
): string | undefined {
  if (pattern.position === 'first_child') {
    // Python风格：文档字符串是函数/类体的第一个子节点
    const body = node.childForFieldName('body');
    if (!body) return undefined;

    const firstChild = body.firstChild;
    if (!firstChild) return undefined;

    if (pattern.docstringTypes.has(firstChild.type)) {
      return sourceCode.substring(firstChild.startIndex, firstChild.endIndex);
    }
  } else if (pattern.position === 'preceding') {
    // JavaScript/Go风格：文档注释在定义之前
    let prevSibling = node.previousSibling;

    // 跳过空白节点
    while (prevSibling && prevSibling.type === 'comment' && !prevSibling.text.trim()) {
      prevSibling = prevSibling.previousSibling;
    }

    if (prevSibling && pattern.docstringTypes.has(prevSibling.type)) {
      const text = sourceCode.substring(prevSibling.startIndex, prevSibling.endIndex);

      // 如果指定了前缀，检查是否匹配
      if (pattern.docPrefix && !text.startsWith(pattern.docPrefix)) {
        return undefined;
      }

      return text;
    }
  }

  return undefined;
}

/**
 * 格式化定义列表
 */
function formatDefinitions(definitions: Definition[], filePath: string): string {
  if (definitions.length === 0) {
    return `# ${filePath}\n\nNo definitions found.`;
  }

  const lines: string[] = [`# ${filePath}\n`];

  for (const def of definitions) {
    lines.push(`## Line ${def.line}: ${def.name}`);
    lines.push(`\`\`\`\n${def.signature}\n\`\`\``);

    if (def.docstring) {
      lines.push(`\n${def.docstring}`);
    }

    lines.push(''); // 空行分隔
  }

  return lines.join('\n');
}

/**
 * 参数Schema定义
 */
const parametersSchema = z.object({
  file_path: z.string().describe('要分析的文件路径'),
  include_docstrings: z.boolean().optional().default(true).describe('是否包含文档字符串'),
});

/**
 * File Outline Tool
 */
export const FileOutlineTool = Tool.define('file-outline', async (ctx) => {
  return {
    description: `提取代码文件的结构信息，包括类、函数、方法定义和文档字符串。

支持的语言：
- Python (.py)
- JavaScript (.js, .jsx)
- TypeScript (.ts, .tsx)
- Go (.go)
- Java (.java)
- C (.c, .h)
- C++ (.cpp, .hpp)

输出包含：
- 定义的行号
- 函数/类签名
- 文档字符串（如果存在）`,

    parameters: parametersSchema,

    async execute(args: z.infer<typeof parametersSchema>, ctx) {
      const { file_path, include_docstrings } = args;

      log.info('Starting file outline extraction', { filePath: file_path });

      try {
        // 检测语言
        const language = detectLanguageFromFilename(file_path);
        if (!language) {
          log.warn('Unsupported file type', { filePath: file_path });
          return {
            title: '不支持的文件类型',
            metadata: {
              file_path,
              language: 'unknown',
              definition_count: 0,
              error: 'unsupported_file_type'
            },
            output: `Error: Unsupported file type for ${file_path}`,
          };
        }

        // 读取文件内容
        const sourceCode = readFileSync(file_path, 'utf-8');
        log.debug('File content loaded', { language, size: sourceCode.length });

        // 加载语言对象（用于创建查询）
        const lang = await treeSitterService.loadLanguage(language);

        // 创建解析器
        const parser = await treeSitterService.createParser(language);

        // 解析代码
        const tree = parser.parse(sourceCode);

        // 加载SCM查询
        const queryText = loadScmQuery(language);

        // 创建查询对象 - 使用 Query 构造函数
        const query = new Query(lang, queryText);

        // 执行查询
        if (!tree) {
          return {
            title: '解析失败',
            metadata: {
              file_path,
              language,
              definition_count: 0,
              error: 'parse_failed',
            },
            output: `Error: Failed to parse ${file_path}`,
          };
        }
        const captures = query.captures(tree.rootNode);

        // 提取定义
        const definitions: Definition[] = [];
        const docstringPattern = DOCSTRING_PATTERNS[language];

        for (const capture of captures) {
          const node = capture.node;
          const captureName = capture.name;

          // 只处理定义类型的捕获
          if (captureName === 'name.definition.class' || captureName === 'name.definition.function') {
            const line = node.startPosition.row + 1;
            const name = node.text;

            // 获取完整签名（父节点）
            const defNode = node.parent;
            const signature = defNode ? sourceCode.substring(defNode.startIndex, defNode.endIndex).split('\n')[0] : name;

            // 提取文档字符串
            let docstring: string | undefined;
            if (include_docstrings && docstringPattern && defNode) {
              docstring = extractDocstring(defNode, sourceCode, docstringPattern);
            }

            definitions.push({
              line,
              name,
              signature,
              docstring,
            });
          }
        }

        // 按行号排序
        definitions.sort((a, b) => a.line - b.line);

        log.info('File outline extraction completed', {
          filePath: file_path,
          language,
          definitionCount: definitions.length
        });

        // 格式化输出
        const output = formatDefinitions(definitions, file_path);

        return {
          title: `File Outline: ${file_path}`,
          metadata: {
            file_path,
            language,
            definition_count: definitions.length,
            error: '',
          },
          output,
        };
      } catch (error) {
        log.error('File outline extraction failed', {
          filePath: file_path,
          error: error instanceof Error ? error.message : String(error)
        });
        return {
          title: '文件分析失败',
          metadata: {
            file_path,
            language: 'unknown',
            definition_count: 0,
            error: error instanceof Error ? error.message : String(error),
          },
          output: `Error: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
});
