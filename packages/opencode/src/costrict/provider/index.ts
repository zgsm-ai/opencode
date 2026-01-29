/**
 * CoStrict CUSTOM_LOADER 实现
 * 导出供 OpenCode provider.ts 使用的 CUSTOM_LOADER 函数
 */

import { v7 as uuidv7 } from "uuid"
import { APICallError } from "ai"
import { loadCoStrictCredentials, saveCoStrictCredentials } from "./credentials"
import { isCoStrictTokenValid, refreshCoStrictToken, extractExpiryFromJWT } from "./token"
import { fetchCoStrictModels } from "./models"
import { getCoStrictBaseURL } from "./auth"
import { Log } from "../../util/log"
import { Installation } from "../../installation"

const log = Log.create({ service: "costrict-loader" })

/**
 * CoStrict CUSTOM_LOADER
 *
 * 核心功能:
 * 1. 从 ~/.costrict/share/auth.json 加载凭证
 * 2. 从 /ai-gateway/api/v1/models 动态获取模型列表
 * 3. 使用自定义 fetch 动态注入 headers 和处理 token 刷新
 * 4. 处理 401 错误自动恢复
 *
 * @param provider Provider 信息 (来自 models.dev)
 * @returns CUSTOM_LOADER 配置对象
 */
export async function createCoStrictCustomLoader(provider: any) {
  // 1. 尝试加载凭证
  const credentials = await loadCoStrictCredentials()

  // 2. 确定 baseURL
  // 优先级: provider.api > credentials.base_url > 环境变量 > 默认值
  const baseUrl = getCoStrictBaseURL(provider.api, credentials?.base_url)

  if (!credentials) {
    log.debug("No credentials found, but provider will still be visible")
    // ✅ 即使没有凭证也显示 provider，让用户可以登录
    // 不返回 models 字段，保留 database 中的默认 Auto 模型
    return {
      autoload: true,
      options: {
        baseURL: `${baseUrl}/chat-rag/api/v1`,
      },
    }
  }

  // 2. 获取模型列表
  let models: any[] = []
  try {
    // ========== 预防性 Token 刷新 (在获取模型前) ==========
    // 只有在 refresh_token 存在且 token 无效时才刷新
    if (credentials.refresh_token && !isCoStrictTokenValid(credentials)) {
      log.debug("Token expired during loader creation, refreshing...", { hasState: !!credentials.state })

      try {
        const refreshed = await refreshCoStrictToken({
          baseUrl: credentials.base_url,
          refreshToken: credentials.refresh_token,
          state: credentials.state, // 可选参数
        })

        // 更新凭证
        await saveCoStrictCredentials({
          ...credentials,
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expiry_date: extractExpiryFromJWT(refreshed.access_token),
          updated_at: new Date().toISOString(),
          expired_at: new Date(extractExpiryFromJWT(refreshed.access_token)).toISOString(),
        })

        // 使用新 token
        credentials.access_token = refreshed.access_token
      } catch (refreshError: any) {
        log.error("Token refresh failed during loader creation", { error: refreshError.message })
        // 模型列表获取失败不应阻塞 Provider 加载
      }
    }

    const modelList = await fetchCoStrictModels(baseUrl, credentials.access_token)
    models = modelList
    log.info("Fetched models", { count: models.length, models: models.map((m) => m.id) })
  } catch (error: any) {
    log.warn("Failed to fetch models", { error: error.message })
    // 模型列表获取失败不应阻塞 Provider 加载
  }

  // 3. 构建 CUSTOM_LOADER 配置
  const loaderConfig: any = {
    autoload: true,
    options: {
      baseURL: `${baseUrl}/chat-rag/api/v1`,

      // ✅ 核心: 自定义 fetch 函数
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        // ========== 步骤 1: 动态读取凭证 ==========
        let creds = await loadCoStrictCredentials()

        if (!creds) {
          throw new APICallError({
            message: "CoStrict credentials not found",
            url: "",
            requestBodyValues: undefined,
            statusCode: 401,
            isRetryable: false,
          })
        }

        // ========== 步骤 2: Token 验证和刷新 (预防性) ==========
        // 只有在 refresh_token 存在且 token 无效时才刷新
        if (creds.refresh_token && !isCoStrictTokenValid(creds)) {
          log.debug("Token expired, refreshing...", { hasState: !!creds.state })

          try {
            const refreshed = await refreshCoStrictToken({
              baseUrl: creds.base_url,
              refreshToken: creds.refresh_token,
              state: creds.state, // 可选参数
            })

            // 更新凭证
            await saveCoStrictCredentials({
              ...creds,
              access_token: refreshed.access_token,
              refresh_token: refreshed.refresh_token,
              expiry_date: extractExpiryFromJWT(refreshed.access_token),
              updated_at: new Date().toISOString(),
              expired_at: new Date(extractExpiryFromJWT(refreshed.access_token)).toISOString(),
            })

            // 使用新 token
            creds.access_token = refreshed.access_token
          } catch (refreshError: any) {
            log.error("Token refresh failed", { error: refreshError.message })
            // 重新抛出原始错误，保留 statusCode 等元数据
            throw refreshError
          }
        } else if (!creds.refresh_token) {
          log.debug("No refresh_token available, skipping token refresh")
        }

        // ========== 步骤 3: 构建 headers ==========
        const headers = new Headers(init?.headers)
        headers.set("Authorization", `Bearer ${creds.access_token}`)
        headers.set("HTTP-Referer", "https://github.com/zgsm-ai/costrict-cli")
        headers.set("X-Title", "CoStrict-CLI")
        headers.set("X-Costrict-Version", `costrict-cli-${Installation.VERSION}`)
        headers.set("X-Request-ID", uuidv7()) // 每次请求生成新 UUID
        headers.set("Accept-Language", "zh-CN")

        // ✅ CoStrict 特有的请求头（与 costrict-cli 保持一致）
        headers.set("zgsm-client-id", Installation.getInstallationId())
        headers.set("zgsm-client-ide", "cli")

        // ========== 步骤 4: 发起请求 ==========
        const response = await fetch(input, { ...init, headers })

        // ========== 步骤 5: 处理 401 错误 (反应性) ==========
        // 只有在 refresh_token 存在时才尝试刷新
        if (response.status === 401 && creds.refresh_token) {
          log.warn("401 error, force refreshing token...", { hasState: !!creds.state })

          try {
            // 强制刷新 token
            const refreshed = await refreshCoStrictToken({
              baseUrl: creds.base_url,
              refreshToken: creds.refresh_token,
              state: creds.state, // 可选参数
            })

            // 保存新 token
            await saveCoStrictCredentials({
              ...creds,
              access_token: refreshed.access_token,
              refresh_token: refreshed.refresh_token,
              expiry_date: extractExpiryFromJWT(refreshed.access_token),
              updated_at: new Date().toISOString(),
              expired_at: new Date(extractExpiryFromJWT(refreshed.access_token)).toISOString(),
            })

            // 重试请求 (使用新 token 和新 Request ID)
            headers.set("Authorization", `Bearer ${refreshed.access_token}`)
            headers.set("X-Request-ID", uuidv7()) // 生成新的 Request ID
            return fetch(input, { ...init, headers })
          } catch (retryError: any) {
            log.error("401 recovery failed", { error: retryError.message })
            // 重新抛出原始错误，保留 statusCode 等元数据
            throw retryError
          }
        } else if (response.status === 401 && !creds.refresh_token) {
          log.warn("401 error but no refresh_token available, cannot refresh")
        }

        return response
      },
    },
  }

  // 4. 动态模型列表 - 只在有模型时才设置，否则保留 database 中的默认模型
  if (models.length > 0) {
    loaderConfig.models = models.reduce((acc: any, model: any) => {
      acc[model.id] = {
        id: model.id,
        name: model.name || model.id,
        providerID: "costrict",
        status: "active",
        api: {
          id: model.id,
          npm: "@ai-sdk/openai-compatible",
          url: `${baseUrl}/chat-rag/api/v1`,
        },
        capabilities: {
          temperature: true,
          reasoning: false,
          attachment: false,
          toolcall: true,
          input: {
            text: true,
            audio: false,
            image: false,
            video: false,
            pdf: false,
          },
          output: {
            text: true,
            audio: false,
            image: false,
            video: false,
            pdf: false,
          },
          interleaved: false,
        },
        limit: {
          context: 100000, // 默认上下文长度
          output: 8192, // 默认输出长度
        },
        cost: {
          input: 0,
          output: 0,
          cache: {
            read: 0,
            write: 0,
          },
        },
        options: {},
        headers: {},
        release_date: new Date().toISOString(),
      }
      return acc
    }, {})
  }

  // 调试日志：输出最终配置
  log.info("CUSTOM_LOADER config", {
    modelCount: models.length,
    modelIds: models.map((m) => m.id),
    hasOptions: !!loaderConfig.options,
    hasModels: !!loaderConfig.models && Object.keys(loaderConfig.models).length > 0,
  })

  return loaderConfig
}
