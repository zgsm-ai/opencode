import { createStore, produce } from "solid-js/store"
import type { SessionStatus, QuestionRequest, PermissionRequest } from "@opencode-ai/sdk/v2/client"

export type WorkspaceSummary = {
  branch?: string
  hasActiveSession: boolean
  hasPendingInteraction: boolean
}

const [summaries, setSummaries] = createStore<Record<string, WorkspaceSummary>>({})

export function useWorkspaceSummary(id: string) {
  return () => summaries[id]
}

export function syncSummary(
  id: string,
  data: {
    vcs?: { branch?: string } | undefined
    sessionStatus: Record<string, SessionStatus>
    questions: Record<string, QuestionRequest[]>
    permissions: Record<string, PermissionRequest[]>
  },
) {
  const hasActiveSession = Object.values(data.sessionStatus).some(
    (s) => s.type === "busy" || s.type === "retry",
  )
  const hasPendingInteraction =
    Object.values(data.questions).some((q) => q.length > 0) ||
    Object.values(data.permissions).some((p) => p.length > 0)
  setSummaries(id, {
    branch: data.vcs?.branch,
    hasActiveSession,
    hasPendingInteraction,
  })
}

export function clearSummary(id: string) {
  setSummaries(produce((draft) => { delete draft[id] }))
}
