import { useNavigate, useParams } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/util/encode"
import { useActiveWorkspace } from "@/pages/workspace/active-workspace"

/**
 * Workspace 导航 Hook
 * 自动补全 /workspace/:workspaceID 前缀
 */
export function useWorkspaceNavigate() {
  const navigate = useNavigate()
  const params = useParams()
  const active = useActiveWorkspace()

  const getWorkspaceId = (): string | undefined => {
    return params.workspaceID ?? active?.id
  }

  /**
   * 生成完整的 workspace URL
   * @param path - 路径（不含 /workspace/:workspaceID 前缀）
   * @param options - 可选参数
   * @param options.workspaceId - 指定 workspaceId，默认使用当前激活的
   * @param options.dir - 指定目录（用于 worktree 场景），默认从 URL 获取
   */
  const buildUrl = (
    path: string,
    options?: { workspaceId?: string; dir?: string }
  ): string => {
    const workspaceId = options?.workspaceId ?? getWorkspaceId()
    if (!workspaceId) {
      console.warn("No workspaceId available for navigation")
      return `/workspace${path.startsWith("/") ? path : `/${path}`}`
    }

    const dir = options?.dir ?? params.dir ?? "default"
    const normalizedPath = path.startsWith("/") ? path : `/${path}`

    return `/workspace/${workspaceId}/${dir}${normalizedPath}`
  }

  /**
   * 导航到 workspace 路径
   * @param path - 路径（不含 /workspace/:workspaceID 前缀）
   * @param options - 导航选项
   */
  const workspaceNavigate = (
    path: string,
    options?: {
      workspaceId?: string
      dir?: string
      replace?: boolean
      state?: unknown
    }
  ) => {
    const url = buildUrl(path, {
      workspaceId: options?.workspaceId,
      dir: options?.dir,
    })

    navigate(url, {
      replace: options?.replace,
      state: options?.state,
    })
  }

  /**
   * 导航到会话
   * @param sessionId - 会话 ID
   * @param options - 可选参数
   */
  const navigateToSession = (
    sessionId: string,
    options: { dir: string; workspaceId?: string; replace?: boolean }
  ) => {
    workspaceNavigate(`/session/${sessionId}`, options)
  }

  /**
   * 导航到新会话
   * @param options - 参数
   */
  const navigateToNewSession = (options: {
    dir: string
    workspaceId?: string
    replace?: boolean
  }) => {
    workspaceNavigate("/session", options)
  }

  /**
   * 从目录路径生成 dir slug
   * @param directory - 目录路径
   */
  const encodeDirectory = (directory: string): string => {
    return base64Encode(directory)
  }

  return {
    navigate: workspaceNavigate,
    buildUrl,
    getWorkspaceId,
    navigateToSession,
    navigateToNewSession,
    encodeDirectory,
  }
}
