import type { Device, Workspace } from "@/pages/workspace/types"

/**
 * Open a csc session by id when the owning workspace is unknown.
 *
 * multica reports only a session id. The session lives on some device, but its
 * working directory is an isolated per-task dir that belongs to no CoStrict
 * workspace, so we cannot resolve the workspace from a path. Instead we:
 *   1. enumerate the user's devices,
 *   2. probe each ONLINE device for the session id (lookup is directory-
 *      independent on the device side),
 *   3. once found, reuse the workspace on that device whose registered
 *      directories CONTAIN the session's directory — never a workspace that
 *      points elsewhere, or the session would render inside the wrong project
 *      tree and fall out of the directory-scoped session list — or create a
 *      workspace on demand for the session's directory,
 *   4. navigate to /workspace/<id>?session=<sessionId>.
 *
 * All I/O is injected so the orchestration is unit-testable.
 */
export interface OpenSessionDeps {
  listDevices: () => Promise<Device[]>
  /** Probe one device for the session; resolve its directory if present, else null. */
  probeSession: (device: Device, sessionId: string) => Promise<{ directory: string } | null>
  listWorkspaces: () => Promise<Workspace[]>
  /** Create a workspace on the device for the directory; resolve the new workspace id. */
  createWorkspace: (input: { name: string; deviceId: string; directory: string }) => Promise<string>
  navigateToSession: (workspaceId: string, sessionId: string) => void
  onError: (reason: "not_found" | "failed") => void
}

export async function openSessionById(sessionId: string, deps: OpenSessionDeps): Promise<void> {
  if (!sessionId) return
  try {
    const devices = await deps.listDevices()
    const online = devices.filter((d) => d.status === "online")

    // Probe concurrently; pick the first device (in list order) that has it.
    const probes = await Promise.all(
      online.map(async (device) => {
        try {
          const found = await deps.probeSession(device, sessionId)
          return found ? { device, directory: found.directory } : null
        } catch {
          return null
        }
      }),
    )
    const hit = probes.find((p): p is { device: Device; directory: string } => p !== null)
    if (!hit) {
      deps.onError("not_found")
      return
    }

    const workspaces = await deps.listWorkspaces()
    const existing = findWorkspaceForSession(workspaces, hit.device, hit.directory)
    if (existing) {
      deps.navigateToSession(existing, sessionId)
      return
    }

    const newWorkspaceId = await deps.createWorkspace({
      name: deriveWorkspaceName(hit.directory),
      deviceId: hit.device.id,
      directory: hit.directory,
    })
    deps.navigateToSession(newWorkspaceId, sessionId)
  } catch {
    deps.onError("failed")
  }
}

/**
 * Find the workspace that owns the session's directory. Only workspaces on the
 * given device are considered, and a workspace matches only when one of its
 * registered directories CONTAINS the session's working directory — reusing a
 * workspace that points at a different directory would render the session
 * inside the wrong project tree and drop it from the directory-scoped session
 * list. When several nested directories match, the longest (most specific)
 * path wins. Returns undefined when nothing contains the directory, so the
 * caller creates a workspace for the session's own directory instead.
 */
export function findWorkspaceForSession(
  workspaces: Workspace[],
  device: Device,
  directory: string,
): string | undefined {
  const dir = normalizePath(directory)
  if (!dir) return undefined
  let best: { id: string; len: number } | undefined
  for (const w of workspaces) {
    const onDevice =
      (!!w.deviceUniqueId && w.deviceUniqueId === device.deviceId) ||
      (!!w.deviceId && w.deviceId === device.id)
    if (!onDevice) continue
    for (const d of w.directories ?? []) {
      const p = normalizePath(d.path)
      if (!p) continue
      if (dir === p || dir.startsWith(p + "/") || dir.startsWith(p + "\\")) {
        if (!best || p.length > best.len) best = { id: w.id, len: p.length }
      }
    }
  }
  return best?.id
}

/** Strip trailing slashes so directory containment checks compare cleanly. */
function normalizePath(p: string): string {
  return (p ?? "").replace(/[/\\]+$/, "")
}

/** Last path segment of the session's directory, used to name an auto-created workspace. */
export function deriveWorkspaceName(directory: string): string {
  const trimmed = (directory ?? "").replace(/[/\\]+$/, "")
  const base = trimmed.split(/[/\\]/).pop()
  return base || "session"
}
