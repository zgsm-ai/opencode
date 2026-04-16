import type {
  OpencodeClient,
  PermissionRequest,
  Project,
  QuestionRequest,
  Todo,
} from "@opencode-ai/sdk/v2/client"
import { showToast } from "@opencode-ai/ui/toast"
import { getFilename } from "@opencode-ai/util/path"
import { retry } from "@opencode-ai/util/retry"
import { batch } from "solid-js"
import { reconcile, type SetStoreFunction, type Store } from "solid-js/store"
import type { ProviderCapabilitiesResponse, State, VcsCache } from "./types"
import { cmp, normalizeProviderList } from "./utils"
import { formatServerError } from "@/utils/server-errors"
import type { ConversationAdapter } from "@/context/device-adapter"

type GlobalStore = {
  ready: boolean
  project: Project[]
  session_todo: {
    [sessionID: string]: Todo[]
  }
  reload: undefined | "pending" | "complete"
}

export async function bootstrapGlobal(input: {
  api: ConversationAdapter
  connectErrorTitle: string
  connectErrorDescription: string
  requestFailedTitle: string
  translate: (key: string, vars?: Record<string, string | number>) => string
  formatMoreCount: (count: number) => string
  setGlobalStore: SetStoreFunction<GlobalStore>
}) {
  const api = input.api
  const health = await api
    .health()
    .then((x) => x.data as any)
    .catch(() => undefined)
  if (!health?.healthy) {
    showToast({
      variant: "error",
      title: input.connectErrorTitle,
      description: input.connectErrorDescription,
    })
    input.setGlobalStore("ready", true)
    return
  }

  const required = []

  const optional = [
    // Provider auth is intentionally not bootstrapped in web mode anymore.
    // Model/provider authentication is handled on the device side for now.
  ]

  const requiredErrors = (await Promise.allSettled(required))
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason)
  if (requiredErrors.length) {
    const message = formatServerError(requiredErrors[0], input.translate)
    const more = requiredErrors.length > 1 ? input.formatMoreCount(requiredErrors.length - 1) : ""
    showToast({
      variant: "error",
      title: input.requestFailedTitle,
      description: message + more,
    })
    input.setGlobalStore("ready", true)
    return
  }

  const optionalResults = await Promise.allSettled(optional)
  const optionalErrors = optionalResults
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason)
  if (optionalErrors.length) {
    console.warn("[bootstrapGlobal] optional requests failed", optionalErrors)
  }

  input.setGlobalStore("ready", true)
}

function groupBySession<T extends { id: string; sessionID: string }>(input: T[]) {
  return input.reduce<Record<string, T[]>>((acc, item) => {
    if (!item?.id || !item.sessionID) return acc
    const list = acc[item.sessionID]
    if (list) list.push(item)
    if (!list) acc[item.sessionID] = [item]
    return acc
  }, {})
}

function legacyProviderToCapability(
  input: Awaited<ReturnType<OpencodeClient["provider"]["list"]>>["data"],
): ProviderCapabilitiesResponse {
  if (!input) return { connected: [] }
  return {
    connected: input.all
      .filter((provider) => input.connected.includes(provider.id))
      .map((provider) => ({
        id: provider.id,
        name: provider.name,
        source: "custom" as const,
        default_model: input.default[provider.id],
        models: Object.fromEntries(
          Object.entries(provider.models).map(([key, model]) => [
            key,
            {
              id: model.id,
              name: model.name,
              family: model.family,
              release_date: model.release_date,
              cost: model.cost
                ? {
                    input: model.cost.input,
                    output: model.cost.output,
                    cache: {
                      read: model.cost.cache_read ?? 0,
                      write: model.cost.cache_write ?? 0,
                    },
                    experimentalOver200K: model.cost.context_over_200k
                      ? {
                          input: model.cost.context_over_200k.input,
                          output: model.cost.context_over_200k.output,
                          cache: {
                            read: model.cost.context_over_200k.cache_read ?? 0,
                            write: model.cost.context_over_200k.cache_write ?? 0,
                          },
                        }
                      : undefined,
                  }
                : undefined,
              limit: {
                context: model.limit.context,
                input: model.limit.input,
                output: model.limit.output,
              },
              capabilities: {
                temperature: model.temperature,
                reasoning: model.reasoning,
                attachment: model.attachment,
                toolcall: model.tool_call,
                input: {
                  text: model.modalities?.input?.includes("text") ?? false,
                  audio: model.modalities?.input?.includes("audio") ?? false,
                  image: model.modalities?.input?.includes("image") ?? false,
                  video: model.modalities?.input?.includes("video") ?? false,
                  pdf: model.modalities?.input?.includes("pdf") ?? false,
                },
                output: {
                  text: model.modalities?.output?.includes("text") ?? false,
                  audio: model.modalities?.output?.includes("audio") ?? false,
                  image: model.modalities?.output?.includes("image") ?? false,
                  video: model.modalities?.output?.includes("video") ?? false,
                  pdf: model.modalities?.output?.includes("pdf") ?? false,
                },
                interleaved: model.interleaved ?? false,
              },
              status:
                model.status === "deprecated" || model.status === "alpha" || model.status === "beta"
                  ? model.status
                  : ("active" as const),
              variants: model.variants,
            },
          ]),
        ),
      })),
  }
}

