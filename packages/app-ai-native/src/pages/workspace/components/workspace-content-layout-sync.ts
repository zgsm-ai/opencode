import type { ContentTab } from "@/context/content-tabs"

export function activeSession(tabs: ContentTab[], id: string | undefined) {
  const tab = tabs.find((item) => item.id === id)
  if (tab?.kind !== "session") return
  return tab.meta.sessionID as string | undefined
}

export function shouldRestore(sid: string | undefined, done: string | undefined) {
  if (!sid) return false
  return sid !== done
}