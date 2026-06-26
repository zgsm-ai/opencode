import { showToast } from "@opencode-ai/ui/toast"
import { channelApi } from "@/pages/store/lib/api"

const DISMISS_KEY = "costrict:notif_prompt_dismissed"

let pendingTimer: ReturnType<typeof setTimeout> | null = null
let isToastVisible = false

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1"
  } catch {
    return false
  }
}

function dismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, "1")
  } catch {
    // ignore
  }
}

export interface NotifPromptTexts {
  title: string
  description: string
  configure: string
  dismiss: string
}

/**
 * Schedules a notification channel check after a new session is created.
 * Only one pending timer and one active toast exist at any time.
 * The toast is persistent (stays until user acts on it).
 *
 * `texts` must be supplied by the caller (from a component context)
 * because this function runs inside a setTimeout callback where
 * SolidJS context is unavailable.
 */
export function scheduleNotifPromptCheck(
  navigate: (path: string) => void,
  texts: NotifPromptTexts,
  delayMs = 8000,
) {
  if (isDismissed()) return

  if (pendingTimer) {
    clearTimeout(pendingTimer)
  }

  pendingTimer = setTimeout(() => {
    pendingTimer = null
    void doCheck(navigate, texts)
  }, delayMs)
}

async function doCheck(navigate: (path: string) => void, texts: NotifPromptTexts) {
  if (isDismissed()) return
  if (isToastVisible) return

  let channels
  try {
    channels = await channelApi.list()
  } catch {
    return
  }

  const hasDisabled = channels.some(
    (ch) => !ch.enabled && (ch.channelType === "wecom-bot" || ch.channelType === "wecom"),
  )
  if (!hasDisabled) return

  isToastVisible = true

  showToast({
    icon: "bell",
    title: texts.title,
    description: texts.description,
    persistent: true,
    bottomLeft: true,
    actions: [
      {
        label: texts.configure,
        onClick: () => {
          isToastVisible = false
          dismiss()
          navigate("/console/notifications")
        },
      },
      {
        label: texts.dismiss,
        onClick: () => {
          isToastVisible = false
          dismiss()
        },
      },
    ],
  })
}
