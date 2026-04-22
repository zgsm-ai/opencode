import { createEffect, createMemo, createSignal, Match, onCleanup, Show, Switch } from "solid-js"
import { Dynamic } from "solid-js/web"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { useFileComponent } from "@opencode-ai/ui/context/file"
import { Markdown } from "@opencode-ai/ui/markdown"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { Button } from "@/components/ui/button"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useDirectory } from "@/context/directory"
import type { ContentTab } from "@/context/content-tabs"
import { filePreviewConfig } from "../lib/file-preview-config"

function isMarkdownFile(path: string | undefined) {
  if (!path) return false
  return path.endsWith(".md") || path.endsWith(".markdown") || path.endsWith(".mdx")
}

export function FilePreviewTab(props: { tab: ContentTab }) {
  const file = useFile()
  const language = useLanguage()
  const fileComponent = useFileComponent()
  const directory = useDirectory()
  const [preview, setPreview] = createSignal(true)

  const path = createMemo(() => props.tab.meta.path as string | undefined)
  const md = createMemo(() => isMarkdownFile(path()))
  const relativePath = createMemo(() => {
    const p = path()
    if (!p) return ""
    const dir = directory().replace(/\\/g, "/").replace(/\/+$/, "")
    const normalized = p.replace(/\\/g, "/")
    if (normalized.startsWith(dir + "/")) return normalized.slice(dir.length + 1)
    if (normalized.startsWith(dir)) return normalized.slice(dir.length).replace(/^\//, "")
    return p
  })
  const state = createMemo(() => {
    const p = path()
    if (!p) return
    return file.get(p)
  })
  const contents = createMemo(() => (state()?.content as { content?: string } | undefined)?.content ?? "")
  const chunk = createMemo(() => state()?.chunk)
  const meta = createMemo(() => state()?.meta)
  const loadedLines = createMemo(() => {
    const current = chunk()
    if (!current) return 0
    return Math.max(0, current.offset - 1) + current.lines
  })
  const hasMore = createMemo(() => {
    const current = chunk()
    if (!current) return false
    return loadedLines() < current.totalLines
  })
  const [loadingMore, setLoadingMore] = createSignal(false)
  let viewportEl: HTMLDivElement | undefined
  let autoLoadTimer: ReturnType<typeof setTimeout> | undefined
  let lastAutoLoadAt = 0
  let pendingRestoreScrollTop: number | undefined

  const restoreScrollPosition = () => {
    const scrollTop = pendingRestoreScrollTop
    if (!viewportEl || scrollTop == null) return

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!viewportEl) return
        viewportEl.scrollTop = scrollTop
        pendingRestoreScrollTop = undefined
      })
    })
  }

  createEffect(() => {
    const p = path()
    const current = state()
    if (!p || current?.loaded || current?.loading || current?.error) return
    void file.load(p, { limit: filePreviewConfig.initialPreviewLines })
  })

  const loadMore = async (mode: "auto" | "manual" = "manual") => {
    const p = path()
    const current = chunk()
    if (!p || !current || loadingMore() || !hasMore()) return
    if (viewportEl) {
      pendingRestoreScrollTop = viewportEl.scrollTop
    }
    setLoadingMore(true)
    try {
      await file.load(p, {
        offset: loadedLines() + 1,
        limit: filePreviewConfig.loadMoreLines,
      })
    } finally {
      setLoadingMore(false)
    }
  }

  const markdownPreviewEnabled = createMemo(() => {
    if (!md()) return false
    if (hasMore()) return false
    return (chunk()?.totalLines ?? 0) <= filePreviewConfig.largeMarkdownLineThreshold || !chunk()
  })

  const canAutoLoadMore = createMemo(() => hasMore() && loadedLines() < filePreviewConfig.autoLoadMoreMaxLines)

  createEffect(() => {
    const el = viewportEl
    if (!el) return

    const maybeLoadMore = () => {
      if (!canAutoLoadMore() || loadingMore()) return
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight
      if (remaining <= filePreviewConfig.autoLoadMoreThresholdPx) {
        const now = Date.now()
        if (now - lastAutoLoadAt < filePreviewConfig.autoLoadMoreCooldownMs) return
        lastAutoLoadAt = now
        void loadMore("auto")
      }
    }

    const scheduleLoadMore = () => {
      if (autoLoadTimer) clearTimeout(autoLoadTimer)
      autoLoadTimer = setTimeout(() => {
        autoLoadTimer = undefined
        maybeLoadMore()
      }, filePreviewConfig.autoLoadMoreDebounceMs)
    }

    el.addEventListener("scroll", scheduleLoadMore, { passive: true })
    onCleanup(() => {
      el.removeEventListener("scroll", scheduleLoadMore)
      if (autoLoadTimer) {
        clearTimeout(autoLoadTimer)
        autoLoadTimer = undefined
      }
    })
  })

  const loadedSizeLabel = createMemo(() => {
    const size = meta()?.size
    if (size == null) return undefined
    if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
    if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${size} B`
  })

  const hasPreviewStatus = createMemo(() => md() && !markdownPreviewEnabled())
  const showFooter = createMemo(() => hasMore() || hasPreviewStatus())

  const renderFile = (source: string) => (
    <div class="relative overflow-hidden pb-40">
      <Dynamic
        component={fileComponent}
        mode="text"
        file={{
          name: path() ?? "",
          contents: source,
        }}
        overflow="scroll"
        class="select-text"
        media={{
          mode: "auto",
          path: path(),
          current: state()?.content,
          onError: () => {},
        }}
        onRendered={restoreScrollPosition}
      />
    </div>
  )

  const renderMarkdown = (source: string) => (
    <div class="px-6 py-4 max-w-none">
      <Markdown text={source} class="text-14-regular" />
    </div>
  )

  return (
    <div class="h-full flex flex-col">
      <Show when={relativePath()}>
        <div class="shrink-0 h-8 flex items-center gap-0.5 px-3 border-b bg-background-base z-10 text-12-medium text-text-weak truncate">
          <span class="truncate flex-1 min-w-0">{relativePath()}</span>
          <Show when={md()}>
            <Tooltip
              value={markdownPreviewEnabled()
                ? (preview() ? language.t("workspace.content.viewSource") : language.t("workspace.content.viewPreview"))
                : language.t("workspace.content.viewSource")}
              placement="bottom"
            >
              <button
                class="shrink-0 ml-2 flex items-center justify-center h-5 w-5 rounded hover:bg-background-stronger transition-colors"
                onClick={() => {
                  if (!markdownPreviewEnabled()) {
                    setPreview(false)
                    return
                  }
                  setPreview((p) => !p)
                }}
              >
                <Icon name={preview() && markdownPreviewEnabled() ? "code" as any : "eye" as any} size="small" class="text-text-weak" />
              </button>
            </Tooltip>
          </Show>
        </div>
      </Show>
      <Switch>
        <Match when={state()?.loaded}>
          <ScrollView class="flex-1 min-h-0" viewportRef={(el) => { viewportEl = el }}>
            <Show when={md() && preview() && markdownPreviewEnabled()} fallback={renderFile(contents())}>
              {renderMarkdown(contents())}
            </Show>
            <Show when={chunk() && showFooter()}>
              <div class="sticky bottom-0 shrink-0 h-8 px-3 border-t bg-background-base/95 backdrop-blur supports-[backdrop-filter]:bg-background-base/85 z-10 flex items-center justify-between gap-3 text-12-medium text-text-weak">
                <div class="truncate min-w-0">
                  {language.t("workspace.content.preview.loadedLines", {
                    loaded: loadedLines().toLocaleString(),
                    total: chunk()!.totalLines.toLocaleString(),
                  })}
                  <Show when={loadedSizeLabel()}>
                    <span> · {loadedSizeLabel()}</span>
                  </Show>
                  <Show when={md() && !markdownPreviewEnabled()}>
                    <span> · {language.t("workspace.content.preview.markdownPreviewDisabled")}</span>
                  </Show>
                  <Show when={hasMore() && !canAutoLoadMore()}>
                    <span> · {language.t("workspace.content.preview.autoLoadPaused", {
                      count: filePreviewConfig.autoLoadMoreMaxLines.toLocaleString(),
                    })}</span>
                  </Show>
                </div>
                <Show when={hasMore()}>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-6 px-2 shrink-0 text-12-medium"
                    onClick={() => void loadMore("manual")}
                    disabled={loadingMore()}
                  >
                    {loadingMore() ? language.t("workspace.content.preview.loadingMore") : language.t("common.loadMore")}
                  </Button>
                </Show>
              </div>
            </Show>
          </ScrollView>
        </Match>
        <Match when={state()?.loading}>
          <div class="flex-1 flex items-center justify-center text-text-weak text-14-regular">
            {language.t("common.loading")}...
          </div>
        </Match>
        <Match when={state()?.error}>
          <div class="flex-1 flex items-center justify-center text-text-weak text-14-regular">
            {state()?.error}
          </div>
        </Match>
      </Switch>
    </div>
  )
}
