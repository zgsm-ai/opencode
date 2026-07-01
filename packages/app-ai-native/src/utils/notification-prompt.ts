import { showToast } from "@opencode-ai/ui/toast"
import { channelApi } from "@/pages/store/lib/api"
import { isMobile } from "@/lib/mobile"

const DISMISS_KEY = "costrict:notif_prompt_dismissed"

let pendingTimer: ReturnType<typeof setTimeout> | null = null
let lastShownAt = 0
const MIN_INTERVAL_MS = 60000 // at most once per minute

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

export function scheduleNotifPromptCheck(
  navigate: (path: string) => void,
  texts: NotifPromptTexts,
  delayMs = 8000,
) {
  if (isDismissed()) return
  if (isMobile()) return
  if (Date.now() - lastShownAt < MIN_INTERVAL_MS) return

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

  lastShownAt = Date.now()

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
          navigate("/console/notifications")
        },
      },
      {
        label: texts.dismiss,
        onClick: () => {
          dismiss()
        },
      },
    ],
  })
}
