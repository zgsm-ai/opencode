/**
 * CoStrict Token 管理模块
 * 负责 Token 验证、刷新和 JWT 解析
 */

import type { CoStrictCredentials } from "./credentials"
import { Log } from "../../util/log"
import { APICallError } from "ai"

const log = Log.create({ service: "costrict-token" })

/**
 * JWT Payload 结构
 */
interface JWTPayload {
  exp?: number  // 过期时间 (秒级时间戳)
  iat?: number  // 签发时间
  [key: string]: any
}

/**
 * 解析 JWT Token (不验证签名)
 * @param token JWT Token 字符串
 * @returns Payload 对象
 */
export function parseJWT(token: string): JWTPayload {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) {
      throw new Error("Invalid JWT format")
    }

    // Base64URL 解码 payload
    const payload = parts[1]
    const decoded = Buffer.from(payload, "base64url").toString("utf-8")
    return JSON.parse(decoded) as JWTPayload
  } catch (error: any) {
    throw new Error(`Failed to parse JWT: ${error.message}`)
  }
}

/**
 * 从 JWT Token 提取过期时间
 * @param token JWT Token 字符串
 * @returns 过期时间戳 (毫秒) 或 0
 */
export function extractExpiryFromJWT(token: string): number {
  try {
    const payload = parseJWT(token)
    if (payload.exp) {
      // JWT exp 是秒级时间戳，转换为毫秒
      return payload.exp * 1000
    }
    return 0
  } catch {
    return 0
  }
}

/**
 * 三层 Token 验证策略
 *
 * 策略优先级:
 * 1. expiry_date (30 分钟缓冲)
 * 2. refresh_token JWT (如果存在)
 * 3. access_token JWT (30 分钟缓冲)
 *
 * @param credentials CoStrict 凭证
 * @returns true 表示 Token 仍然有效
 */
export function isCoStrictTokenValid(credentials: CoStrictCredentials): boolean {
  const now = Date.now()

  // 策略 1: expiry_date (30 分钟缓冲)
  if (credentials.expiry_date) {
    const bufferMs = 30 * 60 * 1000  // 30 分钟
    const isValid = now < credentials.expiry_date - bufferMs
    log.debug("Token validation via expiry_date", {
      isValid,
      expiresIn: Math.floor((credentials.expiry_date - now) / 1000)
    })
    return isValid
  }

  // 策略 2: refresh_token JWT (如果存在)
  if (credentials.refresh_token) {
    try {
      const refreshPayload = parseJWT(credentials.refresh_token)
      if (refreshPayload.exp) {
        return refreshPayload.exp * 1000 > now
      }
    } catch {
      // refresh_token 解析失败，尝试下一个策略
    }
  }

  // 策略 3: access_token JWT (30 分钟缓冲)
  try {
    const accessPayload = parseJWT(credentials.access_token)
    if (accessPayload.exp) {
      const bufferMs = 30 * 60 * 1000  // 30 分钟
      return now < accessPayload.exp * 1000 - bufferMs
    }
  } catch {
    // access_token 解析失败
  }

  // 所有策略都失败，认为 Token 无效
  return false
}

/**
 * Token 刷新参数
 */
export interface RefreshTokenParams {
  baseUrl: string
  refreshToken: string
  state?: string  // 可选: OAuth 状态标识
}

/**
 * Token 刷新响应
 */
export interface RefreshTokenResponse {
  access_token: string
  refresh_token: string
}

/**
 * 刷新 CoStrict Token
 *
 * ⚠️ 关键: 刷新时**排除** machine_code 参数
 *
 * @param params 刷新参数
 * @returns 新的 access_token 和 refresh_token
 */
export async function refreshCoStrictToken(
  params: RefreshTokenParams,
): Promise<RefreshTokenResponse> {
  log.info("Token refresh started", { baseUrl: params.baseUrl })

  // 构建查询参数 (排除 machine_code，state 为可选)
  const queryParams: [string, string][] = [
    ["provider", "casdoor"],
    ["plugin_version", "opencode-1.0.0"],
    ["vscode_version", "opencode-1.0.0"],
    ["uri_scheme", "opencode"],
  ]

  // 只有当 state 存在时才添加到查询参数
  if (params.state) {
    queryParams.unshift(["state", params.state])
  }

  const queryString = queryParams
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&")

  const url = `${params.baseUrl}/oidc-auth/api/v1/plugin/login/token?${queryString}`

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${params.refreshToken}`,
        Accept: "application/json",
      },
    })

    if (!response.ok) {
      log.error("Token refresh failed", { status: response.status })
      const responseBody = await response.text()

      throw new APICallError({
        message: response.status === 400 || response.status === 401
          ? "Refresh token is invalid or expired"
          : "Token refresh failed",
        url,
        requestBodyValues: undefined,
        statusCode: response.status,
        responseHeaders: Object.fromEntries(response.headers.entries()),
        responseBody,
        isRetryable: false,  // 认证失败不应该重试
      })
    }

    const data = (await response.json()) as RefreshTokenResponse

    if (!data.access_token || !data.refresh_token) {
      log.error("Token refresh response missing fields")
      throw new APICallError({
        message: "Token refresh response is missing required fields",
        url,
        requestBodyValues: undefined,
        statusCode: 500,
        responseBody: JSON.stringify(data),
        isRetryable: false,
      })
    }

    log.info("Token refresh completed successfully")
    return data
  } catch (error: any) {
    log.error("Token refresh error", { error: error.message })
    // 重新抛出原始错误，保留 statusCode 等元数据
    throw error
  }
}
