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

const execPath = () => {
  try {
    return fs.realpathSync(process.execPath)
  } catch {
    return process.execPath
  }
}

export function resolveResourcesPath(importMetaUrl: string, subdir?: string) {
  const sourceDir = path.dirname(fileURLToPath(importMetaUrl))
  const exec = execPath()
  const execAttempts = [
    path.resolve(path.dirname(exec), "..", "resources"),
    path.resolve(path.dirname(exec), "resources"),
  ]
  const sourceAttempts = [
    path.resolve(sourceDir, "..", "..", "resources"),
    path.resolve(sourceDir, "..", "..", "..", "resources"),
    path.resolve(sourceDir, "..", "resources"),
  ]
  const binary = path.basename(exec)
  const bundled = /^costrict-cli(?:\.exe)?$/i.test(binary)
  const attempts = bundled ? [...execAttempts, ...sourceAttempts] : [...sourceAttempts, ...execAttempts]

  const root = attempts.find((value) => isDir(value)) || attempts[0]
  if (!subdir) return root
  return path.join(root, subdir)
}
