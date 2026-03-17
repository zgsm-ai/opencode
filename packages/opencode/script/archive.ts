#!/usr/bin/env bun

import path from "path"
import fs from "fs/promises"
import { $ } from "bun"
import { fileURLToPath } from "url"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

export async function archive(names?: string[]) {
  const root = path.join(dir, "dist")
  const out = path.join(root, "release")
  await fs.rm(out, { recursive: true, force: true })
  await fs.mkdir(out, { recursive: true })

  const keys = names?.length
    ? names
    : await fs.readdir(root, { withFileTypes: true }).then((items) =>
        items
          .filter((item) => item.isDirectory())
          .map((item) => item.name)
          .filter((name) => name !== "release" && !name.startsWith("_")),
      )

  for (const key of keys) {
    const cwd = path.join(root, key)
    const exists = await fs.stat(cwd).then(
      (stat) => stat.isDirectory(),
      () => false,
    )
    if (!exists) continue

    if (key.includes("linux")) {
      await $`tar -czf ../release/${key}.tar.gz *`.cwd(cwd)
      continue
    }

    await $`zip -r ../release/${key}.zip *`.cwd(cwd)
  }

  return out
}

if (import.meta.main) {
  const out = await archive(process.argv.slice(2))
  console.log(`created archives in ${out}`)
}
