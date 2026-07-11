interface CostrictAuthMeResponse {
  user?: {
    casdoorUniversalId?: unknown
  }
}

type CostrictFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export async function fetchCostrictUniversalId(
  apiPrefix: string,
  fetcher: CostrictFetch = fetch,
): Promise<string | null> {
  try {
    const prefix = apiPrefix.replace(/\/$/, "")
    const res = await fetcher(`${prefix}/api/auth/me`, { credentials: "include" })
    if (!res.ok) return null
    const payload = (await res.json()) as CostrictAuthMeResponse
    const universalId = payload.user?.casdoorUniversalId
    if (typeof universalId !== "string") return null
    const trimmed = universalId.trim()
    return trimmed || null
  } catch {
    return null
  }
}

export function postCostrictIdentity(
  targetWindow: Pick<Window, "postMessage"> | null | undefined,
  targetOrigin: string,
  casdoorUniversalId: string | null | undefined,
) {
  const universalId = casdoorUniversalId?.trim()
  if (!targetWindow || !universalId) return
  targetWindow.postMessage(
    {
      type: "costrict:identity",
      casdoorUniversalId: universalId,
    },
    targetOrigin,
  )
}
