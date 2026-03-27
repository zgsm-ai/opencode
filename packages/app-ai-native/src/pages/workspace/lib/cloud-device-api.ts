// Cloud Device File API - 使用新的 cloud/file/* 接口访问远程设备文件
import { showToast } from "@opencode-ai/ui/toast"
import { getProxyUrl } from "./url"

/**
 * 通过云端代理访问设备的 API
 * 路径格式: /cloud/device/{deviceID}/proxy/{devicePath}
 */
async function deviceProxyFetch<T>(
  deviceId: string,
  path: string,
  options?: RequestInit
): Promise<T> {
  // 确保 path 不以 / 开头
  const cleanPath = path.startsWith("/") ? path.slice(1) : path
  const proxyPath = `${getProxyUrl(deviceId)}/${cleanPath}`

  const res = await fetch(proxyPath, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `Request failed: ${res.status}`)
  }

  return res.json()
}

// 文件/目录类型
export interface FileNode {
  name: string
  path: string
  absolute: string
  type: "file" | "directory"
  ignored: boolean
}

// 文件内容类型
export interface FileContent {
  type: "text" | "binary"
  content: string
  diff?: string
  patch?: string
  encoding?: string
  mimeType?: string
}

// Cloud Config Info
export interface CloudConfigInfo {
  allowAbsolutePaths: boolean
  maxListDepth: number
  allowedOperations: string[]
  blacklistCount: number
  whitelistEnabled: boolean
}

/**
 * 检查设备是否支持绝对路径访问
 */
export async function checkCloudFileSupport(deviceId: string): Promise<{
  supported: boolean
  config: CloudConfigInfo | null
  error?: string
}> {
  try {
    const config = await deviceProxyFetch<CloudConfigInfo>(
      deviceId,
      "/cloud/config",
      { method: "GET" }
    )
    
    return {
      supported: config.allowAbsolutePaths,
      config,
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    // 如果 404，说明设备端不支持 cloud file API
    if (errorMessage.includes("404") || errorMessage.includes("not found")) {
      return {
        supported: false,
        config: null,
        error: "设备不支持云端文件访问，请升级 opencode",
      }
    }
    return {
      supported: false,
      config: null,
      error: errorMessage,
    }
  }
}

// 云端设备文件 API
export const cloudDeviceFileApi = {
  /**
   * 列出目录内容（绝对路径）
   * GET /cloud/file/list?path={absolutePath}
   */
  list: async (deviceId: string, absolutePath: string): Promise<FileNode[]> => {
    try {
      return await deviceProxyFetch<FileNode[]>(
        deviceId,
        `/cloud/file/list?path=${encodeURIComponent(absolutePath)}`,
        { method: "GET" }
      )
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      showToast({
        title: "无法读取目录",
        description: errorMessage,
      })
      throw err
    }
  },

  /**
   * 读取文件内容（绝对路径）
   * GET /cloud/file/read?path={absolutePath}
   */
  read: async (deviceId: string, absolutePath: string): Promise<FileContent> => {
    try {
      return await deviceProxyFetch<FileContent>(
        deviceId,
        `/cloud/file/read?path=${encodeURIComponent(absolutePath)}`,
        { method: "GET" }
      )
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      showToast({
        title: "无法读取文件",
        description: errorMessage,
      })
      throw err
    }
  },

  /**
   * 搜索文件（绝对路径）
   * GET /cloud/file/search?path={absolutePath}&query={query}&type={type}&limit={limit}
   */
  search: async (
    deviceId: string,
    absolutePath: string,
    query: string,
    options?: { type?: "file" | "directory"; limit?: number }
  ): Promise<string[]> => {
    try {
      const params = new URLSearchParams({
        path: absolutePath,
        query,
      })
      if (options?.type) params.set("type", options.type)
      if (options?.limit) params.set("limit", options.limit.toString())

      return await deviceProxyFetch<string[]>(
        deviceId,
        `/cloud/file/search?${params.toString()}`,
        { method: "GET" }
      )
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      showToast({
        title: "搜索失败",
        description: errorMessage,
      })
      throw err
    }
  },

  /**
   * 获取云端配置
   */
  getConfig: (deviceId: string): Promise<CloudConfigInfo> =>
    deviceProxyFetch<CloudConfigInfo>(deviceId, "/cloud/config", { method: "GET" }),
}
