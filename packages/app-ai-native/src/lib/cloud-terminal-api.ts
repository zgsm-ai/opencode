import type { ServerConnection } from "@/context/server"

const CONTROL_TAG_JSON = 0x01
const WS_CONNECT_TIMEOUT_MS = 5000
const WS_KEEPALIVE_INTERVAL_MS = 20000
const WS_RECONNECT_INITIAL_DELAY_MS = 1000
const WS_RECONNECT_MAX_DELAY_MS = 30000
const WS_RECONNECT_JITTER_MS = 250
const SSE_MAX_RETRIES = 3
const SSE_INITIAL_RETRY_DELAY = 1000
const SSE_MAX_RETRY_DELAY = 8000
const SSE_CONNECTION_TIMEOUT = 10000

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export const TERMINAL_DISABLED_CODE = "TERMINAL_DISABLED"

export class TerminalDisabledError extends Error {
  constructor(message?: string) {
    super(message ?? "Terminal is disabled by policy")
    this.name = "TerminalDisabledError"
  }
}

export function isTerminalDisabledError(error: unknown): error is TerminalDisabledError {
  return error instanceof TerminalDisabledError
}

async function checkTerminalDisabled(response: Response): Promise<void> {
  if (response.status === 403) {
    const body = await response.json().catch(() => ({}))
    if (body?.code === TERMINAL_DISABLED_CODE) {
      throw new TerminalDisabledError(body.error ?? "Terminal is disabled")
    }
  }
}

type TerminalInputControlMessage = {
  t: string
  s?: string
  v?: number
}

export interface CloudTerminalSession {
  sessionId: string
  pid: number
}

export interface CloudTerminalApiOptions {
  server: ServerConnection.Any
  deviceId: string
}

export class CloudTerminalApi {
  private server: ServerConnection.Any
  private deviceId: string
  private ws: WebSocket | null = null
  private boundSessionId: string | null = null
  private wsClosed = false
  private wsReconnectAttempt = 0
  private wsReconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null
  private wsOpenPromise: Promise<WebSocket | null> | null = null

  constructor(options: CloudTerminalApiOptions) {
    this.server = options.server
    this.deviceId = options.deviceId
  }

  private get baseUrl(): string {
    return this.server.http.url
  }

  private buildUrl(path: string): string {
    return `${this.baseUrl}/api/v1/terminal${path}`
  }

  private buildWsUrl(): string {
    const httpUrl = this.buildUrl("/input-ws")
    return httpUrl.replace(/^http/, "ws")
  }

  private buildSseUrl(sessionId: string): string {
    return this.buildUrl(`/${sessionId}/stream`)
  }

