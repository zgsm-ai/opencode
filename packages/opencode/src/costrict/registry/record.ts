import path from "path"
import { Global } from "../../global"
import { Filesystem } from "../../util/filesystem"
import type { InstalledEntry, InstalledRecord, InstallScope, RegistryItemType } from "./types"

const recordPath = path.join(Global.Path.config, "installed-plugins.json")

async function read(): Promise<InstalledRecord> {
  return Filesystem.readJson<InstalledRecord>(recordPath).catch(() => ({ items: [] }))
}

async function write(record: InstalledRecord): Promise<void> {
  await Filesystem.writeJson(recordPath, record)
}

export async function all(): Promise<InstalledEntry[]> {
  return read().then((r) => r.items)
}

export async function get(slug: string): Promise<InstalledEntry | undefined> {
  return read().then((r) => r.items.find((i) => i.slug === slug))
}

export async function add(entry: InstalledEntry): Promise<void> {
  const record = await read()
  record.items = record.items.filter((i) => i.slug !== entry.slug)
  record.items.push(entry)
  await write(record)
}

export async function remove(slug: string): Promise<boolean> {
  const record = await read()
  const before = record.items.length
  record.items = record.items.filter((i) => i.slug !== slug)
  if (record.items.length === before) return false
  await write(record)
  return true
}

export function make(
  item: { slug: string; type: RegistryItemType; name: string },
  registry: string,
  scope: InstallScope,
): InstalledEntry {
  return {
    slug: item.slug,
    type: item.type,
    name: item.name,
    registry,
    scope,
    installedAt: new Date().toISOString(),
  }
}
