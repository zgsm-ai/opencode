import { batch } from "solid-js"
import type {
  CloudEvent,
  TeamSession,
  TeammateRegistration,
  TeammateStatus,
  Task,
  TaskStatus,
  ApprovalRequest,
  ApprovalStatus,
  CloudMessage,
  ProgressUpdate,
  LeaderStatus,
} from "../../client/cloud-team-types"

type CloudTeamStore = {
  active: boolean
  session?: {
    id: string
    title: string
    status: TeamSession["status"]
    repoUrl?: string
    leaderId?: string
  }
  teammates: TeammateRegistration[]
  tasks: Task[]
  messages: CloudMessage[]
  approvals: ApprovalRequest[]
  progress: Record<string, ProgressUpdate>
  wsConnected: boolean
  lastEventId?: string
  leader?: LeaderStatus
}

type SetStore = (fn: (state: CloudTeamStore) => void) => void

/**
 * Apply a CloudEvent to the store, returning mutations via setStore.
 * All store updates go through this reducer to ensure single source of truth.
 */
export function applyCloudEvent(store: CloudTeamStore, setStore: SetStore, event: CloudEvent): void {
  if (event.eventId) {
    setStore((s) => {
      s.lastEventId = event.eventId
    })
  }

  switch (event.type) {
    case "session.create":
    case "session.updated": {
      const payload = event.payload as TeamSession
      batch(() => {
        setStore((s) => {
          s.session = {
            id: payload.sessionId,
            title: payload.name,
            status: payload.status,
            repoUrl: undefined,
            leaderId: payload.leaderId,
          }
          s.teammates = payload.teammates ?? []
        })
      })
      break
    }

    case "session.join": {
      const payload = event.payload as TeammateRegistration
      batch(() => {
        setStore((s) => {
          const idx = s.teammates.findIndex((t) => t.teammateId === payload.teammateId)
          if (idx >= 0) {
            s.teammates[idx] = payload
          } else {
            s.teammates.push(payload)
          }
        })
      })
      break
    }

    case "teammate.status": {
      const payload = event.payload as { teammateId: string; status: TeammateStatus }
      batch(() => {
        setStore((s) => {
          const idx = s.teammates.findIndex((t) => t.teammateId === payload.teammateId)
          if (idx >= 0) {
            s.teammates[idx].status = payload.status
          }
        })
      })
      break
    }

    case "task.plan.submit": {
      const payload = event.payload as { tasks: Task[] }
      batch(() => {
        setStore((s) => {
          s.tasks = payload.tasks
        })
      })
      break
    }

    case "task.assigned": {
      const payload = event.payload as { taskId: string; assignedTeammateId: string; status: TaskStatus }
      batch(() => {
        setStore((s) => {
          const idx = s.tasks.findIndex((t) => t.taskId === payload.taskId)
          if (idx >= 0) {
            s.tasks[idx].assignedTeammateId = payload.assignedTeammateId
            s.tasks[idx].status = payload.status
          }
        })
      })
      break
    }

    case "task.claim": {
      const payload = event.payload as { taskId: string; teammateId: string }
      batch(() => {
        setStore((s) => {
          const idx = s.tasks.findIndex((t) => t.taskId === payload.taskId)
          if (idx >= 0) {
            s.tasks[idx].assignedTeammateId = payload.teammateId
            s.tasks[idx].status = "claimed"
            s.tasks[idx].claimedAt = Date.now()
          }
        })
      })
      break
    }

    case "task.progress": {
      const payload = event.payload as ProgressUpdate
      batch(() => {
        setStore((s) => {
          s.progress[payload.taskId] = payload
        })
      })
      break
    }

    case "task.complete": {
      const payload = event.payload as { taskId: string; result?: Task["result"] }
      batch(() => {
        setStore((s) => {
          const idx = s.tasks.findIndex((t) => t.taskId === payload.taskId)
          if (idx >= 0) {
            s.tasks[idx].status = "completed"
            s.tasks[idx].completedAt = Date.now()
            if (payload.result) s.tasks[idx].result = payload.result
          }
          // Update teammate's currentTaskId
          const tIdx = s.teammates.findIndex(
            (t) => t.currentTaskId === payload.taskId,
          )
          if (tIdx >= 0) {
            s.teammates[tIdx].currentTaskId = undefined
          }
        })
      })
      break
    }

    case "approval.request": {
      const payload = event.payload as ApprovalRequest
      batch(() => {
        setStore((s) => {
          const idx = s.approvals.findIndex((a) => a.approvalId === payload.approvalId)
          if (idx >= 0) {
            s.approvals[idx] = payload
          } else {
            s.approvals.push(payload)
          }
        })
      })
      break
    }

    case "approval.response":
    case "approval.respond": {
      const payload = event.payload as { approvalId: string; status: ApprovalStatus; feedback?: string }
      batch(() => {
        setStore((s) => {
          const idx = s.approvals.findIndex((a) => a.approvalId === payload.approvalId)
          if (idx >= 0) {
            s.approvals[idx].status = payload.status
            if (payload.feedback) s.approvals[idx].feedback = payload.feedback
            s.approvals[idx].resolvedAt = Date.now()
          }
        })
      })
      break
    }

    case "message.send":
    case "message.receive": {
      const payload = event.payload as CloudMessage
      batch(() => {
        setStore((s) => {
          const exists = s.messages.some((m) => m.messageId === payload.messageId)
          if (!exists) {
            s.messages.push(payload)
          }
        })
      })
      break
    }

    case "repo.register": {
      // Repo registration is informational; no store update needed on leader side
      break
    }

    case "explore.request":
    case "explore.result": {
      // Explore events are handled directly by the request initiator, not stored
      break
    }

    default: {
      // Unknown event type - log but don't crash
      console.warn("[cloud-team] Unhandled event type:", event.type)
    }
  }
}
