/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ImportanceAnalyzer - Multi-dimensional importance analysis for code files
 */

import * as path from 'path';
import { createGraph, addNode, addEdge, pagerank } from '../util/pagerank';
import { parseFileDirect } from './file-parser';
import type {
  FileScore,
  ComplexityData,
  AnalysisStats,
  DEFAULT_WEIGHTS,
} from './types.js';
import { GitAnalyzer } from './git-analyzer.js';
import {
  calculateUsageScore,
  calculateComplexityScore,
  calculateSemanticScore,
  calculateSizeScore,
} from './score-calculators.js';

/**
 * Multi-dimensional importance analyzer
 */
export class ImportanceAnalyzer {
  private rootPath: string;
  private allFiles: string[];
  private weights: typeof DEFAULT_WEIGHTS;
  private concurrency: number;

  // Statistics
  private stats: {
    files_parsed: number;
    files_skipped: number;
    total_definitions: number;
    total_references: number;
    git_available: boolean;
    parse_errors: string[];
  };

  // Caches
  private fileContents: Map<string, string> = new Map();
  private defines: Map<string, Set<string>> = new Map();
  private references: Map<string, Set<string>> = new Map();
  private importCounts: Map<string, number> = new Map();
  private complexityData: Map<string, ComplexityData> = new Map();

  // Git analyzer
  private gitAnalyzer: GitAnalyzer;

  constructor(
    rootPath: string,
    allFiles: string[],
    weights: typeof DEFAULT_WEIGHTS,
    concurrency = 10,
  ) {
    this.rootPath = rootPath;
    this.allFiles = allFiles;
    this.weights = weights;
    this.concurrency = concurrency;

    this.stats = {
      files_parsed: 0,
      files_skipped: 0,
      total_definitions: 0,
      total_references: 0,
      git_available: false,
      parse_errors: [],
    };

    // Initialize git analyzer
    this.gitAnalyzer = new GitAnalyzer(rootPath);
    this.stats.git_available = this.gitAnalyzer.isGitAvailable();
  }

  /**
   * Analyze all files and return scores
   */
  async analyzeAll(
    updateOutput?: (output: string) => void,
  ): Promise<FileScore[]> {
    const totalFiles = this.allFiles.length;

    // Step 1: Parse all files and build dependency graph
    const step1Header = 'Step 1/4: Parsing files...\n';
    if (updateOutput) {
      updateOutput(step1Header);
    }
    await this.parseAllFiles(updateOutput, step1Header);

    const step1Complete = `✓ Parsed ${this.stats.files_parsed} files (${this.stats.files_skipped} skipped)\n\n`;
    if (updateOutput) {
      updateOutput(step1Header + step1Complete);
    }

    // Step 2: Batch fetch git history
    const step2Header =
      step1Header + step1Complete + 'Step 2/4: Fetching git history...\n';
    if (updateOutput) {
      updateOutput(step2Header);
    }
    this.gitAnalyzer.batchFetchGitHistory();

    const step2Complete = `✓ Fetched git history for ${this.gitAnalyzer.getCommitCountsSize()} files\n\n`;
    if (updateOutput) {
      updateOutput(step2Header + step2Complete);
    }

    // Step 3: Calculate PageRank
    const step3Header =
      step2Header + step2Complete + 'Step 3/4: Computing PageRank...\n';
    if (updateOutput) {
      updateOutput(step3Header);
    }
    const pagerankScores = await this.calculatePageRank();

    const step3Complete = `✓ Computed PageRank for ${Object.keys(pagerankScores).length} files\n\n`;
    if (updateOutput) {
      updateOutput(step3Header + step3Complete);
    }

    // Step 4: Calculate all dimension scores for each file
    const step4Header =
      step3Header +
      step3Complete +
      `Step 4/4: Calculating scores for ${totalFiles} files...\n`;
    if (updateOutput) {
      updateOutput(step4Header);
    }

    const fileScores: FileScore[] = [];

    for (let idx = 0; idx < this.allFiles.length; idx++) {
      const absPath = this.allFiles[idx];

      let relPath: string;
      try {
        relPath = path.relative(this.rootPath, absPath);
      } catch {
        relPath = absPath;
      }

      const content = this.fileContents.get(absPath) || '';

      const fs: FileScore = {
        file: relPath,
        absolute_path: absPath,
        pagerank_score: pagerankScores[relPath] || 0.0,
        usage_score: calculateUsageScore(relPath, this.importCounts),
        complexity_score: calculateComplexityScore(
          content,
          this.complexityData,
          relPath,
        ),
        semantic_score: calculateSemanticScore(relPath),
        git_history_score: this.gitAnalyzer.calculateGitHistoryScore(absPath),
        size_score: calculateSizeScore(content),
        total_score: 0,
      };

      // Calculate weighted total score
      fs.total_score =
        fs.pagerank_score * this.weights.pagerank +
        fs.usage_score * this.weights.usage +
        fs.complexity_score * this.weights.complexity +
        fs.semantic_score * this.weights.semantic +
        fs.git_history_score * this.weights.git_history +
        fs.size_score * this.weights.size;

      // Add metadata
      if (content) {
        const lines = content.split('\n');
        fs.metadata = {
          lines_of_code: lines.length,
          imports_count: this.importCounts.get(relPath) || 0,
        };
      }

      fileScores.push(fs);
    }

    // Step 4 complete
    const step4Complete = `✓ Calculated scores for ${fileScores.length} files\n`;
    if (updateOutput) {
      updateOutput(step4Header + step4Complete);
    }

    return fileScores;
  }

