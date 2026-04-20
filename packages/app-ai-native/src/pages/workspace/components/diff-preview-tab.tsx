import { createEffect, createMemo, createSignal, Match, on, Show, Switch } from "solid-js"
import { Dynamic } from "solid-js/web"
import { applyPatch, parsePatch, reversePatch } from "diff"
import { useFileComponent } from "@opencode-ai/ui/context/file"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useDeviceSDK } from "@/context/device-sdk"
import type { ContentTab } from "@/context/content-tabs"

function computeBefore(after: string, diff: string): string {
  if (!diff) return after
  try {
    const parsed = parsePatch(diff)
    if (!parsed.length) return after
    const reversed = reversePatch(parsed[0])
    const result = applyPatch(after, reversed)
    if (result === false) return after
    return result
  } catch {
    return after
  }
}

export function DiffPreviewTab(props: { tab: ContentTab }) {
  const file = useFile()
  const language = useLanguage()
  const fileComponent = useFileComponent()
  const layout = useLayout()
  const sdk = useDeviceSDK()

  const path = createMemo(() => props.tab.meta.path as string | undefined)
  const status = createMemo(() => props.tab.meta.status as string | undefined)
  const state = createMemo(() => {
    const p = path()
    if (!p) return
    return file.get(p)
  })
  const fileContent = createMemo(() => (state()?.content as { content?: string; diff?: string } | undefined))

  const [fetchedDiff, setFetchedDiff] = createSignal<string | undefined>()
  const [diffTried, setDiffTried] = createSignal(false)
  const [fetchingDiff, setFetchingDiff] = createSignal(false)

  const after = createMemo(() => {
    if (status() === "deleted") return ""
    return fileContent()?.content ?? ""
  })

  const diffSource = createMemo(() => fileContent()?.diff ?? fetchedDiff())

  const before = createMemo(() => {
    const s = status()
    if (s === "added") return ""
    const d = diffSource()
    if (!d) return after()
    return computeBefore(after(), d)
  })

  const diffStyle = createMemo(() => layout.review.diffStyle())

  const loaded = createMemo(() => {
    if (status() === "deleted") return !!fetchedDiff()
    const fileLoaded = !!state()?.loaded
    const needDiff = status() !== "added"
    if (needDiff) return fileLoaded && !!diffSource()
    return fileLoaded
  })

  const loading = createMemo(() => {
    if (status() === "deleted") return fetchingDiff()
    return !!state()?.loading || fetchingDiff()
  })

  createEffect(on(path, () => {
    setFetchedDiff(undefined)
    setDiffTried(false)
    setFetchingDiff(false)
  }))

  createEffect(() => {
    const p = path()
    if (!p) return
    if (status() === "deleted") return
    void file.load(p)
  })

  createEffect(() => {
    const p = path()
    if (!p) return
    if (status() === "added") return
    if (fileContent()?.diff) return
    if (diffTried()) return

    setDiffTried(true)
    setFetchingDiff(true)
    sdk.client.runtime.diff({ path: p }).then((result) => {
      setFetchedDiff(result?.diff)
    }).catch(() => {
      setFetchedDiff(undefined)
    }).finally(() => {
      setFetchingDiff(false)
    })
  })

  return (
    <div class="h-full flex flex-col">
      <Show when={path()}>
        <div class="shrink-0 h-8 flex items-center gap-0.5 px-3 border-b bg-background-base z-10 text-12-medium text-text-weak truncate">
          {path()}
        </div>
      </Show>
      <Switch>
        <Match when={loaded()}>
          <Dynamic
            component={fileComponent}
            mode="diff"
            before={{ name: path() ?? "", contents: before() }}
            after={{ name: path() ?? "", contents: after() }}
            diffStyle={diffStyle()}
            overflow="wrap"
            class="select-text"
          />
        </Match>
        <Match when={loading()}>
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
