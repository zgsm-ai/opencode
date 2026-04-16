import { readdir } from "fs/promises"
import { extname, join } from "path"

const root = join(import.meta.dir, "../dist")
const exts = new Set([
  ".css",
  ".js",
  ".json",
  ".map",
  ".svg",
  ".txt",
  ".wasm",
  ".webmanifest",
  ".xml",
])

const walk = async (dir: string): Promise<string[]> =>
  (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map((ent) =>
        ent.isDirectory() ? walk(join(dir, ent.name)) : [join(dir, ent.name)],
      ),
    )
  ).flat()

const files = (await walk(root)).filter(
  (file) => exts.has(extname(file)) && !file.endsWith(".gz"),
)

const done = await Promise.all(
  files.map(async (file) => {
    const body = await Bun.file(file).bytes()
    if (body.byteLength < 1024) return 0
    await Bun.write(`${file}.gz`, Bun.gzipSync(body))
    return 1
  }),
)

console.log(`Wrote ${done.reduce((sum, n) => sum + n, 0)} gzip assets`)
