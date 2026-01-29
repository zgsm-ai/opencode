/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Call chain and inheritance chain analyzer
 */

import type { Graph } from './base';
import type { GraphNode } from './base';

interface ChainNode {
  depth: number;
  path: string;
  id: string;
  name: string;
  file: string;
  line: number;
}

export interface CallChainResult {
  found: boolean;
  target: string;
  matches: Array<{
    targetId: string;
    targetName: string;
    targetType: string;
    filePath: string;
    line: number;
    callers?: Record<number, ChainNode[]>;
    callees?: Record<number, ChainNode[]>;
  }>;
}

export interface InheritanceChainResult {
  found: boolean;
  target: string;
  matches: Array<{
    targetId: string;
    targetName: string;
    targetType: string;
    filePath: string;
    line: number;
    parents?: Array<{
      depth: number;
      id: string;
      name: string;
      file: string;
      line: number;
    }>;
    children?: Array<{
      depth: number;
      id: string;
      name: string;
      file: string;
      line: number;
    }>;
  }>;
}

/**
 * Analyze call chains and inheritance chains
 */
export class ChainAnalyzer {
  constructor(private graph: Graph) {}

  /**
   * Find nodes by name
   */
  findNodeByName(name: string, exactMatch = false): GraphNode[] {
    const matches: GraphNode[] = [];

    for (const [nodeId, node] of this.graph.nodes) {
      // Exact match ID
      if (nodeId === name) {
        matches.push(node);
      }
      // Exact match simple name
      else if (node.name === name) {
        matches.push(node);
      }
      // Partial match (only in non-exact mode)
      else if (!exactMatch && nodeId.includes(name)) {
        matches.push(node);
      }
    }

    return matches;
  }

  /**
   * Get all callers of a target function (BFS multi-level search)
   */
  getCallers(
    targetNodeId: string,
    maxDepth = 3,
  ): Array<{ depth: number; path: string; node: GraphNode }> {
    const callers: Array<{ depth: number; path: string; node: GraphNode }> = [];
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number; path: string[] }> = [
      { id: targetNodeId, depth: 0, path: [targetNodeId] },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (visited.has(current.id) || current.depth > maxDepth) {
        continue;
      }

      visited.add(current.id);

      // Find all edges pointing to current.id
      const incomingEdges = this.graph.getIncomingEdges(current.id);

      for (const edge of incomingEdges) {
        if (edge.edgeType === 'calls') {
          const callerNode = this.graph.getNode(edge.source);
          if (callerNode && !current.path.includes(edge.source)) {
            const newPath = [edge.source, ...current.path];
            callers.push({
              depth: current.depth + 1,
              path: newPath.join(' → '),
              node: callerNode,
            });

            if (current.depth < maxDepth) {
              queue.push({
                id: edge.source,
                depth: current.depth + 1,
                path: newPath,
              });
            }
          }
        }
      }
    }

