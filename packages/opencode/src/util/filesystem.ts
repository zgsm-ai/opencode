import { realpathSync } from "fs"
import { dirname, join, relative, resolve } from "path"

export namespace Filesystem {
  const normalizeMsys = (value: string) => {
    if (process.platform !== "win32") return value
    if (value.match(/^\/cygdrive\/[a-z]\//i)) {
      return value
        .replace(/^\/cygdrive\/([a-z])\//i, (_match, drive) => `${String(drive).toUpperCase()}:\\`)
        .replace(/\//g, "\\")
    }
    if (value.match(/^\/[a-z]\//i)) {
      return value
        .replace(/^\/([a-z])\//i, (_match, drive) => `${String(drive).toUpperCase()}:\\`)
        .replace(/\//g, "\\")
    }
    return value
  }

  export const exists = (p: string) =>
    Bun.file(p)
      .stat()
      .then(() => true)
      .catch(() => false)

  export const isDir = (p: string) =>
    Bun.file(p)
      .stat()
      .then((s) => s.isDirectory())
      .catch(() => false)
  /**
   * On Windows, normalize a path to its canonical casing using the filesystem.
   * This is needed because Windows paths are case-insensitive but LSP servers
   * may return paths with different casing than what we send them.
   */
  export function normalizePath(p: string): string {
    if (process.platform !== "win32") return p
    const normalized = normalizeMsys(p)
    try {
      return realpathSync.native(normalized)
    } catch {
      return normalized
    }
  }
  export function overlaps(a: string, b: string) {
    const relA = relative(a, b)
    const relB = relative(b, a)
    return !relA || !relA.startsWith("..") || !relB || !relB.startsWith("..")
  }

  export function contains(parent: string, child: string) {
    const base = resolve(normalizePath(parent))
    const target = resolve(normalizePath(child))
    // On Windows, check if drives match first
    if (process.platform === "win32") {
      const drivePattern = /^[a-zA-Z]:/
      const parentHasDrive = drivePattern.test(base)
      const childHasDrive = drivePattern.test(target)
      if (parentHasDrive && childHasDrive) {
        const parentDrive = base.split(":")[0]?.toLowerCase()
        const childDrive = target.split(":")[0]?.toLowerCase()
        if (parentDrive !== childDrive) return false
      }
    }
    return !relative(base, target).startsWith("..")
  }

  export async function findUp(target: string, start: string, stop?: string) {
    let current = start
    const result = []
    while (true) {
      const search = join(current, target)
      if (await exists(search)) result.push(search)
      if (stop === current) break
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
    return result
  }

  export async function* up(options: { targets: string[]; start: string; stop?: string }) {
    const { targets, start, stop } = options
    let current = start
    while (true) {
      for (const target of targets) {
        const search = join(current, target)
        if (await exists(search)) yield search
      }
      if (stop === current) break
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
  }

  export async function globUp(pattern: string, start: string, stop?: string) {
    let current = start
    const result = []
    while (true) {
      try {
        const glob = new Bun.Glob(pattern)
        for await (const match of glob.scan({
          cwd: current,
          absolute: true,
          onlyFiles: true,
          followSymlinks: true,
          dot: true,
        })) {
          result.push(match)
        }
      } catch {
        // Skip invalid glob patterns
      }
      if (stop === current) break
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
    return result
  }
}
