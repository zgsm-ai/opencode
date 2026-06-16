export type ContentMode = "text" | "archive"

export function canArchive(type: string) {
  return type === "skill" || type === "mcp" || type === "plugin"
}

export function usableMode(archive: boolean, mode: ContentMode): ContentMode {
  return archive ? mode : "text"
}

export function contentValue(mode: ContentMode, text: string) {
  return mode === "text" ? text : ""
}

/** Map backend sourceType to the UI content mode. */
export function sourceTypeToMode(sourceType?: string): ContentMode {
  return sourceType === "archive" ? "archive" : "text"
}
