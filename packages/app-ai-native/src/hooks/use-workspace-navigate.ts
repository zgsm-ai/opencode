import { useNavigate, useParams } from "@solidjs/router"
import { useActiveWorkspace } from "@/pages/workspace/active-workspace"

export function useWorkspaceNavigate() {
  const navigate = useNavigate()
  const params = useParams()
  const active = useActiveWorkspace()

  const getWorkspaceId = (): string | undefined => {
    return params.workspaceID ?? active?.id
  }

  const buildUrl = (
    path: string,
    options?: { workspaceId?: string }
  ): string => {
    const workspaceId = options?.workspaceId ?? getWorkspaceId()
    if (!workspaceId) {
      console.warn("No workspaceId available for navigation")
      return `/workspace${path.startsWith("/") ? path : `/${path}`}`
    }

    const normalizedPath = path.startsWith("/") ? path : `/${path}`
    return `/workspace/${workspaceId}${normalizedPath}`
  }

  const workspaceNavigate = (
    path: string,
    options?: {
      workspaceId?: string
      replace?: boolean
      state?: unknown
    }
  ) => {
    const url = buildUrl(path, {
      workspaceId: options?.workspaceId,
    })

    navigate(url, {
      replace: options?.replace,
      state: options?.state,
    })
  }

  const navigateToSession = (
    sessionId: string,
    options: { workspaceId?: string; replace?: boolean }
  ) => {
    workspaceNavigate(`/${sessionId}`, options)
  }

  const navigateToNewSession = (options: {
    workspaceId?: string
    replace?: boolean
  }) => {
    workspaceNavigate("/", options)
  }

  return {
    navigate: workspaceNavigate,
    buildUrl,
    getWorkspaceId,
    navigateToSession,
    navigateToNewSession,
  }
}
