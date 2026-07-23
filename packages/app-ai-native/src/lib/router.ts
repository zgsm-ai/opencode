import { env } from "@/lib/env"

export function appPath(path: string) {
  const base = (env.BASE_PATH || "").replace(/\/+$/, "")

  if (!base || base === "/") return path
  if (path === base) return "/"
  if (path.startsWith(`${base}/`)) return path.slice(base.length) || "/"

  return path
}

export function href(path: string) {
  const base = (env.BASE_PATH || "").replace(/\/+$/, "")
  return new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`, window.location.origin).toString()
}

export function isWorkspacePath(path: string) {
  return path === "/workspace" || path.startsWith("/workspace/")
}

export function isChromePath(path: string) {
  return path.startsWith("/store") || path.startsWith("/projects")
}