async function loadProviderCapabilities(input: {
  sdk: OpencodeClient
  directory: string
  baseUrl: string
  setStore: SetStoreFunction<State>
}) {
  const base = input.baseUrl
  if (!base) {
    const data = await input.sdk.provider.list().then((x) => x.data)
    if (data) input.setStore("provider", normalizeProviderList(legacyProviderToCapability(data)))
    return
  }
  const res = await fetch(`${base}/provider/capabilities?directory=${encodeURIComponent(input.directory)}`, {
    credentials: "include",
  })
  if (!res.ok) throw new Error(`provider capabilities request failed: ${res.status}`)
  const data = await res.json()
  if (data) input.setStore("provider", normalizeProviderList(data))
}

export async function bootstrapDirectory(input: {
  directory: string
  sdk: OpencodeClient
  api: ConversationAdapter
  baseUrl: string
  store: Store<State>
  setStore: SetStoreFunction<State>
  vcsCache: VcsCache
  loadSessions: (directory: string) => Promise<void> | void
  translate: (key: string, vars?: Record<string, string | number>) => string
}) {
  const api = input.api
  if (input.store.status !== "complete") input.setStore("status", "loading")

  const required = {
    agent: () => api.sessionModes().then((x) => input.setStore("agent", (x.data ?? []) as any)),
    agentRuntimes: () => api.agentRuntimes().then((x) => input.setStore("agentRuntimes", (x.data ?? []) as any)),
  }

  try {
    await Promise.all(Object.values(required).map((p) => retry(p)))
  } catch (err) {
    console.error("Failed to bootstrap instance", err)
    const project = getFilename(input.directory)
    showToast({
      variant: "error",
      title: `Failed to reload ${project}`,
      description: formatServerError(err, input.translate),
    })
    input.setStore("status", "partial")
    return
  }

  if (input.store.status !== "complete") input.setStore("status", "partial")

  const optional = [
    loadProviderCapabilities(input),
    api.path().then((x) => input.setStore("path", x.data!)),
    api.permissions().then((x) => {
      const list = (x.data ?? []) as PermissionRequest[]
      const grouped = groupBySession(list.filter((perm): perm is PermissionRequest => !!perm?.id && !!perm.sessionID))
      batch(() => {
        for (const sessionID of Object.keys(input.store.permission)) {
          if (grouped[sessionID]) continue
          input.setStore("permission", sessionID, [])
        }
        for (const [sessionID, permissions] of Object.entries(grouped)) {
          input.setStore(
            "permission",
            sessionID,
            reconcile(
              permissions.filter((p) => !!p?.id).sort((a, b) => cmp(a.id, b.id)),
              { key: "id" },
            ),
          )
        }
      })
    }),
    api.questions().then((x) => {
      const list = (x.data ?? []) as QuestionRequest[]
      const grouped = groupBySession(list.filter((q): q is QuestionRequest => !!q?.id && !!q.sessionID))
      batch(() => {
        for (const sessionID of Object.keys(input.store.question)) {
          if (grouped[sessionID]) continue
          input.setStore("question", sessionID, [])
        }
        for (const [sessionID, questions] of Object.entries(grouped)) {
          input.setStore(
            "question",
            sessionID,
            reconcile(
              questions.filter((q) => !!q?.id).sort((a, b) => cmp(a.id, b.id)),
              { key: "id" },
            ),
          )
        }
      })
    }),
  ]

  Promise.allSettled(optional).then((results) => {
    const errors = results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => r.reason)
    if (errors.length) {
      console.warn("[bootstrapDirectory] optional requests failed", {
        directory: input.directory,
        errors,
      })
    }
    input.setStore("status", "complete")
  })
}
