import path from "node:path"
import { existsSync } from "node:fs"
import { mkdir, rm } from "node:fs/promises"
import { applyEdits, modify } from "jsonc-parser"
import { loadCoStrictCredentials, saveCoStrictCredentials } from "../provider/credentials"
import { extractExpiryFromJWT, isCoStrictTokenValid, parseJWT, refreshCoStrictToken } from "../provider/token"
import { getCloudBaseUrl } from "../device/client"
import { Global } from "../../global"
import { Filesystem } from "../../util/filesystem"
import { Config } from "../../config/config"
import { ConfigMarkdown } from "../../config/markdown"
import { Log } from "../../util/log"

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
}

/** @deprecated Use FavoriteItemWithStatus instead */
export type FavoriteSkillWithStatus = FavoriteItemWithStatus

type RemoteListResponse = {
  items?: Array<{ id: string } & Record<string, unknown>>
  hasMore?: boolean
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
  const candidates = ["opencode.jsonc", "opencode.json", "config.json"].map((file) =>
    path.join(Global.Path.config, file),
  )
  for (const file of candidates) {
    if (existsSync(file)) return file
  }
  return candidates[0]
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
    const refreshed = await refreshCoStrictToken({
      baseUrl: creds.base_url,
      refreshToken: creds.refresh_token,
      state: creds.state,
    }).catch(() => null)

    if (!refreshed) throw new Error("Authentication expired. Please run `cs auth login` again.")

    await saveCoStrictCredentials({
      ...creds,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expiry_date: extractExpiryFromJWT(refreshed.access_token),
      updated_at: new Date().toISOString(),
      expired_at: new Date(extractExpiryFromJWT(refreshed.access_token)).toISOString(),
    })

    creds = {
      ...creds,
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

async function listRemoteCandidates(storeType?: string) {
  const { baseUrl, json } = await createAuthenticatedFetch()
  const result: Array<{ id: string } & Record<string, unknown>> = []

  for (let page = 1; page <= FAVORITE_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(FAVORITE_PAGE_SIZE),
    })
    if (storeType) params.set("type", storeType)
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
      const configJson = await Filesystem.readJson<Record<string, unknown>>(
        path.join(localPath, "mcp.json"),
      ).catch(() => null)
      if (configJson) {
        await patchGlobalConfig(["mcp", item.slug], configJson)
      }
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
    case "mcp":
      // MCP content is expected to be JSON config; try parsing, fallback to raw
      try {
        const mcpConfig = JSON.parse(item.content)
        await Filesystem.writeJson(path.join(dir, "mcp.json"), mcpConfig)
      } catch {
        await Filesystem.write(path.join(dir, "mcp.json"), item.content)
      }
      break
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
    }
  })

  return dir
}

/** @deprecated Use persistInstalledItem */
async function persistInstalledSkill(skill: FavoriteItem) {
  return persistInstalledItem(skill)
}

async function ensureInstalled(slugOrId: string) {
  const state = await readState()
  const hit = state.items[slugOrId] ?? Object.values(state.items).find((item) => item.id === slugOrId)
  if (hit) {
    // Check that content file exists
    const contentExists = await (async () => {
      switch (hit.itemType) {
        case "skill":
          return Filesystem.exists(path.join(hit.localPath, "SKILL.md"))
        case "agent":
          return Filesystem.exists(path.join(hit.localPath, `${hit.slug}.md`))
        case "command":
          return Filesystem.exists(path.join(hit.localPath, `${hit.slug}.md`))
        case "mcp":
          return Filesystem.exists(path.join(hit.localPath, "mcp.json"))
      }
    })()
    if (contentExists) return hit
  }

  const favorites = await listFavoriteItems()
  const item = favorites.find((f) => f.slug === slugOrId || f.id === slugOrId)
  if (!item) throw new Error(`Favorite item not found: ${slugOrId}`)
  const localPath = await persistInstalledItem(item)
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    itemType: item.itemType,
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
  const allCandidates: Array<{ id: string } & Record<string, unknown>> = []
  for (const st of [...new Set(storeTypes)]) {
    const candidates = await listRemoteCandidates(st)
    allCandidates.push(...candidates)
  }

  const details = await Promise.all(
    allCandidates.map(async (item) =>
      getRemoteItem(String(item.id)).catch((error) => {
        log.warn("failed to inspect remote favorite candidate", { id: item.id, error })
        return undefined
      }),
    ),
  )

  const [activeSkillPaths, activeAgentNames, activeCommandNames, activeMcpNames, state] = await Promise.all([
    getFavoritePathsFromConfig(),
    getActiveAgentNames(),
    getActiveCommandNames(),
    getActiveMcpNames(),
    readState(),
  ])

  const seen = new Set<string>()
  const result: FavoriteItemWithStatus[] = []

  for (const item of details) {
    if (!item?.favorited) continue
    if (seen.has(item.slug)) continue
    seen.add(item.slug)
    const local = state.items[item.slug]
    result.push({
      ...item,
      status: deriveStatus(local, activeSkillPaths, activeAgentNames, activeCommandNames, activeMcpNames),
      localPath: local?.localPath,
    })
  }

  return result.sort((a, b) => a.name.localeCompare(b.name))
}

/** @deprecated Use listFavoriteItems("skill") */
export async function listFavoriteSkills(): Promise<FavoriteItemWithStatus[]> {
  return listFavoriteItems()
}

export async function viewFavoriteItem(slugOrId: string): Promise<FavoriteItemWithStatus> {
  const favorites = await listFavoriteItems()
  const item = favorites.find((f) => f.slug === slugOrId || f.id === slugOrId)
  if (!item) throw new Error(`Favorite item not found: ${slugOrId}`)
  return item
}

/** @deprecated Use viewFavoriteItem */
export async function viewFavoriteSkill(slugOrId: string): Promise<FavoriteItemWithStatus> {
  return viewFavoriteItem(slugOrId)
}

export async function downloadFavoriteItem(slugOrId: string) {
  const item = await viewFavoriteItem(slugOrId)
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
    description: String(itemMeta.description ?? ""),
    itemType: installed.itemType,
    content: "",
  }
}
