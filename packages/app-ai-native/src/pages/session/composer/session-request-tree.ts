import type { PermissionRequest, QuestionRequest, Session } from "@opencode-ai/sdk/v2/client"

function sessionTreeIDs(session: Session[], sessionID?: string) {
  if (!sessionID) return [] as string[]

  const parentMap = session.reduce((acc, item) => {
    if (!item.parentID) return acc
    const list = acc.get(item.parentID)
    if (list) list.push(item.id)
    if (!list) acc.set(item.parentID, [item.id])
    return acc
  }, new Map<string, string[]>())

  const childMap = new Map<string, string>()
  for (const item of session) {
    if (item.parentID) childMap.set(item.id, item.parentID)
  }

  const seen = new Set([sessionID])
  const ids: string[] = [sessionID]

  // Walk down to children
  for (const id of ids) {
    const list = parentMap.get(id)
    if (!list) continue
    for (const child of list) {
      if (seen.has(child)) continue
      seen.add(child)
      ids.push(child)
    }
  }

  // Walk up to parent chain (bidirectional tree access)
  let cur = sessionID
  while (true) {
    const p = childMap.get(cur)
    if (!p || seen.has(p)) break
    seen.add(p)
    ids.push(p)
    cur = p
  }

  return ids
}

function sessionTreeRequest<T>(
  session: Session[],
  request: Record<string, T[] | undefined>,
  sessionID?: string,
  include: (item: T) => boolean = () => true,
) {
  const ids = sessionTreeIDs(session, sessionID)
  if (ids.length === 0) return
  const id = ids.find((id) => request[id]?.some(include))
  if (!id) return
  return request[id]?.find(include)
}

export function sessionPermissionRequest(
  session: Session[],
  request: Record<string, PermissionRequest[] | undefined>,
  sessionID?: string,
  include?: (item: PermissionRequest) => boolean,
) {
  return sessionTreeRequest(session, request, sessionID, include)
}

export function sessionQuestionRequest(
  session: Session[],
  request: Record<string, QuestionRequest[] | undefined>,
  sessionID?: string,
  include?: (item: QuestionRequest) => boolean,
) {
  return sessionTreeRequest(session, request, sessionID, include)
}

export { sessionTreeIDs }
