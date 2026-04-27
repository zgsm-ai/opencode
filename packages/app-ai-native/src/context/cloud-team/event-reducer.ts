import { batch } from "solid-js"
import { showToast } from "@opencode-ai/ui/toast"
import type {
  CloudEvent,
  TeamSession,
  TeammateRegistration,
  TeammateStatus,
  Task,
  TaskStatus,
  TaskResult,
  ApprovalRequest,
  ApprovalStatus,
  ProgressUpdate,
  LeaderStatus,
  LeaderScore,
  OrchestratePhase,
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
  timeline: CloudEvent[]
  approvals: ApprovalRequest[]
  progress: Record<string, ProgressUpdate>
  wsConnected: boolean
  lastEventId?: string
  leader?: LeaderStatus
  leaderScore?: LeaderScore
  orchestrating: boolean
  orchestratePhase?: OrchestratePhase
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

  // Append every event to the timeline for activity feed display
  setStore((s) => {
    const exists = s.timeline.some((e) => e.eventId === event.eventId)
    if (!exists) {
      s.timeline.push(event)
    }
  })

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
          // Sync teammate.currentTaskId
          const assignedMemberId = task?.assignedMemberId ?? (p.assignedMemberId as string | undefined)
          if (assignedMemberId) {
            const ti = s.teammates.findIndex((t) => t.id === assignedMemberId)
            if (ti >= 0) s.teammates[ti].currentTaskId = id
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
            // Mark assignee as busy when they claim a task
            const assignedMemberId = s.tasks[idx].assignedMemberId
            if (assignedMemberId) {
              const ti = s.teammates.findIndex((t) => t.id === assignedMemberId)
              if (ti >= 0) s.teammates[ti].status = "busy"
            }
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
          // Ensure task shows as "running" while progress updates arrive
          const idx = s.tasks.findIndex((t) => t.id === taskId)
          if (idx >= 0) {
            const task = s.tasks[idx]
            if (task.status === "assigned" || task.status === "claimed" || task.status === "pending") {
              s.tasks[idx].status = "running" as TaskStatus
            }
            // Mark the assigned teammate as busy
            if (task.assignedMemberId) {
              const ti = s.teammates.findIndex((t) => t.id === task.assignedMemberId)
              if (ti >= 0 && s.teammates[ti].status !== "busy") {
                s.teammates[ti].status = "busy"
              }
            }
          }
        })
      })
      break
    }

    case "task.complete": {
      const taskId = p.taskId as string
      const description = p.description as string | undefined
      const result = p.result as TaskResult | undefined
      batch(() => {
        setStore((s) => {
          const idx = s.tasks.findIndex((t) => t.id === taskId)
          if (idx >= 0) {
            s.tasks[idx].status = "completed" as TaskStatus
            if (result) s.tasks[idx].result = result
          }
          // Clear currentTaskId and reset status if no other active tasks
          const ti = s.teammates.findIndex((t) => t.currentTaskId === taskId)
          if (ti >= 0) {
            s.teammates[ti].currentTaskId = undefined
            const hasOtherActiveTasks = s.tasks.some(
              (t) => t.id !== taskId && t.assignedMemberId === s.teammates[ti].id
                && (t.status === "running" || t.status === "claimed" || t.status === "assigned"),
            )
            if (!hasOtherActiveTasks) s.teammates[ti].status = "online"
          }
        })
      })
      if (description) {
        showToast({ title: "Task completed", description, variant: "success" })
      }
      break
    }

    case "task.fail": {
      const taskId = p.taskId as string
      const errorMessage = p.errorMessage as string | undefined
      const description = p.description as string | undefined
      batch(() => {
        setStore((s) => {
          const idx = s.tasks.findIndex((t) => t.id === taskId)
          if (idx >= 0) {
            s.tasks[idx].status = "failed" as TaskStatus
            if (errorMessage) s.tasks[idx].errorMessage = errorMessage
          }
          // Clear currentTaskId and reset status if no other active tasks
          const ti = s.teammates.findIndex((t) => t.currentTaskId === taskId)
          if (ti >= 0) {
            s.teammates[ti].currentTaskId = undefined
            const hasOtherActiveTasks = s.tasks.some(
              (t) => t.id !== taskId && t.assignedMemberId === s.teammates[ti].id
                && (t.status === "running" || t.status === "claimed" || t.status === "assigned"),
            )
            if (!hasOtherActiveTasks) s.teammates[ti].status = "online"
          }
        })
      })
      showToast({
        title: "Task failed",
        description: errorMessage ?? description ?? "Unknown error",
        variant: "error",
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
          const ti = s.teammates.findIndex((t) => t.currentTaskId === taskId)
          if (ti >= 0) {
            s.teammates[ti].currentTaskId = undefined
            const hasOtherActiveTasks = s.tasks.some(
              (t) => t.id !== taskId && t.assignedMemberId === s.teammates[ti].id
                && (t.status === "running" || t.status === "claimed" || t.status === "assigned"),
            )
            if (!hasOtherActiveTasks) s.teammates[ti].status = "online"
          }
        })
      })
      break
    }

    case "task.terminate": {
      const taskId = p.taskId as string
      batch(() => {
        setStore((s) => {
          const idx = s.tasks.findIndex((t) => t.id === taskId)
          if (idx >= 0 && (s.tasks[idx].status === "running" || s.tasks[idx].status === "claimed" || s.tasks[idx].status === "assigned")) {
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
        if (approval.status === "pending") {
          showToast({
            title: "Approval needed",
            description: `${approval.toolName}: ${approval.description}`,
          })
        }
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
      showToast({ title: "Leader elected", description: `New leader selected for this session` })
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

    case "leader.snapshot": {
      batch(() => {
        setStore((s) => {
          if (Array.isArray(p.tasks)) s.tasks = p.tasks as Task[]
          if (Array.isArray(p.approvals)) s.approvals = p.approvals as ApprovalRequest[]
          if (Array.isArray(p.teammates)) s.teammates = p.teammates as TeammateRegistration[]
        })
      })
      break
    }

    case "orchestrate.progress": {
      const phase = p.phase as OrchestratePhase | undefined
      batch(() => {
        setStore((s) => {
          s.orchestrating = phase !== "ready_for_review"
          s.orchestratePhase = phase
        })
      })
      break
    }

    case "repo.register":
    case "explore.request":
    case "explore.result": {
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
