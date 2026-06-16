/**
 * CoStrict Skill Extension
 *
 * This module extends the base Skill functionality with:
 * - Builtin skill initialization from bundled content
 *
 * Skills are downloaded during build to bundled-skills/ and copied to cache
 * on first run. Users get updated skills when they upgrade CoStrict.
 *
 * Version tracking:
 * - Uses commit SHA from bundled-skills/index.json for version tracking
 * - Stores installed version in .version file in skill directory
 * - Does NOT modify SKILL.md content
 *
 * Design: Minimal invasive - only patches/extends the original Discovery module
 * without modifying its source code.
 */

import path from "path"
import { writeFile, readFile, rm } from "fs/promises"
import { Log } from "../../util/log"
import { Filesystem } from "../../util/filesystem"
// @ts-ignore skill/builtin 由构建期下载生成（见 bundled-skills/），仓库默认不存在，无需 typecheck
import * as Builtin from "./skill/builtin"

const log = Log.create({ service: "costrict-skill" })

/**
 * Get the cache directory for skills.
 * Skills are stored in ~/.config/costrict/skills/<name>/
 */
function getSkillCacheDir(): string {
  return path.join(process.env.HOME ?? process.env.USERPROFILE ?? "", ".config", "costrict", "skills")
}

/**
 * Get the .version file path for a skill
 */
function getVersionFilePath(skillDir: string): string {
  return path.join(skillDir, ".version")
}

/**
 * Get the installed version from .version file
 * Returns null if file doesn't exist or can't be read
 */
async function getInstalledVersion(skillDir: string): Promise<string | null> {
  const versionFilePath = getVersionFilePath(skillDir)
  try {
    const content = await readFile(versionFilePath, "utf-8")
    return content.trim()
  } catch {
    return null
  }
}

/**
 * Check if the skill needs to be updated
 * Returns true if:
 * - Directory doesn't exist
 * - .version file doesn't exist or can't be read
 * - Version or locale doesn't match
 */
async function needsUpdate(skillDir: string, skillName: string, locale: string): Promise<boolean> {
  const builtinVersion = await Builtin.getBuiltinSkillVersion(skillName)
  if (!builtinVersion) {
    log.debug("no builtin version found, assuming update needed", { name: skillName })
    return true
  }

  const installedVersion = await getInstalledVersion(skillDir)
  const expectedVersion = `${builtinVersion}:${locale}`
  return installedVersion !== expectedVersion
}

/**
 * Write .version file to track installed skill version and locale
 */
async function writeVersionFile(skillDir: string, skillName: string, locale: string): Promise<void> {
  const builtinVersion = await Builtin.getBuiltinSkillVersion(skillName)
  if (!builtinVersion) {
    log.warn("no builtin version to write", { name: skillName })
    return
  }

  const versionFilePath = getVersionFilePath(skillDir)
  await writeFile(versionFilePath, `${builtinVersion}:${locale}`, "utf-8")
  log.debug("wrote version file", { name: skillName, locale, version: builtinVersion.slice(0, 7) })
}

/**
 * Initialize builtin skills by copying them from bundled to cache directory.
 * This is called on startup to ensure skills are available.
 *
 * Version tracking:
 * - Uses commit SHA from bundled-skills/index.json
 * - Stores version in .version file (separate from SKILL.md)
 * - Full replacement when version changes
 *
 * To force update, delete the .version file or entire skill directory.
 */
export async function initializeBuiltinSkills(locale: string = "zh-CN"): Promise<void> {
  const cacheDir = getSkillCacheDir()

  // Get list of builtin skills
  const skillNames = Builtin.listBuiltinSkills()

  for (const name of skillNames) {
    const skillDir = path.join(cacheDir, name)

    // Check if skill needs update (doesn't exist or version mismatch)
    const dirExists = await Filesystem.isDir(skillDir)
    let builtinVersion: string | undefined

    if (dirExists) {
      const updateNeeded = await needsUpdate(skillDir, name, locale)
      if (!updateNeeded) {
        log.debug("builtin skill up to date", { name, locale })
        continue
      }

      builtinVersion = await Builtin.getBuiltinSkillVersion(name)
      log.info("builtin skill version or locale changed, replacing", {
        name,
        locale,
        version: builtinVersion?.slice(0, 7) ?? "unknown",
      })

      // Try to delete the directory first for clean replacement
      // If deletion fails (due to file locks), we'll try to copy over it
      try {
        await rm(skillDir, { recursive: true, force: true })
      } catch (err: any) {
        log.warn("failed to delete skill directory, will attempt to copy over existing files", {
          name,
          error: err.message,
        })
        // Continue with copy operation - cp will overwrite existing files
      }
    } else {
      log.info("initializing builtin skill", { name })
    }

    // Extract skill from bundled/embedded source to cache directory
    await Builtin.extractBundledSkill(name, skillDir, locale)

    // Write .version file to track installed version
    await writeVersionFile(skillDir, name, locale)

    const skillFiles = await Builtin.listSkillFiles(name, locale)

    if (!builtinVersion) {
      builtinVersion = await Builtin.getBuiltinSkillVersion(name)
    }

    log.info("initialized builtin skill", {
      name,
      locale,
      fileCount: skillFiles.length,
      version: builtinVersion?.slice(0, 7) ?? "unknown",
    })
  }
}

/**
 * Get the path to the builtin skills cache directory.
 * This can be used to scan for skills.
 */
export function getBuiltinSkillsDir(): string {
  return getSkillCacheDir()
}
