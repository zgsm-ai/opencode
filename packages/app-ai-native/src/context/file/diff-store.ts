import { createStore, produce } from "solid-js/store"
import type { DiffData, DiffFileEntry } from "@/client/device-client"

type DiffState = {
  stagedFiles: DiffFileEntry[]
  unstagedFiles: DiffFileEntry[]
  untrackedFiles: DiffFileEntry[]
  branch: string
  loading: boolean
  error: string | undefined
}

type DiffStoreOptions = {
  scope: () => string
  fetch: () => Promise<DiffData | undefined>
}

export function createDiffStore(options: DiffStoreOptions) {
  const [state, setState] = createStore<DiffState>({
    stagedFiles: [],
    unstagedFiles: [],
    untrackedFiles: [],
    branch: "",
    loading: false,
    error: undefined,
  })

  const inflight = new Map<string, Promise<void>>()

  const reset = () => {
    inflight.clear()
    setState(
      produce((draft) => {
        draft.stagedFiles = []
        draft.unstagedFiles = []
        draft.untrackedFiles = []
        draft.branch = ""
        draft.loading = false
        draft.error = undefined
      }),
    )
  }

  const load = (): Promise<void> => {
    const directory = options.scope()
    const pending = inflight.get(directory)
    if (pending) return pending

    setState("loading", true)
    setState("error", undefined)

    const promise = options
      .fetch()
      .then((result) => {
        if (options.scope() !== directory) return
        if (result) {
          setState(
            produce((draft) => {
              draft.stagedFiles = result.stagedFiles ?? []
              draft.unstagedFiles = result.unstagedFiles ?? []
              draft.untrackedFiles = result.untrackedFiles ?? []
              draft.branch = result.branch ?? ""
            }),
          )
        }
      })
      .catch((e) => {
        if (options.scope() !== directory) return
        setState("error", e?.message ?? "Unknown error")
      })
      .finally(() => {
        if (options.scope() !== directory) return
        setState("loading", false)
        inflight.delete(directory)
      })

    inflight.set(directory, promise)
    return promise
  }

  return { state: () => state, load, reset }
}
