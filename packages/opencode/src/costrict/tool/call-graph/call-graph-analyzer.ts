/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Call graph and inheritance analyzer - Bun适配版本（简化版）
 */

import { readFile } from 'fs/promises';
import { Graph, NodeType } from './base';
import type { GraphNode, GraphEdge, Symbol, Context } from './base';
import { getParser } from './parser';
import type { SyntaxNode, TreeSitterParser } from './parser';
import { DefaultSymbolResolver } from './symbol-resolver';

/**
 * Call graph and inheritance analyzer
 */
export class CallGraphAnalyzer {
  private parser: TreeSitterParser;
  private resolver: DefaultSymbolResolver;
  private readonly maxConcurrency: number = 10;

  constructor() {
    this.parser = getParser();
    this.resolver = new DefaultSymbolResolver();
  }

  /**
   * Process files in batches to limit concurrency
   */
  private async processBatch<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += this.maxConcurrency) {
      batches.push(items.slice(i, i + this.maxConcurrency));
    }

    const results: R[] = [];
    for (const batch of batches) {
      const batchResults = await Promise.all(batch.map(processor));
      results.push(...batchResults);
    }
    return results;
  }

  /**
   * Analyze a single file and extract symbols (simplified version)
   */
  async analyzeFile(filePath: string): Promise<boolean> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const language = this.parser.getLanguageForFile(filePath);
      if (!language) {
        return false;
      }

      const astRoot = await this.parser.parse(content, filePath);
      if (!astRoot) {
        return false;
      }

      // Extract symbols from AST
      this.extractSymbolsFromNode(astRoot, content, filePath, language);
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Extract symbols from AST node
   */
  private extractSymbolsFromNode(
    node: SyntaxNode,
    content: string,
    filePath: string,
    language: string,
    currentClass?: string,
  ): void {
    // Handle class definitions
    if (this.isClassNode(node, language)) {
      const className = this.getNodeName(node, language, content);
      if (className) {
        const parentClass = this.extractParentClass(node, language, content);
        const symbol: Symbol = {
          name: className,
          symbolType: NodeType.CLASS_DEF,
          filePath,
          line: node.startPosition.row + 1,
          scope: 'global',
          qualifiedName: className,
          parentClass,
        };
        this.resolver.registerDefinition(symbol);

        // Recurse into class body
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child) {
            this.extractSymbolsFromNode(child, content, filePath, language, className);
          }
        }
        return;
      }
    }

    // Handle function/method definitions
    if (this.isFunctionNode(node, language)) {
      const funcName = this.getNodeName(node, language, content);
      if (funcName) {
        const symbol: Symbol = {
          name: funcName,
          symbolType: currentClass ? NodeType.METHOD_DEF : NodeType.FUNCTION_DEF,
          filePath,
          line: node.startPosition.row + 1,
          scope: currentClass || 'global',
          qualifiedName: currentClass ? `${currentClass}.${funcName}` : funcName,
        };
        this.resolver.registerDefinition(symbol);
      }
    }

    // Recurse into children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.extractSymbolsFromNode(child, content, filePath, language, currentClass);
      }
    }
  }

  /**
   * Extract parent class from class definition
   */
  private extractParentClass(node: SyntaxNode, language: string, content: string): string | undefined {
    // Python: class ClassName(ParentClass):
    if (language === 'python') {
      const argList = node.childForFieldName('superclasses');
      if (argList) {
        const text = this.getNodeText(argList, content);
        return text.replace(/[()]/g, '').trim();
      }
    }

    // Java/TypeScript: class ClassName extends ParentClass
    if (language === 'java' || language === 'typescript' || language === 'javascript') {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && child.type === 'extends_clause') {
          for (let j = 0; j < child.childCount; j++) {
            const grandchild = child.child(j);
            if (grandchild && grandchild.type === 'type_identifier') {
              return this.getNodeText(grandchild, content);
            }
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Build inheritance graph
   */
  async buildInheritanceGraph(
    files: string[],
    progressCallback?: (current: number, total: number) => void,
  ): Promise<Graph> {
    this.resolver.clear();
    const graph = new Graph();

    // Phase 1: Extract all class definitions
    let processedCount = 0;
    await this.processBatch(files, async (filePath) => {
      const result = await this.analyzeFile(filePath);
      processedCount++;
      if (progressCallback) {
        progressCallback(processedCount, files.length);
      }
      return result;
    });

    // Phase 2: Build graph nodes
    const classes = this.resolver.getAllClasses();
    for (const classSymbol of classes) {
      const node: GraphNode = {
        id: classSymbol.qualifiedName,
        name: classSymbol.name,
        nodeType: 'class',
        filePath: classSymbol.filePath,
        line: classSymbol.line,
        metadata: { scope: classSymbol.scope },
      };
      graph.addNode(node);
    }

    // Phase 3: Add inheritance edges
    for (const classSymbol of classes) {
      if (classSymbol.parentClass) {
        const parentClasses = classSymbol.parentClass
          .split(',')
          .map((p) => p.trim());

        for (const parentClass of parentClasses) {
          const context: Context = {
            filePath: classSymbol.filePath,
            moduleName: '',
            imports: {},
          };
          const parentSymbol = this.resolver.resolve(parentClass, context);

          if (parentSymbol && parentSymbol.symbolType === NodeType.CLASS_DEF) {
            const edge: GraphEdge = {
              source: classSymbol.qualifiedName,
              target: parentSymbol.qualifiedName,
              edgeType: 'inherits',
              metadata: {},
            };
            graph.addEdge(edge);
          }
        }
      }
    }

    return graph;
  }

  /**
   * Build call graph
   */
  async buildCallGraph(
    files: string[],
    progressCallback?: (current: number, total: number) => void,
  ): Promise<Graph> {
    this.resolver.clear();
    const graph = new Graph();

    // Phase 1: Extract all function/method definitions
    let processedCount = 0;
    await this.processBatch(files, async (filePath) => {
      const result = await this.analyzeFile(filePath);
      processedCount++;
      if (progressCallback) {
        progressCallback(processedCount, files.length);
      }
      return result;
    });

    // Phase 2: Build graph nodes
    const functions = this.resolver.getAllFunctions();
    for (const funcSymbol of functions) {
      const node: GraphNode = {
        id: funcSymbol.qualifiedName,
        name: funcSymbol.name,
        nodeType:
          funcSymbol.symbolType === NodeType.METHOD_DEF ? 'method' : 'function',
        filePath: funcSymbol.filePath,
        line: funcSymbol.line,
        metadata: { scope: funcSymbol.scope },
      };
      graph.addNode(node);
    }

    // Phase 3: Extract call edges
    const edgeCollections = await this.processBatch(files, (filePath) =>
      this.collectCallEdgesFromFile(filePath),
    );

    // Phase 4: Add collected edges to graph
    for (const edges of edgeCollections) {
      for (const edge of edges) {
        if (graph.getNode(edge.source) && graph.getNode(edge.target)) {
          graph.addEdge(edge);
        }
      }
    }

    return graph;
  }

  /**
   * Collect call edges from a file
   */
  private async collectCallEdgesFromFile(
    filePath: string,
  ): Promise<GraphEdge[]> {
    const edges: GraphEdge[] = [];

    try {
      const content = await readFile(filePath, 'utf-8');
      const language = this.parser.getLanguageForFile(filePath);
      if (!language) {
        return edges;
      }

      const astRoot = await this.parser.parse(content, filePath);
      if (!astRoot) {
        return edges;
      }

      const context: Context = {
        filePath,
        moduleName: '',
        imports: {},
      };

      this.collectCallsFromNodeToList(
        astRoot,
        context,
        edges,
        language,
        content,
      );
    } catch (_error) {
      // Skip files that can't be parsed
    }

    return edges;
  }

  /**
   * Collect call edges from AST node into a list
   */
  private collectCallsFromNodeToList(
    node: SyntaxNode,
    context: Context,
    edges: GraphEdge[],
    language: string,
    content: string,
  ): void {
    // Update context when entering classes or functions
    if (this.isClassNode(node, language)) {
      const className = this.getNodeName(node, language, content);
      if (className) {
        const newContext: Context = {
          ...context,
          currentClass: className,
        };
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child) {
            this.collectCallsFromNodeToList(
              child,
              newContext,
              edges,
              language,
              content,
            );
          }
        }
        return;
      }
    }

    if (this.isFunctionNode(node, language)) {
      const funcName = this.getNodeName(node, language, content);
      if (funcName) {
        const newContext: Context = {
          ...context,
          currentFunction: funcName,
        };
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child) {
            this.collectCallsFromNodeToList(
              child,
              newContext,
              edges,
              language,
              content,
            );
          }
        }
        return;
      }
    }

    // Detect call expressions
    if (this.isCallExpression(node, language)) {
      const calleeName = this.getCallTarget(node, language, content);
      if (calleeName && context.currentFunction) {
        const calleeSymbol = this.resolver.resolve(calleeName, context);

        const callerQualifiedName = context.currentClass
          ? `${context.currentClass}.${context.currentFunction}`
          : context.currentFunction;

        if (calleeSymbol) {
          edges.push({
            source: callerQualifiedName,
            target: calleeSymbol.qualifiedName,
            edgeType: 'calls',
            metadata: {},
          });
        }
      }
    }

    // Recurse into child nodes
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.collectCallsFromNodeToList(
          child,
          context,
          edges,
          language,
          content,
        );
      }
    }
  }

  /**
   * Check if node is a class node
   */
  private isClassNode(node: SyntaxNode, language: string): boolean {
    switch (language) {
      case 'python':
        return node.type === 'class_definition';
      case 'java':
        return node.type === 'class_declaration';
      case 'javascript':
      case 'typescript':
        return node.type === 'class_declaration';
      case 'cpp':
        return node.type === 'class_specifier';
      case 'go':
        return node.type === 'type_spec';
      default:
        return false;
    }
  }

  /**
   * Check if node is a function node
   */
  private isFunctionNode(node: SyntaxNode, language: string): boolean {
    switch (language) {
      case 'python':
        return node.type === 'function_definition';
      case 'java':
        return node.type === 'method_declaration';
      case 'javascript':
      case 'typescript':
        return (
          node.type === 'function_declaration' ||
          node.type === 'method_definition' ||
          node.type === 'function' ||
          node.type === 'arrow_function'
        );
      case 'cpp':
      case 'c':
        return node.type === 'function_definition';
      case 'go':
        return (
          node.type === 'function_declaration' ||
          node.type === 'method_declaration'
        );
      default:
        return false;
    }
  }

  /**
   * Check if node is a call expression
   */
  private isCallExpression(node: SyntaxNode, language: string): boolean {
    switch (language) {
      case 'python':
      case 'javascript':
      case 'typescript':
      case 'java':
      case 'cpp':
      case 'c':
      case 'go':
        return node.type === 'call_expression';
      default:
        return false;
    }
  }

  /**
   * Get node name
   */
  private getNodeName(
    node: SyntaxNode,
    language: string,
    content: string,
  ): string | undefined {
    const nameNode = node.childForFieldName?.('name');
    if (nameNode) {
      return this.getNodeText(nameNode, content);
    }

    // For C/C++, name might be in declarator
    if (language === 'c' || language === 'cpp') {
      const declarator = node.childForFieldName?.('declarator');
      if (declarator) {
        for (let i = 0; i < declarator.childCount; i++) {
          const child = declarator.child(i);
          if (child && child.type === 'identifier') {
            return this.getNodeText(child, content);
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Get call target name
   */
  private getCallTarget(
    node: SyntaxNode,
    language: string,
    content: string,
  ): string | undefined {
    // Try to get identifier or attribute
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) continue;

      if (child.type === 'identifier' || child.type === 'attribute') {
        return this.getNodeText(child, content);
      }

      // Handle member expressions (obj.method())
      if (child.type === 'member_expression') {
        for (let j = 0; j < child.childCount; j++) {
          const memberChild = child.child(j);
          if (
            memberChild &&
            (memberChild.type === 'property_identifier' ||
              memberChild.type === 'field_identifier')
          ) {
            return this.getNodeText(memberChild, content);
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Get node text content
   */
  private getNodeText(node: SyntaxNode, _content: string): string {
    try {
      if (node.text) {
        if (typeof node.text === 'string') {
          return node.text;
        }
        // Handle Uint8Array (tree-sitter uses this)
        const text = node.text as unknown;
        if (text instanceof Uint8Array) {
          return new TextDecoder().decode(text);
        }
        return String(node.text);
      }
      return '';
    } catch (_error) {
      return '';
    }
  }
}
