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
  ProgressUpdate,
  LeaderStatus,
  LeaderScore,
} from "../../client/cloud-team-types"

type CloudTeamStore = {
  active: boolean
  decomposing: boolean
  session?: {
    id: string
    title: string
    status: TeamSession["status"]
    repoUrl?: string
    leaderId?: string
  }
  teammates: TeammateRegistration[]
  tasks: Task[]
  messages: CloudEvent[]
  approvals: ApprovalRequest[]
  progress: Record<string, ProgressUpdate>
  wsConnected: boolean
  lastEventId?: string
  leader?: LeaderStatus
  leaderScore?: LeaderScore
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

  const p = event.payload

  switch (event.type) {
    case "session.create":
    case "session.updated": {
      batch(() => {
        setStore((s) => {
          s.session = {
            id: (p.id as string) ?? event.sessionId,
            title: (p.name as string) ?? "",
            status: ((p.status as string) ?? "active") as TeamSession["status"],
            repoUrl: undefined,
            leaderId: (p.leaderMachineId as string) ?? (p.leaderId as string),
          }
          // Teammates may come as part of session payload
          if (Array.isArray(p.teammates)) {
            s.teammates = p.teammates as TeammateRegistration[]
          }
        })
      })
      break
    }

    case "session.join": {
      const member = p as unknown as TeammateRegistration
      batch(() => {
        setStore((s) => {
          const idx = s.teammates.findIndex((t) => t.id === member.id)
          if (idx >= 0) {
            s.teammates[idx] = member
          } else {
            s.teammates.push(member)
          }
        })
      })
      break
    }

    case "teammate.status": {
      const machineId = p.machineId as string
      const status = p.status as TeammateStatus
      batch(() => {
        setStore((s) => {
          const idx = s.teammates.findIndex((t) => t.machineId === machineId)
          if (idx >= 0) {
            s.teammates[idx].status = status
          }
        })
      })
      break
    }

    case "task.plan.submit": {
      const tasks = (p.tasks as Task[]) ?? []
      batch(() => {
        setStore((s) => {
          s.tasks = tasks
        })
      })
      break
    }

    case "task.assigned": {
      const taskId = p.taskId as string
      const task = p.task as Task | undefined
      batch(() => {
        setStore((s) => {
          const id = task?.id ?? taskId
          const idx = s.tasks.findIndex((t) => t.id === id)
          if (idx >= 0 && task) {
            s.tasks[idx] = task
          } else if (task) {
            s.tasks.push(task)
          }
        })
      })
      break
    }

    case "task.claim": {
      const taskId = p.taskId as string
      batch(() => {
        setStore((s) => {
          const idx = s.tasks.findIndex((t) => t.id === taskId)
          if (idx >= 0) {
            s.tasks[idx].status = "claimed" as TaskStatus
          }
        })
      })
      break
    }

    case "task.progress": {
      const taskId = p.taskId as string
      batch(() => {
        setStore((s) => {
          s.progress[taskId] = p as unknown as ProgressUpdate
        })
      })
      break
    }

    case "task.complete": {
      const taskId = p.taskId as string
      batch(() => {
        setStore((s) => {
          const idx = s.tasks.findIndex((t) => t.id === taskId)
          if (idx >= 0) {
            s.tasks[idx].status = "completed" as TaskStatus
          }
        })
      })
      break
    }

    case "task.fail": {
      const taskId = p.taskId as string
      batch(() => {
        setStore((s) => {
          const idx = s.tasks.findIndex((t) => t.id === taskId)
          if (idx >= 0) {
            s.tasks[idx].status = "failed" as TaskStatus
          }
        })
      })
      break
    }

    case "task.interrupted": {
      const taskId = p.taskId as string
      batch(() => {
        setStore((s) => {
          const idx = s.tasks.findIndex((t) => t.id === taskId)
          if (idx >= 0) {
            s.tasks[idx].status = "interrupted" as TaskStatus
          }
        })
      })
      break
    }

    case "decompose.request": {
      batch(() => {
        setStore((s) => {
          s.decomposing = true
        })
      })
      break
    }

    case "decompose.result": {
      const tasks = (p.tasks as Task[]) ?? []
      batch(() => {
        setStore((s) => {
          s.decomposing = false
          if (tasks.length > 0) {
            s.tasks = tasks
          }
        })
      })
      break
    }

    case "approval.request":
    case "approval.push": {
      const approval = p.approval as ApprovalRequest | undefined
      if (approval) {
        batch(() => {
          setStore((s) => {
            const idx = s.approvals.findIndex((a) => a.id === approval.id)
            if (idx >= 0) {
              s.approvals[idx] = approval
            } else {
              s.approvals.push(approval)
            }
          })
        })
      }
      break
    }

    case "approval.response":
    case "approval.respond": {
      const approvalId = p.approvalId as string
      const status = p.status as ApprovalStatus
      const feedback = p.feedback as string | undefined
      batch(() => {
        setStore((s) => {
          const idx = s.approvals.findIndex((a) => a.id === approvalId)
          if (idx >= 0) {
            s.approvals[idx].status = status
            if (feedback) s.approvals[idx].feedback = feedback
          }
        })
      })
      break
    }

    case "message.send":
    case "message.receive": {
      batch(() => {
        setStore((s) => {
          const exists = s.messages.some((m) => m.eventId === event.eventId)
          if (!exists) {
            s.messages.push(event)
          }
        })
      })
      break
    }

    case "leader.elected": {
      const leaderId = p.leaderId as string
      const fencingToken = p.fencingToken as number
      const score = p.score as LeaderScore | undefined
      batch(() => {
        setStore((s) => {
          if (s.session) {
            s.session.leaderId = leaderId
          }
          s.leader = {
            elected: true,
            fencingToken,
            leaderId,
            score,
          }
          if (score) {
            s.leaderScore = score
          }
        })
      })
      break
    }

    case "leader.expired": {
      batch(() => {
        setStore((s) => {
          if (s.session) {
            s.session.leaderId = undefined
          }
          s.leader = undefined
        })
      })
      break
    }

    case "repo.register":
    case "explore.request":
    case "explore.result":
    case "decompose.request":
    case "decompose.result": {
      // Informational or handled by request initiator — no store update needed
      break
    }

    case "error": {
      console.error("[cloud-team] Server error event:", p.message ?? p)
      break
    }

    default: {
      // Unknown event type - log but don't crash
      console.warn("[cloud-team] Unhandled event type:", event.type)
    }
  }
}
