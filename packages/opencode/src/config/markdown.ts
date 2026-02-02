import { NamedError } from "@opencode-ai/util/error"
import matter from "gray-matter"
import { z } from "zod"
import path from "path"
import fs from "fs/promises"

export namespace ConfigMarkdown {
  export const FILE_REGEX = /(?<![\w`])@(\.?[^\s`,.]*(?:\.[^\s`,.]+)*)/g
  export const SHELL_REGEX = /!`([^`]+)`/g

  export function files(template: string) {
    return Array.from(template.matchAll(FILE_REGEX))
  }

  export function shell(template: string) {
    return Array.from(template.matchAll(SHELL_REGEX))
  }

  export function preprocessFrontmatter(content: string): string {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!match) return content

    const frontmatter = match[1]
    const lines = frontmatter.split("\n")
    const result: string[] = []

    for (const line of lines) {
      // skip comments and empty lines
      if (line.trim().startsWith("#") || line.trim() === "") {
        result.push(line)
        continue
      }

      // skip lines that are continuations (indented)
      if (line.match(/^\s+/)) {
        result.push(line)
        continue
      }

      // match key: value pattern
      const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/)
      if (!kvMatch) {
        result.push(line)
        continue
      }

      const key = kvMatch[1]
      const value = kvMatch[2].trim()

      // skip if value is empty, already quoted, or uses block scalar
      if (value === "" || value === ">" || value === "|" || value.startsWith('"') || value.startsWith("'")) {
        result.push(line)
        continue
      }

      // if value contains a colon, convert to block scalar
      if (value.includes(":")) {
        result.push(`${key}: |`)
        result.push(`  ${value}`)
        continue
      }

      result.push(line)
    }

    const processed = result.join("\n")
    return content.replace(frontmatter, () => processed)
  }

  /**
   * Process {{include:path}} syntax to include external component files
   * @param content - The content with include directives
   * @param baseDir - The base directory for resolving component paths
   * @param maxDepth - Maximum recursion depth to prevent circular references
   * @returns Processed content with includes resolved
   */
  async function processIncludes(
    content: string,
    baseDir: string,
    maxDepth: number = 5,
  ): Promise<string> {
    if (maxDepth <= 0) {
      throw new Error("Include depth exceeded (possible circular reference)")
    }

    const includeRegex = /\{\{include:([\w\-\/\.]+)\}\}/g
    let result = content
    const matches = Array.from(content.matchAll(includeRegex))

    for (const match of matches) {
      const includePath = match[1]
      const fullPath = path.join(baseDir, "components", `${includePath}.txt`)

      try {
        const includeContent = await fs.readFile(fullPath, "utf-8")
        // Recursively process nested includes
        const processed = await processIncludes(includeContent, baseDir, maxDepth - 1)
        result = result.replace(match[0], processed)
      } catch (err) {
        console.warn(`Failed to include ${includePath}:`, err)
        // Keep original marker for debugging
        result = result.replace(match[0], `[ERROR: Cannot include ${includePath}]`)
      }
    }

    return result
  }

  /**
   * Replace ${variable} and {{variable}} syntax with context values
   * @param content - The content with variable placeholders
   * @param context - The context object with variable values
   * @returns Content with variables replaced
   */
  function replaceVariables(content: string, context: Record<string, any>): string {
    let result = content

    // Support ${variable} syntax
    for (const [key, value] of Object.entries(context)) {
      const regex = new RegExp(`\\$\\{${key}\\}`, "g")
      result = result.replace(regex, String(value))
    }

    // Support {{variable}} syntax (but not {{include:...}} or {{#if ...}})
    for (const [key, value] of Object.entries(context)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g")
      result = result.replace(regex, String(value))
    }

    return result
  }

  /**
   * Get nested value from object using dot notation
   * @param obj - The object to query
   * @param path - The dot-separated path (e.g., "user.name")
   * @returns The value at the path, or undefined if not found
   */
  function getNestedValue(obj: any, path: string): any {
    return path.split(".").reduce((current, key) => current?.[key], obj)
  }

  /**
   * Process {{#if variable}}...{{/if}} conditional syntax
   * @param content - The content with conditional directives
   * @param context - The context object with variable values
   * @returns Content with conditionals processed
   */
  function processConditionals(content: string, context: Record<string, any>): string {
    // Support {{#if variable}}...{{/if}} syntax
    const ifRegex = /\{\{#if\s+([\w\.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g

    return content.replace(ifRegex, (match, variable, body) => {
      const value = getNestedValue(context, variable)
      return value ? body : ""
    })
  }

  /**
   * Parse a string template with optional template features
   * @param template - The template string to parse
   * @param options - Template processing options
   * @returns Parsed markdown with frontmatter and content
   */
  export async function parseString(
    template: string,
    options?: {
      context?: Record<string, any>
      baseDir?: string
      enableIncludes?: boolean
      enableVariables?: boolean
      enableConditionals?: boolean
    },
  ) {
    let processed = template
    const opts = {
      enableIncludes: true,
      enableVariables: true,
      enableConditionals: true,
      ...options,
    }

    // 1. Process includes (first, because components may contain variables)
    if (opts.enableIncludes && opts.baseDir) {
      processed = await processIncludes(processed, opts.baseDir)
    }

    // 2. Process conditionals
    if (opts.enableConditionals && opts.context) {
      processed = processConditionals(processed, opts.context)
    }

    // 3. Replace variables (last)
    if (opts.enableVariables && opts.context) {
      processed = replaceVariables(processed, opts.context)
    }

    // 4. Parse YAML frontmatter
    processed = preprocessFrontmatter(processed)

    try {
      const md = matter(processed)
      return md
    } catch (err) {
      throw new FrontmatterError(
        {
          path: "<string>",
          message: `Failed to parse YAML frontmatter: ${err instanceof Error ? err.message : String(err)}`,
        },
        { cause: err },
      )
    }
  }

  /**
   * Render a template with runtime context (for already-loaded templates)
   * This only processes variables and conditionals, not includes
   * @param template - The template string
   * @param context - Runtime context variables
   * @returns Rendered template string
   */
  export function renderTemplate(template: string, context: Record<string, any>): string {
    let result = template

    // Process conditionals
    result = processConditionals(result, context)

    // Replace variables
    result = replaceVariables(result, context)

    return result
  }

  export async function parse(filePath: string) {
    const raw = await Bun.file(filePath).text()
    const template = preprocessFrontmatter(raw)

    try {
      const md = matter(template)
      return md
    } catch (err) {
      throw new FrontmatterError(
        {
          path: filePath,
          message: `${filePath}: Failed to parse YAML frontmatter: ${err instanceof Error ? err.message : String(err)}`,
        },
        { cause: err },
      )
    }
  }

  export const FrontmatterError = NamedError.create(
    "ConfigFrontmatterError",
    z.object({
      path: z.string(),
      message: z.string(),
    }),
  )
}
