import { spawn, type ChildProcessWithoutNullStreams } from "child_process"
import path from "path"
import os from "os"
import { Global } from "../../global"
import { Log } from "../../util/log"
import { $ } from "bun"
import fs from "fs/promises"
import { Filesystem } from "../../util/filesystem"
import { Instance } from "../../project/instance"

const log = Log.create({ service: "lsp.jdtls-offline" })
const pathExists = async (p: string) =>
  fs
    .stat(p)
    .then(() => true)
    .catch(() => false)

/*costrict change*/
// jdtls 默认下载地址
const JDTLS_DEFAULT_URL = "https://shenma.sangfor.com.cn/costrict/opencode/jdt-language-server-1.30.0-202311301503.tar.gz"
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

export namespace JDTLS_OFFLINE {
  export interface Handle {
    process: ChildProcessWithoutNullStreams
    initialization?: Record<string, any>
  }

  /**
   * 从内网私服下载 JDTLS 离线包
   * @param internalUrl 完整的下载地址
   * @param distPath 安装目录路径
   */
  async function downloadFromInternalServer(
    internalUrl: string,
    distPath: string,
  ): Promise<boolean> {
    try {
      const archivePath = path.join(distPath, "release.tar.gz")
      
      /*costrict change*/
      // 优先使用默认下载地址
      try {
        log.info("Trying default download URL", { url: JDTLS_DEFAULT_URL })
        
        await $`curl -L -o '${archivePath}' '${JDTLS_DEFAULT_URL}'`.quiet().nothrow()
        
        const archiveExists = await pathExists(archivePath)
        if (archiveExists) {
          // 解压下载的文件
          await $`tar -xzf ${archivePath}`.cwd(distPath).quiet().nothrow()
          
          // 清理压缩包
          await fs.rm(archivePath, { force: true })
          
          log.info("Successfully installed JDTLS from default URL")
          return true
        }
      } catch (error) {
        log.info("Default download failed, trying internal server", { error })
      }
      /*costrict change*/
      
      // 使用内网私服下载
      log.info("Downloading JDTLS from internal server", { internalUrl })
      
      // 直接使用配置的完整下载地址
      const downloadUrl = internalUrl
      
      log.info("Starting download from", { url: downloadUrl })
      
      // 使用 curl 从内网私服下载
      await $`curl -L -o '${archivePath}' '${downloadUrl}'`.quiet().nothrow()
      
      // 检查文件是否下载成功
      const archiveExists = await pathExists(archivePath)
      if (!archiveExists) {
        log.error("Failed to download JDTLS from internal server")
        return false
      }
      
      // 解压下载的文件
      await $`tar -xzf ${archivePath}`.cwd(distPath).quiet().nothrow()
      
      // 清理压缩包
      await fs.rm(archivePath, { force: true })
      
      log.info("Successfully installed JDTLS from internal server")
      return true
    } catch (error) {
      log.error("Error downloading JDTLS from internal server", { error })
      return false
    }
  }


  /**
   * 获取配置的内网 URL
   */
  function getConfiguredInternalUrl(): string {
    const url = process.env.COSTRICT_JDTLS_INTERNAL_URL
    if (!url) {
      throw new Error("COSTRICT_JDTLS_INTERNAL_URL environment variable is required")
    }
    return url
  }

  /**
   * 启动 JDTLS_OFFLINE 服务器
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
    // 检查 Java 是否安装
    const java = Bun.which("java")
    if (!java) {
      log.error("Java 21 or newer is required to run the JDTLS. Please install it first.")
      return
    }

    // 检查 Java 版本
    const javaMajorVersion = await $`java -version`
      .quiet()
      .nothrow()
      .then(({ stderr }) => {
        const m = /"(\d+)\.\d+\.\d+"/.exec(stderr.toString())
        return !m ? undefined : parseInt(m[1])
      })

    if (javaMajorVersion == null || javaMajorVersion < 21) {
      log.error("JDTLS requires at least Java 21.")
      return
    }

    // 获取配置参数，优先使用选项，然后使用环境变量，最后使用默认值
    const internalUrl = options?.internalUrl ?? getConfiguredInternalUrl()

    const distPath = path.join(Global.Path.bin, "jdtls-offline")
    const launcherDir = path.join(distPath, "plugins")
    const installed = await pathExists(launcherDir)

    // 如果未安装，则从内网私服下载
    if (!installed) {
      log.info("JDTLS not installed, downloading from internal server...")
      await fs.mkdir(distPath, { recursive: true })

      const success = await downloadFromInternalServer(internalUrl, distPath)
      if (!success) {
        log.error("Failed to install JDTLS from internal server")
        return
      }
    }

    // 从 child_process 导入 spawn，避免与函数名冲突
    const cpSpawn = spawn
    
    // 查找 launcher jar 文件
    const jarFileName = await $`ls org.eclipse.equinox.launcher_*.jar`
      .cwd(launcherDir)
      .quiet()
      .nothrow()
      .then(({ stdout }) => stdout.toString().trim())

    const launcherJar = path.join(launcherDir, jarFileName)
    if (!(await pathExists(launcherJar))) {
      log.error(`Failed to locate the JDTLS launcher module in the installed directory: ${distPath}.`)
      return
    }

    // 根据操作系统选择配置文件
    const configFile = path.join(
      distPath,
      (() => {
        switch (process.platform) {
          case "darwin":
            return "config_mac"
          case "linux":
            return "config_linux"
          case "win32":
            return "config_win"
          default:
            return "config_linux"
        }
      })(),
    )

    // 创建临时数据目录
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "costrict-jdtls-offline-data"))

    log.info("Starting JDTLS_OFFLINE server", { distPath })

    // 启动 JDTLS 进程
    return {
      process: cpSpawn(
        java,
        [
          "-jar",
          launcherJar,
          "-configuration",
          configFile,
          "-data",
          dataDir,
          "-Declipse.application=org.eclipse.jdt.ls.core.id1",
          "-Dosgi.bundles.defaultStartLevel=4",
          "-Declipse.product=org.eclipse.jdt.ls.core.product",
          "-Dlog.level=ALL",
          "--add-modules=ALL-SYSTEM",
          "--add-opens java.base/java.util=ALL-UNNAMED",
          "--add-opens java.base/java.lang=ALL-UNNAMED",
        ],
        {
          cwd: root,
        },
      ),
    }
  }
}

// JDTLS_OFFLINE_SERVER - LSP 服务器实现
// 符合 LSPServer.Info 接口
export const JDTLS_OFFLINE_SERVER: {
  id: string
  extensions: string[]
  root: (file: string) => Promise<string | undefined>
  spawn(root: string): Promise<{ process: ChildProcessWithoutNullStreams; initialization?: Record<string, any> } | undefined>
} = {
  id: "jdtls-offline",
  root: NearestRoot(["pom.xml", "build.gradle", "build.gradle.kts", ".project", ".classpath"]),
  extensions: [".java"],
  async spawn(root) {
    // 从环境变量获取配置
    const internalUrl = process.env.COSTRICT_JDTLS_INTERNAL_URL
    if (!internalUrl) {
      log.error("JDTLS_OFFLINE requires COSTRICT_JDTLS_INTERNAL_URL environment variable")
      return
    }
    
    return await JDTLS_OFFLINE.start(root, {
      internalUrl,
    })
  },
}