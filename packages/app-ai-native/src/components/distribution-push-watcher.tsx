import { useNavigate } from "@solidjs/router"
import { showToast } from "@opencode-ai/ui/toast"
import { createEffect, onCleanup } from "solid-js"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"

// While a user is logged in, periodically check for distributions (skill pushes)
// that were sent to them and surface a bottom-right toast for any newly received
// (unread) one. The store「我收到的推送」tab is the source of truth; this only adds
// a live, in-app prompt so a recipient learns about a push without polling the tab.
//
// There is no global notification stream the web subscribes to today (the cloud SSE
// is scoped to terminal/device sessions), so this is a lightweight client-side poll.

const POLL_INTERVAL_MS = 45_000
const STORAGE_PREFIX = "costrict.distribution.seen-receipts:"

function loadSeen(key: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.filter((id): id is string => typeof id === "string")) : new Set()
  } catch {
    // Corrupt/blocked storage: treat as an empty baseline rather than null so we
    // don't replay historical receipts as toasts.
    return new Set()
  }
}

function saveSeen(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids))
  } catch {
    // ignore storage write failures
  }
}

export function DistributionPushWatcher() {
  const auth = useAuth()
  const navigate = useNavigate()
  const language = useLanguage()

  createEffect(() => {
    const user = auth.user()
    const userId = user?.id
    // Only poll for an authenticated user; restart cleanly if the user changes.
    if (!userId) return

    const storageKey = `${STORAGE_PREFIX}${userId}`
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const poll = async () => {
      try {
        const { distributionApi } = await import("@/pages/store/lib/api")
        const res = await distributionApi.listMyReceived()
        if (cancelled) return
        const receipts = res?.receipts ?? []

        const ids = receipts.map((r) => r.id)
        const seen = loadSeen(storageKey)
        if (seen === null) {
          // First time for this user in this browser: establish a baseline silently so
          // we never flood the recipient with toasts for pushes they already had.
          saveSeen(storageKey, ids)
          return
        }

        const fresh = receipts.filter((r) => r.receiptStatus === "unread" && !seen.has(r.id))
        if (fresh.length === 1) {
          const itemName = fresh[0]!.distribution?.item?.name || language.t("store.received.unknownItem")
          showToast({
            variant: "default",
            icon: "inbox",
            title: language.t("store.push.toast.title"),
            description: itemName,
            duration: 8000,
            actions: [{ label: language.t("store.push.toast.view"), onClick: () => navigate("/store/manager?tab=received") }],
          })
        } else if (fresh.length > 1) {
          showToast({
            variant: "default",
            icon: "inbox",
            title: language.t("store.push.toast.titlePlural", { count: fresh.length }),
            duration: 8000,
            actions: [{ label: language.t("store.push.toast.view"), onClick: () => navigate("/store/manager?tab=received") }],
          })
        }

        // Record the full current set so neither toasted nor already-handled receipts
        // re-toast on the next poll.
        saveSeen(storageKey, ids)
      } catch {
        // Network / permission / not-logged-in: skip this round, retry next interval.
      }
    }

    const schedule = () => {
      timer = setTimeout(tick, POLL_INTERVAL_MS)
    }
    const tick = async () => {
      if (cancelled) return
      // Pause work while the tab is hidden; just reschedule.
      if (typeof document !== "undefined" && document.hidden) {
        schedule()
        return
      }
      await poll()
      if (!cancelled) schedule()
    }

    const onVisibility = () => {
      if (cancelled || document.hidden) return
      // Returning to the tab: poll promptly instead of waiting for the next tick.
      if (timer) clearTimeout(timer)
      void tick()
    }

    void tick()
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility)
    }

    onCleanup(() => {
      cancelled = true
      if (timer) clearTimeout(timer)
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility)
      }
    })
  })

  return null
}
