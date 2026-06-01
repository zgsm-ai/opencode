import { createSignal, onMount, onCleanup } from "solid-js"
import { useAuth } from "@/context/auth"

function getMulticaUrl(): string {
  // Runtime-configurable via env; falls back to a sensible default.
  return import.meta.env.VITE_MULTICA_WEB_URL || "https://zgsmtest.cn:30443/multica-web"
}

export default function MulticaPage() {
  const auth = useAuth()
  const [isLoading, setIsLoading] = createSignal(true)
  const [hasError, setHasError] = createSignal(false)

  const url = getMulticaUrl()

  // Build the iframe URL with an auth hint so multica-web can
  // recognise it is running inside an iframe and skip its own
  // login wall when the parent already has a session.
  const iframeSrc = () => {
    const u = new URL(url)
    u.searchParams.set("embedded", "opencode")
    const email = auth.user()?.email
    if (email) {
      u.searchParams.set("preferred_email", email)
    }
    return u.toString()
  }

  let iframeRef: HTMLIFrameElement | undefined

  const handleLoad = () => {
    setIsLoading(false)
  }

  const handleError = () => {
    setIsLoading(false)
    setHasError(true)
  }

  // Post-message bridge: listen for navigation requests from the
  // embedded app so we can handle deep-links back to the parent.
  const handleMessage = (event: MessageEvent) => {
    if (event.origin !== new URL(url).origin) return
    if (typeof event.data !== "object" || event.data === null) return

    if (event.data.type === "multica:navigate" && typeof event.data.href === "string") {
      // Optionally handle navigation requests
      console.log("[Multica_embed] navigate request:", event.data.href)
    }

    if (event.data.type === "multica:ready") {
      setIsLoading(false)
    }
  }

  onMount(() => {
    window.addEventListener("message", handleMessage)
  })

  onCleanup(() => {
    window.removeEventListener("message", handleMessage)
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
        src={iframeSrc()}
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
