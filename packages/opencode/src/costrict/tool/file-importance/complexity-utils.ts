/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Complexity analysis utilities
 */

import type { ComplexityData } from './types';

/**
 * Count complexity-related AST nodes and max depth
 */
export function countComplexityNodes(rootNode: unknown): ComplexityData {
  const complexityPatterns = [
    // Conditionals
    'if_',
    '_if',
    'elif',
    'else_if',
    'switch',
    'case_',
    '_case',
    'match_',
    '_match',
    'when',
    'guard',
    'unless',
    'conditional_expression',
    'ternary',
    // Loops
    'for_',
    '_for',
    'foreach',
    'while_',
    '_while',
    'do_',
    'loop_',
    '_loop',
    'repeat_',
    'until',
    // Exception handling
    'try_',
    '_try',
    'except_',
    '_except',
    'catch_',
    '_catch',
    'rescue',
    'finally_',
  ];

  let branchCount = 0;
  let maxDepth = 0;

  const traverse = (
    node: { type: string; children?: unknown[] },
    depth: number,
  ) => {
    maxDepth = Math.max(maxDepth, depth);

    const nodeType = node.type.toLowerCase();
    // Check if this node type matches any complexity pattern
    for (const pattern of complexityPatterns) {
      if (nodeType.includes(pattern)) {
        branchCount++;
        break;
      }
    }

    if (node.children) {
      for (const child of node.children) {
        traverse(child as { type: string; children?: unknown[] }, depth + 1);
      }
    }
  };

  traverse(rootNode as { type: string; children?: unknown[] }, 0);
  return { branch_count: branchCount, max_depth: maxDepth };
}
