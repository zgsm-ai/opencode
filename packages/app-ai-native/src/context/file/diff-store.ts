import { createStore, produce } from "solid-js/store"
import type { DiffData, DiffFileEntry } from "@/client/device-client"

type DiffState = {
  stagedFiles: DiffFileEntry[]
  unstagedFiles: DiffFileEntry[]
  untrackedFiles: DiffFileEntry[]
  branch: string
  loading: boolean
  error: string | undefined
  disabled: boolean
}

type DiffStoreOptions = {
  scope: () => string
  fetch: () => Promise<DiffData | undefined>
  isDisabledError?: (e: unknown) => boolean
}

export function createDiffStore(options: DiffStoreOptions) {
  const [state, setState] = createStore<DiffState>({
    stagedFiles: [],
    unstagedFiles: [],
    untrackedFiles: [],
    branch: "",
    loading: false,
    error: undefined,
    disabled: false,
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
        draft.disabled = false
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
        if (!result) return
        const next = {
          stagedFiles: result.stagedFiles ?? [],
          unstagedFiles: result.unstagedFiles ?? [],
          untrackedFiles: result.untrackedFiles ?? [],
          branch: result.branch ?? "",
        }
        const unchanged =
          state.branch === next.branch &&
          JSON.stringify(state.stagedFiles) === JSON.stringify(next.stagedFiles) &&
          JSON.stringify(state.unstagedFiles) === JSON.stringify(next.unstagedFiles) &&
          JSON.stringify(state.untrackedFiles) === JSON.stringify(next.untrackedFiles)
        if (unchanged) return
        setState(
          produce((draft) => {
            draft.stagedFiles = next.stagedFiles
            draft.unstagedFiles = next.unstagedFiles
            draft.untrackedFiles = next.untrackedFiles
            draft.branch = next.branch
          }),
        )
      })
      .catch((e) => {
        if (options.scope() !== directory) return
        if (options.isDisabledError?.(e)) {
          setState("disabled", true)
        } else {
          setState("error", e?.message ?? "Unknown error")
        }
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
