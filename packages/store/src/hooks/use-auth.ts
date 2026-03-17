import { createSignal, onMount } from "solid-js"
import { CasdoorUser } from "../lib/auth"

const API_BASE = import.meta.env.VITE_API_URL ?? ""

export function useAuth() {
  const [user, setUser] = createSignal<CasdoorUser | null>(null)
  const [loading, setLoading] = createSignal(true)

  async function handleCallback() {
    const params = new URLSearchParams(window.location.search)
    const code = params.get("code")
    if (!code) return false

    try {
      const res = await fetch(`http://10.48.18.5:18000/api/auth/callback?code=${encodeURIComponent(code)}`, {
        credentials: "include",
      })
      if (!res.ok) return false

      // const state = params.get("state")
      // let redirectTo = "/"
      // if (state) {
      //   try {
      //     const parsed = JSON.parse(state)
      //     redirectTo = parsed.redirectTo || "/"
      //   } catch {
      //     redirectTo = state
      //   }
      // }

      // window.history.replaceState({}, "", window.location.pathname)
      // if (redirectTo !== window.location.pathname) {
      //   window.location.href = redirectTo
      // }
      return true
    } catch {
      return false
    }
  }

  async function fetchUser() {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setUser(data.user ?? null)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    }
  }

  onMount(async () => {
    await handleCallback()
    await fetchUser()
    setLoading(false)
  })

  const logout = async () => {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {})
    setUser(null)
    window.location.href = "/"
  }

  return { user, loading, logout }
}
