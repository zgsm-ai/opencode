export const CATEGORIES = [
  "developer-tools",
  "database",
  "file-system",
  "cloud-infrastructure",
  "productivity",
  "ai-task-management",
  "web-search",
  "browser-automation",
  "version-control",
  "api-development",
  "utilities",
  "other",
] as const

const archives = [".zip", ".tar.gz", ".tgz"] as const

export const ACCEPTED_ARCHIVE_TYPES = archives.join(",")

export const TYPE_PREFIX: Record<string, string> = {
  skill: "skill-",
  subagent: "agent-",
  command: "cmd-",
  mcp: "mcp-",
}

export const TYPE_CONTENT_PLACEHOLDER: Record<string, string> = {
  skill: "# Skill Instructions\n\nDescribe what this skill does...",
  subagent: "# Subagent\n\nDescribe the subagent behavior...",
  command: "# Command\n\nDescribe the command behavior...",
  mcp: "# MCP Server\n\nDescribe the MCP server...",
}

// "developer-tools" → "developerTools"
function camelize(slug: string) {
  return slug.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())
}

export function categoryKey(slug: string) {
  return `store.capability.category.${camelize(slug)}`
}

export function typeKey(type: string) {
  return `store.capability.type.${type}`
}

export function isArchive(name: string) {
  const file = name.toLowerCase()
  return archives.some((ext) => file.endsWith(ext))
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
