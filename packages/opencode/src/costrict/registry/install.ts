import path from "path"
import { mkdir } from "fs/promises"
import { Global } from "../../global"
import { Filesystem } from "../../util/filesystem"
import { Log } from "../../util/log"
import { Discovery } from "../../skill/discovery"
import { Instance } from "../../project/instance"
import { Config } from "../../config/config"
import { modify, applyEdits } from "jsonc-parser"
import { fetchFile, resolveToken } from "./client"
import type { InstallScope, RegistryItem, RegistryItemFile } from "./types"
import { PackValidationError } from "./types"

const log = Log.create({ service: "registry-install" })

function projectConfigPath(): string {
  return path.join(Instance.worktree, ".costrict", "costrict.json")
}

function globalConfigPath(): string {
  return path.join(Global.Path.config, "costrict.json")
}

async function addSkillUrl(registryUrl: string, scope: InstallScope): Promise<void> {
  const configPath = scope === "global" ? globalConfigPath() : projectConfigPath()
  let text = "{}"
  if (await Filesystem.exists(configPath)) text = await Filesystem.readText(configPath)

  const parsed = JSON.parse(text.trim() || "{}") as { skills?: { urls?: string[] } }
  const urls = parsed.skills?.urls ?? []
  if (urls.includes(registryUrl)) return

  const edits = modify(text, ["skills", "urls"], [...urls, registryUrl], {
    formattingOptions: { tabSize: 2, insertSpaces: true },
  })
  await Filesystem.write(configPath, applyEdits(text, edits))
}

async function removeSkillUrl(registryUrl: string, scope: InstallScope): Promise<void> {
  const configPath = scope === "global" ? globalConfigPath() : projectConfigPath()
  if (!(await Filesystem.exists(configPath))) return
  const text = await Filesystem.readText(configPath)
  const parsed = JSON.parse(text.trim() || "{}") as { skills?: { urls?: string[] } }
  const urls = (parsed.skills?.urls ?? []).filter((u) => u !== registryUrl)
  const edits = modify(text, ["skills", "urls"], urls, {
    formattingOptions: { tabSize: 2, insertSpaces: true },
  })
  await Filesystem.write(configPath, applyEdits(text, edits))
}

async function downloadFile(
  registryBase: string,
  itemType: string,
  slug: string,
  file: string,
  destDir: string,
  token: string | undefined,
): Promise<void> {
  const base = registryBase.endsWith("/") ? registryBase : `${registryBase}/`
  const url = new URL(`${itemType}/${slug}/${file}`, base).href
  const dest = path.join(destDir, file)
  await mkdir(path.dirname(dest), { recursive: true })
  const res = await fetchFile(url, token)
  if (res.body) await Filesystem.writeStream(dest, res.body)
}

export async function installSkill(
  item: RegistryItemFile,
  registryUrl: string,
  scope: InstallScope,
): Promise<void> {
  log.info("installing skill", { slug: item.slug })
  const token = await resolveToken(registryUrl)
  const dest =
    scope === "global"
      ? path.join(Global.Path.config, "skills", item.slug)
      : path.join(Instance.worktree, ".costrict", "skills", item.slug)
  await Promise.all(item.files.map((f) => downloadFile(registryUrl,item.type, item.slug, f, dest, token)))
  await addSkillUrl(registryUrl, scope)
}

export async function uninstallSkill(
  slug: string,
  registryUrl: string,
  scope: InstallScope,
): Promise<void> {
  log.info("uninstalling skill", { slug })
  const dest =
    scope === "global"
      ? path.join(Global.Path.config, "skills", slug)
      : path.join(Instance.worktree, ".costrict", "skills", slug)
  const { rm } = await import("fs/promises")
  await rm(dest, { recursive: true, force: true })
  const allInstalled = await Filesystem.readJson<{ items: Array<{ slug: string; registry: string }> }>(
    path.join(Global.Path.config, "installed-plugins.json"),
  ).catch(() => ({ items: [] }))
  const remaining = allInstalled.items.filter((i) => i.registry === registryUrl && i.slug !== slug)
  if (remaining.length === 0) await removeSkillUrl(registryUrl, scope)
}

