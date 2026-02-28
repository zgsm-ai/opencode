import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const isDir = (value: string) => {
  try {
    return fs.statSync(value).isDirectory()
  } catch {
    return false
  }
}

export function resolveResourcesPath(importMetaUrl: string, subdir?: string) {
  const sourceDir = path.dirname(fileURLToPath(importMetaUrl))
  const execRoot = path.resolve(path.dirname(process.execPath), "..", "resources")
  const sourceAttempts = [
    path.resolve(sourceDir, "..", "..", "resources"),
    path.resolve(sourceDir, "..", "..", "..", "resources"),
    path.resolve(sourceDir, "..", "resources"),
  ]
  const binary = path.basename(process.execPath)
  const bundled = /^costrict-cli(?:\.exe)?$/i.test(binary)
  const attempts = bundled
    ? [execRoot, ...sourceAttempts]
    : [
        ...sourceAttempts,
    execRoot,
      ]

  const root = attempts.find((value) => isDir(value)) || attempts[0]
  if (!subdir) return root
  return path.join(root, subdir)
}
