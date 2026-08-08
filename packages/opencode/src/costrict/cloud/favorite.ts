import path from "node:path"
import { existsSync } from "node:fs"
import { mkdir, rm } from "node:fs/promises"
import { applyEdits, modify } from "jsonc-parser"
import { loadCoStrictCredentials, saveCoStrictCredentials } from "../provider/credentials"
import { getCoStrictBaseURL } from "../provider/auth"
import { extractExpiryFromJWT, isCoStrictTokenValid, parseJWT, refreshCoStrictToken } from "../provider/token"
import { getCloudBaseUrl } from "../device/client"
import { Global } from "../../global"
import { Filesystem } from "../../util/filesystem"
import { Config } from "../../config/config"
import { ConfigMarkdown } from "../../config/markdown"
import { Log } from "../../util/log"
import { planFavoriteEnable } from "./favorite-plan"

export { planFavoriteEnable, newDistributionAtFor, type FavoriteEnablePlan } from "./favorite-plan"

const log = Log.create({ service: "cloud-favorite" })

const FAVORITE_PAGE_SIZE = 100
const FAVORITE_MAX_PAGES = 20

export type FavoriteItemType = "skill" | "agent" | "command" | "mcp"

type FavoriteLifecycle = "downloaded" | "active" | "unloaded"

type FavoriteStateRecord = {
  id: string
  slug: string
  name: string
  itemType: FavoriteItemType
  localPath: string
  lifecycle: FavoriteLifecycle
  installedAt: string
  updatedAt: string
  // 分发重推水位线：本客户端已应用过的最新一条 distribution 的 createdAt。
  // 订阅项被用户手动 unload 后，只有当管理员推来更新的分发（createdAt 大于
  // 此水位线）才会重新启用，从而区分「用户主动关掉的旧分发」与「管理员刚
  // 重推的新分发」。缺失 = 从未收到过分发（纯收藏），永不跨 unload 重启用。
  lastAppliedDistributionAt?: string
}

type FavoriteState = {
  items: Record<string, FavoriteStateRecord>
}

export type FavoriteItem = {
  id: string
  slug: string
  name: string
  description: string
  itemType: FavoriteItemType
  content: string
  category?: string
  version?: string
  favoriteCount?: number
  favorited?: boolean
  createdBy?: string
  createdAt?: string
  updatedAt?: string
}

/** @deprecated Use FavoriteItem instead */
export type FavoriteSkill = FavoriteItem

export type FavoriteStatus = "Cloud" | "Downloaded" | "Active" | "Unloaded"

export type FavoriteItemWithStatus = FavoriteItem & {
  status: FavoriteStatus
  localPath?: string
  /** 分发重推水位线，见 FavoriteStateRecord.lastAppliedDistributionAt */
  lastAppliedDistributionAt?: string
}

/** @deprecated Use FavoriteItemWithStatus instead */
export type FavoriteSkillWithStatus = FavoriteItemWithStatus

type RemoteListResponse = {
  items?: Array<{ id: string } & Record<string, unknown>>
  hasMore?: boolean
}

type FavoriteListItem = FavoriteItem & {
  content: ""
}

// Map store itemType values to our local type names
const STORE_TYPE_MAP: Record<string, FavoriteItemType> = {
  skill: "skill",
  subagent: "agent",
  command: "command",
  mcp: "mcp",
}

const LOCAL_TO_STORE_TYPE: Record<FavoriteItemType, string> = {
  skill: "skill",
  agent: "subagent",
  command: "command",
  mcp: "mcp",
}

function favoriteRoot() {
  return path.join(Global.Path.config, "costrict", "cloud-favorites")
}

function favoriteTypeRoot(itemType: FavoriteItemType) {
  switch (itemType) {
    case "skill":
      return path.join(favoriteRoot(), "skills")
    case "agent":
      return path.join(favoriteRoot(), "agents")
    case "command":
      return path.join(favoriteRoot(), "commands")
    case "mcp":
      return path.join(favoriteRoot(), "mcp")
  }
}

