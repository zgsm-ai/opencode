/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Multi-language code parser using tree-sitter - Bun适配版本
 */

import { CodeParser } from './base';
import { treeSitterService } from '../service/tree-sitter';
import type { Tree } from 'web-tree-sitter';

// 导出 SyntaxNode 类型（从 web-tree-sitter）
export type SyntaxNode = Tree['rootNode'];

/**
 * Tree-sitter based multi-language parser
 */
export class TreeSitterParser extends CodeParser {
  /**
   * Parse source code file
   */
  async parse(
    fileContent: string,
    filePath: string,
  ): Promise<SyntaxNode | null> {
    const tree = await treeSitterService.parseSourceCode(fileContent, filePath);
    return tree ? tree.rootNode : null;
  }

  /**
   * Get supported file extensions
   */
  getSupportedExtensions(): string[] {
    return ['.py', '.pyw', '.java', '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.go', '.cpp', '.cc', '.cxx', '.hpp', '.h', '.hh', '.hxx', '.c'];
  }

  /**
   * Get language for file
   */
  getLanguageForFile(filePath: string): string | undefined {
    return treeSitterService.getLanguageFromPath(filePath);
  }
}

// Global parser instance
let parserInstance: TreeSitterParser | undefined;

/**
 * Get global parser instance
 */
export function getParser(): TreeSitterParser {
  if (!parserInstance) {
    parserInstance = new TreeSitterParser();
  }
  return parserInstance;
}
