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
import { Log } from "../../util/log"

const log = Log.create({ service: "cloud-favorite" })

const FAVORITE_PAGE_SIZE = 100
const FAVORITE_MAX_PAGES = 20

type FavoriteLifecycle = "installed" | "loaded" | "active" | "unloaded"

type FavoriteStateRecord = {
  id: string
  slug: string
  name: string
  itemType: "skill"
  localPath: string
  lifecycle: FavoriteLifecycle
  installedAt: string
  updatedAt: string
}

type FavoriteState = {
  items: Record<string, FavoriteStateRecord>
}

export type FavoriteSkill = {
  id: string
  slug: string
  name: string
  description: string
  itemType: "skill"
  content: string
  category?: string
  version?: string
  favoriteCount?: number
  favorited?: boolean
  createdBy?: string
  createdAt?: string
  updatedAt?: string
}

export type FavoriteStatus = "Cloud" | "Installed" | "Loaded" | "Active" | "Unloaded"

export type FavoriteSkillWithStatus = FavoriteSkill & {
  status: FavoriteStatus
  localPath?: string
}

type RemoteListResponse = {
  items?: Array<{ id: string } & Record<string, unknown>>
  hasMore?: boolean
}

function favoriteRoot() {
  return path.join(Global.Path.config, "costrict", "cloud-favorites")
}

function favoriteSkillsRoot() {
  return path.join(favoriteRoot(), "skills")
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
  await mkdir(favoriteSkillsRoot(), { recursive: true })
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

async function listRemoteSkillCandidates() {
  const { baseUrl, json } = await createAuthenticatedFetch()
  const result: Array<{ id: string } & Record<string, unknown>> = []

  for (let page = 1; page <= FAVORITE_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      type: "skill",
      page: String(page),
      pageSize: String(FAVORITE_PAGE_SIZE),
    })
    const data = await json<RemoteListResponse>(`${baseUrl}/api/items?${params.toString()}`)
    const items = data.items ?? []
    result.push(...items)
    if (!data.hasMore || items.length === 0) break
  }

  return result
}

