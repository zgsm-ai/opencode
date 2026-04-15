import { env } from "@/lib/env"
import type { CloudEvent } from "./cloud-team-types"

type CloudTeamWSOptions = {
  sessionId: string
  token: string
  machineId: string
  onEvent: (event: CloudEvent) => void
  onConnect: () => void
  onDisconnect: () => void
}

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30_000
const HEARTBEAT_INTERVAL_MS = 15_000
const HEARTBEAT_TIMEOUT_MS = 30_000

/**
 * WebSocket client for Cloud Team real-time events.
 *
 * Manages connection lifecycle, reconnection with exponential backoff,
 * heartbeat, and lastEventId-based resume.
 */
export function createCloudTeamWS(options: CloudTeamWSOptions) {
  const { sessionId, token, machineId, onEvent, onConnect, onDisconnect } = options

  let ws: WebSocket | undefined
  let lastEventId: string | undefined
  let reconnectAttempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | undefined
  let destroyed = false

  function getWSUrl(): string {
    const appUrl = env.API_URL || `${location.protocol}//${location.host}${env.API_PREFIX}`
    const wsBase = appUrl.replace(/^http/, "ws")
    const params = new URLSearchParams({ token, machineId })
    if (lastEventId) params.set("lastEventId", lastEventId)
    return `${wsBase}/ws/sessions/${sessionId}?${params.toString()}`
  }

  function connect() {
    if (destroyed) return
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return

    const url = getWSUrl()
    ws = new WebSocket(url)

    ws.onopen = () => {
      reconnectAttempt = 0
      startHeartbeat()
      onConnect()
    }

    ws.onmessage = (event) => {
      resetHeartbeatTimeout()
      try {
        const cloudEvent: CloudEvent = JSON.parse(event.data)
        if (cloudEvent.eventId) {
          lastEventId = cloudEvent.eventId
        }
        onEvent(cloudEvent)
      } catch {
        console.error("[cloud-team-ws] Failed to parse event", event.data)
      }
    }

    ws.onclose = (event) => {
      stopHeartbeat()
      ws = undefined
      onDisconnect()
      if (!destroyed && !event.wasClean) {
        scheduleReconnect()
      }
    }

    ws.onerror = () => {
      // onclose will fire after onerror, reconnect logic is there
    }
  }

  function disconnect() {
    destroyed = true
    clearReconnect()
    stopHeartbeat()
    if (ws) {
      ws.onclose = null
      ws.onerror = null
      ws.onmessage = null
      ws.close(1000, "Client disconnect")
      ws = undefined
    }
    onDisconnect()
  }

  function send(event: Partial<CloudEvent> & { type: CloudEvent["type"] }) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn("[cloud-team-ws] Cannot send: WebSocket not open")
      return
    }
    const cloudEvent: CloudEvent = {
      eventId: event.eventId ?? `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: event.type,
      sessionId: event.sessionId ?? sessionId,
      timestamp: event.timestamp ?? Date.now(),
      payload: event.payload ?? {},
    }
    ws.send(JSON.stringify(cloudEvent))
  }

  function scheduleReconnect() {
    if (destroyed) return
    clearReconnect()
    const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt), RECONNECT_MAX_MS)
    reconnectAttempt++
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined
      connect()
    }, delay)
  }

  function clearReconnect() {
    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer)
      reconnectTimer = undefined
    }
  }

  function startHeartbeat() {
    stopHeartbeat()
    heartbeatTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }))
        startHeartbeatTimeout()
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  function stopHeartbeat() {
    if (heartbeatTimer !== undefined) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = undefined
    }
    clearHeartbeatTimeout()
  }

  function startHeartbeatTimeout() {
    clearHeartbeatTimeout()
    heartbeatTimeoutTimer = setTimeout(() => {
      console.warn("[cloud-team-ws] Heartbeat timeout, reconnecting...")
      if (ws) {
        ws.close(4000, "Heartbeat timeout")
      }
    }, HEARTBEAT_TIMEOUT_MS)
  }

  function resetHeartbeatTimeout() {
    clearHeartbeatTimeout()
    // Next heartbeat will restart the timeout
  }

  function clearHeartbeatTimeout() {
    if (heartbeatTimeoutTimer !== undefined) {
      clearTimeout(heartbeatTimeoutTimer)
      heartbeatTimeoutTimer = undefined
    }
  }

  return {
    connect,
    disconnect,
    send,
    getLastEventId: () => lastEventId,
  }
}
