// MCP placeholder-detection heuristic (frontend-only).
//
// The upstream catalog has NO structured "which inputs must the user fill" field
// (see research/everything-ai-coding-mcp-field.md). We therefore DERIVE the fillable
// fields from the normalized single-server template `metadata` ({command,args,env,...}).
//
// The shared cross-layer contract with the backend is ONLY the key scheme
// (`env:<NAME>` / `args:<INDEX>` / `headers:<NAME>`): the backend mechanically
// substitutes by key and does no detection. All detection lives here. See design.md §3.1–3.2.

// One fillable field surfaced to the config dialog. `required` is always true in the
// MVP (every detected placeholder must be filled to enable subscribe).
export interface McpField {
  key: string // "env:<NAME>" | "args:<INDEX>" | "headers:<NAME>"
  label: string
  placeholder: string // the ORIGINAL placeholder string — carries semantics when label is generic
  required: true
  secret: boolean
}

// Generic labels for fields with no precise name (bare positional args). Injected so the
// detector stays pure/testable; the dialog passes localized strings via i18n.
export interface McpFieldLabels {
  path: string // label for a bare path-like positional arg
  arg: (n: number) => string // label for an otherwise-anonymous positional arg (1-based)
}

const DEFAULT_LABELS: McpFieldLabels = {
  path: "path",
  arg: (n) => `arg ${n}`,
}

const SECRET_RE = /(token|secret|key|password|passwd|pwd|api[_-]?key|access[_-]?token|credential|auth)/i
const ALL_CAPS_SNAKE_RE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/
const FLAG_RE = /^--?[A-Za-z]/
const PATH_LIKE_RE = /\/|\.(py|js|ts|sh|rb|jar|exe|cjs|mjs)$/i

// Variables the HOST resolves at run time (Claude Code plugin runtime), never the user.
// A value whose only ${}/{{}} refs are runtime vars has nothing for the user to fill —
// but it also means the MCP only works inside its parent plugin's runtime, so standalone
// subscribe must be blocked (see mcpRequiresPluginRuntime).
const RUNTIME_VAR_NAMES = new Set(["CLAUDE_PLUGIN_ROOT", "CLAUDE_PROJECT_DIR"])
const VAR_REF_RE = /\$\{([^}]+)\}|\{\{([^}]+)\}\}/g

// varRefs extracts the variable names referenced via ${NAME} / {{NAME}} in a value.
function varRefs(v: string): string[] {
  const names: string[] = []
  for (const m of v.matchAll(VAR_REF_RE)) names.push((m[1] ?? m[2] ?? "").trim())
  return names
}

// isRuntimeResolved reports whether a value references variables and ALL of them are
// runtime-provided — i.e. it LOOKS like a placeholder but the user must not fill it.
export function isRuntimeResolved(v: unknown): boolean {
  if (typeof v !== "string") return false
  const refs = varRefs(v)
  return refs.length > 0 && refs.every((name) => RUNTIME_VAR_NAMES.has(name))
}