  async create(cwd: string, rows: number, cols: number): Promise<CloudTerminalSession> {
    const response = await fetch(this.buildUrl(""), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ cwd, rows, cols }),
    })
    await checkTerminalDisabled(response)
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: "Failed to create terminal" } }))
      throw new Error(err.error?.message ?? "Failed to create terminal session")
    }
    const result = await response.json()
    return { sessionId: result.data.sessionId, pid: result.data.pid }
  }

  async kill(sessionId: string): Promise<void> {
    const response = await fetch(this.buildUrl(`/${sessionId}`), {
      method: "DELETE",
      credentials: "include",
    })
    if (!response.ok) {
      throw new Error("Failed to kill terminal session")
    }
  }

  async resize(sessionId: string, rows: number, cols: number): Promise<void> {
    const response = await fetch(this.buildUrl(`/${sessionId}/resize`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ rows, cols }),
    })
    await checkTerminalDisabled(response)
    if (!response.ok) {
      throw new Error("Failed to resize terminal")
    }
  }

  async restart(sessionId: string, cwd: string): Promise<CloudTerminalSession> {
    const response = await fetch(this.buildUrl(`/${sessionId}/restart`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ cwd }),
    })
    await checkTerminalDisabled(response)
    if (!response.ok) {
      throw new Error("Failed to restart terminal session")
    }
    const result = await response.json()
    return { sessionId: result.data.sessionId, pid: result.data.pid }
  }

  async sendInputHttp(sessionId: string, data: string): Promise<void> {
    const encoded = btoa(data)
    const response = await fetch(this.buildUrl(`/${sessionId}/input`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ data: encoded }),
    })
    if (!response.ok) {
      throw new Error("Failed to send terminal input")
    }
  }

  connectSse(
    sessionId: string,
    onEvent: (event: { type: string; data?: string; exitCode?: number }) => void,
    onError?: (error: Error, fatal?: boolean) => void,
  ): () => void {
    let eventSource: EventSource | null = null
    let retryCount = 0
    let retryTimeout: ReturnType<typeof setTimeout> | null = null
    let connectionTimeoutId: ReturnType<typeof setTimeout> | null = null
    let isClosed = false
    let hasDispatchedOpen = false
    let terminalExited = false

    const clearTimeouts = () => {
      if (retryTimeout) {
        clearTimeout(retryTimeout)
        retryTimeout = null
      }
      if (connectionTimeoutId) {
        clearTimeout(connectionTimeoutId)
        connectionTimeoutId = null
      }
    }

    const cleanup = () => {
      isClosed = true
      clearTimeouts()
      if (eventSource) {
        eventSource.close()
        eventSource = null
      }
    }

    const connect = () => {
      if (isClosed || terminalExited) return
      if (eventSource && eventSource.readyState !== EventSource.CLOSED) return

      hasDispatchedOpen = false
      eventSource = new EventSource(this.buildSseUrl(sessionId), { withCredentials: true })

      connectionTimeoutId = setTimeout(() => {
        if (!hasDispatchedOpen && eventSource?.readyState !== EventSource.OPEN) {
          eventSource?.close()
          handleError(new Error("Connection timeout"), false)
        }
      }, SSE_CONNECTION_TIMEOUT)

      eventSource.onopen = () => {
        if (hasDispatchedOpen) return
        hasDispatchedOpen = true
        retryCount = 0
        clearTimeouts()
        onEvent({ type: "connected" })
      }

      eventSource.addEventListener("data", (event: MessageEvent) => {
        onEvent({ type: "data", data: event.data })
      })

      eventSource.addEventListener("exit", (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data)
          onEvent({ type: "exit", exitCode: parsed.exitCode ?? 0 })
        } catch {
          onEvent({ type: "exit", exitCode: 0 })
        }
        terminalExited = true
        cleanup()
      })

      eventSource.onerror = () => {
        clearTimeouts()
        const isFatal = terminalExited || eventSource?.readyState === EventSource.CLOSED
        eventSource?.close()
        eventSource = null
        if (!terminalExited) {
          handleError(new Error("SSE connection error"), isFatal)
        }
      }
    }

    const handleError = (error: Error, isFatal: boolean) => {
      if (isClosed || terminalExited) return
      if (retryCount < SSE_MAX_RETRIES && !isFatal) {
        retryCount++
        const delay = Math.min(SSE_INITIAL_RETRY_DELAY * Math.pow(2, retryCount - 1), SSE_MAX_RETRY_DELAY)
        onEvent({ type: "reconnecting" })
        retryTimeout = setTimeout(() => {
          if (!isClosed && !terminalExited) connect()
        }, delay)
      } else {
        onError?.(error, true)
        cleanup()
      }
    }

    connect()
    return cleanup
  }

  connectInputWs(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return

    this.wsClosed = false
    this.ensureWsConnected()
  }

  private ensureWsConnected(): void {
    if (this.wsClosed) return
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return
    if (this.wsOpenPromise) return

    this.clearWsReconnectTimeout()

    const url = this.buildWsUrl()
    this.wsOpenPromise = new Promise<WebSocket | null>((resolve) => {
      let settled = false
      let connectTimeout: ReturnType<typeof setTimeout> | null = null

      const settle = (value: WebSocket | null) => {
        if (settled) return
        settled = true
        if (connectTimeout) {
          clearTimeout(connectTimeout)
          connectTimeout = null
        }
        this.wsOpenPromise = null
        resolve(value)
      }

      try {
        const socket = new WebSocket(url)
        socket.binaryType = "arraybuffer"

        socket.onopen = () => {
          this.ws = socket
          this.wsReconnectAttempt = 0
          this.startWsKeepalive()
          settle(socket)
        }

        socket.onmessage = (event) => {
          void this.handleWsMessage(event.data)
        }

        socket.onclose = () => {
          if (this.ws === socket) {
            this.ws = null
            this.boundSessionId = null
            this.stopWsKeepalive()
            if (!this.wsClosed) this.scheduleWsReconnect()
          }
          settle(null)
        }

        connectTimeout = setTimeout(() => {
          if (socket.readyState === WebSocket.CONNECTING) {
            socket.close()
            settle(null)
          }
        }, WS_CONNECT_TIMEOUT_MS)
      } catch {
        settle(null)
        if (!this.wsClosed) this.scheduleWsReconnect()
      }
    })
  }

  async sendInput(sessionId: string, data: string): Promise<boolean> {
    if (!sessionId || !data || this.wsClosed) return false

    const socket = await this.getOpenWs()
    if (!socket || socket.readyState !== WebSocket.OPEN) return false

    try {
      if (this.boundSessionId !== sessionId) {
        socket.send(this.encodeControlFrame({ t: "b", s: sessionId, v: 1 }))
        this.boundSessionId = sessionId
      }
      socket.send(data)
      return true
    } catch {
      this.handleWsFailure()
      return false
    }
  }

  unbindSession(sessionId: string): void {
    if (this.boundSessionId === sessionId) {
      this.boundSessionId = null
    }
  }

  disconnect(): void {
    this.wsClosed = true
    this.clearWsReconnectTimeout()
    this.resetWs()
  }

  private encodeControlFrame(payload: TerminalInputControlMessage): Uint8Array {
    const jsonBytes = textEncoder.encode(JSON.stringify(payload))
    const bytes = new Uint8Array(jsonBytes.length + 1)
    bytes[0] = CONTROL_TAG_JSON
    bytes.set(jsonBytes, 1)
    return bytes
  }

  private async handleWsMessage(messageData: unknown): Promise<void> {
    const bytes = await this.asUint8Array(messageData)
    if (!bytes || bytes.length < 2) return
    if (bytes[0] !== CONTROL_TAG_JSON) return

    try {
      const payload = JSON.parse(textDecoder.decode(bytes.subarray(1))) as TerminalInputControlMessage
      if (payload.t === "po") return
      if (payload.t === "e") {
        if (payload.s) this.boundSessionId = null
      }
    } catch {
      this.handleWsFailure()
    }
  }

  private async asUint8Array(messageData: unknown): Promise<Uint8Array | null> {
    if (messageData instanceof ArrayBuffer) return new Uint8Array(messageData)
    if (messageData instanceof Uint8Array) return messageData
    if (typeof Blob !== "undefined" && messageData instanceof Blob) {
      const buffer = await messageData.arrayBuffer()
      return new Uint8Array(buffer)
    }
    return null
  }

  private startWsKeepalive(): void {
    this.stopWsKeepalive()
    this.keepaliveInterval = setInterval(() => {
      if (this.wsClosed || !this.ws || this.ws.readyState !== WebSocket.OPEN) return
      try {
        this.ws.send(this.encodeControlFrame({ t: "p", v: 1 }))
      } catch {
        this.handleWsFailure()
      }
    }, WS_KEEPALIVE_INTERVAL_MS)
  }

  private stopWsKeepalive(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval)
      this.keepaliveInterval = null
    }
  }

  private scheduleWsReconnect(): void {
    if (this.wsClosed || this.wsReconnectTimeout) return
    const baseDelay = Math.min(
      WS_RECONNECT_INITIAL_DELAY_MS * Math.pow(2, this.wsReconnectAttempt),
      WS_RECONNECT_MAX_DELAY_MS,
    )
    const jitter = Math.floor(Math.random() * WS_RECONNECT_JITTER_MS)
    const delay = baseDelay + jitter
    this.wsReconnectTimeout = setTimeout(() => {
      this.wsReconnectTimeout = null
      this.wsReconnectAttempt++
      this.ensureWsConnected()
    }, delay)
  }

  private clearWsReconnectTimeout(): void {
    if (this.wsReconnectTimeout) {
      clearTimeout(this.wsReconnectTimeout)
      this.wsReconnectTimeout = null
    }
  }

  private async getOpenWs(waitMs = 1200): Promise<WebSocket | null> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return this.ws
    this.ensureWsConnected()
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return this.ws

    const opened = await Promise.race([
      this.wsOpenPromise ?? Promise.resolve(null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), waitMs)),
    ])
    if (opened && opened.readyState === WebSocket.OPEN) return opened
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return this.ws
    return null
  }

  private handleWsFailure(): void {
    this.boundSessionId = null
    this.resetWs()
    this.scheduleWsReconnect()
  }

  private resetWs(): void {
    this.wsOpenPromise = null
    this.stopWsKeepalive()
    if (this.ws) {
      const socket = this.ws
      this.ws = null
      socket.onopen = null
      socket.onmessage = null
      socket.onerror = null
      socket.onclose = null
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close()
      }
    }
    this.boundSessionId = null
  }
}

export function isCloudMode(server: ServerConnection.Any): boolean {
  return server.http.url.includes("/cloud/device/")
}
