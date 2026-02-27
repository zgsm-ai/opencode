/**
 * File Outline Tool - Bun适配版本
 * 提取代码文件的结构信息（类、函数、方法定义）
 */

import { Tool } from '@/tool/tool';
import { z } from 'zod';
import { readFileSync, existsSync, statSync } from 'fs';
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
  perl: {
    docstringTypes: new Set(['comments']),
    definitionTypes: new Set(['function_definition', 'package_statement']),
    position: 'preceding',
  },
};

type SyntaxNode = Tree['rootNode'];

const COMMENT_TYPES = new Set(['comment', 'comments', 'block_comment', 'line_comment']);
const PYTHON_DOCSTRING_SKIP = new Set(['comment', 'NEWLINE', 'INDENT', 'DEDENT', 'pass_statement']);
const PERL_IGNORE_TYPES = new Set([
  'pod_statement',
  'string',
  'string_content',
  'string_single_quoted',
  'string_double_quoted',
  'comment',
  'comments',
  'line_comment',
  'block_comment',
]);

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

function fallbackLineSignature(lines: string[], line: number, name: string): string {
  if (line < 1 || line > lines.length) return name;
  return lines[line - 1].trimEnd();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectPerlNameNodes(node: SyntaxNode, out: SyntaxNode[]): void {
  if (node.type === 'identifier' || node.type === 'package_name') {
    out.push(node);
  }
  for (const child of node.children) {
    if (!child) continue;
    collectPerlNameNodes(child, out);
  }
}

function isPerlDefinitionLine(line: string, name: string, type: string): boolean {
  if (!line || !name) return false;
  const escaped = escapeRegex(name);
  const packageMatch = new RegExp(`^\\s*package\\s+${escaped}(?:\\b|\\s*;)`).test(line);
  if (packageMatch) return true;
  if (type === 'package_name') return false;
  return new RegExp(`^\\s*sub\\s+${escaped}(?:\\b|\\s*\\()`).test(line);
}

function collectPerlPodLines(lines: string[]): Set<number> {
  const pod = new Set<number>();
  const scan = (index: number, inPod: boolean): void => {
    if (index >= lines.length) return;
    const line = lines[index];
    const next = /^=\w/.test(line.trim()) ? true : /^=cut\b/.test(line.trim()) ? false : inPod;
    if (next) pod.add(index + 1);
    scan(index + 1, next);
  };
  scan(0, false);
  return pod;
}

function perlLineDefinition(line: string): { name: string; type: 'identifier' | 'package_name' } | undefined {
  const packageMatch = line.match(/^\s*package\s+([A-Za-z_][A-Za-z0-9_:]*)\b/);
  if (packageMatch) return { name: packageMatch[1], type: 'package_name' };
  const subMatch = line.match(/^\s*sub\s+([A-Za-z_][A-Za-z0-9_:]*)\b/);
  if (subMatch) return { name: subMatch[1], type: 'identifier' };
  return undefined;
}

function shouldIgnorePerlLineNode(node: SyntaxNode | null | undefined): boolean {
  if (!node) return false;
  if (PERL_IGNORE_TYPES.has(node.type)) return true;
  return shouldIgnorePerlLineNode(node.parent ?? undefined);
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

function definitionQuality(def: Definition): number {
  const head = def.signature.trimStart();
  const hasPrefix = head.startsWith('sub ') || head.startsWith('package ');
  const hasDoc = Boolean(def.docstring);
  return (hasPrefix ? 2 : 0) + (hasDoc ? 1 : 0);
}

function formatErrorFeedback(reason: string, fixHint: string, example?: string): string {
  const parts = [
    "[FileOutline] TOOL CALL FAILED.",
    `Reason: ${reason}`,
    `Fix: ${fixHint}`,
  ]
  if (example) {
    parts.push(`Example: ${example}`)
  }
  return parts.join("\n")
}

/**
 * 参数Schema定义
 */
const parametersSchema = z.object({
  file_path: z.string().describe('要分析的代码文件的绝对路径。'),
});

/**
 * File Outline Tool
 */
export const FileOutlineTool = Tool.define('file-outline', async (ctx) => {
  return {
    description: `从单个文件中提取代码结构（类、函数、方法）。

使用场景：
- 阅读代码前了解文件结构
- 定位特定的类、函数或方法
- 快速获取文件内容概览

返回：类定义、函数签名，附带行号和文档字符串。

注意：支持 Python、JavaScript、TypeScript、Go、Java、C/C++、Rust、Ruby、PHP、Perl 等多种语言。`,

    parameters: parametersSchema,

    async execute(args: z.infer<typeof parametersSchema>, ctx) {
      const file_path = args.file_path

      if (!file_path) {
        throw new Error(formatErrorFeedback(
          "Missing required parameter 'file_path'.",
          "Call the tool with {'file_path': '<absolute path to the code file>'}.",
          "{'file_path': '/path/to/file.py'}",
        ))
      }

      if (!path.isAbsolute(file_path)) {
        throw new Error(formatErrorFeedback(
          `Received non-absolute path: '${file_path}'.`,
          "Convert the path to an absolute path (e.g., Path(relative).resolve()) before calling the tool.",
          "{'file_path': '/path/to/file.py'}",
        ))
      }

      if (!existsSync(file_path)) {
        throw new Error(formatErrorFeedback(
          `File does not exist: '${file_path}'.`,
          "Double-check the path with a file listing command and pass the correct absolute path.",
          "Run `ls /path/to/directory` to verify the file name before calling.",
        ))
      }

      if (!statSync(file_path).isFile()) {
        throw new Error(formatErrorFeedback(
          `Path points to a directory, not a file: '${file_path}'.`,
          "Provide the absolute path to a real file (e.g., .../module.py).",
        ))
      }

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
        if (pattern?.position === 'preceding') {
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
          const lineSig = fallbackLineSignature(lines, line, name);
          if (language === 'perl' && !isPerlDefinitionLine(lineSig, name, node.type)) continue;
          const signature =
            language === 'perl' ? lineSig || sig || name : sig || lineSig || name;
          const docNode = defNode ?? (language === 'perl' ? sigNode : undefined);
          const docstring = (() => {
            if (!pattern || !defNode) return undefined;
            if (pattern.position === 'first_child' && language === 'python') {
              return extractPythonDocstring(docNode, sourceCode);
            }
            if (pattern.position === 'preceding') {
              return extractPrecedingComment(docNode, comments, sourceCode, pattern);
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

        if (language === 'perl') {
          const perlNames: SyntaxNode[] = [];
          collectPerlNameNodes(tree.rootNode, perlNames);
          for (const node of perlNames) {
            const name = getNodeText(node, sourceCode);
            if (!name) continue;
            const line = node.startPosition.row + 1;
            const lineSig = fallbackLineSignature(lines, line, name);
            if (!isPerlDefinitionLine(lineSig, name, node.type)) continue;

            const defNode = pattern ? findDefinitionParent(node, defTypes) : undefined;
            const sigNode = defNode ?? inferSignatureNodeFromNameNode(node);
            const sig = extractDefinitionSignature(sigNode, sourceCode, language);
            const signature =
              language === 'perl' ? lineSig || sig || name : sig || lineSig || name;
            const docNode = defNode ?? sigNode;
            const docstring = (() => {
              if (!include_docstrings || !pattern || !docNode) return undefined;
              if (pattern.position === 'preceding') {
                return extractPrecedingComment(docNode, comments, sourceCode, pattern);
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

          const podLines = collectPerlPodLines(lines);
          for (const [index, lineText] of lines.entries()) {
            const line = index + 1;
            if (podLines.has(line)) continue;
            const parsed = perlLineDefinition(lineText);
            if (!parsed) continue;
            if (!isPerlDefinitionLine(lineText, parsed.name, parsed.type)) continue;
            const column = lineText.indexOf(parsed.name);
            if (column < 0) continue;

            const lineNode = tree.rootNode.namedDescendantForPosition(
              { row: index, column },
              { row: index, column: column + parsed.name.length }
            );
            if (!lineNode) continue;
            if (shouldIgnorePerlLineNode(lineNode)) continue;

            const docstring = (() => {
              if (!include_docstrings || !pattern) return undefined;
              return extractPrecedingComment(lineNode, comments, sourceCode, pattern);
            })();

            definitions.push({
              line,
              name: parsed.name,
              signature: lineText.trimEnd(),
              docstring,
            });
          }
        }

        const map = new Map<string, Definition>();
        for (const def of definitions) {
          const key = `${def.name}:${def.line}`;
          const current = map.get(key);
          if (!current) {
            map.set(key, def);
            continue;
          }
          const next =
            definitionQuality(def) > definitionQuality(current) ||
            (definitionQuality(def) === definitionQuality(current) &&
              def.signature.length < current.signature.length);
          if (next) {
            map.set(key, def);
          }
        }
        const unique = [...map.values()];
        const compact: Definition[] = [];
        const sigSeen = new Set<string>();
        for (const def of unique) {
          const key = `${def.line}:${def.signature}`;
          if (sigSeen.has(key)) continue;
          sigSeen.add(key);
          compact.push(def);
        }

        // 按行号排序
        compact.sort((a, b) => a.line - b.line);

        log.info('File outline extraction completed', {
          filePath: file_path,
          language,
          definitionCount: compact.length
        });

        // 格式化输出
        const output = formatDefinitions(compact, file_path);

        return {
          title: `File Outline: ${file_path}`,
          metadata: {
            file_path,
            language,
              definition_count: compact.length,
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
