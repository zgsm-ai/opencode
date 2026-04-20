#!/usr/bin/env bun

/**
 * Downloads builtin skills from their source repositories and generates
 * src/costrict/skill/builtin.ts with all skill files embedded as string constants.
 *
 * Uses git SSH transport (git ls-remote + git clone).
 * Compares remote commit SHA with cached version and skips download if unchanged.
 *
 * Usage: bun run scripts/generate-skills.ts
 */

import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import { spawnSync } from "child_process"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Output directories
const bundledSkillsDir = path.resolve(__dirname, "../bundled-skills")
const builtinTsFile = path.resolve(__dirname, "../src/costrict/skill/builtin.ts")

type SkillConfig = {
  repo: string
  branch: string
  subdir: string
}

const BUILTIN_SKILLS: Record<string, SkillConfig> = {
  "security-review": {
    repo: "zgsm-ai/security-review-skill",
    branch: "main",
    subdir: "security-review",
  },
}

function git(...args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync("git", args, { encoding: "utf-8" })
  return {
    ok: result.status === 0,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  }
}

function getCloneUrl(repo: string): string {
  return `git@github.com:${repo}.git`
}

/**
 * Get the latest commit SHA for a branch via `git ls-remote`.
 * No clone needed — lightweight remote query over SSH.
 */
function lsRemoteSha(repo: string, branch: string): string | null {
  const cloneUrl = getCloneUrl(repo)
  const ref = `refs/heads/${branch}`
  const result = git("ls-remote", "--heads", cloneUrl, ref)
  if (!result.ok || !result.stdout) {
    return null
  }
  // Output format: "<sha>\t<ref>"
  const sha = result.stdout.split("\t")[0] ?? ""
  return sha.length >= 40 ? sha : null
}

/**
 * Read the cached commit SHA from the generated builtin.ts file.
 */
async function readCachedSha(skillName: string): Promise<string | null> {
  try {
    const content = await fs.readFile(builtinTsFile, "utf-8")
    const regex = new RegExp(
      `^\\s*${JSON.stringify(skillName)}:\\s*"([a-f0-9]{40})"`,
      "m",
    )
    const match = content.match(regex)
    return match ? match[1] : null
  } catch {
    return null
  }
}

async function walk(dir: string, base = ""): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const files: string[] = []

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      const relativePath = base ? path.join(base, entry.name) : entry.name

      if (entry.isDirectory()) {
        files.push(...await walk(fullPath, relativePath))
      } else {
        files.push(relativePath)
      }
    }

    return files
  } catch {
    return []
  }
}

async function downloadSkill(
  name: string,
  config: SkillConfig,
): Promise<{ name: string; commitSha: string | null } | null> {
  const { repo, branch, subdir } = config
  const cloneUrl = getCloneUrl(repo)

  console.log(`\n📦 Skill: ${name}`)
  console.log(`   From: ${cloneUrl}`)
  console.log(`   Branch: ${branch}`)

  // Step 1: Get remote commit SHA via git ls-remote (no clone)
  const remoteSha = lsRemoteSha(repo, branch)
  if (!remoteSha) {
    throw new Error(`git ls-remote failed for ${cloneUrl} (branch: ${branch})`)
  }
  console.log(`   Remote commit: ${remoteSha.slice(0, 7)}`)

  // Step 2: Compare with cached SHA — skip only if SHA matches AND cached files exist
  const cachedSha = await readCachedSha(name)
  const skillOutputDir = path.join(bundledSkillsDir, name)
  const hasCachedFiles = (await walk(skillOutputDir)).length > 0
  if (cachedSha && cachedSha === remoteSha && hasCachedFiles) {
    console.log(`   ✓ Cached version matches remote, skipping download`)
    return { name, commitSha: remoteSha }
  }
  if (cachedSha) {
    console.log(`   Cached: ${cachedSha.slice(0, 7)} → Remote: ${remoteSha.slice(0, 7)}, updating...`)
  }

  // Step 3: Clone and extract files
  const cloneDir = path.join(bundledSkillsDir, `.clone-${name}`)

  console.log(`   git clone --depth 1 ${cloneUrl}`)

  await fs.rm(cloneDir, { recursive: true, force: true })

  const cloneResult = git("clone", "--depth", "1", "--branch", branch, cloneUrl, cloneDir)
  if (!cloneResult.ok) {
    throw new Error(`git clone failed: ${cloneResult.stderr}`)
  }

  const srcDir = subdir ? path.join(cloneDir, subdir) : cloneDir
  await fs.rm(skillOutputDir, { recursive: true, force: true })
  await fs.cp(srcDir, skillOutputDir, { recursive: true })

  // Verify SKILL.md exists
  const skillMdPath = path.join(skillOutputDir, "SKILL.md")
  try {
    await fs.access(skillMdPath)
  } catch {
    throw new Error(`Skill "${name}" missing SKILL.md`)
  }

  // Cleanup clone directory
  await fs.rm(cloneDir, { recursive: true, force: true })

  const fileCount = (await walk(skillOutputDir)).length
  console.log(`   ✓ ${fileCount} files copied`)
  return { name, commitSha: remoteSha }
}

