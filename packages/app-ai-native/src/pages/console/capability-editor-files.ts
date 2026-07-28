import { reconcile } from "solid-js/store"
import type { CapabilityItemAsset } from "@/pages/store/lib/api"

export type ItemType = "skill" | "subagent" | "command" | "mcp" | "plugin"
export type FileContentMap = Record<string, string>

// Binary files never enter the text editor. Two kinds of entries share the map:
// - "local": a File picked up by the directory import, zipped and uploaded
//   through the multipart branch on submit.
// - "remote": an asset that already lives in object storage (loaded from the
//   item's asset manifest on edit). On a content-changing save it is fetched
//   back, verified against contentSha, and re-packed into the uploaded zip so
//   the server's delete-and-rebuild asset pass cannot destroy it.
export type BinaryFileEntry =
  | { kind: "local"; file: File }
  | { kind: "remote"; fileSize: number; mimeType?: string; contentSha?: string }
export type BinaryFileMap = Record<string, BinaryFileEntry>

// Mirror of the server-side archive limits (services.MaxSingleFileSize /
// MaxUncompressedSize).
export const MAX_ARCHIVE_SINGLE_FILE_SIZE = 10 * 1024 * 1024
export const MAX_ARCHIVE_TOTAL_SIZE = 50 * 1024 * 1024

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

// Normalize a path destined for the uploaded zip, mirroring the server's
// normalizeArchivePath: backslashes become "/", empty and "." segments are
// dropped, and absolute paths or ".." traversal are rejected (null). Applied to
// every imported relPath and defensively re-applied right before zipping.
export function normalizeImportedPath(raw: string): string | null {
  const slashed = raw.replace(/\\/g, "/")
  if (slashed.startsWith("/") || /^[A-Za-z]:/.test(slashed)) return null
  const clean: string[] = []
  for (const part of slashed.split("/")) {
    if (part === "" || part === ".") continue
    if (part === "..") return null
    clean.push(part)
  }
  if (clean.length === 0) return null
  return clean.join("/")
}

// A single tree entry name (file or directory created/renamed inline) must be
// exactly one path segment: no separators, no traversal, not empty/dot-only.
export function isValidTreeEntryName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed || trimmed === "." || trimmed === "..") return false
  if (trimmed.includes("/") || trimmed.includes("\\")) return false
  return true
}

export type ArchiveSizeCheck =
  | { ok: true; totalSize: number }
  | { ok: false; reason: "file"; path: string; size: number }
  | { ok: false; reason: "total"; totalSize: number }

// Submit-time preflight over the FINAL file set (the user may have pasted huge
// text after import, so the import-time check alone is not enough). Only
// relevant when the submission goes through the multipart zip path.
export function checkArchiveSizeLimits(fileContents: FileContentMap, binaryFiles: BinaryFileMap): ArchiveSizeCheck {
  let total = 0
  const encoder = new TextEncoder()
  for (const [path, content] of Object.entries(fileContents)) {
    const size = encoder.encode(content).length
    if (size > MAX_ARCHIVE_SINGLE_FILE_SIZE) return { ok: false, reason: "file", path, size }
    total += size
  }
  for (const [path, entry] of Object.entries(binaryFiles)) {
    const size = entry.kind === "local" ? entry.file.size : entry.fileSize
    if (size > MAX_ARCHIVE_SINGLE_FILE_SIZE) return { ok: false, reason: "file", path, size }
    total += size
  }
  if (total > MAX_ARCHIVE_TOTAL_SIZE) return { ok: false, reason: "total", totalSize: total }
  return { ok: true, totalSize: total }
}

// Serialized editor content state used for the "did anything change" check on
// edit-save. Binary entries are part of the state: deleting a remote binary
// MUST count as a change (otherwise the save is skipped as a no-op and the
// deletion never reaches the server), and a local entry always differs from
// the loaded remote-only snapshot.
export function buildContentSnapshot(fileContents: FileContentMap, binaryFiles: BinaryFileMap): string {
  const binaries = Object.keys(binaryFiles).sort().map((path) => {
    const entry = binaryFiles[path]!
    return entry.kind === "remote"
      ? { path, kind: entry.kind, sha: entry.contentSha ?? "", size: entry.fileSize }
      : { path, kind: entry.kind, size: entry.file.size, name: entry.file.name }
  })
  return JSON.stringify({ files: fileContents, binaries })
}
