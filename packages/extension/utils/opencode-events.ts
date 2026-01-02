// SSE event handler for OpenCode real-time updates
// Handles streaming responses and state synchronization

import type { Message, Part, Session, SessionStatus } from "./opencode-api"

export type OpenCodeEvent =
  | { type: "server.connected"; properties: Record<string, never> }
  | { type: "session.created"; properties: { session: Session } }
  | { type: "session.updated"; properties: { session: Session } }
  | { type: "session.deleted"; properties: { sessionID: string } }
  | { type: "message.created"; properties: { info: Message; parts: Part[] } }
  | { type: "message.updated"; properties: { info: Message } }
  | { type: "message.part.updated"; properties: { part: Part } }
  | { type: "session.status"; properties: { sessionID: string; status: SessionStatus } }
  | { type: "provider.updated"; properties: Record<string, unknown> }
  | { type: "config.updated"; properties: Record<string, unknown> }
  | { type: "instance.disposed"; properties: Record<string, never> }

export interface EventHandler {
  onEvent: (event: OpenCodeEvent) => void
  onError?: (error: Error) => void
  onConnect?: () => void
  onDisconnect?: () => void
}

export interface EventConnection {
  close: () => void
  readonly connected: boolean
}

export function connectToEvents(port: number, directory: string | undefined, handler: EventHandler): EventConnection {
  let eventSource: EventSource | null = null
  let connected = false
  let reconnectAttempts = 0
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

  const connect = () => {
    const url = new URL(`http://localhost:${port}/event`)
    if (directory) {
      url.searchParams.set("directory", directory)
    }

    eventSource = new EventSource(url.toString())

    eventSource.onopen = () => {
      connected = true
      reconnectAttempts = 0
      handler.onConnect?.()
    }

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as OpenCodeEvent
        handler.onEvent(data)

        // Handle server disposal
        if (data.type === "instance.disposed") {
          close()
        }
      } catch (err) {
        handler.onError?.(err instanceof Error ? err : new Error(String(err)))
      }
    }

    eventSource.onerror = () => {
      connected = false
      handler.onDisconnect?.()

      // Attempt reconnection with exponential backoff
      if (reconnectAttempts < 5) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)
        reconnectTimeout = setTimeout(() => {
          reconnectAttempts++
          connect()
        }, delay)
      } else {
        handler.onError?.(new Error("Max reconnection attempts reached"))
      }
    }
  }

  const close = () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    connected = false
  }

  // Initial connection
  connect()

  return {
    close,
    get connected() {
      return connected
    },
  }
}

// Helper to create a reactive event store for SolidJS
export function createEventStore() {
  const listeners = new Set<(event: OpenCodeEvent) => void>()

  return {
    subscribe(listener: (event: OpenCodeEvent) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit(event: OpenCodeEvent) {
      listeners.forEach((l) => l(event))
    },
  }
}
