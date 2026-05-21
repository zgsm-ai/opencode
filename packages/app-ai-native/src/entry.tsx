// @refresh reload

import { iife } from "@opencode-ai/util/iife"
import { render } from "solid-js/web"
import { Router } from "@solidjs/router"
import { AppBaseProviders } from "@/app"
import { type Platform, PlatformProvider } from "@/context/platform"
import { dict as en } from "@/i18n/en"
import { dict as zh } from "@/i18n/zh"
import { handleNotificationClick } from "@/utils/notification-click"
import { env } from "@/lib/env"
import pkg from "../package.json"
import { ServerConnection } from "./context/server"
import { RootLayoutRoute, renderRoutes, routeConfig } from "./routes"

const DEFAULT_SERVER_URL_KEY = "opencode.settings.dat:defaultServerUrl"

const getLocale = () => {
  if (typeof navigator !== "object") return "en" as const
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const language of languages) {
    if (!language) continue
    if (language.toLowerCase().startsWith("zh")) return "zh" as const
  }
  return "en" as const
}

const getRootNotFoundError = () => {
  const key = "error.dev.rootNotFound" as const
  const locale = getLocale()
  return locale === "zh" ? (zh[key] ?? en[key]) : en[key]
}

const getStorage = (key: string) => {
  if (typeof localStorage === "undefined") return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const setStorage = (key: string, value: string | null) => {
  if (typeof localStorage === "undefined") return
  try {
    if (value !== null) {
      localStorage.setItem(key, value)
      return
    }
    localStorage.removeItem(key)
  } catch {
    return
  }
}

const readDefaultServerUrl = () => getStorage(DEFAULT_SERVER_URL_KEY)
const writeDefaultServerUrl = (url: string | null) => setStorage(DEFAULT_SERVER_URL_KEY, url)

const notify: Platform["notify"] = async (title, description, href) => {
  if (!("Notification" in window)) return

  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission().catch(() => "denied")
      : Notification.permission

  if (permission !== "granted") return

  const inView = document.visibilityState === "visible" && document.hasFocus()
  if (inView) return

  const notification = new Notification(title, {
    body: description ?? "",
    icon: "https://opencode.ai/favicon-96x96-v3.png",
  })

  notification.onclick = () => {
    handleNotificationClick(href)
    notification.close()
  }
}

const openLink: Platform["openLink"] = (url) => {
  window.open(url, "_blank")
}

const back: Platform["back"] = () => {
  window.history.back()
}

const forward: Platform["forward"] = () => {
  window.history.forward()
}

const restart: Platform["restart"] = async () => {
  window.location.reload()
}

const root = document.getElementById("root")
if (!(root instanceof HTMLElement) && import.meta.env.DEV) {
  throw new Error(getRootNotFoundError())
}

const platform: Platform = {
  platform: "web",
  version: pkg.version,
  openLink,
  back,
  forward,
  restart,
  notify,
  getDefaultServerUrl: async () => readDefaultServerUrl(),
  setDefaultServerUrl: writeDefaultServerUrl,
}

const pwa = () => {
  if (!("serviceWorker" in navigator)) return

  const hour = 60 * 60 * 1000
  const scope = (env.BASE_PATH || "/").replace(/\/?$/, "/")
  const skip = (sw?: ServiceWorker | null) => {
    if (!sw || !navigator.serviceWorker.controller) return
    sw.postMessage({ type: "SKIP_WAITING" })
  }
  const state = { refresh: false }

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (state.refresh) return
    state.refresh = true
    window.location.reload()
  })

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(scope + "sw.js", { scope })
      .then((reg) => {
        skip(reg.waiting)
        reg.addEventListener("updatefound", () => {
          const next = reg.installing
          if (!next) return
          next.addEventListener("statechange", () => {
            if (next.state === "installed") skip(next)
          })
        })
        reg.update().catch(() => {})
        window.setInterval(() => reg.update().catch(() => {}), hour)
      })
      .catch(() => {})
  })
}

if (root instanceof HTMLElement) {
  pwa()

  render(
    () => (
      <PlatformProvider value={platform}>
        <AppBaseProviders>
          <Router base={env.BASE_PATH || "/"} root={RootLayoutRoute}>{renderRoutes(routeConfig)}</Router>
        </AppBaseProviders>
      </PlatformProvider>
    ),
    root,
  )
}
