/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Worker for file importance analysis - Bun Web Workers 适配版本
 */

import { ImportanceAnalyzer } from './analyzer';
import type { FileScore, DEFAULT_WEIGHTS } from './types';

interface WorkerInput {
  rootPath: string;
  allFiles: string[];
  weights: typeof DEFAULT_WEIGHTS;
  concurrency?: number;
}

interface ProgressMessage {
  type: 'progress';
  message: string;
}

interface CompleteMessage {
  type: 'complete';
  fileScores: FileScore[];
  statistics: {
    files_parsed: number;
    files_skipped: number;
    total_definitions: number;
    total_references: number;
    git_available: boolean;
    unique_symbols_defined: number;
    unique_symbols_referenced: number;
    parse_errors_count: number;
  };
}

interface ErrorMessage {
  type: 'error';
  error: string;
}

/**
 * Send progress update to main thread
 */
function sendProgress(message: string) {
  self.postMessage({ type: 'progress', message } as ProgressMessage);
}

/**
 * Run the file importance analysis
 */
async function runAnalysis(input: WorkerInput): Promise<void> {
  const { rootPath, allFiles, weights, concurrency } = input;

  try {
    sendProgress(`Starting analysis of ${allFiles.length} files...`);

    // Create analyzer instance
    const analyzer = new ImportanceAnalyzer(
      rootPath,
      allFiles,
      weights,
      concurrency,
    );

    // Run analysis with progress callback
    const fileScores = await analyzer.analyzeAll(sendProgress);

    // Get statistics
    const statistics = analyzer.getStatistics();

    sendProgress('Analysis completed successfully');

    // Send completion message
    self.postMessage({
      type: 'complete',
      fileScores,
      statistics,
    } as CompleteMessage);
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    } as ErrorMessage);
  }
}

// Listen for messages from main thread
self.onmessage = async (event: MessageEvent<WorkerInput>) => {
  await runAnalysis(event.data);
};
