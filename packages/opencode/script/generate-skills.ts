#!/usr/bin/env bun

import { $ } from "bun"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Output directories
const bundledSkillsDir = path.resolve(__dirname, "../bundled-skills")
const builtinTsFile = path.resolve(__dirname, "../src/costrict/skill/builtin.ts")
const indexJsonFile = path.resolve(bundledSkillsDir, "index.json")

// Read version from package.json
async function getPackageVersion(): Promise<string> {
  const pkgPath = path.resolve(__dirname, "../package.json")
  const pkgContent = await fs.readFile(pkgPath, "utf-8")
  const pkg = JSON.parse(pkgContent)
  return pkg.version || "0.0.0"
}

function getGitSshUrl(repo: string): string {
  return `git@github.com:${repo}.git`
}

// Fetch latest commit SHA for a repo branch
async function fetchCommitSha(repo: string, branch: string): Promise<string | null> {
  const apiUrl = `https://api.github.com/repos/${repo}/commits/${branch}`
  try {
    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent": "OpenCode-Build",
        Accept: "application/vnd.github.v3+json",
      },
    })
    if (!response.ok) {
      console.warn(`  ⚠ Could not fetch commit SHA from GitHub API: ${response.status}`)
      return fetchCommitShaViaGit(repo, branch)
    }
    const data = await response.json()
    return data.sha || null
  } catch (err) {
    console.warn(`  ⚠ Failed to fetch commit SHA: ${err}`)
    return fetchCommitShaViaGit(repo, branch)
  }
}

async function fetchCommitShaViaGit(repo: string, branch: string): Promise<string | null> {
  try {
    const result = await $`git ls-remote ${getGitSshUrl(repo)} refs/heads/${branch}`.quiet()
    const text = (await result.text()).trim()
    const sha = text.split(/\s+/)[0]
    return sha || null
  } catch (err) {
    console.warn(`  ⚠ Failed to fetch commit SHA via git+ssh: ${err}`)
    return null
  }
}

// Builtin skills configuration
const BUILTIN_SKILLS = {
  "security-review": {
    repo: "zgsm-ai/security-review-skill",
    branch: "main",
    subdir: "security-review",
  },
} as const

type Index = {
  skills: Array<{
    name: string
    description: string
    files: string[]
  }>
}

async function withTempClone<T>(
  repo: string,
  branch: string,
  fn: (dir: string) => Promise<T>,
): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "costrict-skill-"))
  try {
    await $`git clone --depth=1 --branch ${branch} ${getGitSshUrl(repo)} ${tempDir}`.quiet()
    return await fn(tempDir)
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}

async function fetchIndex(repo: string, branch: string): Promise<Index | null> {
  const indexUrl = `https://raw.githubusercontent.com/${repo}/${branch}/index.json`
  try {
    const response = await fetch(indexUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch index: ${indexUrl} (${response.status})`)
    }
    return response.json() as Promise<Index>
  } catch (err) {
    console.warn(`  ⚠ Failed to fetch index over HTTPS, trying git+ssh: ${err}`)
    return withTempClone(repo, branch, async (dir) => {
      const content = await fs.readFile(path.join(dir, "index.json"), "utf-8")
      return JSON.parse(content) as Index
    })
  }
}

async function fetchFile(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${url} (${response.status})`)
  }
  return response.text()
}

// Load local index.json to check for updates
async function loadLocalIndex(): Promise<{ version: string; skills: Array<{ name: string; commitSha: string }> } | null> {
  try {
    const content = await fs.readFile(indexJsonFile, "utf-8")
    return JSON.parse(content)
  } catch {
    return null
  }
}

// Check if skill needs download based on commit SHA
async function needsDownload(skillName: string, repo: string, branch: string): Promise<boolean> {
  const localIndex = await loadLocalIndex()
  if (!localIndex) {
    return true
  }

  const localSkill = localIndex.skills.find((s) => s.name === skillName)
  if (!localSkill || !localSkill.commitSha) {
    return true
  }

  const latestSha = await fetchCommitSha(repo, branch)
  if (!latestSha) {
    // If we can't reach GitHub but have local files, skip download
    if (localSkill?.commitSha) {
      console.log(`  ⚠ Could not fetch latest commit, using local cache (commit: ${localSkill.commitSha.slice(0, 7)})`)
      return false
    }
    console.log(`  ⚠ Could not fetch latest commit, downloading anyway`)
    return true
  }

  if (latestSha === localSkill.commitSha) {
    console.log(`  ✓ Up to date (commit: ${latestSha.slice(0, 7)})`)
    return false
  }

  console.log(`  → Update available (${localSkill.commitSha.slice(0, 7)} → ${latestSha.slice(0, 7)})`)
  return true
}

async function copySkillFromGitRepo(
  repo: string,
  branch: string,
  subdir: string,
  skillOutputDir: string,
): Promise<void> {
  await withTempClone(repo, branch, async (dir) => {
    const sourceDir = path.join(dir, subdir)
    await fs.cp(sourceDir, skillOutputDir, { recursive: true })
  })
}

