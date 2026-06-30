import { showToast } from "@opencode-ai/ui/toast"
import { createDeviceClient, type RuntimeConfig } from "@/client/device-client"
import { isBinaryFileError } from "@/client/device-transport"
import { getProxyUrl } from "./url"

export type { RuntimeConfig }

export type FileEntry = {
  name: string
  path: string
  absolute: string
  type: "file" | "directory"
  ignored: boolean
}

export type FileContent = {
  type: "text" | "binary"
  content: string
  diff?: string
  patch?: string
  encoding?: string
  mimeType?: string
}

function client(deviceId: string) {
  return createDeviceClient({ baseUrl: getProxyUrl(deviceId) })
}

export async function checkRuntimeConfig(deviceId: string): Promise<{
  supported: boolean
  config: RuntimeConfig | null
  error?: string
}> {
  try {
    const cfg = await client(deviceId).runtime.config()
    return {
      supported: cfg.allow_absolute_paths,
      config: cfg,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("404") || msg.includes("not found")) {
      return {
        supported: false,
        config: null,
        error: "设备不支持运行时配置，请升级 opencode",
      }
    }
    return {
      supported: false,
      config: null,
      error: msg,
    }
  }
}

export const deviceFileApi = {
  list: async (deviceId: string, absolutePath: string): Promise<FileEntry[]> => {
    try {
      return await client(deviceId).runtime.fileList(absolutePath)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast({ title: "无法读取目录", description: msg })
      throw err
    }
  },

  listRoots: async (deviceId: string): Promise<FileEntry[]> => {
    try {
      return await client(deviceId).runtime.roots()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast({ title: "无法读取盘符", description: msg })
      throw err
    }
  },

  read: async (deviceId: string, absolutePath: string): Promise<FileContent> => {
    try {
      const res = await client(deviceId).runtime.fileRead(absolutePath)
      return { type: res.type, content: res.content }
    } catch (err) {
      if (isBinaryFileError(err)) {
        const { useLanguage } = await import("@/context/language")
        const msg = useLanguage().t("file.preview.binaryUnsupported")
        showToast({ title: msg })
        throw new Error(msg)
      }
      const msg = err instanceof Error ? err.message : String(err)
      showToast({ title: "无法读取文件", description: msg })
      throw err
    }
  },

  search: async (
    deviceId: string,
    absolutePath: string,
    query: string,
    options?: { type?: "file" | "directory"; limit?: number }
  ): Promise<string[]> => {
    try {
      const c = client(deviceId)
      const input: Record<string, string> = { query, dirs: options?.type === "directory" ? "true" : "false" }
      if (options?.limit) input.limit = String(options.limit)
      const res = await c.runtime.findFiles(query, input.dirs as "true" | "false")
      return (res as string[]) ?? []
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast({ title: "搜索失败", description: msg })
      throw err
    }
  },

  getConfig: (deviceId: string): Promise<RuntimeConfig> =>
    client(deviceId).runtime.config(),

  getDefaultPath: (() => {
    const cache = new Map<string, string>()
    return async (deviceId: string): Promise<string> => {
      const hit = cache.get(deviceId)
      if (hit) return hit
      const res = await client(deviceId).runtime.path() as { home?: string; directory?: string } | null
      const p = res?.directory || res?.home || "/"
      cache.set(deviceId, p)
      return p
    }
  })(),
}
