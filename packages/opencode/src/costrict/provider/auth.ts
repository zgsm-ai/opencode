/**
 * CoStrict OAuth 登录流程模块
 * 负责浏览器登录、Token 轮询和登录 URL 构建
 */

import { randomBytes } from "node:crypto"
import {
  generateMachineId,
  saveCoStrictCredentials,
  type CoStrictCredentials,
} from "./credentials"
import { extractExpiryFromJWT } from "./token"
import { Log } from "../../util/log"

const log = Log.create({ service: "costrict" })

/**
 * Token 轮询响应
 */
interface TokenResponse {
  access_token: string
  refresh_token: string
}

/**
 * 生成随机 state 字符串
 * 格式: {12位随机}.{12位随机}
 */
export function generateState(): string {
  const part1 = randomBytes(6).toString("hex")
  const part2 = randomBytes(6).toString("hex")
  return `${part1}.${part2}`
}

/**
 * 获取 CoStrict Base URL
 * 优先级: providerApi > credentialsBaseUrl > 环境变量 > 默认值
 *
 * @param providerApi 来自配置文件的 provider.api
 * @param credentialsBaseUrl 来自凭证文件的 base_url
 * @returns Base URL (不含尾部斜杠)
 */
export function getCoStrictBaseURL(providerApi?: string, credentialsBaseUrl?: string): string {
  const envUrl = process.env["COSTRICT_BASE_URL"]
  const defaultUrl = "https://zgsm.sangfor.com"

  const baseUrl = providerApi || credentialsBaseUrl || envUrl || defaultUrl

  // 移除可能的端点后缀
  return baseUrl.replace(/\/chat-rag\/api\/v1$/, "").replace(/\/$/, "")
}

/**
 * 构建 CoStrict 登录 URL
 *
 * ⚠️ 关键: 初次登录**包含** machine_code 参数
 *
 * @param baseUrl CoStrict 服务器地址
 * @param state OAuth state
 * @param machineId 机器唯一标识
 * @returns 完整的登录 URL
 */
export function buildCoStrictLoginURL(
  baseUrl: string,
  state: string,
  machineId: string,
): string {
  const params = [
    ["machine_code", machineId],
    ["state", state],
    ["provider", "casdoor"],
    ["plugin_version", "opencode-1.0.0"],
    ["vscode_version", "opencode-1.0.0"],
    ["uri_scheme", "opencode"],
  ]

  const queryString = params
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&")

  return `${baseUrl}/oidc-auth/api/v1/plugin/login?${queryString}`
}

/**
 * 轮询 Token 端点获取登录凭证
 *
 * ⚠️ 关键: 轮询时**保留** machine_code 参数 (与 Token 刷新不同)
 *
 * @param baseUrl CoStrict 服务器地址
 * @param state OAuth state
 * @param machineId 机器唯一标识
 * @param maxAttempts 最大尝试次数 (默认 120)
 * @param intervalMs 轮询间隔毫秒数 (默认 5000)
 * @returns Token 响应
 */
