/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Worker for call graph analysis - Bun Web Workers 适配版本
 */

import { DefaultAnalysisBuilder } from './analysis-builder';
import { ChainAnalyzer } from './chain-analyzer';
import type {
  CallChainResult,
  InheritanceChainResult,
} from './chain-analyzer';

interface WorkerInput {
  analysisType: 'call_chain' | 'inheritance_chain';
  files: string[];
  targetName: string;
  chainDirection: 'callers' | 'callees' | 'both' | 'parents' | 'children';
  chainDepth: number;
  exactMatch: boolean;
}

interface ProgressMessage {
  type: 'progress';
  message: string;
}

interface CompleteMessage {
  type: 'complete';
  result: CallChainResult | InheritanceChainResult;
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
 * Run the call graph analysis
 */
async function runAnalysis(input: WorkerInput): Promise<void> {
  const {
    analysisType,
    files,
    targetName,
    chainDirection,
    chainDepth,
    exactMatch,
  } = input;

  try {
    const builder = new DefaultAnalysisBuilder();

    if (analysisType === 'call_chain') {
      // Build call graph
      sendProgress(`Analyzing ${files.length} files for call chains...`);

      const callGraph = await builder.buildCallGraph(
        files,
        (current, total) => {
          sendProgress(`Parsing files: ${current}/${total}`);
        },
      );

      sendProgress('Building call graph completed. Analyzing call chains...');

      // Analyze call chains
      const analyzer = new ChainAnalyzer(callGraph);
      const result = analyzer.getCallChain(
        targetName,
        chainDepth,
        chainDirection as 'callers' | 'callees' | 'both',
        exactMatch,
        (message) => sendProgress(message),
      );

      sendProgress('Call chain analysis completed.');

      // Send completion message
      self.postMessage({
        type: 'complete',
        result,
      } as CompleteMessage);
    } else {
      // Build inheritance graph
      sendProgress(`Analyzing ${files.length} files for inheritance chains...`);

      const inheritanceGraph = await builder.buildInheritanceGraph(
        files,
        (current, total) => {
          sendProgress(`Parsing files: ${current}/${total}`);
        },
      );

      sendProgress(
        'Building inheritance graph completed. Analyzing inheritance chains...',
      );

      // Analyze inheritance chains
      const analyzer = new ChainAnalyzer(inheritanceGraph);
      const result = analyzer.getInheritanceChain(
        targetName,
        chainDirection as 'parents' | 'children' | 'both',
        exactMatch,
        (message) => sendProgress(message),
      );

      sendProgress('Inheritance chain analysis completed.');

      // Send completion message
      self.postMessage({
        type: 'complete',
        result,
      } as CompleteMessage);
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: `Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
    } as ErrorMessage);
  }
}

/**
 * Listen for messages from main thread
 */
self.onmessage = async (event: MessageEvent<WorkerInput>) => {
  const input = event.data;

  try {
    await runAnalysis(input);
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: `Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
    } as ErrorMessage);
  }
};

