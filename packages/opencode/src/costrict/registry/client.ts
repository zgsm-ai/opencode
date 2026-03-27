import path from "path"
import { Global } from "../../global"
import { Filesystem } from "../../util/filesystem"
import { Log } from "../../util/log"
import { loadCoStrictCredentials } from "../provider/credentials"
import { isCoStrictTokenValid, refreshCoStrictToken } from "../provider/token"
import { ForbiddenError, NotLoggedInError, UnauthorizedError } from "./types"
import type { AccessCache, CreateItemRequest, CreateItemResponse, CreateRegistryRequest, CreateRegistryResponse, IndexJson, RegistryAccess, UploadArtifactResponse } from "./types"

const log = Log.create({ service: "registry-client" })

const ACCESS_CACHE_TTL = 60 * 60 * 1000

function parseRegistryOrg(url: string): { origin: string; org: string } | null {
  try {
    const u = new URL(url)
    const match = u.pathname.match(/^\/registry\/([^/]+)/)
    if (!match) return null
    return { origin: u.origin, org: match[1] }
  } catch {
    return null
  }
}

function accessCachePath(origin: string, org: string): string {
  const key = `${new URL(origin).hostname}-${org}`
  return path.join(Global.Path.cache, "registry-access", `${key}.json`)
}

async function readAccessCache(origin: string, org: string): Promise<boolean | undefined> {
  const p = accessCachePath(origin, org)
  const data = await Filesystem.readJson<AccessCache>(p).catch(() => undefined)
  if (!data) return undefined
  if (Date.now() - data.cachedAt > ACCESS_CACHE_TTL) return undefined
  return data.public
}

async function writeAccessCache(origin: string, org: string, isPublic: boolean): Promise<void> {
  const p = accessCachePath(origin, org)
  await Filesystem.writeJson(p, { public: isPublic, cachedAt: Date.now() } satisfies AccessCache)
}

async function fetchAccess(origin: string, org: string): Promise<boolean> {
  const url = `${origin}/registry/${org}/access`
  log.info("probing registry access", { url })
  const res = await fetch(url).catch((err) => {
    log.warn("failed to probe registry access", { url, err })
    return undefined
  })
  if (!res?.ok) return false
  const data = await res.json().catch(() => undefined) as RegistryAccess | undefined
  return data?.public ?? false
}

export async function resolveToken(url: string): Promise<string | undefined> {
  const parsed = parseRegistryOrg(url)
  if (!parsed) return undefined

  const cached = await readAccessCache(parsed.origin, parsed.org)
  const isPublic = cached ?? await fetchAccess(parsed.origin, parsed.org)

  if (cached === undefined) {
    await writeAccessCache(parsed.origin, parsed.org, isPublic)
  }

  if (isPublic) return undefined

  return resolveLoggedInToken()
}

export async function resolveLoggedInToken(): Promise<string> {
  const credentials = await loadCoStrictCredentials()
  if (!credentials) throw new NotLoggedInError()

  if (isCoStrictTokenValid(credentials)) return credentials.access_token

  if (!credentials.refresh_token) throw new NotLoggedInError()

  const refreshed = await refreshCoStrictToken({
    baseUrl: credentials.base_url,
    refreshToken: credentials.refresh_token,
    state: credentials.state,
  }).catch(() => null)

  if (!refreshed) throw new NotLoggedInError()

  return refreshed.access_token
}

export async function fetchIndex(registryUrl: string): Promise<IndexJson> {
  const base = registryUrl.endsWith("/") ? registryUrl : `${registryUrl}/`
  const url = new URL("index.json", base).href

  const token = await resolveToken(registryUrl)
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

  log.info("fetching registry index", { url })
  const res = await fetch(url, { headers }).catch((err) => {
    throw new Error(`Failed to reach registry: ${registryUrl} (${err.message})`)
  })

  if (res.status === 401) throw new UnauthorizedError()
  if (res.status === 403) throw new ForbiddenError()
  if (!res.ok) throw new Error(`Failed to fetch index: ${res.status}`)

  return res.json() as Promise<IndexJson>
}

