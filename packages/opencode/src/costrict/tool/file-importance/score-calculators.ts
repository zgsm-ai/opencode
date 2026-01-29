/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Score calculation utilities for file importance analysis
 */

import * as path from 'path';
import type { ComplexityData } from './types.js';
import {
  IMPORTANT_KEYWORDS,
  IMPORTANT_FILENAMES,
  BUILD_CONFIG_FILES,
  LANGUAGE_ENTRY_POINTS,
} from './types.js';
import {
  isTestFile,
  isExampleFile,
  isGeneratedOrVendor,
} from './file-classifiers.js';

/**
 * Calculate usage frequency score (0-1)
 */
export function calculateUsageScore(
  relPath: string,
  importCounts: Map<string, number>,
): number {
  const importCount = importCounts.get(relPath) || 0;
  // Normalize: 10+ imports = max score
  return Math.min(importCount / 10.0, 1.0);
}

/**
 * Calculate code complexity score (0-1)
 */
export function calculateComplexityScore(
  content: string,
  complexityData?: Map<string, ComplexityData>,
  relPath?: string,
): number {
  if (!content) {
    return 0.0;
  }

  // Prefer AST-based complexity data when available
  if (relPath && complexityData && complexityData.has(relPath)) {
    const data = complexityData.get(relPath)!;
    const branchCount = data.branch_count;
    const maxDepth = data.max_depth;

    // Normalize: 50+ branches = max score
    const complexityScore = Math.min(branchCount / 50.0, 1.0);

    // Normalize nesting: depth 8+ = max contribution of 0.3
    const nestingScore = Math.min(maxDepth / 8.0, 1.0) * 0.3;

    return Math.min(complexityScore + nestingScore, 1.0);
  }

  // Fallback: regex-based analysis
  const lines = content.split('\n');

  const branchPatterns = [
    /\b(if|else if|elseif)\b/,
    /\b(for|foreach|while|do)\b/,
    /\b(switch|case|match|when)\b/,
    /\b(try|catch|finally)\b/,
  ];

  let branchCount = 0;
  for (const line of lines) {
    for (const pattern of branchPatterns) {
      if (pattern.test(line)) {
        branchCount++;
        break;
      }
    }
  }

  const complexityScore = Math.min(branchCount / 50.0, 1.0);

  // Check nesting depth (based on indentation)
  let maxIndent = 0;
  for (const line of lines) {
    if (line.trim()) {
      const indent = line.length - line.trimStart().length;
      maxIndent = Math.max(maxIndent, indent);
    }
  }

  const nestingScore = Math.min(maxIndent / 20.0, 1.0) * 0.3;

  return Math.min(complexityScore + nestingScore, 1.0);
}

/**
 * Calculate semantic importance score (0-1)
 */
export function calculateSemanticScore(relPath: string): number {
  let score = 0.0;
  const pathLower = relPath.toLowerCase();
  const filePath = path.parse(relPath);
  const name = filePath.name;
  const nameLower = name.toLowerCase();
  const filename = filePath.base;
  const ext = filePath.ext.toLowerCase();

  // 1. Check important keywords in path (+0.2, only once)
  for (const keyword of IMPORTANT_KEYWORDS) {
    if (pathLower.includes(keyword)) {
      score += 0.2;
      break;
    }
  }

  // 2. Check important file names (+0.4, only once)
  for (const importantName of IMPORTANT_FILENAMES) {
    const importantLower = importantName.toLowerCase();
    if (nameLower === importantLower || nameLower.startsWith(importantLower)) {
      score += 0.4;
      break;
    }
  }

  // 3. Language-specific entry point detection (+0.4)
  if (ext in LANGUAGE_ENTRY_POINTS) {
    const entryPoints = LANGUAGE_ENTRY_POINTS[ext];
    for (const ep of entryPoints) {
      if (name === ep || nameLower === ep.toLowerCase()) {
        score += 0.4;
        break;
      }
    }
  }

  // 4. Build and config files (+0.5)
  if (BUILD_CONFIG_FILES.has(filename)) {
    score += 0.5;
  }

  // 5. Config/settings/env files (+0.2)
  const configPatterns = [
    'config',
    'settings',
    'env',
    'conf',
    'cfg',
    'properties',
    'options',
  ];
  if (configPatterns.some((pattern) => nameLower.includes(pattern))) {
    score += 0.2;
  }

  // 6. Interface/Abstract definitions (+0.15)
  const interfacePatterns = [
    'interface',
    'abstract',
    'trait',
    'protocol',
    'contract',
  ];
  if (interfacePatterns.some((pattern) => nameLower.includes(pattern))) {
    score += 0.15;
  }

  // 7. Test files (reduced importance, -0.3)
  if (isTestFile(relPath, nameLower)) {
    score -= 0.3;
  }

  // 8. Example/Demo/Sample files (reduced importance, -0.2)
  if (isExampleFile(relPath, nameLower)) {
    score -= 0.2;
  }

  // 9. Generated/Vendor files (reduced importance, -0.4)
  if (isGeneratedOrVendor(relPath)) {
    score -= 0.4;
  }

  return Math.max(Math.min(score, 1.0), 0.0);
}

/**
 * Calculate code size importance score (0-1)
 */
export function calculateSizeScore(content: string): number {
  if (!content) {
    return 0.0;
  }

  const lines = content.split('\n');
  const codeLines = lines.filter((line) => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('#');
  });

  const lineCount = codeLines.length;

  if (lineCount < 20) {
    return lineCount / 40.0; // Small files: 0 - 0.5
  } else {
    return Math.min(0.5 + (lineCount - 20) / 960.0, 1.0); // 20-500 lines: 0.5 - 1.0
  }
}
