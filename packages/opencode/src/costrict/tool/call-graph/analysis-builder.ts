/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Analysis builder implementation
 */

import type { Graph } from './base';
import { AnalysisBuilder as BaseAnalysisBuilder } from './base';
import { CallGraphAnalyzer } from './call-graph-analyzer';

/**
 * Default analysis builder implementation
 */
export class DefaultAnalysisBuilder extends BaseAnalysisBuilder {
  private analyzer: CallGraphAnalyzer;

  constructor() {
    super();
    this.analyzer = new CallGraphAnalyzer();
  }

  /**
   * Build inheritance graph
   */
  async buildInheritanceGraph(
    files: string[],
    progressCallback?: (current: number, total: number) => void,
  ): Promise<Graph> {
    return this.analyzer.buildInheritanceGraph(files, progressCallback);
  }

  /**
   * Build call graph
   */
  async buildCallGraph(
    files: string[],
    progressCallback?: (current: number, total: number) => void,
  ): Promise<Graph> {
    return this.analyzer.buildCallGraph(files, progressCallback);
  }
}
