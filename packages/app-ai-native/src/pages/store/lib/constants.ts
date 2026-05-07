const archives = [".zip", ".tar.gz", ".tgz"] as const

export const ACCEPTED_ARCHIVE_TYPES = archives.join(",")

export const TYPE_PREFIX: Record<string, string> = {
  skill: "skill-",
  subagent: "agent-",
  command: "cmd-",
  mcp: "mcp-",
}

export const TYPE_COLORS: Record<string, string> = {
  skill: "#F59E0B",
  subagent: "#3B82F6",
  command: "#10B981",
  mcp: "#8B5CF6",
}

export const TYPE_CONTENT_PLACEHOLDER: Record<string, string> = {
  skill: "# SKILL\n\nDescribe what this skill does...",
  subagent: "# Subagent\n\nDescribe the subagent behavior...",
  command: "# Command\n\nDescribe the command behavior...",
  mcp: "{\n  \"mcpServers\": {\n      \n  }\n}",
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
