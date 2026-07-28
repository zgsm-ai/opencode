import { reconcile } from "solid-js/store"
import type { CapabilityItemAsset } from "@/pages/store/lib/api"

export type ItemType = "skill" | "subagent" | "command" | "mcp" | "plugin"
export type FileContentMap = Record<string, string>
// Binary files imported from a directory upload. They never enter the text
// editor; on create they are packed together with the text files into a zip
// and submitted through the multipart branch of POST /api/items.
export type BinaryFileMap = Record<string, File>

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

// Generic over the value type so the same path semantics apply to both the
// text-content map (string values) and the binary-file map (File values):
// renaming/removing a directory must move/drop its descendants in BOTH maps,
// otherwise stale binary entries would survive tree operations.
export function renameFileContents<T>(contents: Record<string, T>, from: string, to: string): Record<string, T> {
  const next: Record<string, T> = {}
  for (const [path, value] of Object.entries(contents)) {
    if (path === from || path.startsWith(`${from}/`)) {
      next[path.replace(from, to)] = value
    } else {
      next[path] = value
    }
  }
  return next
}

export function removeFileContents<T>(contents: Record<string, T>, path: string): Record<string, T> {
  const next: Record<string, T> = {}
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

// Same replacement semantics for the binary-file map: a directory re-upload or
// item-type switch must not leave stale binary entries behind (they would be
// zipped up and submitted). File values are not wrappable by the Solid store,
// so reconcile assigns them as-is and instances stay intact.
export function binaryFilesUpdate(next: BinaryFileMap) {
  return reconcile(next)
}
