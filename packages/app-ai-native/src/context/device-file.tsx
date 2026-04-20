import { batch, createEffect, createMemo, onCleanup } from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import { showToast } from "@opencode-ai/ui/toast"
import { getFilename } from "@opencode-ai/util/path"
import type { ParentProps } from "solid-js"
import { useDeviceSDK } from "./device-sdk"
import { useLanguage } from "@/context/language"
import { FileContext } from "./file"
import { createPathHelpers } from "./file/path"
import { createFileTreeStore } from "./file/tree-store"
import {
  approxBytes,
  evictContentLru,
  getFileContentBytesTotal,
  getFileContentEntryCount,
  hasFileContent,
  removeFileContentBytes,
  resetFileContentLru,
  setFileContentBytes,
  touchFileContent,
} from "./file/content-cache"
import { createFileViewCache } from "./file/view-cache"
import type { FileState, FileViewState, SelectedLineRange } from "./file/types"

export { selectionFromLines } from "./file/types"
export type { FileSelection, SelectedLineRange, FileViewState, FileState } from "./file/types"
export {
  evictContentLru,
  getFileContentBytesTotal,
  getFileContentEntryCount,
  removeFileContentBytes,
  resetFileContentLru,
  setFileContentBytes,
  touchFileContent,
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error) return error
  return "Unknown error"
}

export function DeviceFileProvider(props: ParentProps) {
  const device = useDeviceSDK()
  const language = useLanguage()

  const scope = createMemo(() => device.directory)
  const path = createPathHelpers(scope)

  const inflight = new Map<string, Promise<void>>()
  const [store, setStore] = createStore<{
    file: Record<string, FileState>
  }>({
    file: {},
  })

  const tree = createFileTreeStore({
    scope,
    normalizeDir: path.normalizeDir,
    list: (dir) => device.client.runtime.fileList(dir || ".").then((x) => (x as unknown as import("@opencode-ai/sdk/v2").FileNode[] | undefined) ?? []),
    onError: (message) => {
      showToast({
        variant: "error",
        title: language.t("toast.file.listFailed.title"),
        description: message,
      })
    },
  })

  const evictContent = (keep?: Set<string>) => {
    evictContentLru(keep, (target) => {
      if (!store.file[target]) return
      setStore(
        "file",
        target,
        produce((draft) => {
          draft.content = undefined
          draft.loaded = false
        }),
      )
    })
  }

  createEffect(() => {
    scope()
    inflight.clear()
    resetFileContentLru()
    batch(() => {
      setStore("file", reconcile({}))
      tree.reset()
    })
  })

  const viewCache = createFileViewCache()
  const view = createMemo(() => viewCache.load(scope(), undefined))

  const ensure = (file: string) => {
    if (!file) return
    if (store.file[file]) return
    setStore("file", file, { path: file, name: getFilename(file) })
  }

  const setLoading = (file: string) => {
    setStore(
      "file",
      file,
      produce((draft) => {
        draft.loading = true
        draft.error = undefined
      }),
    )
  }

  const setLoaded = (file: string, content: FileState["content"]) => {
    setStore(
      "file",
      file,
      produce((draft) => {
        draft.loaded = true
        draft.loading = false
        draft.content = content
      }),
    )
  }

  const setLoadError = (file: string, message: string) => {
    setStore(
      "file",
      file,
      produce((draft) => {
        draft.loading = false
        draft.error = message
      }),
    )
    showToast({
      variant: "error",
      title: language.t("toast.file.loadFailed.title"),
      description: message,
    })
  }

  const load = (input: string, options?: { force?: boolean }) => {
    const file = path.normalize(input)
    if (!file) return Promise.resolve()

    const directory = scope()
    const key = `${directory}\n${file}`
    ensure(file)

    const current = store.file[file]
    if (!options?.force && current?.loaded) return Promise.resolve()

    const pending = inflight.get(key)
    if (pending) return pending

    setLoading(file)

    const promise = device.client.runtime
      .fileRead(file)
      .then((x) => {
        if (scope() !== directory) return
        const content = x as FileState["content"]
        setLoaded(file, content)

        if (!content) return
        touchFileContent(file, approxBytes(content))
        evictContent(new Set([file]))
      })
      .catch((e) => {
        if (scope() !== directory) return
        setLoadError(file, errorMessage(e))
      })
      .finally(() => {
        inflight.delete(key)
      })

    inflight.set(key, promise)
    return promise
  }

  let searchTimer: ReturnType<typeof setTimeout> | undefined
  const search = (query: string, dirs: "true" | "false") =>
    new Promise<string[]>((resolve) => {
      if (searchTimer) clearTimeout(searchTimer)
      searchTimer = setTimeout(() => {
        searchTimer = undefined
        device.client.runtime.findFiles(query, dirs).then(
          (x) => resolve(((x as string[] | undefined) ?? []).map(path.normalize)),
          () => resolve([]),
        )
      }, 300)
    })

  const get = (input: string) => {
    const file = path.normalize(input)
    const state = store.file[file]
    const content = state?.content
    if (!content) return state
    if (hasFileContent(file)) {
      touchFileContent(file)
      return state
    }
    touchFileContent(file, approxBytes(content))
    return state
  }

  onCleanup(() => {
    viewCache.clear()
  })

  const value = {
    ready: () => view().ready(),
    normalize: path.normalize,
    tab: path.tab,
    pathFromTab: path.pathFromTab,
    tree: {
      list: tree.listDir,
      refresh: (input: string) => tree.listDir(input, { force: true }),
      state: tree.dirState,
      children: tree.children,
      expand: tree.expandDir,
      collapse: tree.collapseDir,
      toggle(input: string) {
        if (tree.dirState(input)?.expanded) {
          tree.collapseDir(input)
          return
        }
        tree.expandDir(input)
      },
    },
    get,
    load,
    scrollTop: (input: string) => {
      const file = path.normalize(input)
      return view().scrollTop(file)
    },
    scrollLeft: (input: string) => {
      const file = path.normalize(input)
      return view().scrollLeft(file)
    },
    selectedLines: (input: string) => {
      const file = path.normalize(input)
      return view().selectedLines(file)
    },
    setScrollTop: (input: string, top: number) => {
      const file = path.normalize(input)
      view().setScrollTop(file, top)
    },
    setScrollLeft: (input: string, left: number) => {
      const file = path.normalize(input)
      view().setScrollLeft(file, left)
    },
    setSelectedLines: (input: string, range: SelectedLineRange | null) => {
      const file = path.normalize(input)
      view().setSelectedLines(file, range)
    },
    searchFiles: (query: string) => search(query, "false"),
    searchFilesAndDirectories: (query: string) => search(query, "true"),
  }

  return <FileContext.Provider value={value}>{props.children}</FileContext.Provider>
}
