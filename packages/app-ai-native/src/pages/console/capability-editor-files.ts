import { reconcile } from "solid-js/store"
import type { CapabilityItemAsset } from "@/pages/store/lib/api"

export type ItemType = "skill" | "subagent" | "command" | "mcp" | "plugin"
export type FileContentMap = Record<string, string>

export function defaultSourcePathForItemType(itemType: ItemType, slug: string) {
  if (itemType === "skill") return "SKILL.md"
  if (itemType === "mcp") return ".mcp.json"
  const root = slug || "untitled"
  if (itemType === "subagent" || itemType === "command") return `${root}.md`
  return `${root}/${root}.md`
}

export function buildCapabilityPayloadFromFiles(itemType: ItemType, slug: string, fileContents: FileContentMap) {
  const sourcePath = defaultSourcePathForItemType(itemType, slug)
  const content = fileContents[sourcePath]
    ?? (itemType === "skill" ? fileContents["SKILL.md"] : undefined)
    ?? (itemType === "mcp" ? fileContents[".mcp.json"] : undefined)
    ?? fileContents[Object.keys(fileContents)[0] ?? ""]
    ?? ""

  const assets: CapabilityItemAsset[] = Object.entries(fileContents)
    .filter(([path]) => path && path !== sourcePath)
    .map(([relPath, textContent]) => ({ relPath, textContent }))

  return { sourcePath, content, assets }
}

export function renameFileContents(contents: FileContentMap, from: string, to: string) {
  const next: FileContentMap = {}
  for (const [path, value] of Object.entries(contents)) {
    if (path === from || path.startsWith(`${from}/`)) {
      next[path.replace(from, to)] = value
    } else {
      next[path] = value
    }
  }
  return next
}

export function removeFileContents(contents: FileContentMap, path: string) {
  const next: FileContentMap = {}
  for (const [key, value] of Object.entries(contents)) {
    if (key === path || key.startsWith(`${path}/`)) continue
    next[key] = value
  }
  return next
}

export function isPathOrDescendant(candidate: string, ancestor: string) {
  return candidate === ancestor || candidate.startsWith(`${ancestor}/`)
}

// Solid shallow-merges a bare object into the existing store node, so paths
// dropped from the new map would survive and still be submitted as assets.
// Every whole-map write must go through this so the map is replaced outright.
export function fileContentsUpdate(next: FileContentMap) {
  return reconcile(next)
}
