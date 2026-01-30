/**
 * File Outline Tool - Bun适配版本
 * 提取代码文件的结构信息（类、函数、方法定义）
 */

import { Tool } from '@/tool/tool';
import { z } from 'zod';
import { readFileSync } from 'fs';
import path from 'path';
import { treeSitterService } from './service/tree-sitter';
import { loadScmQuery, detectLanguageFromFilename } from './util/scm-loader';
import { Query } from 'web-tree-sitter';
import type { Tree } from 'web-tree-sitter';
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
    definitionTypes: new Set([
      'class_declaration',
      'method_declaration',
      'constructor_declaration',
      'interface_declaration',
    ]),
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
  rust: {
    docstringTypes: new Set(['line_comment', 'block_comment']),
    definitionTypes: new Set(['function_item', 'impl_item', 'struct_item', 'enum_item']),
    position: 'preceding',
    docPrefix: '///',
  },
  ruby: {
    docstringTypes: new Set(['comment']),
    definitionTypes: new Set(['method', 'class', 'module']),
    position: 'preceding',
  },
  php: {
    docstringTypes: new Set(['comment']),
    definitionTypes: new Set(['function_definition', 'method_declaration', 'class_declaration']),
    position: 'preceding',
  },
};

type SyntaxNode = Tree['rootNode'];

const COMMENT_TYPES = new Set(['comment', 'block_comment', 'line_comment']);
const PYTHON_DOCSTRING_SKIP = new Set(['comment', 'NEWLINE', 'INDENT', 'DEDENT', 'pass_statement']);

function getNodeText(node: SyntaxNode, sourceCode: string): string {
  return sourceCode.substring(node.startIndex, node.endIndex);
}

function cleanDocstring(value: string): string {
  const text = value.trim();
  if (!text) return text;

  const triples = ['"""', "'''"];
  for (const quote of triples) {
    if (text.startsWith(quote) && text.endsWith(quote) && text.length >= quote.length * 2) {
      return text.slice(quote.length, -quote.length).trim();
    }
    if (text.startsWith(quote)) {
      const trimmed = text.slice(quote.length);
      if (trimmed.endsWith(quote) && trimmed.length >= quote.length) {
        return trimmed.slice(0, -quote.length).trim();
      }
      return trimmed.trim();
    }
  }

  for (const quote of ['"', "'"]) {
    if (text.startsWith(quote) && text.endsWith(quote) && text.length > 1) {
      return text.slice(1, -1).trim();
    }
  }

  return text;
}

function cleanComment(value: string): string {
  const lines = value.split('\n');
  const cleaned: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const noBlockStart = trimmed.startsWith('/**')
      ? trimmed.slice(3)
      : trimmed.startsWith('/*')
        ? trimmed.slice(2)
        : trimmed;
    const noBlockEnd = noBlockStart.endsWith('*/') ? noBlockStart.slice(0, -2) : noBlockStart;
    const noPrefix = noBlockEnd.startsWith('///')
      ? noBlockEnd.slice(3)
      : noBlockEnd.startsWith('//!')
        ? noBlockEnd.slice(3)
        : noBlockEnd.startsWith('//')
          ? noBlockEnd.slice(2)
          : noBlockEnd.startsWith('#')
            ? noBlockEnd.slice(1)
            : noBlockEnd.startsWith('*')
              ? noBlockEnd.slice(1)
              : noBlockEnd;
    const next = noPrefix.trim();
    if (next) cleaned.push(next);
  }

  return cleaned.join('\n').trim();
}

function normalizeSignatureWhitespace(signature: string): string {
  const normalized = signature.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized) return normalized;

  const indentMatch = normalized.match(/^[ \t]*/);
  const indent = indentMatch ? indentMatch[0] : '';
  const content = normalized.slice(indent.length);
  const collapsed = content.replace(/\s+/g, ' ').trim();
  return `${indent}${collapsed}`.trimEnd();
}

