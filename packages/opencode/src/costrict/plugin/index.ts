/**
 * CoStrict 认证插件
 * 提供 OAuth 登录流程，集成到 OpenCode 认证系统
 */

import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { Log } from "../../util/log"

const log = Log.create({ service: "costrict-plugin" })

// 模块级 AbortController，用于取消登录轮询
// 当用户按 ESC 时，需要能够取消正在进行的轮询
let currentLoginAbortController: AbortController | null = null

/**
 * CoStrict 认证插件
 *
 * 功能:
 * 1. 提供 auth.login hook，触发 OAuth 登录流程
 * 2. 不提供 auth.loader (凭证管理由 CUSTOM_LOADER 处理)
 *
 * @param input 插件输入上下文
 * @returns Hooks 对象
 */
export async function CoStrictAuthPlugin(input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "costrict",

      /**
       * 注意: 不提供 loader
       *
       * CoStrict 的凭证管理和 fetch 逻辑完全由 CUSTOM_LOADER 处理。
       * 这是因为:
       * 1. 凭证存储在独立的 ~/.costrict/share/auth.json
       * 2. 不使用 OpenCode 的 Auth 系统
       * 3. CUSTOM_LOADER 中已经实现了完整的 token 管理和刷新逻辑
       */

      /**
       * 认证方法声明
       * 声明 CoStrict 使用 OAuth 2.0 认证
       */
      methods: [
        {
          label: "OAuth Login",
          type: "oauth",
          authorize: async () => {
            // 取消之前的登录流程（如果存在）
            if (currentLoginAbortController) {
              currentLoginAbortController.abort()
            }

            // 创建新的 AbortController
            currentLoginAbortController = new AbortController()
            const abortSignal = currentLoginAbortController.signal

            // 导入必要的函数
            const { generateState, getCoStrictBaseURL, buildCoStrictLoginURL, pollLoginToken } = await import("../provider/auth")
            const { generateMachineId, saveCoStrictCredentials } = await import("../provider/credentials")
            const { extractExpiryFromJWT } = await import("../provider/token")

            // 生成登录参数
            const baseUrl = getCoStrictBaseURL()
            const state = generateState()
            const machineId = generateMachineId()

            // 构建登录 URL
            const loginUrl = buildCoStrictLoginURL(baseUrl, state, machineId)

            log.debug("Generated login URL", { url: loginUrl })

            // 自动打开浏览器（使用 open 包，与 Link 组件一致）
            try {
              const open = (await import("open")).default
              await open(loginUrl)
            } catch (error: any) {
              log.warn("Failed to open browser", { error: error.message, url: loginUrl })
            }

            // 根据平台生成不同的提示文本
            const platform = process.platform
            const instructions = platform === "linux"
              ? "Please copy the URL above and open it in your browser to login."
              : "Complete authorization in your browser. This window will close automatically."

            return {
              url: loginUrl,
              instructions,
              method: "auto" as const,
              callback: async () => {
                // 浏览器已打开，现在轮询 token
                log.info("Starting token polling")

                try {
                  // 传递 abortSignal 以支持取消（用户按 ESC 时）
                  const tokens = await pollLoginToken(baseUrl, state, machineId, 120, 5000, abortSignal)

                  // 保存凭证
                  const expiryDate = extractExpiryFromJWT(tokens.access_token)
                  const credentials = {
                    id: "opencode",
                    name: "CoStrict Auth",
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    state,
                    machine_id: machineId,
                    base_url: baseUrl,
                    expiry_date: expiryDate,
                    updated_at: new Date().toISOString(),
                    expired_at: new Date(expiryDate).toISOString(),
                  }

                  await saveCoStrictCredentials(credentials)
                  log.info("Login completed successfully")

                  return {
                    type: "success" as const,
                    key: "costrict-oauth-token", // 虚拟 key，实际凭证存储在 ~/.costrict/share/auth.json
                  }
                } catch (error: any) {
                  // 用户取消或登录失败
                  log.warn("Login cancelled or failed", { error: error.message })
                  return {
                    type: "failed" as const,
                  }
                }
              },
            }
          },
        },
      ],
    },
  }
}
