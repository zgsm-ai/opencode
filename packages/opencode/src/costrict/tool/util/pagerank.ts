/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PageRank algorithm implementation for RepoMap
 */

/** Directed graph represented as adjacency list */
export interface MultiDiGraph {
  /** Map from node to array of outgoing edges (target nodes) */
  edges: Map<string, string[]>;
  /** All nodes in the graph */
  nodes: Set<string>;
}

/**
 * Create an empty MultiDiGraph
 */
export function createGraph(): MultiDiGraph {
  return {
    edges: new Map(),
    nodes: new Set(),
  };
}

/**
 * Add a node to the graph
 */
export function addNode(graph: MultiDiGraph, node: string): void {
  graph.nodes.add(node);
  if (!graph.edges.has(node)) {
    graph.edges.set(node, []);
  }
}

/**
 * Add an edge to the graph
 */
export function addEdge(
  graph: MultiDiGraph,
  source: string,
  target: string,
): void {
  addNode(graph, source);
  addNode(graph, target);

  const edges = graph.edges.get(source) || [];
  edges.push(target);
  graph.edges.set(source, edges);
}

/**
 * Get the number of edges in the graph
 */
export function getEdgeCount(graph: MultiDiGraph): number {
  let count = 0;
  for (const edges of graph.edges.values()) {
    count += edges.length;
  }
  return count;
}

/**
 * PageRank algorithm implementation
 *
 * @param graph - The directed graph
 * @param personalization - Optional personalization weights for nodes
 * @param alpha - Damping factor (default: 0.85)
 * @param maxIterations - Maximum iterations (default: 100)
 * @param tolerance - Convergence tolerance (default: 1e-6)
 * @returns Map of node to PageRank score
 */
export function pagerank(
  graph: MultiDiGraph,
  personalization?: Record<string, number>,
  alpha = 0.85,
  maxIterations = 100,
  tolerance = 1e-6,
): Record<string, number> {
  const nodes = Array.from(graph.nodes);
  const nodeCount = nodes.length;

  if (nodeCount === 0) {
    return {};
  }

  // Initialize ranks
  const ranks: Record<string, number> = {};
  const newRanks: Record<string, number> = {};

  // Initialize personalization vector
  const personalVector: Record<string, number> = {};
  let personalSum = 0;

  if (personalization) {
    for (const node of nodes) {
      const weight = personalization[node] || 0;
      personalVector[node] = weight;
      personalSum += weight;
    }

    // Normalize personalization vector
    if (personalSum > 0) {
      for (const node of nodes) {
        personalVector[node] /= personalSum;
      }
    } else {
      // Fallback to uniform distribution
      for (const node of nodes) {
        personalVector[node] = 1 / nodeCount;
      }
    }
  } else {
    // Uniform personalization
    for (const node of nodes) {
      personalVector[node] = 1 / nodeCount;
    }
  }

  // Initialize ranks to personalization vector
  for (const node of nodes) {
    ranks[node] = personalVector[node];
  }

  // Power iteration
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Initialize new ranks with teleportation probability
    for (const node of nodes) {
      newRanks[node] = (1 - alpha) * personalVector[node];
    }

    // Distribute rank from each node
    for (const node of nodes) {
      const outEdges = graph.edges.get(node) || [];
      const outDegree = outEdges.length;

      if (outDegree > 0) {
        const rankContribution = (alpha * ranks[node]) / outDegree;
        for (const target of outEdges) {
          newRanks[target] += rankContribution;
        }
      } else {
        // Dangling node: distribute rank equally (teleport)
        const danglingContribution = (alpha * ranks[node]) / nodeCount;
        for (const target of nodes) {
          newRanks[target] += danglingContribution;
        }
      }
    }

    // Check convergence
    let diff = 0;
    for (const node of nodes) {
      diff += Math.abs(newRanks[node] - ranks[node]);
    }

    // Copy new ranks to ranks
    for (const node of nodes) {
      ranks[node] = newRanks[node];
    }

    if (diff < tolerance) {
      break;
    }
  }

  return ranks;
}
