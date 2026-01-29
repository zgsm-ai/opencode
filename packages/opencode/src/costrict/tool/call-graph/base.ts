/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Base classes and abstractions for call graph and inheritance analysis
 */

/**
 * Universal node type enumeration
 */
export enum NodeType {
  CLASS_DEF = 'CLASS_DEF',
  FUNCTION_DEF = 'FUNCTION_DEF',
  METHOD_DEF = 'METHOD_DEF',
  CALL_EXPR = 'CALL_EXPR',
  IMPORT_STMT = 'IMPORT_STMT',
  VARIABLE_DEF = 'VARIABLE_DEF',
}

/**
 * Symbol information
 */
export interface Symbol {
  name: string; // Symbol name
  symbolType: NodeType; // Symbol type
  filePath: string; // File path
  line: number; // Line number
  scope: string; // Scope (e.g., global, ClassName, ClassName.method_name)
  parentClass?: string; // Parent class name (only for classes)
  qualifiedName: string; // Fully qualified name
}

/**
 * Context information
 */
export interface Context {
  filePath: string; // Current file path
  moduleName: string; // Module name
  currentClass?: string; // Current class name
  currentFunction?: string; // Current function name
  imports: Record<string, string>; // Import mapping {alias: full_name}
}

/**
 * Graph node
 */
export interface GraphNode {
  id: string; // Unique identifier
  name: string; // Node name
  nodeType: string; // Node type (class, function, method)
  filePath: string; // File path
  line: number; // Line number
  metadata: Record<string, unknown>; // Extra metadata
}

/**
 * Graph edge
 */
export interface GraphEdge {
  source: string; // Source node ID
  target: string; // Target node ID
  edgeType: string; // Edge type (inherits, calls)
  metadata: Record<string, unknown>; // Extra metadata
}

/**
 * Graph structure
 */
export class Graph {
  nodes: Map<string, GraphNode> = new Map();
  edges: GraphEdge[] = [];
  // For accelerated chain queries, maintain in/out edge indexes (avoid O(E) scan every time)
  private outgoingEdges: Map<string, GraphEdge[]> = new Map();
  private incomingEdges: Map<string, GraphEdge[]> = new Map();

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  addEdge(edge: GraphEdge): void {
    this.edges.push(edge);
    if (!this.outgoingEdges.has(edge.source)) {
      this.outgoingEdges.set(edge.source, []);
    }
    this.outgoingEdges.get(edge.source)!.push(edge);

    if (!this.incomingEdges.has(edge.target)) {
      this.incomingEdges.set(edge.target, []);
    }
    this.incomingEdges.get(edge.target)!.push(edge);
  }

  getNode(nodeId: string): GraphNode | undefined {
    return this.nodes.get(nodeId);
  }

  getEdgesByType(edgeType: string): GraphEdge[] {
    return this.edges.filter((e) => e.edgeType === edgeType);
  }

  getOutgoingEdges(nodeId: string): GraphEdge[] {
    return this.outgoingEdges.get(nodeId) || [];
  }

  getIncomingEdges(nodeId: string): GraphEdge[] {
    return this.incomingEdges.get(nodeId) || [];
  }
}

/**
 * Abstract syntax tree parser
 */
export abstract class CodeParser {
  /**
   * Parse source code file
   */
  abstract parse(fileContent: string, filePath: string): unknown;

  /**
   * Get supported file extensions
   */
  abstract getSupportedExtensions(): string[];
}

/**
 * Symbol resolver
 */
export abstract class SymbolResolver {
  /**
   * Register definition
   */
  abstract registerDefinition(symbol: Symbol): void;

  /**
   * Resolve reference
   */
  abstract resolve(name: string, context: Context): Symbol | undefined;

  /**
   * Get parent classes of a class
   */
  abstract getParentClasses(className: string): string[];

  /**
   * Clear symbol table
   */
  abstract clear(): void;
}

/**
 * Analysis builder
 */
export abstract class AnalysisBuilder {
  /**
   * Build inheritance graph
   */
  abstract buildInheritanceGraph(
    files: string[],
    progressCallback?: (current: number, total: number) => void,
  ): Promise<Graph>;

  /**
   * Build call graph
   */
  abstract buildCallGraph(
    files: string[],
    progressCallback?: (current: number, total: number) => void,
  ): Promise<Graph>;
}
