import type { FilePart } from "@opencode-ai/sdk/v2"

export function attached(part: FilePart) {
  // Browsers can directly render `data:` URIs and `http(s):` URLs. Local
  // `file:` URLs are filtered out here because cross-origin https pages
  // can't load them — those are treated as inline references instead.
  return part.url.startsWith("data:") || /^https?:\/\//.test(part.url)
}

export function inline(part: FilePart) {
  if (attached(part)) return false
  return part.source?.text?.start !== undefined && part.source?.text?.end !== undefined
}

export function kind(part: FilePart) {
  return part.mime.startsWith("image/") ? "image" : "file"
}
