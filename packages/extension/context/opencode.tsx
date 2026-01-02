import {
  createContext,
  useContext,
  createSignal,
  createEffect,
  onCleanup,
  type ParentComponent,
  type Accessor,
} from "solid-js"
import { createStore, produce } from "solid-js/store"
import {
  createOpencodeClient,
  type OpencodeClient,
  type Session,
  type Message,
  type Part,
  type SessionStatus,
  type Agent,
  type Provider,
} from "../utils/opencode-api"
import { connectToEvents, type EventConnection, type OpenCodeEvent } from "../utils/opencode-events"

export interface MessageWithParts {
  info: Message
  parts: Part[]
}

export interface OpenCodeState {
  sessions: Session[]
  messages: Record<string, MessageWithParts[]>
  parts: Record<string, Part[]>
  status: Record<string, SessionStatus>
  agents: Agent[]
  providers: Provider[]
}

export interface OpenCodeContextValue {
  client: OpencodeClient
  state: OpenCodeState
  isConnected: Accessor<boolean>
  error: Accessor<string | undefined>
  clearError: () => void
  currentSessionId: Accessor<string | undefined>
  setCurrentSessionId: (id: string | undefined) => void
  currentSession: Accessor<Session | undefined>
  currentMessages: Accessor<MessageWithParts[]>
  currentStatus: Accessor<SessionStatus>
  refresh: () => Promise<void>
  createSession: (title?: string) => Promise<Session | undefined>
  sendMessage: (
    text: string,
    agent: string,
    model: { providerID: string; modelID: string },
    parts?: Array<{ type: "text"; text: string } | { type: "file"; url: string; filename: string }>,
  ) => Promise<void>
  abort: () => Promise<void>
}

const OpenCodeContext = createContext<OpenCodeContextValue>()

export function useOpenCode(): OpenCodeContextValue {
  const ctx = useContext(OpenCodeContext)
  if (!ctx) throw new Error("useOpenCode must be used within OpenCodeProvider")
  return ctx
}

export interface OpenCodeProviderProps {
  port: number
  directory?: string
}