async function getRemoteSkill(id: string): Promise<FavoriteSkill> {
  const { baseUrl, json } = await createAuthenticatedFetch()
  const data = await json<Record<string, unknown>>(`${baseUrl}/api/items/${id}`)
  if (data.itemType !== "skill") {
    throw new Error(`Only skill favorites are supported right now: ${String(data.slug ?? id)}`)
  }
  return {
    id: String(data.id),
    slug: String(data.slug),
    name: String(data.name),
    description: String(data.description ?? ""),
    itemType: "skill",
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

async function getFavoritePathsFromConfig() {
  const cfg = await Config.getGlobal()
  return new Set(cfg.skills?.paths ?? [])
}

async function patchGlobalSkillPaths(update: (paths: string[]) => string[]) {
  const file = globalConfigPath()
  await mkdir(path.dirname(file), { recursive: true })
  const exists = await Filesystem.exists(file)
  const before = exists ? await Filesystem.readText(file) : "{}"
  const parsed = JSON.parse((before || "{}").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")) as {
    skills?: { paths?: string[] }
  }
  const nextPaths = update(parsed.skills?.paths ?? [])
  const edits = modify(before || "{}", ["skills", "paths"], nextPaths, {
    formattingOptions: { tabSize: 2, insertSpaces: true },
  })
  await Filesystem.write(file, applyEdits(before || "{}", edits))
}

async function addSkillPath(skillPath: string) {
  await patchGlobalSkillPaths((paths) => (paths.includes(skillPath) ? paths : [...paths, skillPath]))
}

async function removeSkillPath(skillPath: string) {
  await patchGlobalSkillPaths((paths) => paths.filter((item) => item !== skillPath))
}

function deriveStatus(state: FavoriteStateRecord | undefined, activePaths: Set<string>): FavoriteStatus {
  if (!state) return "Cloud"
  if (activePaths.has(state.localPath)) return "Active"
  switch (state.lifecycle) {
    case "loaded":
      return "Loaded"
    case "unloaded":
      return "Unloaded"
    case "active":
      return "Installed"
    default:
      return "Installed"
  }
}

async function persistInstalledSkill(skill: FavoriteSkill) {
  await ensureFavoriteDirs()
  const dir = path.join(favoriteSkillsRoot(), skill.slug)
  await mkdir(dir, { recursive: true })
  await Filesystem.write(path.join(dir, "SKILL.md"), skill.content)
  await Filesystem.writeJson(path.join(dir, "item.json"), {
    id: skill.id,
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    itemType: skill.itemType,
    category: skill.category,
    version: skill.version,
    favoriteCount: skill.favoriteCount,
    updatedAt: skill.updatedAt,
  })

  await mutateState((state) => {
    state.items[skill.slug] = {
      id: skill.id,
      slug: skill.slug,
      name: skill.name,
      itemType: "skill",
      localPath: dir,
      lifecycle: state.items[skill.slug]?.lifecycle ?? "installed",
      installedAt: state.items[skill.slug]?.installedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  })

  return dir
}

async function ensureInstalled(slugOrId: string) {
  const state = await readState()
  const hit = state.items[slugOrId] ?? Object.values(state.items).find((item) => item.id === slugOrId)
  if (hit && (await Filesystem.exists(path.join(hit.localPath, "SKILL.md")))) {
    return hit
  }

  const favorites = await listFavoriteSkills()
  const skill = favorites.find((item) => item.slug === slugOrId || item.id === slugOrId)
  if (!skill) throw new Error(`Favorite skill not found: ${slugOrId}`)
  const localPath = await persistInstalledSkill(skill)
  return {
    id: skill.id,
    slug: skill.slug,
    name: skill.name,
    itemType: "skill" as const,
    localPath,
    lifecycle: "installed" as const,
    installedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export async function listFavoriteSkills(): Promise<FavoriteSkillWithStatus[]> {
  const candidates = await listRemoteSkillCandidates()
  const details = await Promise.all(
    candidates.map(async (item) =>
      getRemoteSkill(String(item.id)).catch((error) => {
        log.warn("failed to inspect remote favorite candidate", { id: item.id, error })
        return undefined
      }),
    ),
  )

  const activePaths = await getFavoritePathsFromConfig()
  const state = await readState()
  const seen = new Set<string>()
  const result: FavoriteSkillWithStatus[] = []

  for (const item of details) {
    if (!item?.favorited) continue
    if (seen.has(item.slug)) continue
    seen.add(item.slug)
    const local = state.items[item.slug]
    result.push({
      ...item,
      status: deriveStatus(local, activePaths),
      localPath: local?.localPath,
    })
  }

  return result.sort((a, b) => a.name.localeCompare(b.name))
}

export async function viewFavoriteSkill(slugOrId: string): Promise<FavoriteSkillWithStatus> {
  const favorites = await listFavoriteSkills()
  const item = favorites.find((skill) => skill.slug === slugOrId || skill.id === slugOrId)
  if (!item) throw new Error(`Favorite skill not found: ${slugOrId}`)
  return item
}

export async function installFavoriteSkill(slugOrId: string) {
  const skill = await viewFavoriteSkill(slugOrId)
  const localPath = await persistInstalledSkill(skill)
  await mutateState((state) => {
    const record = state.items[skill.slug]
    record.lifecycle = "installed"
    record.updatedAt = new Date().toISOString()
    record.localPath = localPath
  })
  return { ...skill, status: "Installed" as const, localPath }
}

export async function loadFavoriteSkill(slugOrId: string) {
  const installed = await ensureInstalled(slugOrId)
  await mutateState((state) => {
    const record = state.items[installed.slug]
    record.lifecycle = "loaded"
    record.updatedAt = new Date().toISOString()
  })
  return installed
}

export async function activateFavoriteSkill(slugOrId: string) {
  const installed = await ensureInstalled(slugOrId)
  await addSkillPath(installed.localPath)
  await mutateState((state) => {
    const record = state.items[installed.slug]
    record.lifecycle = "active"
    record.updatedAt = new Date().toISOString()
  })
  await Config.invalidate(true)
  return installed
}

export async function unloadFavoriteSkill(slugOrId: string) {
  const installed = await ensureInstalled(slugOrId)
  await removeSkillPath(installed.localPath)
  await mutateState((state) => {
    const record = state.items[installed.slug]
    record.lifecycle = "unloaded"
    record.updatedAt = new Date().toISOString()
  })
  await Config.invalidate(true)
  return installed
}

export async function uninstallFavoriteSkill(slugOrId: string) {
  const installed = await ensureInstalled(slugOrId)
  await removeSkillPath(installed.localPath)
  await rm(installed.localPath, { recursive: true, force: true })
  await mutateState((state) => {
    delete state.items[installed.slug]
  })
  await Config.invalidate(true)
  return installed
}
