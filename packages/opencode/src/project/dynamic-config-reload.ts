import path from "path"
import { Bus } from "@/bus"
import { Config } from "@/config/config"
import { FileWatcher } from "@/file/watcher"
import { Log } from "@/util/log"

const log = Log.create({ service: "dynamic-config-reload" })
const DYNAMIC_CONFIG_FILE = /^(?:\.costrict\/|\.opencode\/)?(?:agent|agents|command|commands)\/.+\.md$/i
const DYNAMIC_SKILL_FILE = /^(?:(?:\.costrict|\.claude|\.agents)\/)?skills\/.+\/SKILL\.md$/i
const OPENCODE_SKILL_FILE = /^(?:\.opencode\/)?(?:skill|skills)\/.+\/SKILL\.md$/i

function normalize(file: string) {
  return file.replaceAll("\\", "/")
}

export function isDynamicConfigFile(file: string, directories: string[]) {
  return directories.some((dir) => {
    const relative = path.relative(dir, file)
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return false
    const normalized = normalize(relative)
    return (
      DYNAMIC_CONFIG_FILE.test(normalized) ||
      DYNAMIC_SKILL_FILE.test(normalized) ||
      OPENCODE_SKILL_FILE.test(normalized)
    )
  })
}

export function registerDynamicConfigReload() {
  return Bus.subscribe(FileWatcher.Event.Updated, async (evt) => {
    const file = evt.properties.file
    const directories = await Config.directories().catch(() => [])
    if (!isDynamicConfigFile(file, directories)) return

    log.info("dynamic config changed, invalidating instance cache", {
      file,
      event: evt.properties.event,
    })
    await Config.invalidate(true)
  })
}