// isPlaceholder reports whether a config value still needs to be filled by the user.
// True when it matches ANY known placeholder shape (design.md §3.2).
export function isPlaceholder(v: unknown): boolean {
  if (typeof v !== "string") return false
  if (v.trim() === "") return true
  if (/^<.*>$/.test(v)) return true // <token>
  if (/\$\{.+\}|\{\{.+\}\}/.test(v)) return true // ${VAR} / {{VAR}}
  if (/path\/to\//i.test(v)) return true // /path/to/...
  if (/\b(YOUR|MY)[_-]/i.test(v)) return true // YOUR_ / MY-
  if (ALL_CAPS_SNAKE_RE.test(v)) return true // META_ACCESS_TOKEN
  if (/(change[_-]?me|replace[_-]?me|placeholder|example|xxxx?)/i.test(v)) return true
  return false
}

// isSecret reports whether a field should be treated as sensitive (password input, never
// echoed back from the server). A pure path (contains "/", label not secret-ish) is NOT
// secret even though it may contain other characters. (design.md §3.2)
export function isSecret(label: string, v: string): boolean {
  if (SECRET_RE.test(label) || SECRET_RE.test(v)) {
    // A path that only matched because it embeds a word like "key" in a dir name should
    // still be a path, not a secret — but if the label itself is secret-ish, trust it.
    if (!SECRET_RE.test(label) && v.includes("/")) return false
    return true
  }
  return false
}

function isPathLike(v: string): boolean {
  return PATH_LIKE_RE.test(v)
}

// argLabel derives a human label for a positional arg placeholder at index `i`.
// - following a flag (e.g. "--fb-token") → the flag name minus leading dashes
// - otherwise path-like value → the generic "path" label
// - otherwise → generic "arg {n}" label (n = i + 1)
function argLabel(args: string[], i: number, value: string, labels: McpFieldLabels): string {
  const prev = i > 0 ? args[i - 1] : undefined
  if (prev && FLAG_RE.test(prev)) {
    return prev.replace(/^-+/, "")
  }
  if (isPathLike(value)) return labels.path
  return labels.arg(i + 1)
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  return value.map((v) => (typeof v === "string" ? v : ""))
}

// detectMcpFields parses a normalized single-server MCP template and returns the fields the
// user must fill. `env` values keyed by NAME → `env:<NAME>`; `args` values by position →
// `args:<INDEX>`. Non-placeholder values are skipped. (design.md §3.2)
export function detectMcpFields(
  metadata: Record<string, unknown> | null | undefined,
  labels: McpFieldLabels = DEFAULT_LABELS,
): McpField[] {
  if (!metadata || typeof metadata !== "object") return []

  const fields: McpField[] = []

  const env = metadata.env
  if (env && typeof env === "object" && !Array.isArray(env)) {
    for (const [name, raw] of Object.entries(env as Record<string, unknown>)) {
      if (typeof raw !== "string") continue
      if (isRuntimeResolved(raw)) continue
      if (!isPlaceholder(raw)) continue
      const label = name
      fields.push({
        key: `env:${name}`,
        label,
        placeholder: raw,
        required: true,
        secret: isSecret(label, raw),
      })
    }
  }

  const args = asStringArray(metadata.args)
  if (args) {
    for (let i = 0; i < args.length; i++) {
      const raw = args[i]
      if (isRuntimeResolved(raw)) continue
      if (!isPlaceholder(raw)) continue
      const label = argLabel(args, i, raw, labels)
      fields.push({
        key: `args:${i}`,
        label,
        placeholder: raw,
        required: true,
        secret: isSecret(label, raw),
      })
    }
  }

  // HTTP-type MCPs commonly carry auth in headers ("Authorization": "Bearer ${KEY}").
  // Field key `headers:<HeaderName>`; label prefers the single referenced var name
  // (GREPTILE_API_KEY) over the generic header name. The backend substitutes IN PLACE
  // of the ${}/{{}} span(s), preserving literal prefixes like "Bearer ".
  const headers = metadata.headers
  if (headers && typeof headers === "object" && !Array.isArray(headers)) {
    for (const [name, raw] of Object.entries(headers as Record<string, unknown>)) {
      if (typeof raw !== "string") continue
      if (isRuntimeResolved(raw)) continue
      if (!isPlaceholder(raw)) continue
      const refs = varRefs(raw)
      const label = refs.length === 1 && refs[0] ? refs[0] : name
      fields.push({
        key: `headers:${name}`,
        label,
        placeholder: raw,
        required: true,
        secret: isSecret(label, raw) || isSecret(name, raw),
      })
    }
  }

  return fields
}

// mcpRequiresPluginRuntime reports whether the template references runtime-provided
// variables anywhere (command/url/args/env/headers). Such an MCP cannot run outside its
// parent plugin's runtime, so standalone subscribe is blocked and the user is pointed at
// the parent plugin instead.
export function mcpRequiresPluginRuntime(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata || typeof metadata !== "object") return false
  const values: unknown[] = [metadata.command, metadata.url]
  const args = asStringArray(metadata.args)
  if (args) values.push(...args)
  for (const group of [metadata.env, metadata.headers]) {
    if (group && typeof group === "object" && !Array.isArray(group)) {
      values.push(...Object.values(group as Record<string, unknown>))
    }
  }
  return values.some((v) => typeof v === "string" && varRefs(v).some((name) => RUNTIME_VAR_NAMES.has(name)))
}
