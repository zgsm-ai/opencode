import type { JSX } from "solid-js"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"

type ShowFn = () => void

let show: ShowFn | null = null
let busy = false
let resetTimer: ReturnType<typeof setTimeout> | null = null

export function registerRateLimitToast(fn: ShowFn) {
  show = fn
}

export function onRateLimited() {
  if (busy || !show) return
  busy = true
  show()
  if (resetTimer) clearTimeout(resetTimer)
  resetTimer = setTimeout(() => {
    busy = false
    resetTimer = null
  }, 6000)
}

export function RateLimitToastProvider(props: { children: JSX.Element }) {
  const language = useLanguage()
  registerRateLimitToast(() => {
    showToast({
      variant: "error",
      title: language.t("toast.rateLimit.title"),
      description: language.t("toast.rateLimit.description"),
    })
  })
  return props.children
}

export const RateLimitToastTesting = {
  reset() {
    busy = false
    show = null
    if (resetTimer) {
      clearTimeout(resetTimer)
      resetTimer = null
    }
  },
  fireCooldown() {
    busy = false
    resetTimer = null
  },
}