export async function fetchFile(fileUrl: string, token: string | undefined): Promise<Response> {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
  const res = await fetch(fileUrl, { headers }).catch((err) => {
    throw new Error(`Failed to download: ${fileUrl} (${err.message})`)
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (res.status === 403) throw new ForbiddenError()
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${fileUrl}`)
  return res
}

export async function invalidateAccessCache(registryUrl: string): Promise<void> {
  const parsed = parseRegistryOrg(registryUrl)
  if (!parsed) return
  const p = accessCachePath(parsed.origin, parsed.org)
  await Filesystem.write(p, "").catch(() => {})
}

export async function createRegistry(
  baseUrl: string,
  request: CreateRegistryRequest
): Promise<CreateRegistryResponse> {
  const url = `${baseUrl.replace(/\/$/, "")}`
  const token = await resolveLoggedInToken()

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  }

  console.log(`→ POST ${url}`)
  console.log(`  Headers: ${JSON.stringify({ ...headers, Authorization: token ? "Bearer ***" : undefined })}`)
  console.log(`  Body: ${JSON.stringify(request)}`)

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  }).catch((err) => {
    console.log(`  Error: ${err.message}`)
    throw new Error(`Failed to create registry: ${err.message}`)
  })

  console.log(`← ${res.status} ${res.statusText}`)

  if (res.status === 401) throw new UnauthorizedError()
  if (res.status === 403) throw new ForbiddenError()
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    console.log(`  Response: ${text}`)
    throw new Error(`Failed to create registry: ${res.status}`)
  }

  const data = await res.json() as CreateRegistryResponse
  console.log(`  Response: ${JSON.stringify(data)}`)
  return data
}

export async function createItem(
  baseUrl: string,
  request: CreateItemRequest
): Promise<CreateItemResponse> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/items`
  const token = await resolveLoggedInToken()

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  console.log(`→ POST ${url}`)
  console.log(`  Headers: ${JSON.stringify({ ...headers, Authorization: token ? "Bearer ***" : undefined })}`)
  console.log(`  Body: ${JSON.stringify({ ...request, content: request.content ? "[SKILL.md content]" : undefined })}`)

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  }).catch((err) => {
    console.log(`  Error: ${err.message}`)
    throw new Error(`Failed to create item: ${err.message}`)
  })

  console.log(`← ${res.status} ${res.statusText}`)

  if (res.status === 401) throw new UnauthorizedError()
  if (res.status === 403) throw new ForbiddenError()
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    console.log(`  Response: ${text}`)
    throw new Error(`Failed to create item: ${res.status}`)
  }

  const data = await res.json() as CreateItemResponse
  console.log(`  Response: ${JSON.stringify(data)}`)
  return data
}

export async function uploadArtifact(
  baseUrl: string,
  itemId: string,
  filePath: string,
  version?: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<UploadArtifactResponse> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/artifacts/upload`
  const token = await resolveLoggedInToken()

  const file = Bun.file(filePath)
  const filename = path.basename(filePath)
  const total = file.size

  console.log(`→ POST ${url}`)
  console.log(`  Headers: ${JSON.stringify({ Authorization: token ? "Bearer ***" : undefined })}`)
  console.log(`  File: ${filename} (${total} bytes)`)
  console.log(`  Item ID: ${itemId}`)
  if (version) console.log(`  Version: ${version}`)

  let fileBlob: Blob

  // 如果提供了进度回调，创建 TransformStream 来跟踪上传进度
  if (onProgress && total > 0) {
    let loaded = 0
    const progressTransform = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        loaded += chunk.byteLength
        onProgress(loaded, total)
        controller.enqueue(chunk)
      },
    })
    const fileStream = file.stream().pipeThrough(progressTransform)
    // Bun 支持将 ReadableStream 直接传递给 Blob 构造函数（使用类型断言绕过 TypeScript 限制）
    fileBlob = new Blob([fileStream as unknown as BlobPart])
  } else {
    fileBlob = file
  }

  const formData = new FormData()
  formData.append("file", fileBlob, filename)
  formData.append("item_id", itemId)
  if (version) {
    formData.append("version", version)
  }

  const headers: Record<string, string> = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: formData,
  }).catch((err) => {
    console.log(`  Error: ${err.message}`)
    throw new Error(`Failed to upload artifact: ${err.message}`)
  })

  console.log(`← ${res.status} ${res.statusText}`)

  if (res.status === 401) throw new UnauthorizedError()
  if (res.status === 403) throw new ForbiddenError()
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    console.log(`  Response: ${text}`)
    throw new Error(`Failed to upload artifact: ${res.status}`)
  }

  const data = await res.json() as UploadArtifactResponse
  console.log(`  Response: ${JSON.stringify(data)}`)
  return data
}
