import { checkNoCorsReachable } from "./reachability"
import { getSettingsFromLocalStorage, saveSettingsToLocalStorage } from "./platform-storage"

/**
 * CloudCLI Status Utility
 * Checks if CloudCLI (Claude Code web UI) server is running and handles connection state
 *
 * CloudCLI is the web UI for Claude Code CLI (siteboon/claudecodeui)
 * Default command: npx @siteboon/claude-code-ui
 * Default port: 3001
 */

const DEFAULT_CLOUDCLI_PORT = 3001
const CLOUDCLI_CHECK_TIMEOUT = 2000 // 2 seconds

export type CloudCLIConnectionMode = "local" | "remote"

/**
 * Get CloudCLI connection mode (local port vs remote URL)
 */
export function getCloudCLIConnectionMode(): CloudCLIConnectionMode {
  const settings = getSettingsFromLocalStorage()
  return settings.cloudcliConnectionMode || "local"
}

/**
 * Set CloudCLI connection mode
 */
export function setCloudCLIConnectionMode(mode: CloudCLIConnectionMode): void {
  const settings = getSettingsFromLocalStorage()
  saveSettingsToLocalStorage({ ...settings, cloudcliConnectionMode: mode })
}

/**
 * Get current configured CloudCLI port (for local mode)
 */
export function getCloudCLIPort(): number {
  const settings = getSettingsFromLocalStorage()
  return settings.cloudcliPort || DEFAULT_CLOUDCLI_PORT
}

/**
 * Save CloudCLI port
 */
export function saveCloudCLIPort(port: number): void {
  const settings = getSettingsFromLocalStorage()
  saveSettingsToLocalStorage({ ...settings, cloudcliPort: port })
}

/**
 * Get CloudCLI remote URL (for remote mode)
 */
export function getCloudCLIRemoteUrl(): string {
  const settings = getSettingsFromLocalStorage()
  return settings.cloudcliRemoteUrl || ""
}

/**
 * Set CloudCLI remote URL
 */
export function setCloudCLIRemoteUrl(url: string): void {
  const settings = getSettingsFromLocalStorage()
  saveSettingsToLocalStorage({ ...settings, cloudcliRemoteUrl: url })
}

/**
 * Get the full CloudCLI URL for iframe embedding
 */
export function getCloudCLIUrl(): string {
  if (getCloudCLIConnectionMode() === "remote") {
    return getCloudCLIRemoteUrl()
  }
  return `http://localhost:${getCloudCLIPort()}`
}

/**
 * Check if a specific port has CloudCLI running
 */
async function checkCloudCLIPort(port: number): Promise<boolean> {
  return checkNoCorsReachable(`http://localhost:${port}`, CLOUDCLI_CHECK_TIMEOUT)
}

/**
 * Check if CloudCLI server is reachable
 */
export async function checkCloudCLIStatus(): Promise<boolean> {
  const mode = getCloudCLIConnectionMode()

  if (mode === "remote") {
    const remoteUrl = getCloudCLIRemoteUrl()
    if (!remoteUrl) return false

    return checkNoCorsReachable(remoteUrl, CLOUDCLI_CHECK_TIMEOUT)
  }

  // Local mode: check configured port
  const port = getCloudCLIPort()
  return checkCloudCLIPort(port)
}

/**
 * Retry CloudCLI connection with delays between attempts
 */
export async function retryCloudCLIConnection(
  maxRetries: number,
  onAttempt?: (attempt: number) => void,
): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    onAttempt?.(i + 1)

    if (await checkCloudCLIStatus()) {
      return true
    }

    // Wait before next retry (500ms, 1000ms, 1500ms)
    if (i < maxRetries - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)))
    }
  }

  return false
}

/**
 * Get the command to start CloudCLI
 * If a workspace path is configured, includes cd to that directory
 */
export function getCloudCLIStartCommand(includeWorkspace = true): string {
  const settings = getSettingsFromLocalStorage()
  const port = getCloudCLIPort()

  let baseCmd = "npx @siteboon/claude-code-ui"
  if (port !== DEFAULT_CLOUDCLI_PORT) {
    baseCmd = `npx @siteboon/claude-code-ui --port ${port}`
  }

  if (includeWorkspace && settings.workspacePath) {
    return `mkdir -p ${settings.workspacePath} && cd ${settings.workspacePath} && ${baseCmd}`
  }

  return baseCmd
}

export type InstallCommand = { label: string; command: string }

function isWindows(): boolean {
  return navigator.platform?.startsWith("Win") || navigator.userAgent?.includes("Windows")
}

export function getClaudeCodeInstallCommands(): InstallCommand[] {
  if (isWindows()) {
    return [
      { label: "PowerShell", command: "irm https://claude.ai/install.ps1 | iex" },
      { label: "WSL / Bash", command: "curl -fsSL https://claude.ai/install.sh | bash" },
    ]
  }
  return [{ label: "Terminal", command: "curl -fsSL https://claude.ai/install.sh | bash" }]
}
