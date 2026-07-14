import { createSignal, createEffect, onMount, onCleanup } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { showToast } from "@opencode-ai/ui/toast"
import type { Session } from "@opencode-ai/sdk/v2/client"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"
import { workspaceApi, deviceApi } from "@/pages/workspace/lib/api"
import { getProxyUrl } from "@/pages/workspace/lib/url"
import { createDeviceClient } from "@/client/device-client"
import { env } from "@/lib/env"
import { fetchCostrictUniversalId, postCostrictIdentity } from "./identity-handoff"
import { openSessionById } from "./open-session-by-id"
import { decideSyncAction } from "./sync-action"

function getMulticaUrl(): string {
  // Runtime-configurable via VITE_MULTICA_WEB_URL (window.__ENV__ injected by
  // docker-entrypoint.sh); falls back to a sensible default.
  return env.MULTICA_WEB_URL ?? "https://zgsmtest.cn:30443/workflow-web"
}

export default function MulticaPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const params = useParams<{ rest?: string }>()
  const t = useLanguage().t
  const [isLoading, setIsLoading] = createSignal(true)
  const [hasError, setHasError] = createSignal(false)
  const [multicaReadyCount, setMulticaReadyCount] = createSignal(0)
  const [costrictUniversalId, setCostrictUniversalId] = createSignal<string | null>(null)

  const url = getMulticaUrl()

  // The multica sub-path captured at mount. Never updated after mount — later
  // navigations go through postMessage, not src rewriting (which would reload
  // the iframe). A hard reload of the parent remounts this component, so the
  // splat is re-read and the iframe re-opens at the right path.
  const rest = () => params.rest ?? ""
  const initialSubPath = rest() === "" ? "" : `/${rest()}`
  const lastChildPath = { current: initialSubPath === "" ? "/" : initialSubPath }

  // Build the iframe URL with an auth hint so multica-web can recognise it is
  // running inside an iframe, plus the initial multica sub-path for deep links.
  const baseIframe = new URL(url)
  baseIframe.pathname = baseIframe.pathname.replace(/\/+$/, "") + initialSubPath
  baseIframe.searchParams.set("embedded", "opencode")
  const email = auth.user()?.email
  if (email) baseIframe.searchParams.set("preferred_email", email)
  const iframeSrc = baseIframe.toString()

  let iframeRef: HTMLIFrameElement | undefined

  const postIdentityToMultica = () => {
    postCostrictIdentity(iframeRef?.contentWindow, new URL(url).origin, costrictUniversalId())
  }

  const handleLoad = () => {
    setIsLoading(false)
  }

  const handleError = () => {
    setIsLoading(false)
    setHasError(true)
  }

  // Open a csc session by id. multica reports only the session id; the session
  // lives in an isolated working dir that belongs to no workspace, so we probe
  // the user's devices to find which one has it, then reuse or create a
  // workspace on that device and deep-link into the session viewer.
  const openSession = (sessionId: string) =>
    openSessionById(sessionId, {
      listDevices: async () => (await deviceApi.list()).devices,
      probeSession: async (device, sid) => {
        const client = createDeviceClient({ baseUrl: getProxyUrl(device.deviceId) })
        const session = (await client.conversation.get(sid)) as Session | undefined
        return session && session.id === sid ? { directory: session.directory } : null
      },
      listWorkspaces: async () => (await workspaceApi.list()).workspaces,
      createWorkspace: async ({ name, deviceId, directory }) => {
        const res = await workspaceApi.create({
          name,
          deviceId,
          directories: [{ name: "default", path: directory, isDefault: true }],
        })
        return res.workspace.id
      },
      navigateToSession: (workspaceId, sid) =>
        navigate(`/workspace/${workspaceId}?session=${encodeURIComponent(sid)}`),
      onError: (reason) =>
        showToast({
          variant: "error",
          title: t("toast.multica.openSession.title"),
          description: t(
            reason === "not_found"
              ? "toast.multica.openSession.notFound"
              : "toast.multica.openSession.failed",
          ),
        }),
    })

  // Post-message bridge: listen for navigation/location requests from the
  // embedded app so we can mirror its path in our URL and deep-link back.
  const handleMessage = (event: MessageEvent) => {
    if (event.origin !== new URL(url).origin) return
    if (typeof event.data !== "object" || event.data === null) return

    if (event.data.type === "multica:navigate") {
      // Open a csc session by id.
      if (event.data.target === "session" && typeof event.data.sessionId === "string") {
        void openSession(event.data.sessionId)
        return
      }
      // Legacy: bare href navigation requests (currently logged only).
      if (typeof event.data.href === "string") {
        console.log("[Multica_embed] navigate request:", event.data.href)
      }
      return
    }

    if (event.data.type === "multica:location" && typeof event.data.path === "string") {
      const action = decideSyncAction(
        { currentSplat: rest(), lastChildPath: lastChildPath.current },
        { kind: "childLocation", path: event.data.path },
      )
      if (action.lastChildPath !== undefined) lastChildPath.current = action.lastChildPath
      if (action.updateUrl) navigate(action.updateUrl, { replace: true })
      return
    }

    if (event.data.type === "multica:ready") {
      setIsLoading(false)
      setMulticaReadyCount((count) => count + 1)
    }
  }

  // When the splat changes externally (browser back/forward, manual edit, or an
  // in-app link), ask the embedded multica to navigate. No-op on mount and
  // whenever the splat already matches where the child is (loop guard).
  createEffect(() => {
    const splat = rest()
    const action = decideSyncAction(
      { currentSplat: splat, lastChildPath: lastChildPath.current },
      { kind: "splatChange", splat },
    )
    if (action.lastChildPath !== undefined) lastChildPath.current = action.lastChildPath
    if (action.postRoute) {
      iframeRef?.contentWindow?.postMessage(
        { type: "multica:route", path: action.postRoute },
        "*",
      )
    }
  })

  onMount(() => {
    window.addEventListener("message", handleMessage)
    void fetchCostrictUniversalId(env.API_PREFIX ?? "").then((universalId) => {
      if (universalId) {
        setCostrictUniversalId(universalId)
      }
    })
  })

  onCleanup(() => {
    window.removeEventListener("message", handleMessage)
  })

  createEffect(() => {
    if (multicaReadyCount() === 0) return
    if (!costrictUniversalId()) return
    postIdentityToMultica()
  })

  return (
    <div class="relative flex h-full w-full flex-col overflow-hidden bg-[var(--native-bg)]">
      {/* Loading overlay */}
      {isLoading() && (
        <div class="absolute inset-0 z-10 flex items-center justify-center bg-[var(--native-bg)]">
          <div class="flex flex-col items-center gap-3">
            <div class="size-6 animate-spin rounded-full border-2 border-[var(--native-primary)] border-t-transparent" />
            <span class="text-xs text-[var(--native-dim)]">Loading Multica...</span>
          </div>
        </div>
      )}

      {/* Error state */}
      {hasError() && (
        <div class="absolute inset-0 z-10 flex items-center justify-center bg-[var(--native-bg)]">
          <div class="flex flex-col items-center gap-3 rounded-lg border border-[var(--native-border)] bg-[var(--native-panel)] p-6">
            <span class="text-sm text-[var(--native-foreground)]">Unable to load Multica</span>
            <span class="text-xs text-[var(--native-dim)]">{url}</span>
            <button
              type="button"
              onClick={() => {
                setHasError(false)
                setIsLoading(true)
                iframeRef?.contentWindow?.location.reload()
              }}
              class="mt-2 rounded-md bg-[var(--native-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title="Multica"
        class="h-full w-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        allow="clipboard-read; clipboard-write"
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  )
}
