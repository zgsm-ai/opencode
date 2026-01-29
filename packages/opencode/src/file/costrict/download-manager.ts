// costrict 下载管理器
import path from "path"

/*costrict change*/
// 默认下载地址
export const DEFAULT_DOWNLOAD_URLS: Record<string, string> = {
  "x64-win32": "https://shenma.sangfor.com.cn/costrict/opencode/ripgrep-14.1.1-x86_64-pc-windows-msvc.zip",
  "x64-linux": "https://shenma.sangfor.com.cn/costrict/opencode/ripgrep-14.1.1-x86_64-unknown-linux-musl.tar.gz",
}
/*costrict change*/

export interface DownloadConfig {
  version: string
  filename: string
  platform: string
  extension: string
  processPlatformKey?: string
}

export interface DownloadError {
  url: string
  status: number
}

// 根据平台构建私服 URL 路径
function buildPrivateRegistryPath(config: DownloadConfig): string {
  const { version, filename, processPlatformKey } = config
  
  /*costrict change*/
  // 特定平台的自定义路径
  if (processPlatformKey === "x64-win32") {
    return `ripgrep-win64/${version}/${filename}`
  }
  
  if (processPlatformKey === "x64-linux") {
    return `ripgrep-linux/${version}/${filename}`
  }
  /*costrict change*/
  
  // 其他平台使用默认路径
  return filename
}

export async function downloadWithFallback(
  publicUrl: string,
  config: DownloadConfig,
): Promise<ArrayBuffer> {
  /*costrict change*/
  // 优先使用默认下载地址
  const { processPlatformKey } = config
  if (processPlatformKey && DEFAULT_DOWNLOAD_URLS[processPlatformKey]) {
    const defaultUrl = DEFAULT_DOWNLOAD_URLS[processPlatformKey]
    try {
      console.log(`Trying default download URL: ${defaultUrl}`)
      const response = await fetch(defaultUrl)
      if (response.ok) {
        return await response.arrayBuffer()
      }
      console.log(`Default download failed: ${defaultUrl} (status: ${response.status})`)
    } catch (error) {
      console.log(`Default download error: ${error}`)
    }
  }
  /*costrict change*/
  
  // 尝试从 GitHub 下载
  try {
    const response = await fetch(publicUrl)
    if (response.ok) {
      return await response.arrayBuffer()
    }
    throw new Error(`GitHub download failed: ${publicUrl} (status: ${response.status})`)
  } catch (error) {
    // GitHub 下载失败，尝试从内网私服下载
    const privateRegistryUrl = process.env.COSTRICT_PRIVATE_REGISTRY
    if (!privateRegistryUrl) {
      console.log("COSTRICT_PRIVATE_REGISTRY environment variable not set, skipping private registry")
      throw error
    }
    const privatePath = buildPrivateRegistryPath(config)
    const privateUrl = `${privateRegistryUrl}${privatePath}`
    
    console.log(`GitHub download failed, trying private registry: ${privateUrl}`)
    
    const privateResponse = await fetch(privateUrl)
    if (!privateResponse.ok) {
      throw new Error(`Private registry download failed: ${privateUrl} (status: ${privateResponse.status})`)
    }
    
    return await privateResponse.arrayBuffer()
  }
}