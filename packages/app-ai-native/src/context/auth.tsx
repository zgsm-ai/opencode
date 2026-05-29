import { createContext, useContext, type ParentProps } from "solid-js"
import { env } from "@/lib/env"
const PREFIX = env.API_PREFIX
const BASE_PATH = env.BASE_PATH || "/"
import { createStore } from "solid-js/store"
import { onMount } from "solid-js"
import type { CasdoorUser } from "@/pages/store/lib/auth"

// Demo mode mock user
const DEMO_USER: CasdoorUser = {
  id: "demo-user-001",
  subjectId: "demo-user-001",
  username: "demo_user",
  avatarUrl: "",
  casdoorUniversalId: "demo-casdoor-001",
  systemRoles: ["admin"],
  sub: "demo-user-001",
  name: "Demo User",
  preferred_username: "demo_user",
  email: "demo@example.com",
  picture: "",
  owner: "demo-org",
}

const DEMO_PERMISSIONS: UserPermissions = {
  menus: ["kanban", "console"],
  apis: ["*"],
  capabilities: ["*"],
}

function normalizeAuthUser(raw: any): CasdoorUser | null {
  if (!raw || typeof raw !== "object") return null

  const id = raw.id ?? raw.subjectId ?? raw.sub
  if (!id) return null

  const username = raw.username ?? raw.preferred_username
  const displayName = raw.name ?? raw.preferred_username ?? raw.username
  const avatarUrl = raw.avatarUrl ?? raw.picture

  return {
    id,
    subjectId: raw.subjectId ?? id,
    username,
    avatarUrl,
    casdoorUniversalId: raw.casdoorUniversalId,
    systemRoles: raw.systemRoles ?? [],

    // backward-compatible aliases
    sub: raw.sub ?? raw.subjectId ?? raw.id,
    name: displayName,
    preferred_username: raw.preferred_username ?? username ?? displayName,
    email: raw.email,
    picture: avatarUrl,
    owner: raw.owner,
  }
}

export interface UserPermissions {
  menus: string[]
  apis: string[]
  capabilities: string[]
}

interface AuthState {
  user: CasdoorUser | null
  permissions: UserPermissions | null
  loading: boolean
}

interface AuthContextValue {
  user: () => CasdoorUser | null
  permissions: () => UserPermissions | null
  loading: () => boolean
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  canAccessMenu: (code: string) => boolean
  hasCapability: (cap: string) => boolean
}

const AuthContext = createContext<AuthContextValue>({
  user: () => null,
  permissions: () => null,
  loading: () => true,
  logout: async () => {},
  refreshUser: async () => {},
  canAccessMenu: () => false,
  hasCapability: () => false,
})

export function AuthProvider(props: ParentProps) {
  const [state, setState] = createStore<AuthState>({ user: null, permissions: null, loading: true })

  async function fetchUser() {
    try {
      const res = await fetch(`${PREFIX}/api/auth/me`, { credentials: "include" })
      if (!res.ok) {
        setState("user", null)
        return
      }
      const payload = await res.json()
      setState("user", normalizeAuthUser(payload?.user))
    } catch {
      setState("user", null)
    }
  }

  async function fetchPermissions() {
    try {
      const res = await fetch(`${PREFIX}/api/auth/permissions`, { credentials: "include" })
      if (!res.ok) {
        setState("permissions", null)
        return
      }
      const payload = await res.json()
      setState("permissions", {
        menus: payload.menus ?? [],
        apis: payload.apis ?? [],
        capabilities: payload.capabilities ?? [],
      })
    } catch {
      setState("permissions", null)
    }
  }

  onMount(async () => {
    // In demo mode, immediately set mock user without API calls
    if (env.DEMO_MODE) {
      setState("user", DEMO_USER)
      setState("permissions", DEMO_PERMISSIONS)
      setState("loading", false)
      return
    }

    await fetchUser()
    if (state.user) {
      await fetchPermissions()
    }
    setState("loading", false)
  })

  const logout = async () => {
    if (env.DEMO_MODE) {
      // In demo mode, just reset to demo user
      setState("user", DEMO_USER)
      setState("permissions", DEMO_PERMISSIONS)
      return
    }
    await fetch(`${PREFIX}/api/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {})
    setState("user", null)
    setState("permissions", null)
    window.location.href = BASE_PATH
  }

  const canAccessMenu = (code: string) => {
    const perms = state.permissions
    if (!perms) return false
    return perms.menus.includes(code)
  }

  const hasCapability = (cap: string) => {
    const perms = state.permissions
    if (!perms) return false
    return perms.capabilities.includes(cap)
  }

  return (
    <AuthContext.Provider value={{ user: () => state.user, permissions: () => state.permissions, loading: () => state.loading, logout, refreshUser: fetchUser, canAccessMenu, hasCapability }}>
      {props.children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
