import { env } from "@/lib/env"

export function appPath(path: string) {
  const base = (env.BASE_PATH || "").replace(/\/+$/, "")

  if (!base || base === "/") return path
  if (path === base) return "/"
  if (path.startsWith(`${base}/`)) return path.slice(base.length) || "/"

  return path
}