import { describe, expect, test } from "bun:test"
import { deriveWorkspaceName, findWorkspaceForSession, openSessionById } from "./open-session-by-id"
import type { OpenSessionDeps } from "./open-session-by-id"
import type { Device, Workspace } from "@/pages/workspace/types"

function device(id: string, deviceId: string, status: Device["status"] = "online"): Device {
  return {
    id,
    deviceId,
    displayName: id,
    platform: "mac",
    version: "1",
    userId: "u",
    status,
    createdAt: "",
    updatedAt: "",
  }
}

function workspace(id: string, opts: Partial<Workspace> = {}): Workspace {
  return {
    id,
    name: id,
    userId: "u",
    isDefault: false,
    status: "active",
    createdAt: "",
    updatedAt: "",
    ...opts,
  }
}

/** Shorthand for a workspace bound to a device with one registered directory. */
function workspaceWithDir(id: string, deviceUniqueId: string, path: string): Workspace {
  return workspace(id, {
    deviceUniqueId,
    // Only `path` matters for directory matching; cast to keep the fixture small.
    directories: [{ path } as any],
  })
}

// Collects the effects of openSessionById for assertions.
function harness(over: Partial<OpenSessionDeps> = {}) {
  const calls = {
    navigated: undefined as { workspaceId: string; sessionId: string } | undefined,
    created: undefined as { name: string; deviceId: string; directory: string } | undefined,
    error: undefined as "not_found" | "failed" | undefined,
  }
  const deps: OpenSessionDeps = {
    listDevices: async () => [],
    probeSession: async () => null,
    listWorkspaces: async () => [],
    createWorkspace: async (input) => {
      calls.created = input
      return "ws-new"
    },
    navigateToSession: (workspaceId, sessionId) => {
      calls.navigated = { workspaceId, sessionId }
    },
    onError: (reason) => {
      calls.error = reason
    },
    ...over,
  }
  return { calls, deps }
}

describe("findWorkspaceForSession", () => {
  test("matches the workspace whose directory contains the session dir", () => {
    const ws = [workspaceWithDir("w1", "dev-uniq", "/p")]
    expect(findWorkspaceForSession(ws, device("db-1", "dev-uniq"), "/p/workdir")).toBe("w1")
  })

  test("matches on deviceId (db id) when deviceUniqueId is absent", () => {
    const ws = [workspace("w1", { deviceId: "db-1", directories: [{ path: "/p" } as any] })]
    expect(findWorkspaceForSession(ws, device("db-1", "dev-uniq"), "/p/workdir")).toBe("w1")
  })

  test("prefers the most specific (longest) containing directory", () => {
    const ws = [
      workspaceWithDir("w-root", "dev-uniq", "/p"),
      workspaceWithDir("w-nested", "dev-uniq", "/p/workdir"),
    ]
    expect(findWorkspaceForSession(ws, device("db-1", "dev-uniq"), "/p/workdir/task")).toBe("w-nested")
  })

  test("does not match a same-device workspace with a different directory", () => {
    const ws = [workspaceWithDir("w1", "dev-uniq", "/other/project")]
    expect(findWorkspaceForSession(ws, device("db-1", "dev-uniq"), "/p/workdir")).toBeUndefined()
  })

  test("does not match a containing directory on another device", () => {
    const ws = [workspaceWithDir("w1", "other-device", "/p")]
    expect(findWorkspaceForSession(ws, device("db-1", "dev-uniq"), "/p/workdir")).toBeUndefined()
  })

  test("a path prefix without a separator boundary is not containment", () => {
    const ws = [workspaceWithDir("w1", "dev-uniq", "/p/work")]
    expect(findWorkspaceForSession(ws, device("db-1", "dev-uniq"), "/p/workdir")).toBeUndefined()
  })

  test("returns undefined for an empty session directory", () => {
    const ws = [workspaceWithDir("w1", "dev-uniq", "/p")]
    expect(findWorkspaceForSession(ws, device("db-1", "dev-uniq"), "")).toBeUndefined()
  })
})

describe("deriveWorkspaceName", () => {
  test("uses the last path segment", () => {
    expect(deriveWorkspaceName("/Users/x/multica_workspaces/a/b/workdir")).toBe("workdir")
  })
  test("ignores trailing slashes", () => {
    expect(deriveWorkspaceName("/Users/x/proj/")).toBe("proj")
  })
  test("falls back to 'session' for empty input", () => {
    expect(deriveWorkspaceName("")).toBe("session")
  })
})

