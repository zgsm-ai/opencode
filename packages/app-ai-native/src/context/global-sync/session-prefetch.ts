type SessionPrefetch = {
  limit: number
  cursor?: string
  complete: boolean
}

const cache = new Map<string, SessionPrefetch>()

const keyFor = (directory: string, sessionID: string) => `${directory}\n${sessionID}`

export function setSessionPrefetch(input: {
  directory: string
  sessionID: string
  limit: number
  cursor?: string
  complete: boolean
}) {
  cache.set(keyFor(input.directory, input.sessionID), {
    limit: input.limit,
    cursor: input.cursor,
    complete: input.complete,
  })
}

export function getSessionPrefetch(directory: string, sessionID: string) {
  return cache.get(keyFor(directory, sessionID))
}

export function getSessionPrefetchPromise(_directory: string, _sessionID: string) {
  return undefined
}

export function clearSessionPrefetch(directory: string, sessionIDs: string[]) {
  for (const sessionID of sessionIDs) {
    cache.delete(keyFor(directory, sessionID))
  }
}

export function clearSessionPrefetchDirectory(directory: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(`${directory}\n`)) cache.delete(key)
  }
}