function findDefinitionParent(node: SyntaxNode, definitionTypes: Set<string>): SyntaxNode | undefined {
  if (definitionTypes.has(node.type)) return node;
  const parent = node.parent;
  if (!parent) return undefined;
  return findDefinitionParent(parent, definitionTypes);
}

function inferSignatureNodeFromNameNode(node: SyntaxNode): SyntaxNode {
  const startRow = node.startPosition.row;
  const climb = (current: SyntaxNode): SyntaxNode => {
    const parent = current.parent;
    if (!parent) return current;
    if (parent.startPosition.row !== startRow) return current;
    return climb(parent);
  };
  const candidate = climb(node);
  if (!candidate.parent) return node;
  if (['program', 'source_file', 'translation_unit', 'module'].includes(candidate.type)) {
    return node;
  }
  return candidate;
}

function findDefinitionBodyChild(node: SyntaxNode, language: string): SyntaxNode | undefined {
  const common = new Set([
    'block',
    'body',
    'statement_block',
    'compound_statement',
    'class_body',
    'declaration_list',
    'field_declaration_list',
    'body_statement',
  ]);
  const specific = new Set(
    language === 'python'
      ? ['block', 'body']
      : language === 'javascript' || language === 'typescript'
        ? ['statement_block', 'class_body']
        : language === 'go'
          ? ['block']
          : language === 'java'
            ? ['block', 'class_body']
            : language === 'cpp'
              ? ['compound_statement', 'declaration_list', 'field_declaration_list', 'class_body']
              : language === 'c'
                ? ['compound_statement']
                : []
  );

  const types = new Set([...common, ...specific]);
  for (const child of node.children) {
    if (!child) continue;
    if (types.has(child.type)) return child;
  }
  return undefined;
}

