/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Symbol resolver for managing symbol tables and resolving references
 */

import { NodeType, SymbolResolver as BaseSymbolResolver } from './base';
import type { Symbol, Context } from './base';

/**
 * Default symbol resolver implementation
 */
export class DefaultSymbolResolver extends BaseSymbolResolver {
  // Symbol table: {qualified_name: Symbol}
  private symbols: Map<string, Symbol> = new Map();

  // Class inheritance: {class_name: [parent_class_names]}
  private inheritance: Map<string, string[]> = new Map();

  // Symbols indexed by file: {file_path: [symbols]}
  private symbolsByFile: Map<string, Symbol[]> = new Map();

  // Symbols indexed by name: {simple_name: [symbols]}
  private symbolsByName: Map<string, Symbol[]> = new Map();

  /**
   * Register definition
   */
  registerDefinition(symbol: Symbol): void {
    // Generate fully qualified name
    if (!symbol.qualifiedName) {
      if (symbol.scope && symbol.scope !== 'global') {
        symbol.qualifiedName = `${symbol.scope}.${symbol.name}`;
      } else {
        symbol.qualifiedName = symbol.name;
      }
    }

    // Register to symbol table
    this.symbols.set(symbol.qualifiedName, symbol);

    // Add to file index
    if (!this.symbolsByFile.has(symbol.filePath)) {
      this.symbolsByFile.set(symbol.filePath, []);
    }
    this.symbolsByFile.get(symbol.filePath)!.push(symbol);

    // Add to name index
    if (!this.symbolsByName.has(symbol.name)) {
      this.symbolsByName.set(symbol.name, []);
    }
    this.symbolsByName.get(symbol.name)!.push(symbol);

    // If class definition, register inheritance
    if (symbol.symbolType === NodeType.CLASS_DEF && symbol.parentClass) {
      // Handle multiple parent classes (comma separated)
      const parentClasses = symbol.parentClass
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p);
      if (!this.inheritance.has(symbol.qualifiedName)) {
        this.inheritance.set(symbol.qualifiedName, []);
      }
      this.inheritance.get(symbol.qualifiedName)!.push(...parentClasses);
    }
  }

  /**
   * Resolve reference
   */
  resolve(name: string, context: Context): Symbol | undefined {
    // 1. Try to find by fully qualified name
    if (this.symbols.has(name)) {
      return this.symbols.get(name);
    }

    // 2. Check if it's an imported symbol
    if (context.imports[name]) {
      const qualifiedName = context.imports[name];
      if (this.symbols.has(qualifiedName)) {
        return this.symbols.get(qualifiedName);
      }
    }

    // 3. Search in current function scope
    if (context.currentFunction) {
      let qualifiedName: string;
      if (context.currentClass) {
        qualifiedName = `${context.currentClass}.${context.currentFunction}.${name}`;
      } else {
        qualifiedName = `${context.currentFunction}.${name}`;
      }

      if (this.symbols.has(qualifiedName)) {
        return this.symbols.get(qualifiedName);
      }
    }

    // 4. Search in current class scope
    if (context.currentClass) {
      const qualifiedName = `${context.currentClass}.${name}`;
      if (this.symbols.has(qualifiedName)) {
        return this.symbols.get(qualifiedName);
      }

      // 5. Search in parent classes
      const parentClasses = this.getParentClasses(context.currentClass);
      for (const parentClass of parentClasses) {
        const parentQualifiedName = `${parentClass}.${name}`;
        if (this.symbols.has(parentQualifiedName)) {
          return this.symbols.get(parentQualifiedName);
        }
      }
    }

    // 6. Search in global scope (same file)
    const fileSymbols = this.symbolsByFile.get(context.filePath) || [];
    for (const symbol of fileSymbols) {
      if (symbol.name === name && symbol.scope === 'global') {
        return symbol;
      }
    }

    // 7. Search by simple name (may be ambiguous, return first match)
    const candidates = this.symbolsByName.get(name);
    if (candidates && candidates.length > 0) {
      // Prefer symbols from the same file
      for (const candidate of candidates) {
        if (candidate.filePath === context.filePath) {
          return candidate;
        }
      }
      // Otherwise return the first one
      return candidates[0];
    }

    return undefined;
  }

  /**
   * Get parent classes of a class (recursively get all parent classes)
   */
  getParentClasses(className: string): string[] {
    const result: string[] = [];
    const visited = new Set<string>();

    const collectParents = (clsName: string): void => {
      if (visited.has(clsName)) {
        return;
      }
      visited.add(clsName);

      const parents = this.inheritance.get(clsName) || [];
      for (const parent of parents) {
        result.push(parent);
        collectParents(parent);
      }
    };

    collectParents(className);
    return result;
  }

  /**
   * Get all class definitions
   */
  getAllClasses(): Symbol[] {
    return Array.from(this.symbols.values()).filter(
      (s) => s.symbolType === NodeType.CLASS_DEF,
    );
  }

  /**
   * Get all function and method definitions
   */
  getAllFunctions(): Symbol[] {
    return Array.from(this.symbols.values()).filter(
      (s) =>
        s.symbolType === NodeType.FUNCTION_DEF ||
        s.symbolType === NodeType.METHOD_DEF,
    );
  }

  /**
   * Clear symbol table
   */
  clear(): void {
    this.symbols.clear();
    this.inheritance.clear();
    this.symbolsByFile.clear();
    this.symbolsByName.clear();
  }
}
