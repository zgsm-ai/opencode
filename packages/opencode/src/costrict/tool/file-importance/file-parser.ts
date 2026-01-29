/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * File parsing utilities for importance analysis
 */

import { Query } from 'web-tree-sitter';
import { readFileSync } from 'fs';
import { treeSitterService } from '../service/tree-sitter';
import { loadScmQuery } from '../util/scm-loader';
import { countComplexityNodes } from './complexity-utils';
import type { WorkerFileResult } from './types.js';

/**
 * Parse a single file directly (without worker)
 * Used when already running inside a worker thread
 */
export async function parseFileDirect(
  absPath: string,
  relPath: string,
): Promise<WorkerFileResult> {
  // Read file content
  let content: string;
  try {
    content = readFileSync(absPath, 'utf-8');
  } catch {
    return { absPath, relPath, content: null, skipped: true };
  }

  if (!content) {
    return { absPath, relPath, content: null, skipped: true };
  }

  // Get language from file extension
  const langName = treeSitterService.getLanguageFromPath(absPath);
  if (!langName) {
    return { absPath, relPath, content, skipped: true };
  }

  try {
    const parser = await treeSitterService.createParser(langName);
    const tree = parser.parse(content);
    if (!tree) {
      return { absPath, relPath, content, skipped: true };
    }

    const queryText = loadScmQuery(langName);
    if (!queryText) {
      return { absPath, relPath, content, skipped: true };
    }

    const language = await treeSitterService.loadLanguage(langName);
    const query = new Query(language, queryText);
    const captures = query.captures(tree.rootNode);

    const definitions = new Set<string>();
    const references = new Set<string>();

    for (const capture of captures) {
      const name = capture.node.text;
      if (!name) {
        continue;
      }

      if (capture.name.includes('name.definition')) {
        definitions.add(name);
      } else if (capture.name.includes('name.reference')) {
        references.add(name);
      }
    }

    // Collect AST-based complexity data
    const complexity = countComplexityNodes(tree.rootNode);

    return {
      absPath,
      relPath,
      content,
      skipped: false,
      definitions: Array.from(definitions),
      references: Array.from(references),
      complexity,
    };
  } catch (error) {
    return {
      absPath,
      relPath,
      content,
      skipped: false,
      error: `${relPath}: ${error}`,
    };
  }
}
