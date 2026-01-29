/**
 * CoStrict 动态模型列表模块
 * 从 /ai-gateway/api/v1/models 获取可用模型
 */

import { Log } from "../../util/log"

const log = Log.create({ service: "costrict-models" })

/**
 * CoStrict 模型信息
 */
export interface CoStrictModel {
  id: string                    // 模型 ID
  name?: string                 // 模型显示名称
  object?: string               // 对象类型 (通常是 "model")
  created?: number              // 创建时间戳
  owned_by?: string             // 所有者
  [key: string]: any            // 其他扩展字段
}

/**
 * 模型列表缓存
 */
interface ModelCache {
  models: CoStrictModel[]
  timestamp: number
}

let modelCache: ModelCache | null = null
const CACHE_TTL_MS = 60 * 60 * 1000  // 1 小时缓存

/**
 * 获取 CoStrict 可用模型列表
 *
 * @param baseUrl CoStrict 服务器地址
 * @param accessToken 访问令牌
 * @returns 模型数组
 */
export async function fetchCoStrictModels(
  baseUrl: string,
  accessToken: string,
): Promise<CoStrictModel[]> {
  // 检查缓存
  if (modelCache && Date.now() - modelCache.timestamp < CACHE_TTL_MS) {
    log.debug("Using cached models list")
    return modelCache.models
  }

  try {
    const url = `${baseUrl}/ai-gateway/api/v1/models`

    log.debug("Fetching models from", { url })

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch models: HTTP ${response.status}`)
    }

    const data = (await response.json()) as { data?: CoStrictModel[] }

    const models = data.data || []

    if (models.length === 0) {
      log.warn("No models returned from API")
      return getDefaultModels()
    }

    // 更新缓存
    modelCache = {
      models,
      timestamp: Date.now(),
    }

    log.info("Loaded models", { count: models.length })
    return models
  } catch (error: any) {
    log.error("Failed to fetch models", { error: error.message })

    // 如果有旧缓存，返回旧缓存
    if (modelCache) {
      log.debug("Using expired cache due to fetch error")
      return modelCache.models
    }

    // 返回默认模型列表
    log.debug("Using default models")
    return getDefaultModels()
  }
}

/**
 * 获取默认模型列表 (当 API 不可用时)
 */
function getDefaultModels(): CoStrictModel[] {
  return [
    {
      id: "gpt-4",
      name: "GPT-4",
      object: "model",
    },
    {
      id: "gpt-3.5-turbo",
      name: "GPT-3.5 Turbo",
      object: "model",
    },
  ]
}

/**
 * 清除模型缓存 (用于测试或强制刷新)
 */
export function clearModelCache(): void {
  modelCache = null
  log.debug("Model cache cleared")
}