  /**
   * Parse all files and extract definitions/references
   * Uses direct parsing (no nested workers) since this runs in a worker already
   */
  private async parseAllFiles(
    updateOutput?: (output: string) => void,
    stepHeader?: string,
  ): Promise<void> {
    const BATCH_SIZE = this.concurrency;
    const totalFiles = this.allFiles.length;
    let processedCount = 0;
    let lastUpdateTime = Date.now();
    const UPDATE_INTERVAL_MS = 1000; // Update every 1 second
    const UPDATE_EVERY_N_FILES = 10; // Or every 10 files

    // Process files in batches
    for (let i = 0; i < totalFiles; i += BATCH_SIZE) {
      const batch = this.allFiles.slice(
        i,
        Math.min(i + BATCH_SIZE, totalFiles),
      );

      // Process batch in parallel (direct parsing, no nested workers)
      const batchResults = await Promise.all(
        batch.map(async (absPath) => {
          let relPath: string;
          try {
            relPath = path.relative(this.rootPath, absPath);
          } catch {
            relPath = absPath;
          }

          try {
            // Parse file directly (already in worker context)
            const result = await parseFileDirect(absPath, relPath);
            return result;
          } catch (error) {
            return {
              absPath,
              relPath,
              content: null,
              skipped: false,
              error: `Parse error: ${error}`,
            };
          }
        }),
      );

      // Collect results from batch
      for (const result of batchResults) {
        processedCount++;

        if (result.content) {
          this.fileContents.set(result.absPath, result.content);
        }

        if (result.skipped) {
          this.stats.files_skipped++;
          continue;
        }

        if (result.error) {
          this.stats.parse_errors.push(result.error);
          continue;
        }

        // Update progress periodically
        if (
          updateOutput &&
          stepHeader &&
          (processedCount % UPDATE_EVERY_N_FILES === 0 ||
            Date.now() - lastUpdateTime > UPDATE_INTERVAL_MS ||
            processedCount === totalFiles)
        ) {
          const progress = `  Progress: ${processedCount}/${totalFiles} files\n`;
          updateOutput(stepHeader + progress);
          lastUpdateTime = Date.now();
        }

        // Merge definitions (convert from array to Set)
        if (result.definitions) {
          for (const name of result.definitions) {
            if (!this.defines.has(name)) {
              this.defines.set(name, new Set());
            }
            this.defines.get(name)!.add(result.relPath);
            this.stats.total_definitions++;
          }
        }

        // Merge references (convert from array to Set)
        if (result.references) {
          for (const name of result.references) {
            if (!this.references.has(name)) {
              this.references.set(name, new Set());
            }
            this.references.get(name)!.add(result.relPath);
            this.stats.total_references++;
          }
        }

        // Store complexity data
        if (result.complexity) {
          this.complexityData.set(result.relPath, result.complexity);
        }

        this.stats.files_parsed++;
      }
    }

    // Calculate import counts
    for (const [symbol, refFiles] of this.references.entries()) {
      const defFiles = this.defines.get(symbol);
      if (defFiles) {
        for (const defFile of defFiles) {
          this.importCounts.set(
            defFile,
            (this.importCounts.get(defFile) || 0) + refFiles.size,
          );
        }
      }
    }
  }

  /**
   * Calculate PageRank scores for all files (async)
   */
  private async calculatePageRank(): Promise<Record<string, number>> {
    const graph = createGraph();

    // Add nodes
    for (const absPath of this.allFiles) {
      let relPath: string;
      try {
        relPath = path.relative(this.rootPath, absPath);
      } catch {
        relPath = absPath;
      }
      addNode(graph, relPath);
    }

    // Add edges
    for (const [symbol, refFiles] of this.references.entries()) {
      const defFiles = this.defines.get(symbol);
      if (defFiles) {
        for (const refFile of refFiles) {
          for (const defFile of defFiles) {
            if (refFile !== defFile) {
              addEdge(graph, refFile, defFile);
            }
          }
        }
      }
    }

    if (graph.nodes.size === 0) {
      return {};
    }

    try {
      const ranks = pagerank(graph, undefined, 0.85);
      // Normalize to 0-1 range
      const maxRank = Math.max(...Object.values(ranks));
      if (maxRank > 0) {
        for (const key in ranks) {
          ranks[key] /= maxRank;
        }
      }
      return ranks;
    } catch (error) {
      const uniformScore = 1.0 / graph.nodes.size;
      const ranks: Record<string, number> = {};
      for (const node of graph.nodes) {
        ranks[node] = uniformScore;
      }
      return ranks;
    }
  }

  /**
   * Get analysis statistics
   */
  getStatistics(): AnalysisStats {
    return {
      files_parsed: this.stats.files_parsed,
      files_skipped: this.stats.files_skipped,
      total_definitions: this.stats.total_definitions,
      total_references: this.stats.total_references,
      git_available: this.stats.git_available,
      unique_symbols_defined: this.defines.size,
      unique_symbols_referenced: this.references.size,
      parse_errors_count: this.stats.parse_errors.length,
    };
  }
}
