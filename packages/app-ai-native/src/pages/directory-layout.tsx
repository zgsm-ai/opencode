import { createEffect, createMemo, Show, type ParentProps } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { SDKProvider, useSDK } from "@/context/sdk"
import { SyncProvider, useSync } from "@/context/sync"
import { ConversationAdapterContext, sdkAdapter } from "@/context/device-adapter"
import { LocalProvider } from "@/context/local"
import { DataProvider } from "@opencode-ai/ui/context"
import { decode64 } from "@/utils/base64"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { DirectoryContext } from "@/context/directory"
import { workspaceKey } from "@/pages/layout/helpers"
import { useActiveWorkspace } from "./workspace/active-workspace"
import { useWorkspace } from "./workspace/context"
import type { ProviderListResponse } from "@opencode-ai/sdk/v2/client"

function legacyProvider(input: ReturnType<typeof useSync>["data"]["provider"]): ProviderListResponse {
  return {
    all: input.connected.map((provider) => ({
      id: provider.id,
      name: provider.name,
      source: provider.source,
      env: [],
      models: Object.fromEntries(
        Object.entries(provider.models).map(([key, model]) => [
          key,
          {
            id: model.id,
            name: model.name,
            ...(model.family ? { family: model.family } : {}),
            release_date: model.release_date,
            attachment: model.capabilities.attachment,
            reasoning: model.capabilities.reasoning,
            temperature: model.capabilities.temperature,
            tool_call: model.capabilities.toolcall,
            interleaved: model.capabilities.interleaved === false ? undefined : model.capabilities.interleaved,
            cost: model.cost
              ? {
                  input: model.cost.input,
                  output: model.cost.output,
                  cache_read: model.cost.cache.read,
                  cache_write: model.cost.cache.write,
                  context_over_200k: model.cost.experimentalOver200K
                    ? {
                        input: model.cost.experimentalOver200K.input,
                        output: model.cost.experimentalOver200K.output,
                        cache_read: model.cost.experimentalOver200K.cache.read,
                        cache_write: model.cost.experimentalOver200K.cache.write,
                      }
                    : undefined,
                }
              : undefined,
            limit: model.limit,
            modalities: {
              input: Object.entries(model.capabilities.input)
                .filter(([, enabled]) => enabled)
                .map(([name]) => name as "text" | "audio" | "image" | "video" | "pdf"),
              output: Object.entries(model.capabilities.output)
                .filter(([, enabled]) => enabled)
                .map(([name]) => name as "text" | "audio" | "image" | "video" | "pdf"),
            },
            status: model.status === "active" ? undefined : model.status,
            options: {},
            variants: model.variants,
          },
        ]),
      ),
    })),
    default: Object.fromEntries(input.connected.flatMap((provider) => (provider.default_model ? [[provider.id, provider.default_model]] : []))),
    connected: input.connected.map((provider) => provider.id),
  }
}

function AdapterBridge(props: ParentProps) {
  const sdk = useSDK()
  const adapter = createMemo(() => sdkAdapter(sdk.client))
  return <ConversationAdapterContext.Provider value={adapter()}>{props.children}</ConversationAdapterContext.Provider>
}

function DirectoryDataProvider(props: ParentProps<{ directory: string; workspaceId: string }>) {
  const sync = useSync()

  return (
    <DataProvider
      data={{ ...sync.data, provider: legacyProvider(sync.data.provider) }}
      directory={props.directory}
      onNavigateToSession={(sessionID: string) => `/workspace/${props.workspaceId}/${sessionID}`}
      onSessionHref={(sessionID: string) => `/workspace/${props.workspaceId}/${sessionID}`}
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
  const workspace = useWorkspace()
  const currentWorkspace = createMemo(() => {
    const id = params.workspaceID
    if (!id) return undefined
    return workspace.workspaces().find((item) => item.id === id) ?? (active?.id === id ? active.workspace : undefined)
  })

  const directory = createMemo(() => {
    if (params.dir) {
      const dir = decode64(params.dir) ?? ""
      if (dir) return workspaceKey(dir)
    }
    const ws = currentWorkspace()
    if (!ws) return ""
    const primary = ws.directories?.find((d) => d.isDefault) || ws.directories?.[0]
    if (!primary?.path) return ""
    return workspaceKey(primary.path)
  })

  createEffect(() => {
    const ws = currentWorkspace()
    if (ws && params.workspaceID) {
      active?.setActive(params.workspaceID, ws)
    }
  })

  createEffect(() => {
    if (!params.workspaceID) return
    if (directory()) return
    showToast({
      variant: "error",
      title: language.t("common.requestFailed"),
      description: language.t("directory.error.invalidUrl"),
    })
    navigate("/", { replace: true })
  })

  return (
    <Show when={directory()}>
      <DirectoryContext.Provider value={directory}>
        <SDKProvider directory={directory}>
          <AdapterBridge>
          <SyncProvider>
            <DirectoryDataProvider directory={directory()!} workspaceId={params.workspaceID ?? ""}>
              {props.children}
            </DirectoryDataProvider>
          </SyncProvider>
          </AdapterBridge>
        </SDKProvider>
      </DirectoryContext.Provider>
    </Show>
  )
}
