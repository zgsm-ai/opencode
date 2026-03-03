import { NamedError } from "@opencode-ai/util/error"
import matter from "gray-matter"
import { z } from "zod"
import path from "path"
import fs from "fs"
import nunjucks from "nunjucks"

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

  const VARIABLE_REGEX = /\{\{\s*([a-zA-Z_][\w.]*?)\s*\}\}/g
  const INCLUDE_REGEX = /\{%\s*include\s+["'][^"']+["']\s*%\}/g
  const CONDITIONAL_REGEX = /\{%\s*(?:if|elif|else|endif)[^%]*%\}/g

  function getNestedValue(obj: Record<string, unknown>, valuePath: string) {
    const next = (current: unknown, key: string) => {
      if (!current || typeof current !== "object") return undefined
      if (!(key in current)) return undefined
      return (current as Record<string, unknown>)[key]
    }
    return valuePath.split(".").reduce<unknown>(next, obj)
  }

  function stash(tokens: Map<string, string>, value: string) {
    const token = `__OC_TEMPLATE_${tokens.size}__`
    tokens.set(token, value)
    return token
  }

  function restore(content: string, tokens: Map<string, string>) {
    return Array.from(tokens.entries()).reduce(
      (current, entry) => current.replaceAll(entry[0], entry[1]),
      content,
    )
  }

  function maskTemplate(
    content: string,
    options: {
      context?: Record<string, unknown>
      enableIncludes: boolean
      enableVariables: boolean
      enableConditionals: boolean
    },
    tokens: Map<string, string>,
  ) {
    const withoutIncludes = options.enableIncludes
      ? content
      : content.replace(INCLUDE_REGEX, (match) => stash(tokens, match))
    const withoutConditionals = options.enableConditionals
      ? withoutIncludes
      : withoutIncludes.replace(CONDITIONAL_REGEX, (match) => stash(tokens, match))
    const withoutVariables = options.enableVariables
      ? withoutConditionals
      : withoutConditionals.replace(VARIABLE_REGEX, (match) => stash(tokens, match))

    if (!options.enableVariables) return withoutVariables

    const context = options.context ?? {}
    return withoutVariables.replace(VARIABLE_REGEX, (match, variable) => {
      const value = getNestedValue(context, variable)
      if (typeof value === "undefined") {
        return stash(tokens, match)
      }
      return match
    })
  }

  function normalizeIncludeName(name: string) {
    return name.endsWith(".txt") ? name : `${name}.txt`
  }

  function createLoader(
    baseDir: string,
    options: {
      context?: Record<string, unknown>
      enableIncludes: boolean
      enableVariables: boolean
      enableConditionals: boolean
      components?: Record<string, string>
    },
    tokens: Map<string, string>,
  ) {
    const root = path.join(baseDir, "components")
    return {
      getSource(name: string) {
        const normalized = normalizeIncludeName(name)
        const file = path.join(root, normalized)
        const raw = (() => {
          if (fs.existsSync(file)) return fs.readFileSync(file, "utf-8")
          if (options.components) {
            const key = name.replace(/\.txt$/, "")
            return options.components[key] ?? options.components[normalized]
          }
          return undefined
        })()
        if (raw === undefined) {
          const label = name.replace(/\.txt$/, "")
          const missing = `[ERROR: Cannot include ${label}]`
          const masked = maskTemplate(missing, options, tokens)
          return { src: masked, path: file, noCache: true }
        }
        const masked = maskTemplate(raw, options, tokens)
        return { src: masked, path: file, noCache: true }
      },
    }
  }

  function renderNunjucks(
    template: string,
    options: {
      context?: Record<string, unknown>
      baseDir?: string
      enableIncludes: boolean
      enableVariables: boolean
      enableConditionals: boolean
      components?: Record<string, string>
    },
  ) {
    const tokens = new Map<string, string>()
    const masked = maskTemplate(template, options, tokens)
    const loader = options.baseDir ?? options.components ? createLoader(options.baseDir ?? "", options, tokens) : undefined
    const env = new nunjucks.Environment(loader, { autoescape: false })
    const context = options.context ?? {}
    const rendered = env.renderString(masked, context)
    return restore(rendered, tokens)
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
      components?: Record<string, string>
      enableIncludes?: boolean
      enableVariables?: boolean
      enableConditionals?: boolean
    },
  ) {
    const opts = {
      enableIncludes: true,
      enableVariables: true,
      enableConditionals: true,
      ...options,
    }
    const includeEnabled = Boolean(opts.enableIncludes && (opts.baseDir ?? opts.components))
    const rendered = renderNunjucks(template, {
      context: opts.context,
      baseDir: opts.baseDir,
      components: opts.components,
      enableIncludes: includeEnabled,
      enableVariables: opts.enableVariables,
      enableConditionals: opts.enableConditionals,
    })

    const processed = preprocessFrontmatter(rendered)

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
    return renderNunjucks(template, {
      context,
      enableIncludes: false,
      enableVariables: true,
      enableConditionals: true,
    })
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
