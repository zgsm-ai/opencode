import type { FileContent } from "@opencode-ai/sdk/v2"

export type FileMeta = {
  path: string
  size: number
  modified?: string
  type: "file" | "directory"
}

export type FileContentChunk = {
  offset: number
  lines: number
  totalLines: number
}

export type FileSelection = {
  startLine: number
  startChar: number
  endLine: number
  endChar: number
}

export type SelectedLineRange = {
  start: number
  end: number
  side?: "additions" | "deletions"
  endSide?: "additions" | "deletions"
}

export type FileViewState = {
  scrollTop?: number
  scrollLeft?: number
  selectedLines?: SelectedLineRange | null
}

export type FileState = {
  path: string
  name: string
  loaded?: boolean
  loading?: boolean
  error?: string
  meta?: FileMeta
  content?: FileContent
  chunk?: FileContentChunk
}

export function selectionFromLines(range: SelectedLineRange): FileSelection {
  const startLine = Math.min(range.start, range.end)
  const endLine = Math.max(range.start, range.end)
  return {
    startLine,
    endLine,
    startChar: 0,
    endChar: 0,
  }
}
