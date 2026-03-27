import { Plugin } from "@/plugin"
import { NotificationMode } from "@/permission/notification"
import { Session } from "@/session"
import { SessionID } from "@/session/schema"
import { MessageV2 } from "@/session/message-v2"
import { notifyCloud } from "@/costrict/device/notify"

interface InterventionData {
  type: "permission" | "question" | "idle"
  sessionID: string
  data: any
}

const mainSessions = new Set<string>()
const RECENT_NOTIFICATIONS = new Map<string, number>()
const NOTIFICATION_COOLDOWN = 2000
const IDLE_DEBOUNCE_TIMERS = new Map<string, ReturnType<typeof setTimeout>>()
const IDLE_DEBOUNCE_DELAY = 2000

function getNotificationKey(data: InterventionData): string {
  return `${data.type}:${data.sessionID}`
}

function shouldSkipNotification(key: string): boolean {
  const now = Date.now()
  const lastSent = RECENT_NOTIFICATIONS.get(key)

  if (lastSent && now - lastSent < NOTIFICATION_COOLDOWN) {
    return true
  }

  RECENT_NOTIFICATIONS.set(key, now)

  for (const [k, t] of RECENT_NOTIFICATIONS.entries()) {
    if (now - t > NOTIFICATION_COOLDOWN) {
      RECENT_NOTIFICATIONS.delete(k)
    }
  }

  return false
}

async function isSessionInterrupted(sessionID: string): Promise<boolean> {
  try {
    const messages = await Session.messages({ sessionID: SessionID.make(sessionID), limit: 1 })
    if (messages.length === 0) return false

    const latestMessage = messages[0]
    if (latestMessage.info.role !== "assistant") return false

    const error = latestMessage.info.error
    return error ? error.name === "MessageAbortedError" : false
  } catch {
    return false
  }
}

function debounceIdleNotification(sessionID: string, data: InterventionData) {
  const existingTimer = IDLE_DEBOUNCE_TIMERS.get(sessionID)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }

  const timer = setTimeout(async () => {
    IDLE_DEBOUNCE_TIMERS.delete(sessionID)

    const interrupted = await isSessionInterrupted(sessionID)
    if (interrupted) {
      return
    }

    await triggerNotification(data)
  }, IDLE_DEBOUNCE_DELAY)

  IDLE_DEBOUNCE_TIMERS.set(sessionID, timer)
}

export async function handleSessionCreated(input: { event: any }): Promise<void> {
  if (input.event.type === "session.created") {
    const sessionInfo = input.event.properties.info
    if (!sessionInfo.parentID) {
      mainSessions.add(sessionInfo.id)
    }
  }
}

export async function handleNotificationEvent(input: { event: any }): Promise<void> {
  const eventType = input.event.type

  if (eventType === "permission.asked") {
    const data: InterventionData = {
      type: "permission",
      sessionID: input.event.properties.sessionID,
      data: {
        permissionID: input.event.properties.id,
        permissionType: input.event.properties.permission,
        patterns: input.event.properties.patterns,
        always: input.event.properties.always,
        tool: input.event.properties.tool,
        metadata: input.event.properties.metadata,
      },
    }

    await triggerNotification(data)
  } else if (eventType === "question.asked") {
    const data: InterventionData = {
      type: "question",
      sessionID: input.event.properties.sessionID,
      data: {
        requestID: input.event.properties.id,
        questions: input.event.properties.questions,
        tool: input.event.properties.tool,
      },
    }

    await triggerNotification(data)
  } else if (eventType === "session.status" && input.event.properties.status.type === "idle") {
    const sessionID = input.event.properties.sessionID

    if (!mainSessions.has(sessionID)) {
      return
    }

    const data: InterventionData = {
      type: "idle",
      sessionID: sessionID,
      data: {
        timestamp: Date.now(),
      },
    }

    debounceIdleNotification(sessionID, data)
  }
}

async function triggerNotification(data: InterventionData) {
  try {
    if (!NotificationMode.isEnabled()) {
      return
    }
  } catch {}

  const key = getNotificationKey(data)
  if (shouldSkipNotification(key)) {
    return
  }

  try {
    await Plugin.trigger(
      "intervention.required",
      {
        type: data.type,
        sessionID: data.sessionID,
        data: data.data,
      },
      { handled: false },
    )
  } catch {}

  const session = await Session.get(data.sessionID).catch(() => null)
  const directory = session?.directory ?? ""

  notifyCloud({ type: data.type, sessionID: data.sessionID, data: data.data }, directory).catch(() => {})
}

export function cleanupSessionHistory(sessionID: string) {
  mainSessions.delete(sessionID)

  const timer = IDLE_DEBOUNCE_TIMERS.get(sessionID)
  if (timer) {
    clearTimeout(timer)
    IDLE_DEBOUNCE_TIMERS.delete(sessionID)
  }
}

export function _test_getMainSessions(): ReadonlySet<string> {
  return mainSessions
}

export function _test_clearMainSessions(): void {
  mainSessions.clear()
}
