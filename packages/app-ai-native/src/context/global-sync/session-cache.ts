type CacheState = {
  message?: Record<string, unknown>
  session_diff?: Record<string, unknown>
  todo?: Record<string, unknown>
  permission?: Record<string, unknown>
  question?: Record<string, unknown>
  session_status?: Record<string, unknown>
  part?: Record<string, Array<{ sessionID?: string }>>
}

export const SESSION_CACHE_LIMIT = 12

export function pickSessionCacheEvictions(input: { seen: Set<string>; keep: string; limit: number }) {
  input.seen.delete(input.keep)
  input.seen.add(input.keep)

  const overflow = input.seen.size - input.limit
  if (overflow <= 0) return []

  const stale: string[] = []
  for (const sessionID of input.seen) {
    if (sessionID === input.keep) continue
    stale.push(sessionID)
    if (stale.length >= overflow) break
  }
  for (const sessionID of stale) {
    input.seen.delete(sessionID)
  }
  return stale
}

export function dropSessionCaches(state: CacheState, sessionIDs: string[]) {
  for (const sessionID of sessionIDs) {
    delete state.message?.[sessionID]
    delete state.session_diff?.[sessionID]
    delete state.todo?.[sessionID]
    delete state.permission?.[sessionID]
    delete state.question?.[sessionID]
    delete state.session_status?.[sessionID]
  }

  if (!state.part) return
  for (const [messageID, parts] of Object.entries(state.part)) {
    if (parts.some((part) => sessionIDs.includes(part.sessionID ?? ""))) {
      delete state.part[messageID]
    }
  }
}