export const OpenCodeProvider: ParentComponent<OpenCodeProviderProps> = (props) => {
  const client = createOpencodeClient(props.port, props.directory)

  const [isConnected, setIsConnected] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>()
  const [currentSessionId, setCurrentSessionId] = createSignal<string | undefined>()

  const [state, setState] = createStore<OpenCodeState>({
    sessions: [],
    messages: {},
    parts: {},
    status: {},
    agents: [],
    providers: [],
  })

  let eventConnection: EventConnection | undefined

  const clearError = () => setError(undefined)

  async function refresh() {
    try {
      const [sessions, agents, providers] = await Promise.all([
        client.session.list(),
        client.agent.list(),
        client.provider.list(),
      ])

      setState({
        sessions: Array.isArray(sessions) ? sessions.sort((a, b) => b.time.updated - a.time.updated) : [],
        agents: Array.isArray(agents) ? agents : [],
        providers: Array.isArray(providers) ? providers : [],
      })

      const sessionId = currentSessionId()
      if (sessionId) {
        await loadSessionMessages(sessionId)
      }
    } catch (err) {
      console.error("[OpenCode] refresh failed:", err)
      setError(err instanceof Error ? err.message : "Failed to refresh")
    }
  }

  async function loadSessionMessages(sessionId: string) {
    try {
      const messages = await client.session.messages(sessionId)
      setState(
        produce((draft) => {
          draft.messages[sessionId] = messages
          for (const msg of messages) {
            draft.parts[msg.info.id] = msg.parts
          }
        }),
      )
    } catch (err) {
      console.error("[OpenCode] loadSessionMessages failed:", err)
    }
  }

  function handleEvent(event: OpenCodeEvent) {
    switch (event.type) {
      case "server.connected":
        setIsConnected(true)
        clearError()
        refresh()
        break

      case "session.created":
        setState(
          produce((draft) => {
            draft.sessions.unshift(event.properties.session)
          }),
        )
        break

      case "session.updated":
        setState(
          produce((draft) => {
            const idx = draft.sessions.findIndex((s) => s.id === event.properties.session.id)
            if (idx >= 0) {
              draft.sessions[idx] = event.properties.session
            }
          }),
        )
        break

      case "session.deleted":
        setState(
          produce((draft) => {
            draft.sessions = draft.sessions.filter((s) => s.id !== event.properties.sessionID)
            delete draft.messages[event.properties.sessionID]
            delete draft.status[event.properties.sessionID]
          }),
        )
        break

      case "message.created": {
        const sessionId = currentSessionId()
        if (!sessionId) break
        setState(
          produce((draft) => {
            if (!draft.messages[sessionId]) draft.messages[sessionId] = []
            draft.messages[sessionId].push({
              info: event.properties.info,
              parts: event.properties.parts,
            })
            draft.parts[event.properties.info.id] = event.properties.parts
          }),
        )
        break
      }

      case "message.updated": {
        const sessionId = currentSessionId()
        if (!sessionId) break
        setState(
          produce((draft) => {
            const messages = draft.messages[sessionId]
            if (!messages) return
            const idx = messages.findIndex((m) => m.info.id === event.properties.info.id)
            if (idx >= 0) {
              messages[idx].info = event.properties.info
            }
          }),
        )
        break
      }

      case "message.part.updated": {
        const sessionId = currentSessionId()
        if (!sessionId) break
        setState(
          produce((draft) => {
            const messages = draft.messages[sessionId]
            if (!messages) return
            for (const msg of messages) {
              const partIdx = msg.parts.findIndex((p) => p.id === event.properties.part.id)
              if (partIdx >= 0) {
                msg.parts[partIdx] = event.properties.part
                break
              }
            }
            for (const msgId in draft.parts) {
              const parts = draft.parts[msgId]
              const idx = parts.findIndex((p) => p.id === event.properties.part.id)
              if (idx >= 0) {
                parts[idx] = event.properties.part
                break
              }
            }
          }),
        )
        break
      }

      case "session.status":
        setState(
          produce((draft) => {
            draft.status[event.properties.sessionID] = event.properties.status
          }),
        )
        break

      case "instance.disposed":
        setIsConnected(false)
        break
    }
  }

  createEffect(() => {
    eventConnection = connectToEvents(props.port, props.directory, {
      onEvent: handleEvent,
      onConnect: () => {
        setIsConnected(true)
        clearError()
        refresh()
      },
      onDisconnect: () => setIsConnected(false),
      onError: (err) => {
        console.error("[OpenCode] SSE error:", err)
        setError(err instanceof Error ? err.message : "Connection error")
      },
    })

    onCleanup(() => {
      eventConnection?.close()
    })
  })

  createEffect(() => {
    const sessionId = currentSessionId()
    if (sessionId && isConnected()) {
      loadSessionMessages(sessionId)
    }
  })

  const currentSession = () => {
    const id = currentSessionId()
    return id ? state.sessions.find((s) => s.id === id) : undefined
  }

  const currentMessages = () => {
    const id = currentSessionId()
    return id ? (state.messages[id] ?? []) : []
  }

  const currentStatus = (): SessionStatus => {
    const id = currentSessionId()
    return id ? (state.status[id] ?? { type: "idle" }) : { type: "idle" }
  }

  async function createSession(title?: string): Promise<Session | undefined> {
    try {
      const session = await client.session.create(title)
      setState(
        produce((draft) => {
          draft.sessions.unshift(session)
        }),
      )
      setCurrentSessionId(session.id)
      return session
    } catch (err) {
      console.error("[OpenCode] createSession failed:", err)
      setError(err instanceof Error ? err.message : "Failed to create session")
      return undefined
    }
  }

  async function sendMessage(
    text: string,
    agent: string,
    model: { providerID: string; modelID: string },
    parts?: Array<{ type: "text"; text: string } | { type: "file"; url: string; filename: string }>,
  ) {
    try {
      let sessionId = currentSessionId()

      if (!sessionId) {
        const session = await createSession()
        if (!session) return
        sessionId = session.id
      }

      const partsToSend = parts || [{ type: "text", text }]

      await client.session.prompt(sessionId, {
        agent,
        model,
        parts: partsToSend,
      })
    } catch (err) {
      console.error("[OpenCode] sendMessage failed:", err)
      setError(err instanceof Error ? err.message : "Failed to send message")
    }
  }

  async function abort() {
    try {
      const sessionId = currentSessionId()
      if (sessionId) {
        await client.session.abort(sessionId)
      }
    } catch (err) {
      console.error("[OpenCode] abort failed:", err)
    }
  }

  const value: OpenCodeContextValue = {
    client,
    state,
    isConnected,
    error,
    clearError,
    currentSessionId,
    setCurrentSessionId,
    currentSession,
    currentMessages,
    currentStatus,
    refresh,
    createSession,
    sendMessage,
    abort,
  }

  return <OpenCodeContext.Provider value={value}>{props.children}</OpenCodeContext.Provider>
}