describe("openSessionById", () => {
  test("navigates to the workspace containing the session directory", async () => {
    const { calls, deps } = harness({
      listDevices: async () => [device("db-1", "dev-1"), device("db-2", "dev-2")],
      probeSession: async (d) => (d.id === "db-2" ? { directory: "/p/workdir" } : null),
      listWorkspaces: async () => [workspaceWithDir("w2", "dev-2", "/p")],
    })
    await openSessionById("sess-1", deps)
    expect(calls.navigated).toEqual({ workspaceId: "w2", sessionId: "sess-1" })
    expect(calls.created).toBeUndefined()
    expect(calls.error).toBeUndefined()
  })

  test("creates a workspace on the owning device when none exists", async () => {
    const { calls, deps } = harness({
      listDevices: async () => [device("db-1", "dev-1")],
      probeSession: async () => ({ directory: "/p/multica_workspaces/x/workdir" }),
      listWorkspaces: async () => [],
    })
    await openSessionById("sess-1", deps)
    expect(calls.created).toEqual({
      name: "workdir",
      deviceId: "db-1",
      directory: "/p/multica_workspaces/x/workdir",
    })
    expect(calls.navigated).toEqual({ workspaceId: "ws-new", sessionId: "sess-1" })
  })

  test("creates a new workspace when the device only has mismatched-directory workspaces", async () => {
    // Regression: reusing a same-device workspace that points at another
    // directory rendered the session in the wrong project tree and dropped it
    // from the directory-scoped session list (lost on refresh).
    const { calls, deps } = harness({
      listDevices: async () => [device("db-1", "dev-1")],
      probeSession: async () => ({ directory: "/p/multica_workspaces/x/workdir" }),
      listWorkspaces: async () => [workspaceWithDir("w-other", "dev-1", "/Users/x/project")],
    })
    await openSessionById("sess-1", deps)
    expect(calls.created).toEqual({
      name: "workdir",
      deviceId: "db-1",
      directory: "/p/multica_workspaces/x/workdir",
    })
    expect(calls.navigated).toEqual({ workspaceId: "ws-new", sessionId: "sess-1" })
  })

  test("skips offline devices when probing", async () => {
    const probed: string[] = []
    const { calls, deps } = harness({
      listDevices: async () => [device("db-1", "dev-1", "offline"), device("db-2", "dev-2", "online")],
      probeSession: async (d) => {
        probed.push(d.id)
        return d.id === "db-2" ? { directory: "/p/workdir" } : null
      },
      listWorkspaces: async () => [workspaceWithDir("w2", "dev-2", "/p")],
    })
    await openSessionById("sess-1", deps)
    expect(probed).toEqual(["db-2"])
    expect(calls.navigated?.workspaceId).toBe("w2")
  })

  test("reports not_found when no device has the session", async () => {
    const { calls, deps } = harness({
      listDevices: async () => [device("db-1", "dev-1")],
      probeSession: async () => null,
    })
    await openSessionById("sess-1", deps)
    expect(calls.error).toBe("not_found")
    expect(calls.navigated).toBeUndefined()
  })

  test("a probe that throws does not abort the search", async () => {
    const { calls, deps } = harness({
      listDevices: async () => [device("db-1", "dev-1"), device("db-2", "dev-2")],
      probeSession: async (d) => {
        if (d.id === "db-1") throw new Error("proxy down")
        return { directory: "/p/workdir" }
      },
      listWorkspaces: async () => [workspaceWithDir("w2", "dev-2", "/p")],
    })
    await openSessionById("sess-1", deps)
    expect(calls.navigated?.workspaceId).toBe("w2")
    expect(calls.error).toBeUndefined()
  })

  test("reports failed when device listing throws", async () => {
    const { calls, deps } = harness({
      listDevices: async () => {
        throw new Error("network")
      },
    })
    await openSessionById("sess-1", deps)
    expect(calls.error).toBe("failed")
  })

  test("no-ops on empty session id", async () => {
    const { calls, deps } = harness()
    await openSessionById("", deps)
    expect(calls.error).toBeUndefined()
    expect(calls.navigated).toBeUndefined()
  })
})

