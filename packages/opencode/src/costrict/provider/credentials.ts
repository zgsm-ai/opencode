/**
 * CoStrict 凭证管理模块
 * 负责读写 ~/.costrict/share/auth.json，与 CoStrict IDE 插件共享凭证
 */

import { promises as fs } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { createHash } from "node:crypto"
import { Log } from "../../util/log"

const log = Log.create({ service: "costrict-credentials" })

/**
 * CoStrict 凭证格式 (与 IDE 插件兼容)
 */
export interface CoStrictCredentials {
  id: string                    // 标识符 (固定为 "opencode")
  name: string                  // 显示名称
  access_token: string          // OAuth 访问令牌
  refresh_token?: string        // OAuth 刷新令牌 (可选)
  state?: string                // OAuth 状态标识 (可选)
  machine_id: string            // 机器唯一标识 (SHA256)
  base_url: string              // CoStrict 服务器地址
  expiry_date: number           // Token 过期时间戳 (毫秒)
  updated_at: string            // 最后更新时间 (ISO 8601)
  expired_at?: string           // Token 过期时间 (ISO 8601)
}

/**
 * 获取 CoStrict 凭证文件路径
 * @returns ~/.costrict/share/auth.json
 */
export function getCoStrictCredentialsPath(): string {
  const home = homedir()
  return join(home, ".costrict", "share", "auth.json")
}

/**
 * 生成机器唯一标识 (SHA256)
 * 基于主机名、用户名、操作系统等信息
 */
export function generateMachineId(): string {
  const os = require("node:os")
  const platform = os.platform()
  const hostname = os.hostname()
  const userInfo = os.userInfo()
  const username = userInfo.username

  // 组合多个系统信息生成唯一标识
  const machineInfo = `${platform}-${hostname}-${username}`
  return createHash("sha256").update(machineInfo).digest("hex")
}

/**
 * 加载 CoStrict 凭证
 * @returns 凭证对象或 null (文件不存在时)
 */
export async function loadCoStrictCredentials(): Promise<CoStrictCredentials | null> {
  try {
    const filepath = getCoStrictCredentialsPath()
    const content = await fs.readFile(filepath, "utf-8")
    const credentials = JSON.parse(content) as CoStrictCredentials

    // 验证必需字段 (refresh_token 和 state 为可选)
    if (
      !credentials.access_token ||
      !credentials.base_url
    ) {
      log.warn("Credentials file is missing required fields")
      return null
    }

    // refresh_token 和 state 为可选，记录日志但不阻止加载
    if (!credentials.refresh_token) {
      log.info("Credentials loaded without refresh_token")
    }
    if (!credentials.state) {
      log.info("Credentials loaded without state")
    }

    return credentials
  } catch (error: any) {
    if (error.code === "ENOENT") {
      // 文件不存在是正常情况
      return null
    }

    if (error instanceof SyntaxError) {
      log.error("Credentials file is corrupted", { error: "invalid JSON" })
      return null
    }

    log.error("Failed to load credentials", { error: error.message })
    return null
  }
}

/**
 * 保存 CoStrict 凭证
 * @param credentials 凭证对象
 */
export async function saveCoStrictCredentials(
  credentials: CoStrictCredentials,
): Promise<void> {
  try {
    const filepath = getCoStrictCredentialsPath()
    const dir = join(homedir(), ".costrict", "share")

    // 确保目录存在
    await fs.mkdir(dir, { recursive: true, mode: 0o755 })

    // 写入凭证文件 (权限 600: 仅所有者读写)
    const content = JSON.stringify(credentials, null, 2)
    await fs.writeFile(filepath, content, { encoding: "utf-8", mode: 0o600 })

    log.info("Credentials saved successfully", { path: filepath })
  } catch (error: any) {
    log.error("Failed to save credentials", { error: error.message })
    throw new Error(`Failed to save CoStrict credentials: ${error.message}`)
  }
}

/**
 * 删除 CoStrict 凭证
 */
export async function deleteCoStrictCredentials(): Promise<void> {
  try {
    const filepath = getCoStrictCredentialsPath()
    await fs.unlink(filepath)
    log.info("Credentials deleted successfully", { path: filepath })
  } catch (error: any) {
    if (error.code === "ENOENT") {
      // 文件不存在是正常情况
      return
    }
    log.error("Failed to delete credentials", { error: error.message })
    throw new Error(`Failed to delete CoStrict credentials: ${error.message}`)
  }
}

/**
 * 检查 CoStrict 凭证是否存在
 */
export async function hasCoStrictCredentials(): Promise<boolean> {
  try {
    const filepath = getCoStrictCredentialsPath()
    await fs.access(filepath)
    return true
  } catch {
    return false
  }
}