async function downloadSkill(
  name: string,
  config: { repo: string; branch: string; subdir: string },
): Promise<{ name: string; commitSha: string | null } | null> {
  const { repo, branch, subdir } = config
  console.log(`\n📦 Downloading skill: ${name}`)
  console.log(`   From: https://github.com/${repo}`)
  console.log(`   Branch: ${branch}`)

  // Fetch commit SHA
  const commitSha = await fetchCommitSha(repo, branch)
  if (commitSha) {
    console.log(`   Commit: ${commitSha.slice(0, 7)}`)
  }

  // Fetch index.json
  const index = await fetchIndex(repo, branch)
  if (!index?.skills?.length) {
    console.error(`   ✗ Invalid index for skill: ${name}`)
    return null
  }

  const skill = index.skills.find((s) => s.name === name)
  if (!skill) {
    console.error(`   ✗ Skill "${name}" not found in index`)
    return null
  }

  console.log(`  Found ${skill.files.length} files to download`)

  // Create output directory
  const skillOutputDir = path.join(bundledSkillsDir, name)
  await fs.rm(skillOutputDir, { recursive: true, force: true })
  await fs.mkdir(skillOutputDir, { recursive: true })

  // Path prefix for files (with subdir)
  const pathPrefix = subdir ? `${subdir}/` : ""

  // Download all files
  try {
    for (const file of skill.files) {
      const url = `https://raw.githubusercontent.com/${repo}/${branch}/${pathPrefix}${file}`
      const targetPath = path.join(skillOutputDir, file)

      // Create parent directories
      await fs.mkdir(path.dirname(targetPath), { recursive: true })

      const content = await fetchFile(url)
      await fs.writeFile(targetPath, content, "utf-8")
      console.log(`  ✓ ${file}`)
    }
  } catch (err) {
    console.warn(`  ⚠ HTTPS file download failed, trying git+ssh: ${err}`)
    await fs.rm(skillOutputDir, { recursive: true, force: true })
    await fs.mkdir(skillOutputDir, { recursive: true })
    await copySkillFromGitRepo(repo, branch, subdir, skillOutputDir)
    for (const file of skill.files) {
      console.log(`  ✓ ${file} (git+ssh)`)
    }
  }

  // Verify SKILL.md exists
  const skillMdPath = path.join(skillOutputDir, "SKILL.md")
  try {
    await fs.access(skillMdPath)
  } catch {
    console.error(`   ✗ Skill "${name}" missing SKILL.md`)
    return null
  }

  console.log(`   ✓ Skill ${name} downloaded successfully`)

  return { name, commitSha }
}

async function generateBuiltinSkills() {
  console.log("\n🚀 OpenCode - Downloading Builtin Skills\n")

  const packageVersion = await getPackageVersion()

  // Ensure bundled-skills directory exists
  await fs.mkdir(bundledSkillsDir, { recursive: true })

  // Load local index to check for updates
  const localIndex = await loadLocalIndex()

  // Download all skills that need updating
  const downloadedSkills: Array<{ name: string; commitSha: string | null }> = []
  let successCount = 0
  let skippedCount = 0

  for (const [name, config] of Object.entries(BUILTIN_SKILLS)) {
    const needsUpdate = await needsDownload(name, config.repo, config.branch)

    if (!needsUpdate) {
      skippedCount++
      const localSkill = localIndex?.skills.find((s) => s.name === name)
      if (localSkill) {
        downloadedSkills.push(localSkill)
      }
      continue
    }

    try {
      const result = await downloadSkill(name, config)
      if (result) {
        successCount++
        downloadedSkills.push(result)
      }
    } catch (err) {
      // Fallback to local cached files if download fails (e.g. private repo)
      const skillDir = path.join(bundledSkillsDir, name)
      const skillMdPath = path.join(skillDir, "SKILL.md")
      try {
        await fs.access(skillMdPath)
        console.warn(`  ⚠ Download failed, using local cached files for "${name}": ${err}`)
        const localSkill = localIndex?.skills.find((s) => s.name === name)
        downloadedSkills.push(localSkill || { name, commitSha: "local" })
        skippedCount++
      } catch {
        console.error(`  ✗ Download failed and no local cache found for "${name}": ${err}`)
      }
    }
  }

  // Always create/update index.json
  const indexContent = {
    version: packageVersion,
    skills: downloadedSkills.map((s) => {
      // If we got a new commitSha, use it; otherwise keep the existing one
      const existingSkill = localIndex?.skills.find((ls) => ls.name === s.name)
      return {
        name: s.name,
        commitSha: s.commitSha || existingSkill?.commitSha || "",
      }
    }),
  }
  await fs.writeFile(indexJsonFile, JSON.stringify(indexContent, null, 2))

  if (skippedCount > 0) {
    console.log(`\n✓ Skipped ${skippedCount} skills (already up to date)`)
  }
  console.log(`✓ Downloaded ${successCount}/${Object.keys(BUILTIN_SKILLS).length} skills`)
  console.log(`✓ Bundled skills directory: ${bundledSkillsDir}`)
  console.log(`✓ Index version: ${packageVersion}`)
  console.log("\n💡 Run 'bun run build' to compile the extension\n")

  // Generate builtin.ts with embedded skills
  await generateBuiltinTs()
}

/**
 * Generate builtin.ts with all skill content embedded
 */
async function generateBuiltinTs() {
  const skillNames = Object.keys(BUILTIN_SKILLS)

  // Scan all skill files and generate embedded content
  const imports: string[] = []
  const skillEntries: string[] = []
  let fileIdx = 0

  for (const skillName of skillNames) {
    const skillDir = path.join(bundledSkillsDir, skillName)

    // Walk the skill directory to find all files
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

  // Read index.json to get version info
  const indexSkillVersions: string[] = []
  try {
    const indexContent = await fs.readFile(indexJsonFile, "utf-8")
    const index = JSON.parse(indexContent)
    for (const skill of index.skills) {
      indexSkillVersions.push(`    "${skill.name}": "${skill.commitSha}"`)
    }
  } catch {
    // ignore
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