function extractDefinitionSignature(
  node: SyntaxNode,
  sourceCode: string,
  language: string
): string {
  const start = node.startIndex;
  const body = findDefinitionBodyChild(node, language);
  const limit = body ? Math.min(node.endIndex, body.startIndex) : node.endIndex;
  const cap = 4096;
  const end = limit - start > cap ? start + cap : limit;
  const raw = sourceCode.substring(start, end);
  const tail = sourceCode.slice(end);
  const withBrace = body && /^[ \t]*\{/.test(tail) ? `${raw} {` : raw;
  return normalizeSignatureWhitespace(withBrace);
}

function collectComments(
  node: SyntaxNode,
  docTypes: Set<string>,
  out: SyntaxNode[]
): void {
  if (docTypes.has(node.type) && COMMENT_TYPES.has(node.type)) {
    out.push(node);
  }
  for (const child of node.children) {
    if (!child) continue;
    collectComments(child, docTypes, out);
  }
}

function extractPythonDocstring(node: SyntaxNode, sourceCode: string): string | undefined {
  const body = node.childForFieldName('body') ?? findDefinitionBodyChild(node, 'python');
  if (!body) return undefined;

  for (const child of body.children) {
    if (!child) continue;
    if (child.type === 'expression_statement') {
      for (const sub of child.children) {
        if (!sub) continue;
        if (sub.type === 'string' || sub.type === 'concatenated_string') {
          return cleanDocstring(getNodeText(sub, sourceCode));
        }
      }
      continue;
    }

    if (child.type === 'string' || child.type === 'concatenated_string') {
      return cleanDocstring(getNodeText(child, sourceCode));
    }

    if (!PYTHON_DOCSTRING_SKIP.has(child.type)) return undefined;
  }

  return undefined;
}

function extractPrecedingComment(
  node: SyntaxNode,
  comments: SyntaxNode[],
  sourceCode: string,
  pattern: DocstringPattern
): string | undefined {
  const defLine = node.startPosition.row;
  const nearby = comments.filter((comment) => {
    const endLine = comment.endPosition.row;
    if (endLine === defLine || endLine === defLine - 1) return true;
    if (endLine < defLine - 1) {
      const gap = defLine - endLine - 1;
      return gap <= 1;
    }
    return false;
  });

  if (nearby.length === 0) return undefined;

  const closest = nearby.reduce((best, item) =>
    item.endPosition.row >= best.endPosition.row ? item : best
  );
  const text = getNodeText(closest, sourceCode);

  if (pattern.docPrefix && !text.trim().startsWith(pattern.docPrefix)) {
    return undefined;
  }

  return cleanComment(text);
}


/**
 * 格式化定义列表
 */
function formatDefinitions(definitions: Definition[], filePath: string): string {
  const filename = path.basename(filePath);

  if (definitions.length === 0) {
    return `${filename}:\n\n  (No definitions found)`;
  }

  const lines: string[] = [`${filename}:`, ''];

  for (const def of definitions) {
    const line = String(def.line).padStart(4, ' ');
    lines.push(`  ${line}: ${def.signature}`);

    if (def.docstring) {
      const lead = def.signature.match(/^[ \t]*/)?.[0] ?? '';
      const indent = ' '.repeat(8 + lead.length);
      const docs = def.docstring.split('\n');

      if (docs.length === 1 && def.docstring.length <= 70) {
        lines.push(`${indent}"""${def.docstring}"""`);
      } else {
        lines.push(`${indent}"""`);
        for (const doc of docs) {
          const text = doc.trim();
          if (text) {
            lines.push(`${indent}${text}`);
          }
        }
        lines.push(`${indent}"""`);
      }
    }

    lines.push('');
  }

  lines.push(`── ${definitions.length} definitions found ──`);

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
- Rust (.rs)
- Ruby (.rb)
- PHP (.php)

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
        const pattern = DOCSTRING_PATTERNS[language];
        const docTypes = pattern ? pattern.docstringTypes : new Set<string>();
        const defTypes = pattern ? pattern.definitionTypes : new Set<string>();
        const comments: SyntaxNode[] = [];
        if (include_docstrings && pattern?.position === 'preceding') {
          collectComments(tree.rootNode, docTypes, comments);
        }
        const lines = sourceCode.split('\n');

        for (const capture of captures) {
          const node = capture.node;
          const captureName = capture.name;
          if (!captureName.includes('name.definition')) continue;

          const name = getNodeText(node, sourceCode);
          const defNode = pattern ? findDefinitionParent(node, defTypes) : undefined;
          const sigNode = defNode ?? inferSignatureNodeFromNameNode(node);
          const line = sigNode.startPosition.row + 1;
          const sig = extractDefinitionSignature(sigNode, sourceCode, language);
          const signature =
            sig || (line >= 1 && line <= lines.length ? lines[line - 1].trimEnd() : name);
          const docstring = (() => {
            if (!include_docstrings || !pattern || !defNode) return undefined;
            if (pattern.position === 'first_child' && language === 'python') {
              return extractPythonDocstring(defNode, sourceCode);
            }
            if (pattern.position === 'preceding') {
              return extractPrecedingComment(defNode, comments, sourceCode, pattern);
            }
            return undefined;
          })();

          definitions.push({
            line,
            name,
            signature,
            docstring,
          });
        }

        const seen = new Set<string>();
        const unique: Definition[] = [];
        for (const def of definitions) {
          const key = `${def.name}:${def.line}`;
          if (seen.has(key)) continue;
          seen.add(key);
          unique.push(def);
        }

        // 按行号排序
        unique.sort((a, b) => a.line - b.line);

        log.info('File outline extraction completed', {
          filePath: file_path,
          language,
          definitionCount: unique.length
        });

        // 格式化输出
        const output = formatDefinitions(unique, file_path);

        return {
          title: `File Outline: ${file_path}`,
          metadata: {
            file_path,
            language,
            definition_count: unique.length,
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
