import { FileIcon } from "@opencode-ai/ui/file-icon"
import { List } from "@opencode-ai/ui/list"
import type { ListRef } from "@opencode-ai/ui/list"
import { Button } from "@opencode-ai/ui/button"
import fuzzysort from "fuzzysort"
import { createSignal, createMemo, Show, batch, onCleanup } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { getDirectory, getFilename } from "@opencode-ai/util/path"
import { deviceFileApi, type FileEntry, checkRuntimeConfig } from "../lib/cloud-device-api"
import type { Device } from "../types"
import { useLanguage } from "@/context/language"

export interface RemoteDirectorySelectorProps {
  device: Device
  initialPath?: string
  onSelect: (directory: string | null) => void
  onCancel?: () => void
}

type Row = {
  absolute: string
  search: string
  name: string
  parent: string
}

function normalizePath(input: string) {
  const v = input.replaceAll("\\", "/")
  if (v.startsWith("//") && !v.startsWith("///")) return "//" + v.slice(2).replace(/\/+/g, "/")
  return v.replace(/\/+/g, "/")
}

function trimTrailing(input: string) {
  if (input === "/") return input
  if (input.endsWith("/")) return input.slice(0, -1)
  return input
}

function getParentPath(path: string): string | null {
  if (path === "") return null
  const trimmed = trimTrailing(normalizePath(path))
  if (trimmed === "/") return null
  if (/^[A-Za-z]:$/.test(trimmed)) return ""
  const lastSlash = trimmed.lastIndexOf("/")
  if (lastSlash <= 0) return "/"
  const parent = trimmed.slice(0, lastSlash)
  if (/^[A-Za-z]:$/.test(parent)) return parent + "/"
  return parent || "/"
}

function displayPath(absolute: string) {
  const trimmed = trimTrailing(absolute)
  const parent = getDirectory(trimmed)
  const name = getFilename(trimmed)
  return { parent: parent || "/", name: name || trimmed }
}

function isAbsolutePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/")
  if (normalized.startsWith("/")) return true
  if (/^[A-Za-z]:[/\\]?.*/.test(normalized)) return true
  return false
}

function normalizeWindowsPath(input: string): string {
  const normalized = input.replace(/\\/g, "/")
  if (/^[A-Za-z]:$/.test(normalized)) {
    return normalized + "/"
  }
  return normalized
}

function useDirectoryCache(deviceId: () => string) {
  const cache = new Map<string, Promise<FileEntry[]>>()
  const pending = new Map<string, AbortController>()

  const fetch = async (path: string): Promise<FileEntry[]> => {
    const key = normalizePath(trimTrailing(path))
    const existing = cache.get(key)
    if (existing) return existing

    const controller = new AbortController()
    pending.set(key, controller)

    const request = deviceFileApi
      .list(deviceId(), path)
      .then((result) => {
        pending.delete(key)
        return result || []
      })
      .catch((err) => {
        pending.delete(key)
        cache.delete(key)
        throw err
      })

    cache.set(key, request)
    return request
  }

  const get = (path: string): FileEntry[] | undefined => {
    const key = normalizePath(trimTrailing(path))
    const promise = cache.get(key)
    if (!promise) return undefined
    return undefined
  }

  const clear = () => {
    cache.clear()
    pending.forEach((controller) => controller.abort())
    pending.clear()
  }

  onCleanup(clear)

  return { fetch, get, clear, cache }
}

