/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Call graph analysis module exports
 */

export { Graph, NodeType } from './base';
export type { GraphNode, GraphEdge, Symbol, Context } from './base';
export { DefaultSymbolResolver } from './symbol-resolver';
export { CallGraphAnalyzer } from './call-graph-analyzer';
export { ChainAnalyzer } from './chain-analyzer';
export type { CallChainResult, InheritanceChainResult } from './chain-analyzer';
export { DefaultAnalysisBuilder } from './analysis-builder';
export { TreeSitterParser, getParser } from './parser';
export type { SyntaxNode } from './parser';
