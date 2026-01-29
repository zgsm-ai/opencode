/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Git history analysis utilities for importance analysis
 */

import { execSync } from 'child_process';
import * as path from 'path';

/**
 * GitAnalyzer handles git history analysis for file importance
 */
export class GitAnalyzer {
  private gitCommitCounts: Map<string, number> = new Map();
  private gitLastModified: Map<string, number> = new Map();
  private gitRoot: string | null = null;
  private gitAvailable = false;

  constructor(private rootPath: string) {
    this.checkGitAvailable();
  }

  /**
   * Check if git is available in the repository
   */
  private checkGitAvailable(): void {
    try {
      execSync('git rev-parse --git-dir', {
        cwd: this.rootPath,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      this.gitAvailable = true;

      // Get git root
      try {
        const gitRootOutput = execSync('git rev-parse --show-toplevel', {
          cwd: this.rootPath,
          encoding: 'utf-8',
          stdio: 'pipe',
        });
        this.gitRoot = gitRootOutput.trim();
      } catch (error) {
        // Failed to get git root
      }
    } catch (error) {
      this.gitAvailable = false;
    }
  }

  /**
   * Batch fetch git history for all files at once
   */
  batchFetchGitHistory(): void {
    if (!this.gitAvailable) {
      return;
    }

    try {
      const gitDir = this.gitRoot || this.rootPath;
      const output = execSync(
        'git log --format="COMMIT_MARKER %at" --name-only --since="12 months ago"',
        {
          cwd: gitDir,
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 60000,
        },
      );

      const lines = output.split('\n');
      let currentTimestamp: number | null = null;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        if (trimmed.startsWith('COMMIT_MARKER ')) {
          try {
            currentTimestamp = parseInt(trimmed.split(' ')[1], 10);
          } catch {
            currentTimestamp = null;
          }
        } else if (currentTimestamp !== null) {
          // This is a file path from git (always uses forward slashes)
          const relPath = trimmed.replace(/\\/g, '/');

          // Increment commit count
          this.gitCommitCounts.set(
            relPath,
            (this.gitCommitCounts.get(relPath) || 0) + 1,
          );

          // Track last modified time (first occurrence is the most recent)
          if (!this.gitLastModified.has(relPath)) {
            this.gitLastModified.set(relPath, currentTimestamp);
          }
        }
      }
    } catch (error) {
      // Failed to fetch git history
    }
  }

  /**
   * Calculate Git history importance score (0-1)
   */
  calculateGitHistoryScore(absPath: string): number {
    if (!this.gitAvailable) {
      return 0.0;
    }

    try {
      const gitBase = this.gitRoot || this.rootPath;
      let relPath = path.relative(gitBase, absPath);
      // Normalize to forward slashes
      relPath = relPath.replace(/\\/g, '/');

      const commitCount = this.gitCommitCounts.get(relPath) || 0;
      const lastCommitTime = this.gitLastModified.get(relPath);

      // Use percentile-based normalization for commit count score
      const commitScore = this.getCommitPercentileScore(commitCount) * 0.7;

      // Calculate recency score
      let recencyScore = 0.0;
      if (lastCommitTime !== undefined) {
        recencyScore = this.getRecencyPercentileScore(lastCommitTime) * 0.3;
      }

      return Math.min(commitScore + recencyScore, 1.0);
    } catch {
      return 0.0;
    }
  }

  /**
   * Calculate commit count score based on percentile ranking
   */
  private getCommitPercentileScore(commitCount: number): number {
    if (this.gitCommitCounts.size === 0) {
      return 0.0;
    }

    const allCounts = Array.from(this.gitCommitCounts.values()).sort(
      (a, b) => a - b,
    );
    const filesBelow = allCounts.filter((c) => c < commitCount).length;
    const filesEqual = allCounts.filter((c) => c === commitCount).length;

    const totalFiles = allCounts.length;
    const percentile = (filesBelow + filesEqual / 2) / totalFiles;

    return percentile;
  }

  /**
   * Calculate recency score based on percentile ranking
   */
  private getRecencyPercentileScore(lastCommitTime: number): number {
    if (this.gitLastModified.size === 0) {
      return 0.0;
    }

    const allTimes = Array.from(this.gitLastModified.values()).sort(
      (a, b) => a - b,
    );
    const filesBelow = allTimes.filter((t) => t < lastCommitTime).length;
    const filesEqual = allTimes.filter((t) => t === lastCommitTime).length;

    const totalFiles = allTimes.length;
    const percentile = (filesBelow + filesEqual / 2) / totalFiles;

    return percentile;
  }

  /**
   * Check if git is available
   */
  isGitAvailable(): boolean {
    return this.gitAvailable;
  }

  /**
   * Get the number of files with git commit data
   */
  getCommitCountsSize(): number {
    return this.gitCommitCounts.size;
  }
}