/** @deprecated Use favoriteTypeRoot("skill") */
function favoriteSkillsRoot() {
  return favoriteTypeRoot("skill")
}

function favoriteStatePath() {
  return path.join(favoriteRoot(), "state.json")
}

function globalConfigPath() {
  // Match the global config load order (config.ts:1348-1352):
  // later files override earlier ones, so higher-index = higher priority.
  const candidates = [
    "config.json",
    "opencode.json",
    "opencode.jsonc",
    "costrict.json",
    "costrict.jsonc",
  ].map((file) => path.join(Global.Path.config, file))

  let lastExisting: string | undefined
  for (const file of candidates) {
    if (existsSync(file)) {
      lastExisting = file
    }
  }
  // Write to the highest-priority existing file, or default to opencode.jsonc
  // for backward compatibility when no config exists yet.
  return lastExisting ?? candidates[2]
}

async function ensureFavoriteDirs() {
  await mkdir(favoriteRoot(), { recursive: true })
}

async function readState(): Promise<FavoriteState> {
  return Filesystem.readJson<FavoriteState>(favoriteStatePath()).catch(() => ({ items: {} }))
}

async function writeState(state: FavoriteState) {
  await ensureFavoriteDirs()
  await Filesystem.writeJson(favoriteStatePath(), state)
}

async function mutateState(fn: (state: FavoriteState) => void | Promise<void>) {
  const state = await readState()
  await fn(state)
  await writeState(state)
}

