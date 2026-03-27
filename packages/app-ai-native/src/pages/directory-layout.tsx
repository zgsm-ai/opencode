import { createEffect, createMemo, createResource, Show, type ParentProps } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { SDKProvider } from "@/context/sdk"
import { SyncProvider, useSync } from "@/context/sync"
import { LocalProvider } from "@/context/local"
import { DataProvider } from "@opencode-ai/ui/context"
import { decode64 } from "@/utils/base64"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { DirectoryContext } from "@/context/directory"
import { workspaceApi } from "./workspace/lib/api"
import { useActiveWorkspace } from "./workspace/active-workspace"

function DirectoryDataProvider(props: ParentProps<{ directory: string; workspaceId: string; dirSlug: string }>) {
  const sync = useSync()

  return (
    <DataProvider
      data={sync.data}
      directory={props.directory}
      onNavigateToSession={(sessionID: string) => `/workspace/${props.workspaceId}/${props.dirSlug}/session/${sessionID}`}
      onSessionHref={(sessionID: string) => `/workspace/${props.workspaceId}/${props.dirSlug}/session/${sessionID}`}
    >
      <LocalProvider>{props.children}</LocalProvider>
    </DataProvider>
  )
}

export default function Layout(props: ParentProps) {
  const params = useParams()
  const navigate = useNavigate()
  const language = useLanguage()
  const active = useActiveWorkspace()

  const [workspace] = createResource(
    () => params.workspaceID,
    (id) => workspaceApi.get(id).then((r) => r.workspace).catch(() => undefined),
  )

  const directory = createMemo(() => decode64(params.dir) ?? "")

  createEffect(() => {
    const ws = workspace()
    if (ws && params.workspaceID) {
      active?.setActive(params.workspaceID, ws)
    }
  })

  createEffect(() => {
    if (!params.workspaceID) return
    if (!params.dir) return
    if (directory()) return
    showToast({
      variant: "error",
      title: language.t("common.requestFailed"),
      description: language.t("directory.error.invalidUrl"),
    })
    navigate("/", { replace: true })
  })

  return (
    <Show when={!workspace.loading} fallback={<div class="size-full" />}>
      <Show when={directory()}>
        <DirectoryContext.Provider value={directory}>
          <SDKProvider directory={directory}>
            <SyncProvider>
              <DirectoryDataProvider 
                directory={directory()!} 
                workspaceId={params.workspaceID ?? ""}
                dirSlug={params.dir ?? ""}
              >
                {props.children}
              </DirectoryDataProvider>
            </SyncProvider>
          </SDKProvider>
        </DirectoryContext.Provider>
      </Show>
    </Show>
  )
}