export function RemoteDirectorySelector(props: RemoteDirectorySelectorProps) {
  const language = useLanguage()
  const t = language.t
  const [currentPath, setCurrentPath] = createSignal(props.initialPath || "/")
  const [selectedPath, setSelectedPath] = createSignal<string | null>(null)
  const [notSupported, setNotSupported] = createSignal<string | null>(null)
  const [loading, setLoading] = createSignal(false)
  const [directories, setDirectories] = createSignal<FileEntry[]>([])
  let list: ListRef | undefined
  let debounce: ReturnType<typeof setTimeout> | undefined

  const dirCache = useDirectoryCache(() => props.device.deviceId)

  const loadPath = async (path: string) => {
    if (notSupported()) return
    setLoading(true)
    try {
      const result = path === ""
        ? await deviceFileApi.listRoots(props.device.deviceId)
        : await dirCache.fetch(path)
      const dirs = result.filter((item) => item.type === "directory")
      setDirectories(dirs)
    } catch (err) {
      console.error("Failed to load directory:", err)
    } finally {
      setLoading(false)
    }
  }

  const checkSupport = async () => {
    const result = await checkRuntimeConfig(props.device.deviceId)
    if (!result.supported) {
      setNotSupported(result.error || t("workspace.directory.notSupported"))
    } else {
      loadPath(currentPath())
    }
  }

  checkSupport()

  onCleanup(() => clearTimeout(debounce))

  const items = async (query: string): Promise<Row[]> => {
    const dirs = directories()
    const normalizedQuery = normalizeWindowsPath(query).trim()

    const searchData = dirs.map((d) => {
      const display = displayPath(d.absolute)
      const searchFields = [d.name, d.absolute, d.absolute.replace(/\\/g, "/")].join(" ")

      return {
        ...d,
        display,
        searchFields,
      }
    })

    if (!normalizedQuery) {
      return searchData.map((d) => ({
        absolute: normalizePath(d.absolute),
        search: d.searchFields,
        name: d.display.name,
        parent: d.display.parent,
      }))
    }

    const filtered = fuzzysort.go(normalizedQuery, searchData, {
      key: "searchFields",
      limit: 50,
    })

    return filtered.map((x) => ({
      absolute: normalizePath(x.obj.absolute),
      search: x.obj.searchFields,
      name: x.obj.display.name,
      parent: x.obj.display.parent,
    }))
  }

  const navigateTo = (path: string, clear = true) => {
    batch(() => {
      setCurrentPath(path)
      setSelectedPath(path)
      if (clear) list?.setFilter("")
    })
    loadPath(path)
  }

  const navigateUp = () => {
    const parent = getParentPath(currentPath())
    if (parent !== null) {
      navigateTo(parent)
    }
  }

  const currentPathDisplay = createMemo(() => {
    const path = currentPath()
    if (path === "") return t("workspace.directory.thisPC")
    if (path === "/") return "/"
    return trimTrailing(path)
  })

  const highlightedPath = createMemo(() => {
    return selectedPath() || currentPath()
  })

  const highlightedLabel = createMemo(() => {
    const p = highlightedPath()
    return p === "" ? t("workspace.directory.thisPC") : p
  })

  function resolve(absolute: string) {
    props.onSelect(absolute)
    if (props.onCancel) {
      props.onCancel()
    }
  }

  const handleFilterChange = (value: string) => {
    const normalizedValue = normalizeWindowsPath(value).trim()
    if (!normalizedValue || !isAbsolutePath(normalizedValue)) return
    clearTimeout(debounce)
    debounce = setTimeout(() => {
      navigateTo(normalizeWindowsPath(normalizedValue), false)
    }, 300)
  }

  return (
    <div class="flex flex-col h-[480px]">
      {/* Path bar */}
      <div class="flex items-center gap-2 px-3 py-1.5 border-b border-border-weak-base shrink-0">
        <button
          type="button"
          class="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-surface-base-hover disabled:opacity-40 transition-colors text-11-medium text-text-weak shrink-0"
          onClick={navigateUp}
          disabled={getParentPath(currentPath()) === null || !!notSupported()}
        >
          <Icon name="arrow-up" class="size-3.5" />
          <span>{t("workspace.directory.goUp")}</span>
        </button>
        <div class="flex items-center gap-1.5 text-12-regular text-text-weak flex-1 min-w-0">
          <Icon name="folder" class="size-3.5 shrink-0" />
          <span class="truncate">{currentPathDisplay()}</span>
        </div>
        <span class="text-11-regular text-text-weaker shrink-0">
          {t("workspace.directory.count", { count: directories().length })}
        </span>
      </div>

      {/* Not supported warning */}
      <Show when={notSupported()}>
        <div class="flex flex-col items-center justify-center p-5 text-text-weak shrink-0">
          <Icon name="warning" class="size-8 mb-2 text-yellow-500" />
          <p class="text-13-medium text-center">{notSupported()}</p>
          <p class="text-11-regular text-text-weaker mt-1.5 text-center">{t("workspace.directory.notSupportedHint")}</p>
        </div>
      </Show>

      {/* Directory list */}
      <div class="flex-1 min-h-0 overflow-hidden pt-2">
        <List
          search={{
            placeholder: notSupported() ? t("workspace.directory.notSupported") : t("workspace.directory.search"),
            autofocus: true,
          }}
          emptyMessage={
            loading()
              ? t("workspace.directory.loading")
              : notSupported()
                ? t("workspace.directory.notSupported")
                : t("workspace.directory.empty")
          }
          loadingMessage={t("workspace.directory.loading")}
          items={items}
          key={(x: Row) => x.absolute}
          filterKeys={["search"]}
          ref={(r: ListRef) => (list = r)}
          onFilter={handleFilterChange}
          onKeyEvent={(e, item) => {
            if (e.key !== "Tab") return
            if (e.shiftKey) return
            if (!item) return

            e.preventDefault()
            e.stopPropagation()

            const value = item.absolute
            list?.setFilter(value.endsWith("/") ? value : value + "/")
          }}
          onSelect={(path) => {
            if (!path) return
            setSelectedPath(path.absolute)
          }}
          class="h-full overflow-y-auto directory-selector-list"
        >
          {(item: Row) => {
            const path = displayPath(item.absolute)
            const isSelected = highlightedPath() === item.absolute
            return (
              <div
                class={`group w-full flex items-center justify-between rounded-md cursor-pointer ${isSelected ? "bg-surface-base-active" : ""}`}
                onDblClick={() => {
                  navigateTo(item.absolute)
                }}
              >
                <div class="flex items-center gap-x-2.5 grow min-w-0">
                  <FileIcon node={{ path: item.absolute, type: "directory" }} class="shrink-0 size-4" />
                  <div class="flex items-center text-13-regular min-w-0">
                    <span class="text-text-weak whitespace-nowrap overflow-hidden overflow-ellipsis truncate min-w-0">
                      {path.parent}
                    </span>
                    <span class="text-text-strong whitespace-nowrap">{path.name}</span>
                    <span class="text-text-weak whitespace-nowrap">/</span>
                  </div>
                </div>
                <span class="shrink-0 flex items-center gap-1 pr-1 opacity-0 group-hover:opacity-100 transition-opacity text-text-weaker">
                  <span class="text-11-regular whitespace-nowrap">{t("workspace.directory.doubleClickHint")}</span>
                  <Icon name="chevron-right" class="size-3" />
                </span>
              </div>
            )
          }}
        </List>
      </div>

      {/* Bottom actions */}
      <div class="flex items-center justify-between gap-2 px-3 py-2 border-t border-border-weak-base shrink-0">
        <div class="flex-1 min-w-0 flex items-center gap-1.5 text-12-regular text-text-weak">
          <Icon name="folder" class="size-3.5 shrink-0 text-text-strong" />
          <span class="text-text-strong truncate">{highlightedLabel()}</span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="small"
            onClick={() => {
              props.onSelect(null)
              if (props.onCancel) {
                props.onCancel()
              }
            }}
          >
            {t("workspace.directory.cancel")}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="small"
            onClick={() => resolve(highlightedPath())}
            disabled={!!notSupported() || highlightedPath() === ""}
          >
            {t("workspace.directory.select")}
          </Button>
        </div>
      </div>
    </div>
  )
}
