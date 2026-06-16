import { createEffect, createMemo, createSignal, Match, Show, Switch } from "solid-js"
import { Dynamic } from "solid-js/web"
import { useFileComponent } from "@opencode-ai/ui/context/file"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { getFilename } from "@opencode-ai/util/path"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useDeviceSDK } from "@/context/device-sdk"
import { useContentTabs, type ContentTab } from "@/context/content-tabs"
import type { DiffContentData } from "@/client/device-client"
import { filePreviewConfig } from "../lib/file-preview-config"

import { isRuntimeFileDisabledError } from "@/client/device-transport"

export function DiffPreviewTab(props: { tab: ContentTab }) {
  const file = useFile()
  const language = useLanguage()
  const fileComponent = useFileComponent()
  const layout = useLayout()
  const sdk = useDeviceSDK()
  const tabStore = useContentTabs()

  const path = createMemo(() => props.tab.meta.path as string | undefined)
  const status = createMemo(() => props.tab.meta.status as string | undefined)
  const staged = createMemo(() => props.tab.meta.staged as boolean | undefined)
  const state = createMemo(() => {
    const p = path()
    if (!p) return
    return file.get(p)
  })

  const [diffResult, setDiffResult] = createSignal<DiffContentData | undefined>()
  const [fetchingDiff, setFetchingDiff] = createSignal(false)
  const [runtimeDisabled, setRuntimeDisabled] = createSignal(false)
  const [diffError, setDiffError] = createSignal<string | undefined>()

  const before = createMemo(() => {
    if (status() === "added") return ""
    return diffResult()?.before ?? ""
  })

  const after = createMemo(() => {
    if (status() === "deleted") return ""
    return diffResult()?.after ?? ""
  })

  const diffStyle = createMemo(() => layout.review.diffStyle())

  const loaded = createMemo(() => !!diffResult())

  const loading = createMemo(() => fetchingDiff())

  createEffect(() => {
    const p = path()
    if (!p) return

    if (!diffResult() && !fetchingDiff() && !runtimeDisabled() && !diffError()) {
      setFetchingDiff(true)
      sdk.client.runtime.diffContent({ path: p, staged: staged() ?? false }).then((result) => {
        setDiffResult(result)
      }).catch((e) => {
        if (isRuntimeFileDisabledError(e)) {
          setRuntimeDisabled(true)
        } else {
          setDiffError(e?.message ?? "Unknown error")
        }
      }).finally(() => {
        setFetchingDiff(false)
      })
    }
  })

  const handleJumpToFile = () => {
    const p = path()
    if (!p) return
    tabStore.open({
      kind: "file",
      key: p,
      title: getFilename(p),
      icon: "file-tree",
      meta: { path: p },
    })
    void file.load(p, { limit: filePreviewConfig.initialPreviewLines })
  }

  return (
    <div class="h-full flex flex-col">
      <Show when={path()}>
        <div class="shrink-0 h-8 flex items-center gap-0.5 px-3 border-b bg-background-base z-10 text-12-medium text-text-weak">
          <span class="truncate flex-1 min-w-0">{path()}</span>
          <Tooltip value={language.t("diff.preview.jumpToFile")} placement="bottom">
            <button
              class="shrink-0 ml-2 flex items-center justify-center h-5 w-5 rounded hover:bg-background-stronger transition-colors"
              onClick={handleJumpToFile}
            >
              <Icon name="open-file" size="small" class="text-text-weak" />
            </button>
          </Tooltip>
        </div>
      </Show>
      <Switch>
        <Match when={runtimeDisabled()}>
          <div class="flex-1 flex flex-col items-center justify-center gap-3 text-text-weak">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <div class="text-14-medium">{language.t("diff.preview.runtimeDisabled.title")}</div>
            <div class="text-12-regular">{language.t("diff.preview.runtimeDisabled.description")}</div>
          </div>
        </Match>
        <Match when={diffResult()?._filtered}>
          {(f) => (
            <div class="flex-1 flex flex-col items-center justify-center gap-3 text-text-weak">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <div class="text-14-medium">{language.t("diff.preview.filtered.title")}</div>
              <Show when={f().path}>
                <div class="text-12-regular font-mono">{f().path}</div>
              </Show>
              <Show when={f().originalSize}>
                <div class="text-12-regular">{language.t("file.preview.filtered.size", { size: f().originalSize! })}</div>
              </Show>
            </div>
          )}
        </Match>
        <Match when={loaded()}>
          <Dynamic
            component={fileComponent}
            mode="diff"
            before={{ name: path() ?? "", contents: before() }}
            after={{ name: path() ?? "", contents: after() }}
            diffStyle={diffStyle()}
            overflow="wrap"
            class="select-text flex-1 min-h-0 overflow-auto"
          />
        </Match>
        <Match when={loading()}>
          <div class="flex-1 flex items-center justify-center text-text-weak text-14-regular">
            {language.t("common.loading")}...
          </div>
        </Match>
        <Match when={diffError()}>
          {(err) => (
            <div class="flex-1 flex items-center justify-center text-text-weak text-14-regular">
              {err()}
            </div>
          )}
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
