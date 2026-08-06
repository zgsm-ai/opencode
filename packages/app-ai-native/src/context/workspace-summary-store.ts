import { createStore, produce } from "solid-js/store"
import type { SessionStatus, QuestionRequest, PermissionRequest } from "@opencode-ai/sdk/v2/client"

export type WorkspaceSummary = {
  branch?: string
  dirty?: boolean
  aheadCount?: number
  behindCount?: number
  lastCommitHash?: string
  hasActiveSession: boolean
  hasPendingInteraction: boolean
  hasUnreadSession: boolean
}

const [summaries, setSummaries] = createStore<Record<string, WorkspaceSummary>>({})

export function useWorkspaceSummary(id: string) {
  return () => summaries[id]
}

export function syncSummary(
  id: string,
  data: {
    vcs?: { branch?: string; dirty?: boolean; aheadCount?: number; behindCount?: number; lastCommitHash?: string } | undefined
    sessionStatus: Record<string, SessionStatus>
    questions: Record<string, QuestionRequest[]>
    permissions: Record<string, PermissionRequest[]>
    hasUnreadSession?: boolean
  },
) {
  const hasActiveSession = Object.values(data.sessionStatus).some(
    (s) => s.type === "busy" || s.type === "retry" || s.type === "compacting",
  )
  const hasPendingInteraction =
    Object.values(data.questions).some((q) => q.length > 0) ||
    Object.values(data.permissions).some((p) => p.length > 0)
  const next = {
    branch: data.vcs?.branch,
    dirty: data.vcs?.dirty,
    aheadCount: data.vcs?.aheadCount,
    behindCount: data.vcs?.behindCount,
    lastCommitHash: data.vcs?.lastCommitHash,
    hasActiveSession,
    hasPendingInteraction,
    hasUnreadSession: !!data.hasUnreadSession,
  }
  const prev = summaries[id]
  if (prev && prev.branch === next.branch && prev.dirty === next.dirty && prev.aheadCount === next.aheadCount && prev.behindCount === next.behindCount && prev.lastCommitHash === next.lastCommitHash && prev.hasActiveSession === next.hasActiveSession && prev.hasPendingInteraction === next.hasPendingInteraction && prev.hasUnreadSession === next.hasUnreadSession) return
  setSummaries(id, next)
}

export function refreshUnread(id: string, hasUnread: boolean) {
  const prev = summaries[id]
  if (!prev || prev.hasUnreadSession === hasUnread) return
  setSummaries(id, "hasUnreadSession", hasUnread)
}

export function clearSummary(id: string) {
  setSummaries(produce((draft) => { delete draft[id] }))
}
