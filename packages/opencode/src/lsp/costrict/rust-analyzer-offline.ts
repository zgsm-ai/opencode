import { spawn, type ChildProcessWithoutNullStreams } from "child_process"
import path from "path"
import os from "os"
import { Global } from "../../global"
import { Log } from "../../util/log"
import { $ } from "bun"
import fs from "fs/promises"
import { Filesystem } from "../../util/filesystem"
import { Instance } from "../../project/instance"

const log = Log.create({ service: "lsp.rust-analyzer-offline" })
const pathExists = async (p: string) =>
  fs
    .stat(p)
    .then(() => true)
    .catch(() => false)

// rust-analyzer 默认版本号
const RUST_ANALYZER_DEFAULT_VERSION = "2024-11-25"

/*costrict change*/
// 默认下载地址
const DEFAULT_DOWNLOAD_URLS: Record<string, string> = {
  win: "https://shenma.sangfor.com.cn/costrict/opencode/rust-analyzer-x86_64-pc-windows-msvc.zip",
  linux: "https://shenma.sangfor.com.cn/costrict/opencode/rust-analyzer-x86_64-unknown-linux-gnu.gz",
}
/*costrict change*/

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

export namespace RUST_ANALYZER_OFFLINE {
  export interface Handle {
    process: ChildProcessWithoutNullStreams
    initialization?: Record<string, any>
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
        return "win"
      default:
        log.error("Unsupported platform", { platform })
        return ""
    }
  }

  /**
   * 获取文件名（rust-analyzer 的完整目标三元组）
   */
  function getFileName(): string {
    const platform = process.platform
    const arch = os.arch()

    // 目前只支持 x86_64 架构
    if (arch !== "x64") {
      log.error("Unsupported architecture, only x86_64 is supported", { arch })
      return ""
    }

    let target: string
    switch (platform) {
      case "darwin":
        target = "x86_64-apple-darwin"
        break
      case "linux":
        target = "x86_64-unknown-linux-gnu"
        break
      case "win32":
        target = "x86_64-pc-windows-msvc"
        break
      default:
        log.error("Unsupported platform", { platform })
        return ""
    }

    return `rust-analyzer-${target}`
  }

  /**
   * 获取文件扩展名
   */
  function getFileExtension(): string {
    const platform = process.platform
    switch (platform) {
      case "darwin":
        return ".gz"
      case "linux":
        return ".gz"
      case "win32":
        return ".zip"
      default:
        log.error("Unsupported platform", { platform })
        return ""
    }
  }

  /**
   * 从内网私服下载 rust-analyzer 离线包
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
      const fileName = getFileName()
      const fileExt = getFileExtension()
      
      if (!platformName || !fileName || !fileExt) {
        log.error("Unable to determine platform/architecture")
        return false
      }

      // 优先使用默认下载地址
      const defaultUrl = DEFAULT_DOWNLOAD_URLS[platformName]
      if (defaultUrl) {
        try {
          log.info("Trying default download URL", { url: defaultUrl })
          
          const archiveFilename = `${fileName}${fileExt}`
          const archivePath = path.join(distPath, archiveFilename)

          await $`curl -L -o '${archivePath}' '${defaultUrl}'`.quiet().nothrow()

          const archiveExists = await pathExists(archivePath)
          if (archiveExists) {
            // 解压下载的文件
            const isWindows = process.platform === "win32"
            if (isWindows) {
              await $`unzip -q '${archivePath}'`.cwd(distPath).quiet().nothrow()
            } else {
              // 对于 .gz 文件，直接解压
              await $`gunzip -kf '${archivePath}'`.cwd(distPath).quiet().nothrow()
            }

            // 清理压缩包
            await fs.rm(archivePath, { force: true })

            log.info("Successfully installed rust-analyzer from default URL")
            return true
          }
        } catch (error) {
          log.info("Default download failed, trying internal server", { error })
        }
      }
      /*costrict change*/

      // 使用内网私服下载
      log.info("Downloading rust-analyzer from internal server", { internalUrl })

      // 使用版本号和平台名称构建文件名
      const version = RUST_ANALYZER_DEFAULT_VERSION
      const archiveFilename = `${fileName}${fileExt}`
      const archivePath = path.join(distPath, archiveFilename)

      // 构建完整的下载 URL
      // URL 格式：{baseUrl}/rust-analyzer-{platform}/{version}/{filename}
      const downloadUrl = internalUrl.endsWith("/")
        ? `${internalUrl}rust-analyzer-${platformName}/${version}/${archiveFilename}`
        : `${internalUrl}/rust-analyzer-${platformName}/${version}/${archiveFilename}`

      log.info("Starting download from", { url: downloadUrl })

      await $`curl -L -o '${archivePath}' '${downloadUrl}'`.quiet().nothrow()

      const archiveExists = await pathExists(archivePath)
      if (!archiveExists) {
        log.error("Failed to download rust-analyzer from internal server")
        return false
      }

      // 解压下载的文件
      const isWindows = process.platform === "win32"
      if (isWindows) {
        await $`unzip -q '${archivePath}'`.cwd(distPath).quiet().nothrow()
      } else {
        // 对于 .gz 文件，直接解压
        await $`gunzip -kf '${archivePath}'`.cwd(distPath).quiet().nothrow()
      }

      // 清理压缩包
      await fs.rm(archivePath, { force: true })

      log.info("Successfully installed rust-analyzer from internal server")
      return true
    } catch (error) {
      log.error("Error downloading rust-analyzer from internal server", { error })
      return false
    }
  }

  /**
   * 获取配置的内网 URL
   */
  function getConfiguredInternalUrl(): string {
    const url = process.env.COSTRICT_RUST_ANALYZER_INTERNAL_URL
    if (!url) {
      throw new Error("COSTRICT_RUST_ANALYZER_INTERNAL_URL environment variable is required")
    }
    return url
  }

  /**
   * 启动 RUST_ANALYZER_OFFLINE 服务器
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

    const distPath = path.join(Global.Path.bin, "rust-analyzer-offline")
    const isWindows = process.platform === "win32"
    const executableName = isWindows ? "rust-analyzer.exe" : "rust-analyzer"
    const rustAnalyzerPath = path.join(distPath, "rust-analyzer", executableName)
    const installed = await pathExists(rustAnalyzerPath)

    // 如果未安装，则从内网私服下载
    if (!installed) {
      log.info("rust-analyzer not installed, downloading from internal server...")
      await fs.mkdir(distPath, { recursive: true })

      const success = await downloadFromInternalServer(internalUrl, distPath)
      if (!success) {
        log.error("Failed to install rust-analyzer from internal server")
        return
      }
    }

    if (!(await pathExists(rustAnalyzerPath))) {
      log.error(`Failed to locate rust-analyzer executable: ${rustAnalyzerPath}`)
      return
    }

    log.info("Starting RUST_ANALYZER_OFFLINE server", { distPath })

    // 启动 rust-analyzer 进程
    return {
      process: spawn(rustAnalyzerPath, [], {
        cwd: root,
      }),
    }
  }
}

// RUST_ANALYZER_OFFLINE_SERVER - LSP 服务器实现
// 符合 LSPServer.Info 接口
export const RUST_ANALYZER_OFFLINE_SERVER: {
  id: string
  extensions: string[]
  root: (file: string) => Promise<string | undefined>
  spawn(root: string): Promise<{ process: ChildProcessWithoutNullStreams; initialization?: Record<string, any> } | undefined>
} = {
  id: "rust-analyzer-offline",
  root: NearestRoot(["Cargo.toml"]),
  extensions: [".rs"],
  async spawn(root) {
    // 从环境变量获取配置
    const internalUrl = process.env.COSTRICT_RUST_ANALYZER_INTERNAL_URL
    if (!internalUrl) {
      log.error("RUST_ANALYZER_OFFLINE requires COSTRICT_RUST_ANALYZER_INTERNAL_URL environment variable")
      return
    }

    return await RUST_ANALYZER_OFFLINE.start(root, {
      internalUrl,
    })
  },
}