import { createMemo, createSignal, Match, Show, Switch } from "solid-js"
import { Dynamic } from "solid-js/web"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { useFileComponent } from "@opencode-ai/ui/context/file"
import { Markdown } from "@opencode-ai/ui/markdown"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useDirectory } from "@/context/directory"
import type { ContentTab } from "@/context/content-tabs"

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
            <Tooltip value={preview() ? language.t("workspace.content.viewSource") : language.t("workspace.content.viewPreview")} placement="bottom">
              <button
                class="shrink-0 ml-2 flex items-center justify-center h-5 w-5 rounded hover:bg-background-stronger transition-colors"
                onClick={() => setPreview((p) => !p)}
              >
                <Icon name={preview() ? "code" as any : "eye" as any} size="small" class="text-text-weak" />
              </button>
            </Tooltip>
          </Show>
        </div>
      </Show>
      <Switch>
        <Match when={state()?.loaded}>
          <ScrollView class="flex-1 min-h-0">
            <Show when={md() && preview()} fallback={renderFile(contents())}>
              {renderMarkdown(contents())}
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