async function generateBuiltinSkills() {
  console.log("\n🚀 OpenCode - Downloading Builtin Skills\n")

  // Ensure bundled-skills directory exists
  await fs.mkdir(bundledSkillsDir, { recursive: true })

  // Download all skills
  const downloadedSkills: Array<{ name: string; commitSha: string | null }> = []
  let successCount = 0
  let skippedCount = 0

  for (const [name, config] of Object.entries(BUILTIN_SKILLS)) {
    try {
      const result = await downloadSkill(name, config)
      if (result) {
        successCount++
        downloadedSkills.push(result)
      }
    } catch (err) {
      const skillDir = path.join(bundledSkillsDir, name)
      const cached = await walk(skillDir)
      if (cached.length > 0) {
        console.warn(`  ⚠ Download failed, using local cached files for "${name}": ${err}`)
        const cachedSha = await readCachedSha(name)
        downloadedSkills.push({ name, commitSha: cachedSha })
        skippedCount++
      } else {
        console.error(`  ✗ Download failed and no local cache found for "${name}": ${err}`)
      }
    }
  }

  if (skippedCount > 0) {
    console.log(`\n✓ Skipped ${skippedCount} skills (download failed, using cache)`)
  }
  console.log(`✓ Downloaded ${successCount}/${Object.keys(BUILTIN_SKILLS).length} skills`)
  console.log(`✓ Bundled skills directory: ${bundledSkillsDir}`)
  console.log("\n💡 Run 'bun run build' to compile the extension\n")

  // Generate builtin.ts with embedded skills
  await generateBuiltinTs(downloadedSkills)
}

/**
 * Generate builtin.ts with all skill content embedded
 */
async function generateBuiltinTs(
  downloadedSkills: Array<{ name: string; commitSha: string | null }>,
) {
  const skillNames = Object.keys(BUILTIN_SKILLS)

  // Scan all skill files and generate embedded content
  const imports: string[] = []
  const skillEntries: string[] = []
  let fileIdx = 0

  for (const skillName of skillNames) {
    const skillDir = path.join(bundledSkillsDir, skillName)

    const files = await walk(skillDir)
    const fileEntries: string[] = []

    for (const file of files) {
      const varName = `SKILL_FILE_${fileIdx++}`
      const filePath = path.join(skillDir, file)

      // Read file content and embed as string constant
      const content = await fs.readFile(filePath, "utf-8")
      const escapedContent = JSON.stringify(content)

      // Normalize path separators to forward slashes for consistency
      const normalizedPath = file.replaceAll("\\", "/")

      imports.push(`const ${varName} = ${escapedContent}`)
      fileEntries.push(`  "${normalizedPath}": ${varName}`)
    }

    skillEntries.push(`  "${skillName}": {\n${fileEntries.join(",\n")}\n  }`)
  }

  // Build version info from downloaded skills
  const indexSkillVersions: string[] = []
  for (const skill of downloadedSkills) {
    if (skill.commitSha) {
      indexSkillVersions.push(`    "${skill.name}": "${skill.commitSha}"`)
    }
  }

  const content = `// This file is auto-generated by script/generate-skills.ts
// Do not edit manually
// All skill files are embedded at build time for compiled builds

${imports.join("\n")}

/**
 * Embedded skills - all skill files are embedded at build time
 */
export const BUNDLED_SKILLS: Record<string, Record<string, string>> = {
${skillEntries.join(",\n")}
}

/**
 * Get the embedded skill files for a skill
 */
export async function loadSkillFiles(skillName: string): Promise<Record<string, string>> {
  return BUNDLED_SKILLS[skillName] || {}
}

/**
 * Get all files in a skill directory (returns list of file paths)
 */
export async function listSkillFiles(skillName: string): Promise<string[]> {
  return Object.keys(BUNDLED_SKILLS[skillName] || {})
}

/**
 * Load a single skill file content
 */
export async function loadSkillFile(skillName: string, filePath: string): Promise<string> {
  const skillFiles = BUNDLED_SKILLS[skillName]
  if (!skillFiles) {
    throw new Error(\`Skill not found: \${skillName}\`)
  }
  const content = skillFiles[filePath]
  if (content === undefined) {
    throw new Error(\`File not found in skill \${skillName}: \${filePath}\`)
  }
  return content
}

/**
 * Get the version (commit SHA) for a specific builtin skill
 */
export async function getBuiltinSkillVersion(skillName: string): Promise<string | undefined> {
  const versions: Record<string, string> = {
${indexSkillVersions.join(",\n")}
  }
  return versions[skillName]
}

/**
 * Get all builtin skill versions
 */
export async function getAllBuiltinSkillVersions(): Promise<Record<string, string>> {
  return {
${indexSkillVersions.join(",\n")}
  }
}

/**
 * List all builtin skill names
 */
export function listBuiltinSkills(): string[] {
  return ${JSON.stringify(skillNames)}
}

/**
 * Check if a skill is a builtin skill
 */
export function isBuiltinSkill(name: string): boolean {
  return ${JSON.stringify(skillNames)}.includes(name)
}

/**
 * Extract bundled skill to a target directory (used for installing to user cache)
 * This function writes embedded skill content to the target directory
 */
export async function extractBundledSkill(skillName: string, targetDir: string): Promise<void> {
  const { writeFile } = await import("fs/promises")
  const { join, dirname } = await import("path")
  const { mkdir } = await import("fs/promises")

  const skillFiles = BUNDLED_SKILLS[skillName]
  if (!skillFiles) {
    throw new Error(\`Skill not found: \${skillName}\`)
  }

  // Create target directory
  await mkdir(targetDir, { recursive: true })

  // Write all files
  for (const [relativePath, content] of Object.entries(skillFiles)) {
    const filePath = join(targetDir, relativePath)
    const fileDir = join(targetDir, dirname(relativePath))
    await mkdir(fileDir, { recursive: true })
    await writeFile(filePath, content, "utf-8")
  }
}
`

  await fs.writeFile(builtinTsFile, content, "utf-8")
  console.log(`✓ Generated ${builtinTsFile}`)
}

generateBuiltinSkills().catch(console.error)
