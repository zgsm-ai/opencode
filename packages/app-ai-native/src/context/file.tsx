import { createContext, useContext } from "solid-js"
import {
  selectionFromLines,
  type FileState,
  type FileSelection,
  type FileViewState,
  type SelectedLineRange,
} from "./file/types"

export type { FileSelection, SelectedLineRange, FileViewState, FileState }
export { selectionFromLines }
export {
  evictContentLru,
  getFileContentBytesTotal,
  getFileContentEntryCount,
  removeFileContentBytes,
  resetFileContentLru,
  setFileContentBytes,
  touchFileContent,
} from "./file/content-cache"

export const FileContext = createContext<any>()

export function useFile() {
  const ctx = useContext(FileContext)
  if (!ctx) throw new Error("File context must be used within a FileContext provider")
  return ctx
}
