import { createEffect, createMemo, createSignal, Match, Show, Switch } from "solid-js"
import { Dynamic } from "solid-js/web"
import { useFileComponent } from "@opencode-ai/ui/context/file"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useDeviceSDK } from "@/context/device-sdk"
import type { ContentTab } from "@/context/content-tabs"
import type { DiffContentData } from "@/client/device-client"

export function DiffPreviewTab(props: { tab: ContentTab }) {
  const file = useFile()
  const language = useLanguage()
  const fileComponent = useFileComponent()
  const layout = useLayout()
  const sdk = useDeviceSDK()

  const path = createMemo(() => props.tab.meta.path as string | undefined)
  const status = createMemo(() => props.tab.meta.status as string | undefined)
  const staged = createMemo(() => props.tab.meta.staged as boolean | undefined)
  const state = createMemo(() => {
    const p = path()
    if (!p) return
    return file.get(p)
  })
  const fileContent = createMemo(() => (state()?.content as { content?: string } | undefined))

  const [diffResult, setDiffResult] = createSignal<DiffContentData | undefined>()
  const [fetchingDiff, setFetchingDiff] = createSignal(false)

  const before = createMemo(() => {
    const s = status()
    if (s === "added") return ""
    const result = diffResult()
    if (result?.before !== undefined) return result.before
    return fileContent()?.content ?? ""
  })

  const after = createMemo(() => {
    if (status() === "deleted") return ""
    const result = diffResult()
    if (result?.after !== undefined) return result.after
    return fileContent()?.content ?? ""
  })

  const diffStyle = createMemo(() => layout.review.diffStyle())

  const loaded = createMemo(() => {
    if (status() === "deleted") return !!diffResult()
    if (status() === "added") return !!diffResult()
    return !!diffResult()
  })

  const loading = createMemo(() => {
    return fetchingDiff()
  })

  createEffect(() => {
    const p = path()
    if (!p) return

    if (!diffResult() && !fetchingDiff()) {
      setFetchingDiff(true)
      sdk.client.runtime.diffContent({ path: p, staged: staged() ?? false }).then((result) => {
        setDiffResult(result)
      }).catch(() => {
        setDiffResult(undefined)
      }).finally(() => {
        setFetchingDiff(false)
      })
    }
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
