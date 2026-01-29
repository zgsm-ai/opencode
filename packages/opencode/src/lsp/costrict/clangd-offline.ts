import { spawn, type ChildProcessWithoutNullStreams } from "child_process"
import path from "path"
import os from "os"
import { Global } from "../../global"
import { Log } from "../../util/log"
import { $ } from "bun"
import fs from "fs/promises"
import { Filesystem } from "../../util/filesystem"
import { Instance } from "../../project/instance"

const log = Log.create({ service: "lsp.clangd-offline" })
const pathExists = async (p: string) =>
  fs
    .stat(p)
    .then(() => true)
    .catch(() => false)

const NearestRoot = (includePatterns: string[], excludePatterns?: string[]) => {
  return async (file: string) => {
    if (excludePatterns) {
      const excludedFiles = Filesystem.up({
        targets: excludePatterns,
        start: path.dirname(file),
        stop: Instance.directory,
      })
      const excluded = await excludedFiles.next()
      await excludedFiles.return()
      if (excluded.value) return undefined
    }
    const files = Filesystem.up({
      targets: includePatterns,
      start: path.dirname(file),
      stop: Instance.directory,
    })
    const first = await files.next()
    await files.return()
    if (!first.value) return Instance.directory
    return path.dirname(first.value)
  }
}

export namespace CLANGD_OFFLINE {
  // 默认版本号
  const DEFAULT_VERSION = "18.1.3"
  
  /*costrict change*/
  // 默认下载地址
  const DEFAULT_DOWNLOAD_URLS: Record<string, string> = {
    linux: "https://shenma.sangfor.com.cn/costrict/opencode/clangd-linux-18.1.3.zip",
    windows: "https://shenma.sangfor.com.cn/costrict/opencode/clangd-windows-18.1.3.zip",
  }
  /*costrict change*/

  export interface Handle {
    process: ChildProcessWithoutNullStreams
    initialization?: Record<string, any>
  }

  /**
   * 获取平台特定的后缀（用于文件名）
   */
  function getPlatformSuffix(): string {
    const platform = process.platform
    const arch = os.arch()

    let platformName: string
    switch (platform) {
      case "darwin":
        platformName = "macos"
        break
      case "linux":
        platformName = "linux"
        break
      case "win32":
        platformName = "windows"
        break
      default:
        log.error("Unsupported platform", { platform })
        return ""
    }

    let archName: string
    switch (arch) {
      case "x64":
        archName = "amd64"
        break
      case "arm64":
        archName = "arm64"
        break
      default:
        log.error("Unsupported architecture", { arch })
        return ""
    }

    return `${platformName}-${archName}`
  }

  /**
   * 获取平台名称（用于 URL 构建）
   */
  function getPlatformName(): string {
    const platform = process.platform
    switch (platform) {
      case "darwin":
        return "mac"
      case "linux":
        return "linux"
      case "win32":
        return "windows"
      default:
        log.error("Unsupported platform", { platform })
        return ""
    }
  }

