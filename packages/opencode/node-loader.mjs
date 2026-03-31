import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = path.dirname(fileURLToPath(import.meta.url))

const shims = {
  bun: pathToFileURL(path.join(root, "node-shims", "bun.mjs")).href,
  "bun:sqlite": pathToFileURL(path.join(root, "node-shims", "bun-sqlite.mjs")).href,
  "bun:jsc": pathToFileURL(path.join(root, "node-shims", "bun-jsc.mjs")).href,
  "bun:ffi": pathToFileURL(path.join(root, "node-shims", "bun-ffi.mjs")).href,
}

export async function resolve(specifier, context, defaultResolve) {
  if (specifier in shims) {
    return {
      shortCircuit: true,
      url: shims[specifier],
    }
  }

  return defaultResolve(specifier, context, defaultResolve)
}

export async function load(url, context, defaultLoad) {
  if (url.endsWith(".txt")) {
    const source = await readFile(new URL(url), "utf8")
    return {
      format: "module",
      shortCircuit: true,
      source: `export default ${JSON.stringify(source)};`,
    }
  }

  return defaultLoad(url, context, defaultLoad)
}
