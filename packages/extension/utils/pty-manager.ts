import { getOpenCodePort } from "./opencode-status"

export interface PtySession {
  id: string
  title: string
  command: string
  args: string[]
  cwd: string
  status: "running" | "exited"
  pid: number
}

function getBaseUrl(): string {
  const port = getOpenCodePort()
  return `http://localhost:${port}`
}

export async function listPtySessions(): Promise<PtySession[]> {
  try {
    const response = await fetch(`${getBaseUrl()}/pty`)
    if (!response.ok) return []
    return await response.json()
  } catch {
    return []
  }
}

export async function findOpenChamberSession(): Promise<PtySession | undefined> {
  const sessions = await listPtySessions()
  return sessions.find(
    (s) => s.status === "running" && (s.command === "openchamber" || s.title.toLowerCase().includes("openchamber")),
  )
}

export async function createPtySession(
  command: string,
  args: string[],
  title: string,
): Promise<PtySession | undefined> {
  try {
    const response = await fetch(`${getBaseUrl()}/pty`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, args, title }),
    })
    if (!response.ok) return undefined
    return await response.json()
  } catch {
    return undefined
  }
}

export async function killPtySession(sessionId: string): Promise<boolean> {
  try {
    const response = await fetch(`${getBaseUrl()}/pty/${sessionId}`, {
      method: "DELETE",
    })
    return response.ok
  } catch {
    return false
  }
}

export async function restartOpenChamberSession(args: string[]): Promise<PtySession | undefined> {
  const session = await findOpenChamberSession()
  if (session) await killPtySession(session.id)
  return createPtySession("openchamber", args, "OpenChamber")
}

export async function killOpenChamberSession(): Promise<boolean> {
  const session = await findOpenChamberSession()
  if (!session) return false
  return killPtySession(session.id)
}