  /**
   * 从内网私服下载 clangd 离线包
   * @param internalUrl 完整的下载地址或基础 URL
   * @param distPath 安装目录路径
   */
  async function downloadFromInternalServer(
    internalUrl: string,
    distPath: string,
  ): Promise<boolean> {
    try {
      /*costrict change*/
      const platformName = getPlatformName()
      if (!platformName) {
        log.error("Unable to determine platform")
        return false
      }

      // 优先使用默认下载地址
      const defaultUrl = DEFAULT_DOWNLOAD_URLS[platformName]
      if (defaultUrl) {
        try {
          log.info("Trying default download URL", { url: defaultUrl })
          const version = DEFAULT_VERSION
          const archiveFilename = `clangd-${platformName}-${version}.zip`
          const archivePath = path.join(distPath, archiveFilename)

          await $`curl -L -o '${archivePath}' '${defaultUrl}'`.quiet().nothrow()

          const archiveExists = await pathExists(archivePath)
          if (archiveExists) {
            // 解压下载的文件（所有平台都使用 .zip 格式）
            await $`unzip -q '${archivePath}'`.cwd(distPath).quiet().nothrow()
            
            // 清理压缩包
            await fs.rm(archivePath, { force: true })

            log.info("Successfully installed clangd from default URL")
            return true
          }
        } catch (error) {
          log.info("Default download failed, trying internal server", { error })
        }
      }
      /*costrict change*/

      // 使用内网私服下载
      log.info("Downloading clangd from internal server", { internalUrl })

      // 使用版本号和平台名称构建文件名
      const version = DEFAULT_VERSION
      const archiveFilename = `clangd-${platformName}-${version}.zip`
      const archivePath = path.join(distPath, archiveFilename)

      // 构建完整的下载 URL
      // URL 格式：{baseUrl}/clangd-{platform}/{version}/clangd-{platform}-{version}.zip
      const downloadUrl = internalUrl.endsWith("/")
        ? `${internalUrl}clangd-${platformName}/${version}/${archiveFilename}`
        : `${internalUrl}/clangd-${platformName}/${version}/${archiveFilename}`

      log.info("Starting download from", { url: downloadUrl })

      await $`curl -L -o '${archivePath}' '${downloadUrl}'`.quiet().nothrow()

      const archiveExists = await pathExists(archivePath)
      if (!archiveExists) {
        log.error("Failed to download clangd from internal server")
        return false
      }

      // 解压下载的文件（所有平台都使用 .zip 格式）
      await $`unzip -q '${archivePath}'`.cwd(distPath).quiet().nothrow()

      // 清理压缩包
      await fs.rm(archivePath, { force: true })

      log.info("Successfully installed clangd from internal server")
      return true
    } catch (error) {
      log.error("Error downloading clangd from internal server", { error })
      return false
    }
  }

  /**
   * 获取配置的内网 URL
   */
 function getConfiguredInternalUrl(): string {
   const url = process.env.COSTRICT_CLANGD_INTERNAL_URL
   if (!url) {
     throw new Error("COSTRICT_CLANGD_INTERNAL_URL environment variable is required")
   }
   return url
 }

  /**
   * 启动 CLANGD_OFFLINE 服务器
   * @param root 项目根目录
   * @param options 可选参数，包含离线下载配置
   */
  export async function start(
    root: string,
    options?: {
      version?: string
      internalUrl?: string
    },
  ): Promise<Handle | undefined> {
    // 获取配置参数，优先使用选项，然后使用环境变量，最后使用默认值
    const internalUrl = options?.internalUrl ?? getConfiguredInternalUrl()

    const distPath = path.join(Global.Path.bin, "clangd-offline")
    const installed = await pathExists(distPath)

    // 如果未安装，则从内网私服下载
    if (!installed) {
      log.info("clangd not installed, downloading from internal server...")
      await fs.mkdir(distPath, { recursive: true })

      const success = await downloadFromInternalServer(internalUrl, distPath)
      if (!success) {
        log.error("Failed to install clangd from internal server")
        return
      }
    }

    // 查找 clangd 可执行文件
    const executableName = process.platform === "win32" ? "clangd.exe" : "clangd"
    const clangdPath = path.join(distPath, "bin", executableName)

    if (!(await pathExists(clangdPath))) {
      log.error(`Failed to locate clangd executable: ${clangdPath}`)
      return
    }

    log.info("Starting CLANGD_OFFLINE server", { distPath })

    // 启动 clangd 进程
    return {
      process: spawn(clangdPath, [], {
        cwd: root,
      }),
    }
  }
}

// CLANGD_OFFLINE_SERVER - LSP 服务器实现
// 符合 LSPServer.Info 接口
export const CLANGD_OFFLINE_SERVER: {
  id: string
  extensions: string[]
  root: (file: string) => Promise<string | undefined>
  spawn(root: string): Promise<{ process: ChildProcessWithoutNullStreams; initialization?: Record<string, any> } | undefined>
} = {
  id: "clangd-offline",
  root: NearestRoot([
    "CMakeLists.txt",
    "Makefile",
    "compile_commands.json",
    "package.json",
  ]),
  extensions: [".cpp", ".c", ".h", ".hpp", ".cc", ".cxx", ".hxx", ".c++"],
  async spawn(root) {
    // 从环境变量获取配置
    const internalUrl = process.env.COSTRICT_CLANGD_INTERNAL_URL

    if (!internalUrl) {
      log.error("CLANGD_OFFLINE requires COSTRICT_CLANGD_INTERNAL_URL environment variable")
      return
    }

    return await CLANGD_OFFLINE.start(root, {
      internalUrl,
    })
  },
}