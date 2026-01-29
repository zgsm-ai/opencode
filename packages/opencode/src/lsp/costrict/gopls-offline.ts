import { spawn, type ChildProcessWithoutNullStreams } from "child_process"
import path from "path"
import { Global } from "../../global"
import { Flag } from "../../flag/flag"
import { Log } from "../../util/log"
import fs from "fs/promises"
import { Filesystem } from "../../util/filesystem"
import { Instance } from "../../project/instance"

const log = Log.create({ service: "lsp.gopls-offline" })
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

export namespace GOPLS_OFFLINE {
  export interface Handle {
    process: ChildProcessWithoutNullStreams
    initialization?: Record<string, any>
  }

  /**
   * 检查并创建全局 gopls 的软链接
   * 如果全局 PATH 中存在 gopls,则在 Global.Path.bin 中创建软链接
   * @param binPath 目标二进制文件路径
   * @returns 如果成功创建软链接或文件已存在,返回 true;否则返回 false
   */
  async function createGlobalSymlink(binPath: string): Promise<boolean> {
    // 检查全局 PATH 中是否存在 gopls
    const globalGopls = Bun.which("gopls")
    
    if (!globalGopls) {
      log.info("gopls not found in global PATH")
      return false
    }

    log.info("Found global gopls", { path: globalGopls })

    // 检查目标文件是否已存在
    const binExists = await pathExists(binPath)
    
    if (binExists) {
      // 如果已存在,检查是否为符号链接且指向正确的目标
      try {
        const stats = await fs.lstat(binPath)
        if (stats.isSymbolicLink()) {
          const linkTarget = await fs.readlink(binPath)
          if (linkTarget === globalGopls) {
            log.info("Symlink already exists and points to global gopls", { binPath })
            return true
          } else {
            // 符号链接指向不同的目标,删除并重新创建
            log.info("Symlink points to different target, recreating", { 
              currentTarget: linkTarget,
              newTarget: globalGopls,
            })
            await fs.unlink(binPath)
          }
        } else {
          // 文件存在但不是符号链接,删除并创建符号链接
          log.info("Regular file exists at target location, removing and creating symlink", { binPath })
          await fs.unlink(binPath)
        }
      } catch (error) {
        log.error("Failed to check existing file", { binPath, error })
        return false
      }
    }

    // 创建符号链接
    try {
      await fs.symlink(globalGopls, binPath)
      log.info("Created symlink from global gopls", { 
        source: globalGopls,
        destination: binPath,
      })
      return true
    } catch (error) {
      log.error("Failed to create symlink to global gopls", { 
        source: globalGopls,
        destination: binPath,
        error,
      })
      return false
    }
  }

  /**
   * 尝试安装 gopls
   * 仅在没有全局 gopls 或软链接创建失败时调用
   * @returns 如果安装成功返回 true,否则返回 false
   */
  async function installGopls(): Promise<boolean> {
    // 检查 Go 是否可用
    if (!Bun.which("go")) {
      log.info("Go not found in PATH, cannot install gopls")
      return false
    }

    // 检查是否禁用 LSP 下载
    if (Flag.COSTRICT_DISABLE_LSP_DOWNLOAD) {
      log.info("LSP download is disabled, skipping gopls installation")
      return false
    }

    log.info("Installing gopls")
    
    const proc = Bun.spawn({
      cmd: ["go", "install", "golang.org/x/tools/gopls@latest"],
      env: { ...process.env, GOBIN: Global.Path.bin },
      stdout: "pipe",
      stderr: "pipe",
      stdin: "pipe",
    })
    
    const exit = await proc.exited
    
    if (exit !== 0) {
      log.error("Failed to install gopls", { exitCode: exit })
      return false
    }

    log.info("Successfully installed gopls", { bin: Global.Path.bin })
    return true
  }

  /**
   * 获取或准备 gopls 二进制文件
   * 1. 优先检查是否已存在
   * 2. 如果不存在,尝试创建全局 gopls 的软链接
   * 3. 如果软链接失败,尝试安装
   * @returns gopls 二进制文件路径,如果失败返回 undefined
   */
  async function getGoplsBinary(): Promise<string | undefined> {
    const isWin32 = process.platform === "win32"
    const binPath = path.join(Global.Path.bin, "gopls" + (isWin32 ? ".exe" : ""))
    
    // 1. 检查文件是否已存在且可用
    if (await pathExists(binPath)) {
      log.info("gopls binary already exists", { binPath })
      return binPath
    }

    // 2. 尝试创建全局 gopls 的软链接
    const symlinkCreated = await createGlobalSymlink(binPath)
    if (symlinkCreated) {
      return binPath
    }

    // 3. 尝试安装 gopls
    const installed = await installGopls()
    if (installed && await pathExists(binPath)) {
      return binPath
    }

    log.error("Failed to obtain gopls binary")
    return undefined
  }

  /**
   * 启动 GOPLS_OFFLINE 服务器
   * @param root 项目根目录
   */
  export async function start(root: string): Promise<Handle | undefined> {
    // 获取或准备 gopls 二进制文件
    const binPath = await getGoplsBinary()
    
    if (!binPath) {
      return undefined
    }

    log.info("Starting GOPLS_OFFLINE server", { binPath, root })

    // 启动 gopls 进程
    return {
      process: spawn(binPath, [], {
        cwd: root,
      }),
    }
  }
}

// GOPLS_OFFLINE_SERVER - LSP 服务器实现
// 符合 LSPServer.Info 接口
export const GOPLS_OFFLINE_SERVER: {
  id: string
  extensions: string[]
  root: (file: string) => Promise<string | undefined>
  spawn(root: string): Promise<{ process: ChildProcessWithoutNullStreams; initialization?: Record<string, any> } | undefined>
} = {
  id: "gopls-offline",
  root: async (file) => {
    const work = await NearestRoot(["go.work"])(file)
    if (work) return work
    return NearestRoot(["go.mod", "go.sum"])(file)
  },
  extensions: [".go"],
  async spawn(root) {
    return await GOPLS_OFFLINE.start(root)
  },
}
