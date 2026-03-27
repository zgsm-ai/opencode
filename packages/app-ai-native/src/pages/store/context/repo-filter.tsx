import { createContext, useContext, createSignal, createEffect, type JSX } from "solid-js"
import { repoApi, type Repository } from "../lib/api"
import { useAuth } from "../hooks/use-auth"

interface RepoFilterContextValue {
  selectedRepo: () => Repository | null
  setSelectedRepo: (repo: Repository | null) => void
  repos: () => Repository[]
  setRepos: (repos: Repository[] | ((prev: Repository[]) => Repository[])) => void
  loading: () => boolean
  refresh: () => Promise<void>
}

const RepoFilterContext = createContext<RepoFilterContextValue>({
  selectedRepo: () => null,
  setSelectedRepo: () => {},
  repos: () => [],
  setRepos: () => {},
  loading: () => false,
  refresh: async () => {},
})

export function RepoFilterProvider(props: { children: JSX.Element }) {
  const [repo, setRepo] = createSignal<Repository | null>(null)
  const [repos, setReposRaw] = createSignal<Repository[]>([])
  const [loading, setLoading] = createSignal(false)
  const { user } = useAuth()

  const setRepos = (v: Repository[] | ((prev: Repository[]) => Repository[])) => {
    setReposRaw(typeof v === "function" ? v : () => v)
  }

  const refresh = async () => {
    const u = user()
    if (!u?.sub) return
    setLoading(true)
    try {
      const res = await repoApi.listMy(u.sub)
      setReposRaw(res.repositories ?? [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  createEffect(() => {
    const u = user()
    if (u?.sub) {
      void refresh()
    } else {
      setReposRaw([])
    }
  })

  return (
    <RepoFilterContext.Provider
      value={{ selectedRepo: repo, setSelectedRepo: setRepo, repos, setRepos, loading, refresh }}
    >
      {props.children}
    </RepoFilterContext.Provider>
  )
}

export function useRepoFilter() {
  return useContext(RepoFilterContext)
}