export async function installFileItem(
  item: RegistryItemFile,
  registryUrl: string,
  scope: InstallScope,
): Promise<string> {
  log.info(`installing ${item.type}`, { slug: item.slug })
  const token = await resolveToken(registryUrl)

  const dir =
    scope === "global"
      ? path.join(Global.Path.config, item.type === "subagent" ? "agents" : "commands")
      : path.join(Instance.worktree, ".costrict", item.type === "subagent" ? "agents" : "commands")

  await mkdir(dir, { recursive: true })

  for (const file of item.files) {
    await downloadFile(registryUrl,item.type, item.slug, file, dir, token)
  }

  const primary = item.files[0] ?? `${item.name}.md`
  return path.join(dir, primary)
}

export async function uninstallFileItem(
  item: { slug: string; type: "subagent" | "command"; scope: InstallScope },
): Promise<void> {
  log.info(`uninstalling ${item.type}`, { slug: item.slug })
  const dir =
    item.scope === "global"
      ? path.join(Global.Path.config, item.type === "subagent" ? "agent" : "commands")
      : path.join(Instance.worktree, ".costrict", item.type === "subagent" ? "agent" : "commands")

  const candidates = [`${item.slug}.md`, item.slug]
  for (const name of candidates) {
    const p = path.join(dir, name)
    if (await Filesystem.exists(p)) {
      const { unlink } = await import("fs/promises")
      await unlink(p).catch(() => {})
      return
    }
  }
}

export async function installMcp(item: RegistryItem, registryUrl: string, scope: InstallScope): Promise<void> {
  if (item.type !== "mcp") return

  // Normalize mcp type: http/sse -> remote, default to local
  if (item.mcp && typeof item.mcp === "object") {
    const mcpType = item.mcp.type
    if (mcpType === "http" || mcpType === "sse") {
      ;(item.mcp as { type: string }).type = "remote"
    } else if (!mcpType) {
      ;(item.mcp as { type: string }).type = "local"
    }
  }

  const mcpType = item.mcp?.type
  if (!item.mcp || typeof item.mcp !== "object" || (mcpType !== "local" && mcpType !== "remote")) {
    throw new PackValidationError(`${JSON.stringify(item)} MCP configuration for "${item.slug}" is invalid or empty. Please check the registry entry.`)
  }
  log.info("installing mcp", { slug: item.slug })
  const configPath = scope === "global" ? globalConfigPath() : projectConfigPath()
  let text = "{}"
  if (await Filesystem.exists(configPath)) text = await Filesystem.readText(configPath)
  const edits = modify(text, ["mcp", item.slug], item.mcp as Config.Mcp, {
    formattingOptions: { tabSize: 2, insertSpaces: true },
  })
  await Filesystem.write(configPath, applyEdits(text, edits))
}

export async function uninstallMcp(slug: string, scope: InstallScope): Promise<void> {
  log.info("uninstalling mcp", { slug })
  const configPath = scope === "global" ? globalConfigPath() : projectConfigPath()
  if (!(await Filesystem.exists(configPath))) return
  const text = await Filesystem.readText(configPath)
  const edits = modify(text, ["mcp", slug], undefined, {
    formattingOptions: { tabSize: 2, insertSpaces: true },
  })
  await Filesystem.write(configPath, applyEdits(text, edits))
}

export async function install(item: RegistryItem, registryUrl: string, scope: InstallScope): Promise<void> {
  switch (item.type) {
    case "skill":
      return installSkill(item, registryUrl, scope)
    case "subagent":
    case "command":
      await installFileItem(item, registryUrl, scope)
      return
    case "mcp":
      return installMcp(item, registryUrl, scope)
  }
}

export async function uninstall(
  entry: { slug: string; type: string; registry: string; scope: InstallScope },
): Promise<void> {
  switch (entry.type) {
    case "skill":
      return uninstallSkill(entry.slug, entry.registry, entry.scope)
    case "subagent":
    case "command":
      return uninstallFileItem({ slug: entry.slug, type: entry.type as "subagent" | "command", scope: entry.scope })
    case "mcp":
      return uninstallMcp(entry.slug, entry.scope)
  }
}
