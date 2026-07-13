import { createEffect, createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { Markdown } from "@opencode-ai/ui/markdown"
import "@/styles/vscode-markdown.css"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { Button } from "@/components/ui/button"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useDirectory } from "@/context/directory"
import type { ContentTab } from "@/context/content-tabs"
import { filePreviewConfig } from "../lib/file-preview-config"
import { LanguageDescription, LanguageSupport, defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { languages } from "@codemirror/language-data"
import { markdown } from "@codemirror/lang-markdown"
import { highlightActiveLine, highlightActiveLineGutter, lineNumbers } from "@codemirror/view"
import { Compartment, EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"

function isMarkdownFile(path: string | undefined) {
  if (!path) return false
  return path.endsWith(".md") || path.endsWith(".markdown") || path.endsWith(".mdx")
}

function languageExtensionForPath(path: string) {
  if (!path) return markdown()
  const match = LanguageDescription.matchFilename(languages, path)
  if (!match) return markdown()
  return match.support ?? markdown()
}

async function loadLanguageExtensionForPath(path: string) {
  if (!path) return markdown()
  const match = LanguageDescription.matchFilename(languages, path)
  if (!match) return markdown()
  if (match.support instanceof LanguageSupport) return match.support
  try {
    const loaded = await match.load()
    return loaded instanceof LanguageSupport ? loaded : markdown()
  } catch {
    return markdown()
  }
}

function languageLabelForPath(path: string) {
  if (!path) return "Markdown"
  const match = LanguageDescription.matchFilename(languages, path)
  return match?.name ?? (isMarkdownFile(path) ? "Markdown" : "Plain Text")
}

function ReadOnlyCodeMirror(props: {
  source: string
  path: string
  wrap?: boolean
  onScrollToBottom?: () => void
  onCursorChange?: (payload: { line: number; column: number }) => void
  onLineCountChange?: (count: number) => void
}) {
  let root!: HTMLDivElement
  let view: EditorView | undefined
  const languageCompartment = new Compartment()
  const themeCompartment = new Compartment()
  const scrollCompartment = new Compartment()
  const wrapCompartment = new Compartment()

  const theme = () =>
    EditorView.theme({
      "&": {
        height: "100%",
        "font-size": "14px",
        "background-color": "transparent",
        color: "var(--native-foreground)",
        outline: "none",
      },
      "&:focus, &:focus-visible, &:focus-within": {
        outline: "none !important",
        "box-shadow": "none !important",
      },
      ".cm-scroller": {
        "font-family": "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)",
        "line-height": "1.65",
        overflow: "auto",
      },
      ".cm-content": {
        padding: "16px",
        "min-height": "100%",
        "caret-color": "transparent",
      },
      ".cm-gutters": {
        background: "color-mix(in srgb, var(--native-panel) 88%, var(--native-bg-subtle))",
        color: "var(--native-muted)",
        border: "none",
        "border-right": "1px solid color-mix(in srgb, var(--native-border) 18%, transparent)",
      },
      ".cm-activeLine": {
        background: "color-mix(in srgb, var(--native-foreground) 3%, transparent)",
      },
      ".cm-activeLineGutter": {
        background: "color-mix(in srgb, var(--native-foreground) 4%, transparent)",
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
        background: "color-mix(in srgb, var(--native-primary) 18%, transparent) !important",
      },
      ".cm-cursor, .cm-dropCursor": {
        display: "none",
      },
      ".cm-focused": {
        outline: "none",
      },
      "&.cm-focused": {
        outline: "none !important",
        "box-shadow": "none !important",
      },
      ".cm-scroller:focus, .cm-scroller:focus-visible, .cm-content:focus, .cm-content:focus-visible, .cm-lineNumbers:focus": {
        outline: "none !important",
        "box-shadow": "none !important",
      },
    })

  onMount(() => {
    view = new EditorView({
      state: EditorState.create({
        doc: props.source,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          languageCompartment.of(languageExtensionForPath(props.path)),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          themeCompartment.of(theme()),
          wrapCompartment.of(props.wrap ? EditorView.lineWrapping : []),
          scrollCompartment.of(EditorView.updateListener.of((update) => {
            if (update.viewportChanged || update.geometryChanged) {
              const scroller = update.view.scrollDOM
              const remaining = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
              if (remaining < 50) {
                props.onScrollToBottom?.()
              }
            }
            if (update.selectionSet) {
              const head = update.state.selection.main.head
              const line = update.state.doc.lineAt(head)
              props.onCursorChange?.({ line: line.number, column: head - line.from + 1 })
            }
          })),
        ],
      }),
      parent: root,
    })

    props.onLineCountChange?.(view.state.doc.lines)

    void loadLanguageExtensionForPath(props.path).then((extension) => {
      if (!view) return
      view.dispatch({ effects: languageCompartment.reconfigure(extension) })
    })
  })

  createEffect(() => {
    const next = props.source
    if (!view) return
    const current = view.state.doc.toString()
    if (current === next) return
    const scrollTop = view.scrollDOM.scrollTop
    view.dispatch({
      changes: { from: 0, to: current.length, insert: next },
      selection: { anchor: 0 },
    })
    requestAnimationFrame(() => {
      if (!view) return
      view.scrollDOM.scrollTop = scrollTop
    })
    props.onLineCountChange?.(view.state.doc.lines)
  })

  createEffect(() => {
    if (!view) return
    view.dispatch({
      effects: [
        languageCompartment.reconfigure(languageExtensionForPath(props.path)),
        themeCompartment.reconfigure(theme()),
      ],
    })
    void loadLanguageExtensionForPath(props.path).then((extension) => {
      if (!view) return
      view.dispatch({ effects: languageCompartment.reconfigure(extension) })
    })
  })

  createEffect(() => {
    if (!view) return
    view.dispatch({ effects: wrapCompartment.reconfigure(props.wrap ? EditorView.lineWrapping : []) })
  })

  onCleanup(() => view?.destroy())

  return <div ref={root} class="min-h-0 flex-1 select-text" />
}

export function FilePreviewTab(props: { tab: ContentTab }) {
  const file = useFile()
  const language = useLanguage()
  const directory = useDirectory()
  const [preview, setPreview] = createSignal(true)
  const [wrap, setWrap] = createSignal(true)
  const [cursorLine, setCursorLine] = createSignal(1)
  const [cursorCol, setCursorCol] = createSignal(1)
  const [totalLines, setTotalLines] = createSignal(0)

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
  const filtered = createMemo(() => state()?.filtered)
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
    return !hasMore()
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

  const languageLabel = createMemo(() => languageLabelForPath(path() ?? ""))

  const previewActive = createMemo(() => md() && preview() && markdownPreviewEnabled())
  const [outlineOpen, setOutlineOpen] = createSignal(true)
  const [headings, setHeadings] = createSignal<{ level: number; text: string; el: HTMLElement }[]>([])
  const [activeIdx, setActiveIdx] = createSignal(-1)
  let markdownEl: HTMLDivElement | undefined
  let activeTick: number | undefined

  const updateActive = () => {
    activeTick = undefined
    const vp = viewportEl
    const list = headings()
    if (!vp || list.length === 0) {
      setActiveIdx(-1)
      return
    }
    const threshold = vp.getBoundingClientRect().top + 32
    let idx = -1
    for (let i = 0; i < list.length; i++) {
      if (list[i].el.getBoundingClientRect().top <= threshold) idx = i
      else break
    }
    setActiveIdx(idx)
  }

  const scrollToHeading = (el: HTMLElement) => {
    const vp = viewportEl
    if (!vp) return
    const top = el.getBoundingClientRect().top - vp.getBoundingClientRect().top + vp.scrollTop - 12
    vp.scrollTo({ top, behavior: "smooth" })
  }

  const scanHeadings = () => {
    if (!markdownEl) {
      setHeadings([])
      setActiveIdx(-1)
      return
    }
    const els = Array.from(markdownEl.querySelectorAll("h1, h2, h3, h4, h5, h6")) as HTMLElement[]
    setHeadings(
      els.map((el) => ({
        level: Number(el.tagName.slice(1)),
        text: el.textContent?.trim() ?? "",
        el,
      })),
    )
    requestAnimationFrame(updateActive)
  }

  createEffect(() => {
    const _ = contents()
    const visible = previewActive()
    if (!visible) {
      setHeadings([])
      setActiveIdx(-1)
      return
    }
    const el = markdownEl
    if (!el) return
    scanHeadings()
    const observer = new MutationObserver(scanHeadings)
    observer.observe(el, { childList: true, subtree: true })
    onCleanup(() => observer.disconnect())
  })

  createEffect(() => {
    const el = viewportEl
    if (!el) return
    const handler = () => {
      if (activeTick != null) cancelAnimationFrame(activeTick)
      activeTick = requestAnimationFrame(updateActive)
    }
    el.addEventListener("scroll", handler, { passive: true })
    onCleanup(() => {
      el.removeEventListener("scroll", handler)
      if (activeTick != null) cancelAnimationFrame(activeTick)
    })
  })

  const renderMarkdown = (source: string) => (
    <div ref={markdownEl} class="px-6 py-4 max-w-none">
      <Markdown text={source} class="vscode-markdown text-14-regular" />
    </div>
  )

  return (
    <div class="h-full flex flex-col">
      <Show when={relativePath()}>
        <div class="shrink-0 h-8 flex items-center gap-0.5 px-3 border-b bg-background-base z-10 text-12-medium text-text-weak truncate">
          <span class="truncate flex-1 min-w-0">{relativePath()}</span>
          <Tooltip
            value={wrap() ? language.t("workspace.content.disableWrap") : language.t("workspace.content.enableWrap")}
            placement="bottom"
          >
            <button
              class="shrink-0 ml-2 flex items-center justify-center h-5 w-5 rounded-md hover:bg-background-stronger transition-colors text-text-weak"
              classList={{ "border border-border-base": wrap() }}
              style={{ "font-size": "10px", "font-weight": "600" }}
              onClick={() => setWrap((w) => !w)}
            >
              W
            </button>
          </Tooltip>
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
          <Show when={previewActive()}>
            <Tooltip
              value={outlineOpen() ? language.t("workspace.content.outline.hide") : language.t("workspace.content.outline.show")}
              placement="bottom"
            >
              <button
                class="shrink-0 ml-2 flex items-center justify-center h-5 w-5 rounded hover:bg-background-stronger transition-colors"
                classList={{ "border border-border-base": outlineOpen() }}
                onClick={() => setOutlineOpen((v) => !v)}
              >
                <Icon name="bullet-list" size="small" class="text-text-weak" />
              </button>
            </Tooltip>
          </Show>
        </div>
      </Show>
      <Switch>
        <Match when={filtered()}>
          {(f) => (
            <div class="flex-1 flex flex-col items-center justify-center gap-3 text-text-weak">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <div class="text-14-medium">
                {f().reason === "RUNTIME_FILE_DISABLED"
                  ? language.t("file.preview.runtimeDisabled.title")
                  : language.t("file.preview.filtered.title")}
              </div>
              <Show when={f().reason === "RUNTIME_FILE_DISABLED"}>
                <div class="text-12-regular">{language.t("file.preview.runtimeDisabled.description")}</div>
              </Show>
              <Show when={f().path}>
                <div class="text-12-regular font-mono">{f().path}</div>
              </Show>
              <Show when={f().originalSize}>
                <div class="text-12-regular">{language.t("file.preview.filtered.size", { size: f().originalSize! })}</div>
              </Show>
            </div>
          )}
        </Match>
        <Match when={state()?.loaded}>
          <div class="flex-1 flex min-h-0">
          <ScrollView class="flex-1 min-h-0" viewportRef={(el) => { viewportEl = el }}>
            <Show
              when={md() && preview() && markdownPreviewEnabled()}
              fallback={
                <ReadOnlyCodeMirror
                  source={contents()}
                  path={path() ?? ""}
                  wrap={wrap()}
                  onScrollToBottom={() => {
                    if (canAutoLoadMore() && !loadingMore()) {
                      const now = Date.now()
                      if (now - lastAutoLoadAt < filePreviewConfig.autoLoadMoreCooldownMs) return
                      lastAutoLoadAt = now
                      void loadMore("auto")
                    }
                  }}
                  onCursorChange={({ line, column }) => {
                    setCursorLine(line)
                    setCursorCol(column)
                  }}
                  onLineCountChange={(count) => setTotalLines(count)}
                />
              }
            >
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
          <Show when={previewActive() && outlineOpen()}>
            <aside class="shrink-0 w-56 border-l flex flex-col bg-background-base">
              <div class="shrink-0 h-8 px-3 flex items-center text-12-medium text-text-weak border-b">
                {language.t("workspace.content.outline.title")}
              </div>
              <div class="flex-1 overflow-y-auto thin-scrollbar py-2">
                <Show
                  when={headings().length > 0}
                  fallback={<div class="px-3 py-2 text-12-regular text-text-weak">{language.t("workspace.content.outline.empty")}</div>}
                >
                  <For each={headings()}>
                    {(h, i) => (
                      <button
                        type="button"
                        class="block w-full text-left px-3 py-1 text-13-regular hover:bg-background-stronger transition-colors truncate"
                        classList={{ "text-primary font-medium bg-background-stronger/50": activeIdx() === i() }}
                        style={{ "padding-left": `${12 + (h.level - 1) * 12}px` }}
                        onClick={() => scrollToHeading(h.el)}
                        title={h.text}
                      >
                        {h.text}
                      </button>
                    )}
                  </For>
                </Show>
              </div>
            </aside>
          </Show>
          </div>
          <div class="shrink-0 flex items-center justify-between border-t bg-background-base px-4 py-1.5 text-12-medium text-text-weak">
            <div class="min-w-0 truncate font-mono">{relativePath()}</div>
            <div class="flex shrink-0 items-center gap-4">
              <span>Ln {cursorLine()}, Col {cursorCol()}</span>
              <Show when={totalLines() > 0}>
                <span>{totalLines().toLocaleString()} lines</span>
              </Show>
              <Show when={loadedSizeLabel()}>
                <span>{loadedSizeLabel()}</span>
              </Show>
              <span>{languageLabel()}</span>
            </div>
          </div>
        </Match>
        <Match when={state()?.loading}>
          <div class="flex-1 flex items-center justify-center text-text-weak text-14-regular">
            {language.t("common.loading")}...
          </div>
        </Match>
        <Match when={state()?.errorKey || state()?.error}>
          <div class="flex-1 flex items-center justify-center text-text-weak text-14-regular">
            {state()?.errorKey ? language.t(state()!.errorKey!) : String(state()?.error ?? "")}
          </div>
        </Match>
      </Switch>
    </div>
  )
}