export async function pollLoginToken(
  baseUrl: string,
  state: string,
  machineId: string,
  maxAttempts: number = 120,
  intervalMs: number = 5000,
  abortSignal?: AbortSignal,
): Promise<TokenResponse> {
  // 构建查询参数 (保留 machine_code)
  const params = [
    ["machine_code", machineId],
    ["state", state],
    ["provider", "casdoor"],
    ["plugin_version", "opencode-1.0.0"],
    ["vscode_version", "opencode-1.0.0"],
    ["uri_scheme", "opencode"],
  ]

  const queryString = params
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&")

  const url = `${baseUrl}/oidc-auth/api/v1/plugin/login/token?${queryString}`

  // 延迟函数
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // 检查是否已取消
    if (abortSignal?.aborted) {
      throw new Error("Login cancelled by user")
    }

    await sleep(intervalMs)

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: abortSignal,
      })

      if (!response.ok) {
        // 4xx 错误: 继续轮询
        if (response.status >= 400 && response.status < 500) {
          continue
        }
        // 5xx 错误: 继续轮询
        continue
      }

      const result = (await response.json()) as any

      // 检查响应格式 (服务器返回 {success, data, message, code})
      if (!result.success) {
        const errorMsg = result.message || result.error || "Unknown error"

        // 如果是明确的错误，抛出异常停止重试
        if (errorMsg.includes("invalid") || errorMsg.includes("expired") || errorMsg.includes("failed")) {
          log.error("Login failed", { error: errorMsg })
          throw new Error(`Login failed: ${errorMsg}`)
        }

        continue
      }

      // 检查 data 字段和 token
      if (!result.data?.access_token || !result.data?.refresh_token ||
          result.data.access_token === "" || result.data.refresh_token === "") {
        // 这是正常的等待状态（用户还没完成登录），静默继续轮询
        continue
      }

      // 验证 state 匹配
      if (result.data.state !== state) {
        log.warn("State mismatch", { expected: state, got: result.data.state })
        continue
      }

      log.info("Login successful")
      return {
        access_token: result.data.access_token,
        refresh_token: result.data.refresh_token,
      } as TokenResponse
    } catch (error: any) {
      // 如果是 AbortError（用户取消），静默退出
      if (error.name === "AbortError" || error.message?.includes("aborted")) {
        log.info("Login cancelled by user")
        throw new Error("Login cancelled")
      }

      // 其他错误：记录但继续轮询
      if (attempt % 10 === 0) {
        // 只在每 10 次尝试时输出一次错误，避免刷屏
        log.warn("Poll attempt failed", { attempt: attempt + 1, error: error.message })
      }

      // 如果是明确的登录失败错误，停止重试
      if (error.message.includes("Login failed")) {
        throw error
      }

      continue
    }
  }

  throw new Error(
    `Login timeout after ${maxAttempts * intervalMs / 1000} seconds. Please try again.`,
  )
}

/**
 * 执行完整的 CoStrict OAuth 登录流程
 *
 * 步骤:
 * 1. 生成 state 和 machine_id
 * 2. 打开浏览器登录页面
 * 3. 轮询 Token 端点
 * 4. 保存凭证到 ~/.costrict/share/auth.json
 *
 * @param openBrowser 打开浏览器的函数 (可选，用于测试)
 * @returns 保存的凭证
 */
export async function loginCoStrict(
  openBrowser?: (url: string) => Promise<void>,
): Promise<CoStrictCredentials> {
  const baseUrl = getCoStrictBaseURL()
  const state = generateState()
  const machineId = generateMachineId()

  // 构建登录 URL
  const loginUrl = buildCoStrictLoginURL(baseUrl, state, machineId)

  console.log("[CoStrict] Opening browser for login...")
  console.log(`[CoStrict] Login URL: ${loginUrl}`)

  // 打开浏览器 (使用默认浏览器或注入的函数)
  if (openBrowser) {
    await openBrowser(loginUrl)
  } else {
    // 默认使用系统命令打开浏览器
    const { spawn } = await import("node:child_process")
    const platform = process.platform

    let command: string
    let args: string[]

    if (platform === "darwin") {
      command = "open"
      args = [loginUrl]
    } else if (platform === "win32") {
      command = "cmd.exe"
      args = ["/c", "start", "", loginUrl]
    } else {
      command = "xdg-open"
      args = [loginUrl]
    }

    spawn(command, args, { detached: true, stdio: "ignore" }).unref()
  }

  // 轮询获取 Token
  const tokens = await pollLoginToken(baseUrl, state, machineId)

  // 构建凭证对象
  const credentials: CoStrictCredentials = {
    id: "opencode",
    name: "OpenCode Auth",
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    state,
    machine_id: machineId,
    base_url: baseUrl,
    expiry_date: extractExpiryFromJWT(tokens.access_token),
    updated_at: new Date().toISOString(),
    expired_at: new Date(extractExpiryFromJWT(tokens.access_token)).toISOString(),
  }

  // 保存凭证
  await saveCoStrictCredentials(credentials)

  return credentials
}