async function createAuthenticatedFetch() {
  let creds = await loadCoStrictCredentials()
  if (!creds) throw new Error("Not authenticated. Please run `cs auth login` first.")

  if (creds.refresh_token && !isCoStrictTokenValid(creds)) {
    const resolvedBaseUrl = getCoStrictBaseURL(undefined, creds.base_url)
    const refreshed = await refreshCoStrictToken({
      baseUrl: resolvedBaseUrl,
      refreshToken: creds.refresh_token,
      state: creds.state,
    }).catch(() => null)

    if (!refreshed) throw new Error("Authentication expired. Please run `cs auth login` again.")

    await saveCoStrictCredentials({
      ...creds,
      base_url: resolvedBaseUrl,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expiry_date: extractExpiryFromJWT(refreshed.access_token),
      updated_at: new Date().toISOString(),
      expired_at: new Date(extractExpiryFromJWT(refreshed.access_token)).toISOString(),
    })

    creds = {
      ...creds,
      base_url: resolvedBaseUrl,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expiry_date: extractExpiryFromJWT(refreshed.access_token),
      updated_at: new Date().toISOString(),
      expired_at: new Date(extractExpiryFromJWT(refreshed.access_token)).toISOString(),
    }
  }

  const baseUrl = getCloudBaseUrl(creds.base_url)
  const tokenPayload = parseJWT(creds.access_token)

  return {
    baseUrl,
    userID: tokenPayload.id || tokenPayload.sub || tokenPayload.name || "cli-user",
    async json<T>(url: string) {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${creds.access_token}`,
          Accept: "application/json",
        },
      })
      if (!response.ok) {
        const text = await response.text().catch(() => "")
        throw new Error(`Request failed: ${response.status} ${text}`)
      }
      return response.json() as Promise<T>
    },
  }
}

async function listRemoteCandidates(storeType?: string, extraParams?: Record<string, string>) {
  const { baseUrl, json } = await createAuthenticatedFetch()
  const result: Array<{ id: string } & Record<string, unknown>> = []

  for (let page = 1; page <= FAVORITE_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(FAVORITE_PAGE_SIZE),
    })
    if (storeType) params.set("type", storeType)
    if (extraParams) {
      for (const [key, value] of Object.entries(extraParams)) {
        params.set(key, value)
      }
    }
    const data = await json<RemoteListResponse>(`${baseUrl}/api/items?${params.toString()}`)
    const items = data.items ?? []
    result.push(...items)
    if (!data.hasMore || items.length === 0) break
  }

  return result
}

/** @deprecated Use listRemoteCandidates("skill") */
async function listRemoteSkillCandidates() {
  return listRemoteCandidates("skill")
}

function parseFavoriteListItem(data: Record<string, unknown>): FavoriteListItem | undefined {
  const storeType = String(data.itemType ?? "")
  const localType = STORE_TYPE_MAP[storeType]
  if (!localType) return undefined

  return {
    id: String(data.id),
    slug: String(data.slug ?? data.id),
    name: String(data.name ?? data.slug ?? data.id),
    description: String(data.description ?? ""),
    itemType: localType,
    content: "",
    category: typeof data.category === "string" ? data.category : undefined,
    version: typeof data.version === "string" ? data.version : undefined,
    favoriteCount: typeof data.favoriteCount === "number" ? data.favoriteCount : undefined,
    favorited: typeof data.favorited === "boolean" ? data.favorited : undefined,
    createdBy: typeof data.createdBy === "string" ? data.createdBy : undefined,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : undefined,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
  }
}

async function getRemoteItem(id: string): Promise<FavoriteItem> {
  const { baseUrl, json } = await createAuthenticatedFetch()
  const data = await json<Record<string, unknown>>(`${baseUrl}/api/items/${id}`)
  const storeType = String(data.itemType ?? "")
  const localType = STORE_TYPE_MAP[storeType]
  if (!localType) {
    throw new Error(`Unsupported item type: ${storeType} (${String(data.slug ?? id)})`)
  }
  return {
    id: String(data.id),
    slug: String(data.slug),
    name: String(data.name),
    description: String(data.description ?? ""),
    itemType: localType,
    content: String(data.content ?? ""),
    category: typeof data.category === "string" ? data.category : undefined,
    version: typeof data.version === "string" ? data.version : undefined,
    favoriteCount: typeof data.favoriteCount === "number" ? data.favoriteCount : undefined,
    favorited: typeof data.favorited === "boolean" ? data.favorited : undefined,
    createdBy: typeof data.createdBy === "string" ? data.createdBy : undefined,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : undefined,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
  }
}

/** @deprecated Use getRemoteItem */
async function getRemoteSkill(id: string): Promise<FavoriteItem> {
  return getRemoteItem(id)
}

async function resolveFavoriteItem(slugOrId: string): Promise<FavoriteItemWithStatus> {
  const favorites = await listFavoriteItems()
  const item = favorites.find((f) => f.slug === slugOrId || f.id === slugOrId)
  if (!item) throw new Error(`Favorite item not found: ${slugOrId}`)

  const detail = await getRemoteItem(item.id)
  return {
    ...detail,
    status: item.status,
    localPath: item.localPath,
  }
}

async function getFavoritePathsFromConfig() {
  const cfg = await Config.getGlobal()
  return new Set(cfg.skills?.paths ?? [])
}

async function getActiveAgentNames() {
  const cfg = await Config.getGlobal()
  return new Set(Object.keys(cfg.agent ?? {}))
}

async function getActiveCommandNames() {
  const cfg = await Config.getGlobal()
  return new Set(Object.keys(cfg.command ?? {}))
}

async function getActiveMcpNames() {
  const cfg = await Config.getGlobal()
  return new Set(Object.keys(cfg.mcp ?? {}))
}

// ── Config patching ────────────────────────────────────────────────────

async function readGlobalConfig(): Promise<{ file: string; text: string }> {
  const file = globalConfigPath()
  await mkdir(path.dirname(file), { recursive: true })
  const exists = await Filesystem.exists(file)
  const text = exists ? await Filesystem.readText(file) : "{}"
  return { file, text: text || "{}" }
}

async function patchGlobalConfig(configPath: string[], value: unknown) {
  const { file, text } = await readGlobalConfig()
  const edits = modify(text, configPath, value, {
    formattingOptions: { tabSize: 2, insertSpaces: true },
  })
  await Filesystem.write(file, applyEdits(text, edits))
}

async function removeGlobalConfig(configPath: string[]) {
  await patchGlobalConfig(configPath, undefined)
}

async function patchGlobalSkillPaths(update: (paths: string[]) => string[]) {
  const { file, text } = await readGlobalConfig()
  const parsed = JSON.parse(text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")) as {
    skills?: { paths?: string[] }
  }
  const nextPaths = update(parsed.skills?.paths ?? [])
  const edits = modify(text, ["skills", "paths"], nextPaths, {
    formattingOptions: { tabSize: 2, insertSpaces: true },
  })
  await Filesystem.write(file, applyEdits(text, edits))
}

async function addSkillPath(skillPath: string) {
  await patchGlobalSkillPaths((paths) => (paths.includes(skillPath) ? paths : [...paths, skillPath]))
}

async function removeSkillPath(skillPath: string) {
  await patchGlobalSkillPaths((paths) => paths.filter((item) => item !== skillPath))
}

// ── Per-type config registration ───────────────────────────────────────

// ── MCP config format conversion ───────────────────────────────────────

/**
 * Convert various MCP config formats to opencode's native format.
 * Supports:
 * - Opencode native: { type: "local", command: [...] }
 * - VS Code / Claude Desktop: { mcpServers: { "name": { command, args } } }
 * - Simplified: { command, args }
 */
function convertMcpConfig(config: Record<string, unknown>): Record<string, unknown> | undefined {
  // Already opencode native format
  if (typeof config.type === "string" && (config.type === "local" || config.type === "remote")) {
    return config
  }

  // VS Code / Claude Desktop format: { mcpServers: { "name": { command, args } } }
  if (config.mcpServers && typeof config.mcpServers === "object" && !Array.isArray(config.mcpServers)) {
    const servers = Object.entries(config.mcpServers as Record<string, unknown>)
    if (servers.length === 0) return undefined
    const [, server] = servers[0]
    if (server && typeof server === "object") {
      return convertSingleMcpServer(server as Record<string, unknown>)
    }
    return undefined
  }

  // Simplified format: { command, args }
  return convertSingleMcpServer(config)
}

function convertSingleMcpServer(server: Record<string, unknown>): Record<string, unknown> | undefined {
  const command = server.command
  const args = server.args

  if (!command && !args) return undefined

  const cmdArray: string[] = []
  if (typeof command === "string") {
    cmdArray.push(command)
  } else if (Array.isArray(command)) {
    for (const c of command) {
      if (typeof c === "string") cmdArray.push(c)
    }
  }

  if (Array.isArray(args)) {
    for (const arg of args) {
      if (typeof arg === "string") cmdArray.push(arg)
    }
  }

  if (cmdArray.length === 0) return undefined

  const result: Record<string, unknown> = {
    type: "local",
    command: cmdArray,
  }

  if (typeof server.environment === "object" && server.environment !== null) {
    result.environment = server.environment
  }

  return result
}

// ── Per-type config registration ───────────────────────────────────────

async function addItemToConfig(item: FavoriteItem, localPath: string) {
  switch (item.itemType) {
    case "skill":
      await addSkillPath(localPath)
      break
    case "agent": {
      const md = await ConfigMarkdown.parse(path.join(localPath, `${item.slug}.md`)).catch(() => null)
      if (md) {
        await patchGlobalConfig(["agent", item.slug], { ...md.data, prompt: md.content.trim() })
      }
      break
    }
    case "command": {
      const md = await ConfigMarkdown.parse(path.join(localPath, `${item.slug}.md`)).catch(() => null)
      if (md) {
        await patchGlobalConfig(["command", item.slug], { ...md.data, template: md.content.trim() })
      }
      break
    }
    case "mcp": {
      const mcpJsonPath = path.join(localPath, "mcp.json")
      const configJson = await Filesystem.readJson<Record<string, unknown>>(mcpJsonPath).catch(() => null)
      if (!configJson) {
        throw new Error(
          `MCP configuration file not found or unreadable: ${mcpJsonPath}\n\n` +
            `Please check that the file exists and contains valid JSON.`,
        )
      }
      const converted = convertMcpConfig(configJson)
      if (!converted) {
        const rawPreview = JSON.stringify(configJson, null, 2).slice(0, 500)
        throw new Error(
          `Unable to recognize MCP configuration format: ${item.slug}\n\n` +
            `Configuration file: ${mcpJsonPath}\n` +
            `Current content preview:\n${rawPreview}${rawPreview.length >= 500 ? "..." : ""}\n\n` +
            `Supported formats:\n\n` +
            `1. Opencode native (recommended):\n` +
            `   {\n` +
            `     "type": "local",\n` +
            `     "command": ["npx", "-y", "@modelcontextprotocol/server-zip"]\n` +
            `   }\n\n` +
            `2. VS Code / Claude Desktop style (auto-converted):\n` +
            `   {\n` +
            `     "mcpServers": {\n` +
            `       "server-name": {\n` +
            `         "command": "npx",\n` +
            `         "args": ["-y", "@modelcontextprotocol/server-zip"]\n` +
            `       }\n` +
            `     }\n` +
            `   }\n\n` +
            `Please edit the file above and re-run:\n` +
            `  cs cloud favorite load ${item.slug}`,
        )
      }
      await patchGlobalConfig(["mcp", item.slug], converted)
      break
    }
  }
}

async function removeItemFromConfig(itemType: FavoriteItemType, slug: string, localPath: string) {
  switch (itemType) {
    case "skill":
      await removeSkillPath(localPath)
      break
    case "agent":
      await removeGlobalConfig(["agent", slug])
      break
    case "command":
      await removeGlobalConfig(["command", slug])
      break
    case "mcp":
      await removeGlobalConfig(["mcp", slug])
      break
  }
}

// ── Status derivation ──────────────────────────────────────────────────

function deriveStatus(
  state: FavoriteStateRecord | undefined,
  activeSkillPaths: Set<string>,
  activeAgentNames: Set<string>,
  activeCommandNames: Set<string>,
  activeMcpNames: Set<string>,
): FavoriteStatus {
  if (!state) return "Cloud"
  switch (state.itemType) {
    case "skill":
      if (activeSkillPaths.has(state.localPath)) return "Active"
      break
    case "agent":
      if (activeAgentNames.has(state.slug)) return "Active"
      break
    case "command":
      if (activeCommandNames.has(state.slug)) return "Active"
      break
    case "mcp":
      if (activeMcpNames.has(state.slug)) return "Active"
      break
  }
  switch (state.lifecycle) {
    case "unloaded":
      return "Unloaded"
    default:
      return "Downloaded"
  }
}

// ── Persist & install ──────────────────────────────────────────────────

async function persistInstalledItem(item: FavoriteItem) {
  const typeRoot = favoriteTypeRoot(item.itemType)
  const dir = path.join(typeRoot, item.slug)
  await mkdir(dir, { recursive: true })

  // Write content file based on type
  switch (item.itemType) {
    case "skill":
      await Filesystem.write(path.join(dir, "SKILL.md"), item.content)
      break
    case "agent":
      await Filesystem.write(path.join(dir, `${item.slug}.md`), item.content)
      break
    case "command":
      await Filesystem.write(path.join(dir, `${item.slug}.md`), item.content)
      break
    case "mcp": {
      const mcpDestPath = path.join(dir, "mcp.json")
      try {
        const mcpConfig = JSON.parse(item.content)
        await Filesystem.writeJson(mcpDestPath, mcpConfig)
      } catch {
        // Content is not valid JSON — write raw but warn the user
        await Filesystem.write(mcpDestPath, item.content)
        log.warn(
          `MCP content for "${item.slug}" is not valid JSON. ` +
            `Written raw to ${mcpDestPath}. ` +
            `You may need to manually convert it to opencode MCP format before loading.`,
        )
      }
      break
    }
  }

  // Write metadata snapshot
  await Filesystem.writeJson(path.join(dir, "item.json"), {
    id: item.id,
    slug: item.slug,
    name: item.name,
    description: item.description,
    itemType: item.itemType,
    category: item.category,
    version: item.version,
    favoriteCount: item.favoriteCount,
    updatedAt: item.updatedAt,
  })

  // Update state
  await mutateState((state) => {
    state.items[item.slug] = {
      id: item.id,
      slug: item.slug,
      name: item.name,
      itemType: item.itemType,
      localPath: dir,
      lifecycle: state.items[item.slug]?.lifecycle ?? "downloaded",
      installedAt: state.items[item.slug]?.installedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // 重装/更新不得清空水位线，否则一条早已应用的旧分发会在下次同步里
      // 重新“变新”，把用户手动关掉的项again启用。
      lastAppliedDistributionAt: state.items[item.slug]?.lastAppliedDistributionAt,
    }
  })

  return dir
}

/** @deprecated Use persistInstalledItem */
async function persistInstalledSkill(skill: FavoriteItem) {
  return persistInstalledItem(skill)
}

async function ensureInstalled(slugOrId: string) {
  const hasUsableLocalContent = async (hit: FavoriteStateRecord) => {
    const contentPath = (() => {
      switch (hit.itemType) {
        case "skill":
          return path.join(hit.localPath, "SKILL.md")
        case "agent":
          return path.join(hit.localPath, `${hit.slug}.md`)
        case "command":
          return path.join(hit.localPath, `${hit.slug}.md`)
        case "mcp":
          return path.join(hit.localPath, "mcp.json")
      }
    })()
    if (!(await Filesystem.exists(contentPath))) return false
    return (await Filesystem.size(contentPath)) > 0
  }

  const state = await readState()
  const hit = state.items[slugOrId] ?? Object.values(state.items).find((item) => item.id === slugOrId)
  if (hit && (await hasUsableLocalContent(hit))) return hit

  let remote = hit ? await getRemoteItem(hit.id).catch(() => undefined) : undefined
  if (!remote) {
    const favorites = await listFavoriteItems()
    const listed = favorites.find((f) => f.slug === slugOrId || f.id === slugOrId)
    if (!listed) throw new Error(`Favorite item not found: ${slugOrId}`)
    remote = await getRemoteItem(listed.id)
  }

  const localPath = await persistInstalledItem(remote)
  return {
    id: remote.id,
    slug: remote.slug,
    name: remote.name,
    itemType: remote.itemType,
    localPath,
    lifecycle: "downloaded" as const,
    installedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

// ── Public API ──────────────────────────────────────────────────────────

export async function listFavoriteItems(type?: FavoriteItemType): Promise<FavoriteItemWithStatus[]> {
  // Fetch candidates: either a specific store type, or all supported types
  const storeTypes = type ? [LOCAL_TO_STORE_TYPE[type]] : Object.values(LOCAL_TO_STORE_TYPE)
  const candidatePages = await Promise.all(
    [...new Set(storeTypes)].map(async (st) =>
      listRemoteCandidates(st, { favorited: "true" }).catch((error) => {
        log.warn("failed to fetch remote favorite candidates", { type: st, error })
        return []
      }),
    ),
  )
  const candidates = candidatePages.flat()

  const [activeSkillPaths, activeAgentNames, activeCommandNames, activeMcpNames, state] = await Promise.all([
    getFavoritePathsFromConfig(),
    getActiveAgentNames(),
    getActiveCommandNames(),
    getActiveMcpNames(),
    readState(),
  ])

  const seen = new Set<string>()
  const result: FavoriteItemWithStatus[] = []

  for (const candidate of candidates) {
    const item = parseFavoriteListItem(candidate)
    if (!item) continue
    if (!item?.favorited) continue
    if (seen.has(item.slug)) continue
    seen.add(item.slug)
    const local = state.items[item.slug]
    result.push({
      ...item,
      status: deriveStatus(local, activeSkillPaths, activeAgentNames, activeCommandNames, activeMcpNames),
      localPath: local?.localPath,
      lastAppliedDistributionAt: local?.lastAppliedDistributionAt,
    })
  }

  // Fallback: when cloud fetch returned nothing, show locally installed items
  if (result.length === 0) {
    for (const [slug, record] of Object.entries(state.items)) {
      if (type && record.itemType !== type) continue
      if (seen.has(slug)) continue
      seen.add(slug)
      result.push({
        id: record.id,
        slug: record.slug,
        name: record.name,
        description: "",
        itemType: record.itemType,
        content: "",
        status: deriveStatus(record, activeSkillPaths, activeAgentNames, activeCommandNames, activeMcpNames),
        localPath: record.localPath,
        lastAppliedDistributionAt: record.lastAppliedDistributionAt,
      })
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name))
}

/** @deprecated Use listFavoriteItems("skill") */
export async function listFavoriteSkills(): Promise<FavoriteItemWithStatus[]> {
  return listFavoriteItems()
}

export async function viewFavoriteItem(slugOrId: string): Promise<FavoriteItemWithStatus> {
  return resolveFavoriteItem(slugOrId)
}

/** @deprecated Use viewFavoriteItem */
export async function viewFavoriteSkill(slugOrId: string): Promise<FavoriteItemWithStatus> {
  return viewFavoriteItem(slugOrId)
}

export async function downloadFavoriteItem(slugOrId: string) {
  const item = await resolveFavoriteItem(slugOrId)
  const localPath = await persistInstalledItem(item)
  await mutateState((state) => {
    const record = state.items[item.slug]
    record.lifecycle = "downloaded"
    record.updatedAt = new Date().toISOString()
    record.localPath = localPath
  })
  return { ...item, status: "Downloaded" as const, localPath }
}

/** @deprecated Use downloadFavoriteItem */
export async function downloadFavoriteSkill(slugOrId: string) {
  return downloadFavoriteItem(slugOrId)
}

export async function loadFavoriteItem(slugOrId: string) {
  const installed = await ensureInstalled(slugOrId)
  const itemForConfig = await readItemForConfig(installed)
  await addItemToConfig(itemForConfig, installed.localPath)
  await mutateState((state) => {
    const record = state.items[installed.slug]
    record.lifecycle = "active"
    record.updatedAt = new Date().toISOString()
  })
  await Config.invalidate(true)
  return installed
}

/** @deprecated Use loadFavoriteItem */
export async function loadFavoriteSkill(slugOrId: string) {
  return loadFavoriteItem(slugOrId)
}

export async function unloadFavoriteItem(slugOrId: string) {
  const installed = await ensureInstalled(slugOrId)
  await removeItemFromConfig(installed.itemType, installed.slug, installed.localPath)
  await mutateState((state) => {
    const record = state.items[installed.slug]
    record.lifecycle = "unloaded"
    record.updatedAt = new Date().toISOString()
  })
  await Config.invalidate(true)
  return installed
}

/** @deprecated Use unloadFavoriteItem */
export async function unloadFavoriteSkill(slugOrId: string) {
  return unloadFavoriteItem(slugOrId)
}

export async function uninstallFavoriteItem(slugOrId: string) {
  const installed = await ensureInstalled(slugOrId)
  await removeItemFromConfig(installed.itemType, installed.slug, installed.localPath)
  await rm(installed.localPath, { recursive: true, force: true })
  await mutateState((state) => {
    delete state.items[installed.slug]
  })
  await Config.invalidate(true)
  return installed
}

/** @deprecated Use uninstallFavoriteItem */
export async function uninstallFavoriteSkill(slugOrId: string) {
  return uninstallFavoriteItem(slugOrId)
}

// ── 订阅即启用 (auto-enable) ─────────────────────────────────────────────

/**
 * 拉取本账号收到的分发回执，聚合成 itemId → 最新一条 distribution.createdAt。
 * fail-open：这只是重启用增强，云端不可用时不应拖垮主收藏流程。
 */
export async function fetchReceivedDistributionMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const { baseUrl, json } = await createAuthenticatedFetch()
    const data = await json<{
      receipts?: Array<{ distribution?: { itemId?: string; createdAt?: string } }>
    }>(`${baseUrl}/api/distributions/my/received`)
    for (const receipt of data.receipts ?? []) {
      const itemId = receipt.distribution?.itemId
      const createdAt = receipt.distribution?.createdAt
      if (!itemId || !createdAt) continue
      const prev = map.get(itemId)
      if (!prev || new Date(createdAt).getTime() > new Date(prev).getTime()) {
        map.set(itemId, createdAt)
      }
    }
  } catch {
    // fail open
  }
  return map
}

async function applyDistributionWatermark(slug: string, at: string): Promise<void> {
  await mutateState((state) => {
    const record = state.items[slug]
    if (!record) return
    if (
      !record.lastAppliedDistributionAt ||
      new Date(at).getTime() > new Date(record.lastAppliedDistributionAt).getTime()
    ) {
      record.lastAppliedDistributionAt = at
    }
  })
}

export type EnablePendingSummary = {
  enabled: string[]
  reactivated: string[]
  errors: Array<{ slug: string; message: string }>
}

/** 按 planFavoriteEnable 的结果启用收藏项，并持久化水位线。 */
export async function enablePendingFavorites(
  items: FavoriteItemWithStatus[],
  distMap: Map<string, string>,
): Promise<EnablePendingSummary> {
  const summary: EnablePendingSummary = { enabled: [], reactivated: [], errors: [] }
  const plan = planFavoriteEnable(items, distMap)
  const reactivateSet = new Set<string>(plan.toReactivate)

  // 串行而非 Promise.all：loadFavoriteItem 对 state.json 是读-改-写，
  // 并发会 last-write-wins 丢记录和水位线。收藏数量很小，串行足够便宜。
  for (const slug of [...plan.toEnable, ...plan.toReactivate]) {
    try {
      await loadFavoriteItem(slug)
      if (reactivateSet.has(slug)) summary.reactivated.push(slug)
      else summary.enabled.push(slug)
    } catch (error) {
      summary.errors.push({ slug, message: error instanceof Error ? error.message : String(error) })
    }
  }

  // 只为启用成功的项推进水位线：一次瞬时失败不应把水位线推过一条从未真正
  // 应用的分发，否则这条分发再也不会被重试。
  const failed = new Set<string>(summary.errors.map((e) => e.slug))
  for (const { slug, at } of plan.watermarks) {
    if (failed.has(slug)) continue
    await applyDistributionWatermark(slug, at)
  }

  return summary
}

/**
 * 订阅即启用：拉一次收藏列表 + 分发回执，启用尚未激活的项，并让管理员重推
 * 穿透用户此前的 unload。静默失败，云端抖动不应影响调用方。
 */
export async function autoEnableCloudFavorites(): Promise<EnablePendingSummary | undefined> {
  try {
    const items = await listFavoriteItems()
    const distMap = await fetchReceivedDistributionMap()
    return await enablePendingFavorites(items, distMap)
  } catch {
    return undefined
  }
}

// ── Internal helpers ────────────────────────────────────────────────────

/** Read persisted item to reconstruct content for config registration */
async function readItemForConfig(installed: FavoriteStateRecord): Promise<FavoriteItem> {
  const itemMeta = await Filesystem.readJson<Record<string, unknown>>(
    path.join(installed.localPath, "item.json"),
  ).catch(() => ({}))
  return {
    id: installed.id,
    slug: installed.slug,
    name: installed.name,
    description: String((itemMeta as Record<string, unknown>).description ?? ""),
    itemType: installed.itemType,
    content: "",
  }
}