    return callers;
  }

  /**
   * Get all callees of a target function (BFS multi-level search)
   */
  getCallees(
    targetNodeId: string,
    maxDepth = 3,
  ): Array<{ depth: number; path: string; node: GraphNode }> {
    const callees: Array<{ depth: number; path: string; node: GraphNode }> = [];
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number; path: string[] }> = [
      { id: targetNodeId, depth: 0, path: [targetNodeId] },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (visited.has(current.id) || current.depth > maxDepth) {
        continue;
      }

      visited.add(current.id);

      // Find all edges from current.id
      const outgoingEdges = this.graph.getOutgoingEdges(current.id);

      for (const edge of outgoingEdges) {
        if (edge.edgeType === 'calls') {
          const calleeNode = this.graph.getNode(edge.target);
          if (calleeNode && !current.path.includes(edge.target)) {
            const newPath = [...current.path, edge.target];
            callees.push({
              depth: current.depth + 1,
              path: newPath.join(' → '),
              node: calleeNode,
            });

            if (current.depth < maxDepth) {
              queue.push({
                id: edge.target,
                depth: current.depth + 1,
                path: newPath,
              });
            }
          }
        }
      }
    }

    return callees;
  }

  /**
   * Get complete call chain
   */
  getCallChain(
    targetName: string,
    maxDepth = 3,
    direction: 'callers' | 'callees' | 'both' = 'both',
    exactMatch = false,
    progressCallback?: (message: string) => void,
  ): CallChainResult {
    // Find target nodes
    if (progressCallback) {
      progressCallback(`Searching for target: ${targetName}`);
    }
    const targetNodes = this.findNodeByName(targetName, exactMatch);

    if (targetNodes.length === 0) {
      if (progressCallback) {
        progressCallback(`No matches found for: ${targetName}`);
      }
      return {
        found: false,
        target: targetName,
        matches: [],
      };
    }

    if (progressCallback) {
      progressCallback(
        `Found ${targetNodes.length} match(es) for: ${targetName}`,
      );
    }

    const results: CallChainResult['matches'] = [];

    for (let i = 0; i < targetNodes.length; i++) {
      const targetNode = targetNodes[i];
      if (progressCallback) {
        progressCallback(
          `Analyzing match ${i + 1}/${targetNodes.length}: ${targetNode.id}`,
        );
      }

      const result: CallChainResult['matches'][0] = {
        targetId: targetNode.id,
        targetName: targetNode.name,
        targetType: targetNode.nodeType,
        filePath: targetNode.filePath,
        line: targetNode.line,
      };

      if (direction === 'callers' || direction === 'both') {
        if (progressCallback) {
          progressCallback(`Finding callers for ${targetNode.id}...`);
        }
        const callers = this.getCallers(targetNode.id, maxDepth);
        result.callers = this.organizeChainByDepth(callers);
      }

      if (direction === 'callees' || direction === 'both') {
        if (progressCallback) {
          progressCallback(`Finding callees for ${targetNode.id}...`);
        }
        const callees = this.getCallees(targetNode.id, maxDepth);
        result.callees = this.organizeChainByDepth(callees);
      }

      results.push(result);
    }

    if (progressCallback) {
      progressCallback('Call chain analysis completed');
    }

    return {
      found: true,
      target: targetName,
      matches: results,
    };
  }

  /**
   * Get parent classes of a class (recursive upward)
   */
  getParentClasses(
    targetNodeId: string,
  ): Array<{ depth: number; node: GraphNode }> {
    const parents: Array<{ depth: number; node: GraphNode }> = [];
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [
      { id: targetNodeId, depth: 0 },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (visited.has(current.id)) {
        continue;
      }

      visited.add(current.id);

      // Find all outgoing inheritance edges from current.id
      const outgoingEdges = this.graph.getOutgoingEdges(current.id);

      for (const edge of outgoingEdges) {
        if (edge.edgeType === 'inherits') {
          const parentNode = this.graph.getNode(edge.target);
          if (parentNode) {
            parents.push({
              depth: current.depth + 1,
              node: parentNode,
            });
            queue.push({
              id: edge.target,
              depth: current.depth + 1,
            });
          }
        }
      }
    }

    return parents;
  }

  /**
   * Get child classes of a class (recursive downward)
   */
  getChildClasses(
    targetNodeId: string,
  ): Array<{ depth: number; node: GraphNode }> {
    const children: Array<{ depth: number; node: GraphNode }> = [];
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [
      { id: targetNodeId, depth: 0 },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (visited.has(current.id)) {
        continue;
      }

      visited.add(current.id);

      // Find all incoming inheritance edges to current.id
      const incomingEdges = this.graph.getIncomingEdges(current.id);

      for (const edge of incomingEdges) {
        if (edge.edgeType === 'inherits') {
          const childNode = this.graph.getNode(edge.source);
          if (childNode) {
            children.push({
              depth: current.depth + 1,
              node: childNode,
            });
            queue.push({
              id: edge.source,
              depth: current.depth + 1,
            });
          }
        }
      }
    }

    return children;
  }

  /**
   * Get complete inheritance chain
   */
  getInheritanceChain(
    targetName: string,
    direction: 'parents' | 'children' | 'both' = 'both',
    exactMatch = false,
    progressCallback?: (message: string) => void,
  ): InheritanceChainResult {
    // Find target nodes
    if (progressCallback) {
      progressCallback(`Searching for target class: ${targetName}`);
    }
    const targetNodes = this.findNodeByName(targetName, exactMatch);

    if (targetNodes.length === 0) {
      if (progressCallback) {
        progressCallback(`No matches found for: ${targetName}`);
      }
      return {
        found: false,
        target: targetName,
        matches: [],
      };
    }

    if (progressCallback) {
      progressCallback(
        `Found ${targetNodes.length} match(es) for: ${targetName}`,
      );
    }

    const results: InheritanceChainResult['matches'] = [];

    for (let i = 0; i < targetNodes.length; i++) {
      const targetNode = targetNodes[i];
      if (progressCallback) {
        progressCallback(
          `Analyzing match ${i + 1}/${targetNodes.length}: ${targetNode.id}`,
        );
      }

      const result: InheritanceChainResult['matches'][0] = {
        targetId: targetNode.id,
        targetName: targetNode.name,
        targetType: targetNode.nodeType,
        filePath: targetNode.filePath,
        line: targetNode.line,
      };

      if (direction === 'parents' || direction === 'both') {
        if (progressCallback) {
          progressCallback(`Finding parent classes for ${targetNode.id}...`);
        }
        const parents = this.getParentClasses(targetNode.id);
        result.parents = parents.map(({ depth, node }) => ({
          depth,
          id: node.id,
          name: node.name,
          file: node.filePath,
          line: node.line,
        }));
      }

      if (direction === 'children' || direction === 'both') {
        if (progressCallback) {
          progressCallback(`Finding child classes for ${targetNode.id}...`);
        }
        const children = this.getChildClasses(targetNode.id);
        result.children = children.map(({ depth, node }) => ({
          depth,
          id: node.id,
          name: node.name,
          file: node.filePath,
          line: node.line,
        }));
      }

      results.push(result);
    }

    if (progressCallback) {
      progressCallback('Inheritance chain analysis completed');
    }

    return {
      found: true,
      target: targetName,
      matches: results,
    };
  }

  /**
   * Organize chain by depth
   */
  private organizeChainByDepth(
    chain: Array<{ depth: number; path: string; node: GraphNode }>,
  ): Record<number, ChainNode[]> {
    const organized: Record<number, ChainNode[]> = {};

    for (const { depth, path, node } of chain) {
      if (!organized[depth]) {
        organized[depth] = [];
      }

      organized[depth].push({
        depth,
        path,
        id: node.id,
        name: node.name,
        file: node.filePath,
        line: node.line,
      });
    }

    return organized;
  }
}
