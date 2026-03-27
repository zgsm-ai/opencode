import { createContext, useContext, type ParentProps } from "solid-js"
import { env } from "@/lib/env"
const PREFIX = env.API_PREFIX
const BASE_PATH = env.BASE_PATH || "/"
import { createStore } from "solid-js/store"
import { onMount } from "solid-js"
import type { CasdoorUser } from "@/pages/store/lib/auth"

interface AuthState {
  user: CasdoorUser | null
  loading: boolean
}

interface AuthContextValue {
  user: () => CasdoorUser | null
  loading: () => boolean
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: () => null,
  loading: () => true,
  logout: async () => {},
})

export function AuthProvider(props: ParentProps) {
  const [state, setState] = createStore<AuthState>({ user: null, loading: true })

  async function fetchUser() {
    try {
      const res = await fetch(`${PREFIX}/api/auth/me`, { credentials: "include" })
      setState("user", res.ok ? ((await res.json()).user ?? null) : null)
    } catch {
      setState("user", null)
    }
  }

  onMount(async () => {
    await fetchUser()
    setState("loading", false)
  })

  const logout = async () => {
    await fetch(`${PREFIX}/api/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {})
    setState("user", null)
    window.location.href = BASE_PATH
  }

  return (
    <AuthContext.Provider value={{ user: () => state.user, loading: () => state.loading, logout }}>
      {props.children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