describe("openSessionById workspace name hint", () => {
  const conflict = () => Object.assign(new Error("workspace name already exists"), { status: 409 })

  test("uses the provided name hint instead of the directory leaf when creating a workspace", async () => {
    // The session directory leaf for multica workflow tasks is a bare task
    // UUID — the hint (issue identifier) is what makes the auto-created
    // workspace recognizable.
    const { calls, deps } = harness({
      listDevices: async () => [device("db-1", "dev-1")],
      probeSession: async () => ({ directory: "/p/multica_workspaces/x/9b1c2d3e-task-uuid" }),
      listWorkspaces: async () => [],
    })
    await openSessionById("sess-1", deps, { workspaceName: "MUL-123" })
    expect(calls.created).toEqual({
      name: "MUL-123",
      deviceId: "db-1",
      directory: "/p/multica_workspaces/x/9b1c2d3e-task-uuid",
    })
    expect(calls.navigated).toEqual({ workspaceId: "ws-new", sessionId: "sess-1" })
  })

  test("retries with a numeric suffix on the hinted name when it is taken", async () => {
    const attempted: string[] = []
    const { deps } = harness({
      listDevices: async () => [device("db-1", "dev-1")],
      probeSession: async () => ({ directory: "/p/x/task-uuid" }),
      listWorkspaces: async () => [],
      createWorkspace: async (input) => {
        attempted.push(input.name)
        if (input.name === "MUL-123") throw conflict()
        return "ws-new"
      },
    })
    await openSessionById("sess-1", deps, { workspaceName: "MUL-123" })
    expect(attempted).toEqual(["MUL-123", "MUL-123-2"])
  })

  test("a blank hint falls back to the directory leaf name", async () => {
    // Older embedded multica builds never send the hint — the parent must
    // keep working against them.
    const { calls, deps } = harness({
      listDevices: async () => [device("db-1", "dev-1")],
      probeSession: async () => ({ directory: "/p/workdir" }),
      listWorkspaces: async () => [],
    })
    await openSessionById("sess-1", deps, { workspaceName: "  " })
    expect(calls.created?.name).toBe("workdir")
  })
})

describe("openSessionById workspace name conflicts", () => {
  const conflict = () => Object.assign(new Error("workspace name already exists"), { status: 409 })

  test("retries with a numeric suffix when the derived name is taken", async () => {
    const attempted: string[] = []
    const { calls, deps } = harness({
      listDevices: async () => [device("db-1", "dev-1")],
      probeSession: async () => ({ directory: "/p/multica_workspaces/x/workdir" }),
      listWorkspaces: async () => [],
      createWorkspace: async (input) => {
        attempted.push(input.name)
        if (input.name === "workdir") throw conflict()
        return "ws-new"
      },
    })
    await openSessionById("sess-1", deps)
    expect(attempted).toEqual(["workdir", "workdir-2"])
    expect(calls.navigated).toEqual({ workspaceId: "ws-new", sessionId: "sess-1" })
    expect(calls.error).toBeUndefined()
  })

  test("keeps retrying through several taken names", async () => {
    const attempted: string[] = []
    const { calls, deps } = harness({
      listDevices: async () => [device("db-1", "dev-1")],
      probeSession: async () => ({ directory: "/p/workdir" }),
      listWorkspaces: async () => [],
      createWorkspace: async (input) => {
        attempted.push(input.name)
        if (input.name !== "workdir-4") throw conflict()
        return "ws-new"
      },
    })
    await openSessionById("sess-1", deps)
    expect(attempted).toEqual(["workdir", "workdir-2", "workdir-3", "workdir-4"])
    expect(calls.navigated?.workspaceId).toBe("ws-new")
  })

  test("a non-conflict creation error aborts immediately", async () => {
    const attempted: string[] = []
    const { calls, deps } = harness({
      listDevices: async () => [device("db-1", "dev-1")],
      probeSession: async () => ({ directory: "/p/workdir" }),
      listWorkspaces: async () => [],
      createWorkspace: async (input) => {
        attempted.push(input.name)
        throw new Error("device offline")
      },
    })
    await openSessionById("sess-1", deps)
    expect(attempted).toEqual(["workdir"])
    expect(calls.error).toBe("failed")
    expect(calls.navigated).toBeUndefined()
  })

  test("when every suffix conflicts, re-checks for a concurrently created containing workspace", async () => {
    const attempted: string[] = []
    let listed = false
    const { calls, deps } = harness({
      listDevices: async () => [device("db-1", "dev-1")],
      probeSession: async () => ({ directory: "/p/workdir" }),
      listWorkspaces: async () => {
        if (!listed) return []
        // The concurrent creator won the name race and registered the dir.
        return [workspaceWithDir("w-race", "dev-1", "/p/workdir")]
      },
      createWorkspace: async (input) => {
        attempted.push(input.name)
        listed = true
        throw conflict()
      },
    })
    await openSessionById("sess-1", deps)
    expect(attempted.length).toBeGreaterThan(1)
    expect(calls.navigated).toEqual({ workspaceId: "w-race", sessionId: "sess-1" })
    expect(calls.error).toBeUndefined()
  })

  test("reports failed when every suffix conflicts and no containing workspace appears", async () => {
    const { calls, deps } = harness({
      listDevices: async () => [device("db-1", "dev-1")],
      probeSession: async () => ({ directory: "/p/workdir" }),
      listWorkspaces: async () => [],
      createWorkspace: async () => {
        throw conflict()
      },
    })
    await openSessionById("sess-1", deps)
    expect(calls.error).toBe("failed")
    expect(calls.navigated).toBeUndefined()
  })
})
