/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Type definitions and constants for file importance analysis
 */

/**
 * Default weights for each dimension
 */
export const DEFAULT_WEIGHTS = {
  pagerank: 2.0, // Dependency graph importance (PageRank)
  usage: 2.0, // Usage frequency
  complexity: 1.0, // Code complexity
  semantic: 1.5, // Semantic importance
  git_history: 4.0, // Git history
  size: 0.0, // Code size, currently set to 0
};

/**
 * Important semantic keywords (language-agnostic)
 */
export const IMPORTANT_KEYWORDS = [
  // Core architecture
  'main',
  'core',
  'engine',
  'api',
  'service',
  'controller',
  'manager',
  'handler',
  'processor',
  'factory',
  'builder',
  'provider',
  'repository',
  'executor',
  'scheduler',
  'config',
  'security',
  'auth',
  'base',
  'model',
  'schema',
  'router',
  'middleware',
  'plugin',
  'extension',
  'util',
  'helper',
  // Additional cross-language keywords
  'server',
  'client',
  'gateway',
  'proxy',
  'adapter',
  'decorator',
  'interface',
  'abstract',
  'impl',
  'implementation',
  'module',
  'component',
  'container',
  'context',
  'registry',
  'listener',
  'dispatcher',
  'resolver',
  'validator',
  'converter',
  'mapper',
  'entity',
  'domain',
  'dto',
  'vo',
  'dao',
  'store',
  'reducer',
  'action',
  'mutation',
  'state',
  'hook',
  'composable',
  'mixin',
];

/**
 * Important file names (cross-language)
 */
export const IMPORTANT_FILENAMES = [
  // TypeScript/JavaScript
  'index',
  'main',
  'app',
  'application',
  'server',
  'bootstrap',
  'startup',
  'program',
  'entry',
  'init',
  'launcher',
  // Configuration
  'settings',
  'config',
  'constants',
  'types',
  'models',
  'schema',
  'router',
  'views',
  'urls',
  'admin',
  'routes',
  // React/Vue/etc
  'App',
  'Index',
  'store',
  'reducer',
  'actions',
];

/**
 * Build and config files (language-specific, high importance)
 */
export const BUILD_CONFIG_FILES = new Set([
  // JavaScript/TypeScript
  'package.json',
  'tsconfig.json',
  'webpack.config.js',
  'vite.config.ts',
  'vite.config.js',
  'rollup.config.js',
  'babel.config.js',
  '.babelrc',
  'next.config.js',
  'nuxt.config.js',
  'vue.config.js',
  'angular.json',
  'jest.config.js',
  'vitest.config.ts',
  'eslint.config.js',
  '.eslintrc.js',
]);

/**
 * Language-specific entry point patterns
 */
export const LANGUAGE_ENTRY_POINTS: Record<string, string[]> = {
  '.ts': ['index', 'main', 'app', 'server', 'entry'],
  '.js': ['index', 'main', 'app', 'server', 'entry'],
  '.tsx': ['index', 'App', 'main'],
  '.jsx': ['index', 'App', 'main'],
};

/**
 * Parameters for the FileImportance tool
 */
export interface FileImportanceToolParams {
  /**
   * Directory path to analyze (absolute path)
   */
  directory: string;

  /**
   * Custom weights for each dimension
   */
  weights?: {
    pagerank?: number;
    usage?: number;
    complexity?: number;
    semantic?: number;
    git_history?: number;
    size?: number;
  };

  /**
   * Return only top N files by importance
   */
  top_n?: number;

  /**
   * Include detailed breakdown of scores for each dimension
   */
  include_details?: boolean;

  /**
   * Include additional statistics in output
   */
  verbose?: boolean;
}

/**
 * Score breakdown for a single file
 */
export interface FileScore {
  file: string;
  absolute_path: string;

  // Individual dimension scores (0.0 - 1.0)
  pagerank_score: number;
  usage_score: number;
  complexity_score: number;
  semantic_score: number;
  git_history_score: number;
  size_score: number;

  // Weighted total score
  total_score: number;

  // Additional metadata
  metadata?: {
    lines_of_code?: number;
    imports_count?: number;
  };
}

/**
 * Complexity data from AST analysis
 */
export interface ComplexityData {
  branch_count: number;
  max_depth: number;
}

/**
 * Result from worker file parsing
 */
export interface WorkerFileResult {
  absPath: string;
  relPath: string;
  content: string | null;
  skipped: boolean;
  definitions?: string[];
  references?: string[];
  complexity?: ComplexityData;
  error?: string;
}

/**
 * Statistics for the analysis
 */
export interface AnalysisStats {
  files_parsed: number;
  files_skipped: number;
  total_definitions: number;
  total_references: number;
  git_available: boolean;
  unique_symbols_defined: number;
  unique_symbols_referenced: number;
  parse_errors_count: number;
}

/**
 * Folder importance data
 */
export interface FolderImportance {
  folder: string;
  absolute_path: string;
  total_score: number;
  avg_score: number;
  normalized_score: number;
  percentile: number;
  rank: number;
  file_count: number;
}

/**
 * File importance result
 */
export interface FileImportanceResult {
  file: string;
  absolute_path: string;
  total_score: number;
  normalized_score: number;
  percentile: number;
  rank: number;
  dimension_scores?: {
    pagerank: number;
    usage: number;
    complexity: number;
    semantic: number;
    git_history: number;
    size: number;
  };
  metadata?: {
    lines_of_code?: number;
    imports_count?: number;
  };
}

/**
 * Output result
 */
export interface OutputResult {
  directory: string;
  total_files_analyzed: number;
  files_with_rank: number;
  folders_with_rank: number;
  weights_used: typeof DEFAULT_WEIGHTS;
  file_importance: FileImportanceResult[];
  folder_importance: FolderImportance[];
  statistics?: AnalysisStats;
}
