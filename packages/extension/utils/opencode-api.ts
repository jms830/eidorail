export interface Session {
  id: string
  title: string
  time: {
    created: number
    updated: number
  }
  summary?: {
    title?: string
    body?: string
    files?: number
  }
}

export interface Message {
  id: string
  role: "user" | "assistant"
  parentID?: string
  time: {
    created: number
    updated: number
  }
  error?: {
    code: string
    data?: { message?: string }
  }
  summary?: {
    title?: string
    body?: string
    diffs?: Array<{
      file: string
      before: string
      after: string
      additions: number
      deletions: number
    }>
  }
  input?: { text: string }
  providerID?: string
  modelID?: string
  cost?: number
  tokens?: {
    input: number
    output: number
    reasoning: number
    cache: { read: number; write: number }
  }
}

export interface Part {
  id: string
  type: "text" | "tool" | "reasoning" | "file"
  text?: string
  synthetic?: boolean
  tool?: string
  state?: {
    status: "pending" | "running" | "completed" | "error"
    input?: Record<string, unknown>
    output?: string
    error?: string
    metadata?: Record<string, unknown>
  }
}

export interface Agent {
  name: string
  description?: string
  model?: {
    providerID: string
    modelID: string
  }
  mode?: "primary" | "subagent" | "all"
}

export interface Provider {
  id: string
  name: string
  models: Record<string, Model>
}

export interface Model {
  id: string
  name: string
  limit?: { context?: number }
  cost?: { input?: number; output?: number }
}

export interface SessionStatus {
  type: "idle" | "running" | "tool" | "generating"
  tool?: string
}

export interface Config {
  model?: string
}

export interface OpencodeClient {
  baseUrl: string
  directory?: string

  // Session APIs
  session: {
    list(): Promise<Session[]>
    get(id: string): Promise<Session>
    create(title?: string): Promise<Session>
    messages(id: string): Promise<Array<{ info: Message; parts: Part[] }>>
    prompt(
      id: string,
      opts: {
        agent: string
        model: { providerID: string; modelID: string }
        parts: Array<{ type: "text"; text: string } | { type: "file"; url: string; filename: string }>
      },
    ): Promise<void>
    abort(id: string): Promise<void>
  }

  // Config APIs
  config: {
    get(): Promise<Config>
  }

  // Provider APIs
  provider: {
    list(): Promise<Provider[]>
  }

  // Agent APIs
  agent: {
    list(): Promise<Agent[]>
  }
}

export function createOpencodeClient(port: number, directory?: string): OpencodeClient {
  const baseUrl = `http://localhost:${port}`

  const headers = (): HeadersInit => {
    const h: HeadersInit = { "Content-Type": "application/json" }
    if (directory) h["x-opencode-directory"] = directory
    return h
  }

  const get = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${baseUrl}${path}`, { headers: headers() })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
  }

  const post = async <T>(path: string, body?: unknown): Promise<T> => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
  }

  return {
    baseUrl,
    directory,

    session: {
      async list() {
        return get<Session[]>("/session")
      },
      async get(id) {
        return get<Session>(`/session/${id}`)
      },
      async create(title) {
        return post<Session>("/session", title ? { title } : undefined)
      },
      async messages(id) {
        return get<Array<{ info: Message; parts: Part[] }>>(`/session/${id}/message?limit=100`)
      },
      async prompt(id, opts) {
        await post(`/session/${id}/message`, opts)
      },
      async abort(id) {
        await post(`/session/${id}/abort`)
      },
    },

    config: {
      async get() {
        return get<Config>("/config")
      },
    },

    provider: {
      async list() {
        return get<Provider[]>("/provider")
      },
    },

    agent: {
      async list() {
        return get<Agent[]>("/agent")
      },
    },
  }
}
