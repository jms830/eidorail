import { createSignal, For, Show, onMount } from "solid-js"
import {
  type Platform,
  type OpenCodeStatus,
  DEFAULT_PLATFORMS,
  PRESET_PLATFORMS,
  getIcon,
  loadPlatforms,
  savePlatformsToStorage,
} from "../utils/shared"
import {
  checkOpenCodeStatus,
  retryConnection,
  getOpenCodeUrl,
  getConnectionMode,
  setConnectionMode,
  getOpenCodePort,
  saveOpenCodePort,
  getRemoteUrl,
  setRemoteUrl,
  manualPortScan,
  isWorkspaceEnabled,
  setWorkspaceEnabled,
  getWorkspaceDirectory,
  setWorkspaceDirectory,
  type ConnectionMode,
} from "../utils/opencode-status"
import {
  getOpenChamberPort,
  saveOpenChamberPort,
  getOpenChamberConnectionMode,
  setOpenChamberConnectionMode,
  getOpenChamberRemoteUrl,
  setOpenChamberRemoteUrl,
  getOpenChamberTryCfTunnel,
  setOpenChamberTryCfTunnel,
  getOpenChamberExtraArgs,
  setOpenChamberExtraArgs,
  checkOpenChamberStatus,
  retryOpenChamberConnection,
  type OpenChamberConnectionMode,
} from "../utils/openchamber-status"
import { findOpenChamberSession, restartOpenChamberSession, killPtySession } from "../utils/pty-manager"

interface SettingsPanelProps {
  isModal?: boolean
  inlineMode?: boolean
  onClose?: () => void
  onPlatformsChange?: (platforms: Platform[]) => void
  onConnectionReady?: () => void
}

export function SettingsPanel(props: SettingsPanelProps) {
  const [platforms, setPlatforms] = createSignal<Platform[]>(loadPlatforms())
  const [settingsTab, setSettingsTab] = createSignal(props.inlineMode ? "connection" : "platforms")
  const [showToast, setShowToast] = createSignal(false)
  const [toastMessage, setToastMessage] = createSignal("Settings saved")
  const [customPlatformName, setCustomPlatformName] = createSignal("")
  const [customPlatformUrl, setCustomPlatformUrl] = createSignal("")
  const [workspaceEnabled, setWorkspaceEnabledState] = createSignal(isWorkspaceEnabled())
  const [workspaceRoot, setWorkspaceRoot] = createSignal(getWorkspaceDirectory())

  const [openCodeStatus, setOpenCodeStatus] = createSignal<OpenCodeStatus>("checking")
  const [connectionMode, setConnectionModeState] = createSignal<ConnectionMode>(getConnectionMode())
  const [localPort, setLocalPort] = createSignal(String(getOpenCodePort()))
  const [remoteUrl, setRemoteUrlState] = createSignal(getRemoteUrl())
  const [isScanning, setIsScanning] = createSignal(false)
  const [scanResult, setScanResult] = createSignal<string | null>(null)

  const [openChamberMode, setOpenChamberMode] = createSignal<OpenChamberConnectionMode>(getOpenChamberConnectionMode())
  const [openChamberPort, setOpenChamberPortState] = createSignal(String(getOpenChamberPort()))
  const [openChamberUrl, setOpenChamberUrlState] = createSignal(getOpenChamberRemoteUrl())
  const [openChamberTryCfTunnel, setOpenChamberTryCfTunnelState] = createSignal(getOpenChamberTryCfTunnel())
  const [openChamberExtraArgs, setOpenChamberExtraArgsState] = createSignal(getOpenChamberExtraArgs())
  const [openChamberStatus, setOpenChamberStatus] = createSignal<OpenCodeStatus>("checking")

  async function checkBothServices() {
    const [ocodeOk, ochamberOk] = await Promise.all([checkOpenCodeStatus(), checkOpenChamberStatus()])
    setOpenCodeStatus(ocodeOk ? "connected" : "disconnected")
    setOpenChamberStatus(ochamberOk ? "connected" : "disconnected")
  }

  onMount(() => {
    checkBothServices()
  })

  function triggerToast(message: string) {
    setToastMessage(message)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 2000)
  }

  function savePlatforms(p: Platform[]) {
    savePlatformsToStorage(p)
    setPlatforms(p)
    props.onPlatformsChange?.(p)
  }

  function previewOpenChamberCommand() {
    const base = `openchamber --port ${openChamberPort().trim() || String(getOpenChamberPort())}`
    const maybeTunnel = openChamberTryCfTunnel() ? "--try-cf-tunnel" : ""
    const extra = openChamberExtraArgs().trim()
    return [base, maybeTunnel, extra].filter(Boolean).join(" ")
  }

  function getOpenChamberArgs(): string[] {
    const args = ["--port", openChamberPort().trim() || String(getOpenChamberPort())]
    if (openChamberTryCfTunnel()) args.push("--try-cf-tunnel")
    const extra = openChamberExtraArgs().trim()
    if (extra) args.push(...extra.split(/\s+/))
    return args
  }

  type StartupState = "idle" | "starting" | "waiting" | "success" | "failed" | "stopping"

  const PORT_MIN = 1
  const PORT_MAX_EXCLUSIVE = 65536

  const OPENCODE_RETRY_ATTEMPTS = 3
  const OPENCHAMBER_EXISTING_SESSION_ATTEMPTS = 5
  const OPENCHAMBER_START_ATTEMPTS = 10
  const OPENCHAMBER_RESTART_DELAY_MS = 500

  const [startupState, setStartupState] = createSignal<StartupState>("idle")
  const [startupProgress, setStartupProgress] = createSignal(0)
  const [chamberSessionId, setChamberSessionId] = createSignal<string | null>(null)

  async function waitForOpenChamber(maxAttempts: number): Promise<boolean> {
    setStartupProgress(0)
    return retryOpenChamberConnection(maxAttempts, (attempt) => {
      setStartupProgress(Math.round((attempt / maxAttempts) * 100))
    })
  }

  async function startOpenChamberViaPty() {
    if (openCodeStatus() !== "connected") {
      triggerToast("Start OpenCode first!")
      return
    }

    setStartupState("starting")
    setStartupProgress(0)

    const existingSession = await findOpenChamberSession()
    if (existingSession) {
      setChamberSessionId(existingSession.id)
      setStartupState("waiting")
      const connected = await waitForOpenChamber(OPENCHAMBER_EXISTING_SESSION_ATTEMPTS)
      if (connected) {
        setStartupState("success")
        setOpenChamberStatus("connected")
        triggerToast("OpenChamber already running!")
        return
      }
    }

    const session = await restartOpenChamberSession(getOpenChamberArgs())

    if (!session) {
      setStartupState("failed")
      triggerToast("Failed to start - is openchamber installed?")
      return
    }

    setChamberSessionId(session.id)
    setStartupState("waiting")
    const connected = await waitForOpenChamber(OPENCHAMBER_START_ATTEMPTS)

    if (connected) {
      setStartupState("success")
      setOpenChamberStatus("connected")
      triggerToast("OpenChamber is ready!")
    } else {
      setStartupState("failed")
      triggerToast("Timed out - try clicking Check Connection")
    }
  }

  async function stopOpenChamber() {
    setStartupState("stopping")
    const sessionId = chamberSessionId()

    if (sessionId) {
      await killPtySession(sessionId)
    } else {
      const session = await findOpenChamberSession()
      if (session) {
        await killPtySession(session.id)
      }
    }

    setChamberSessionId(null)
    setOpenChamberStatus("disconnected")
    setStartupState("idle")
    triggerToast("OpenChamber stopped")
    await checkBothServices()
  }

  async function restartOpenChamber() {
    await stopOpenChamber()
    await new Promise((r) => setTimeout(r, OPENCHAMBER_RESTART_DELAY_MS))
    await startOpenChamberViaPty()
  }

  function getStartupMessage(): string {
    const state = startupState()
    const progress = startupProgress()
    if (state === "starting") return "Launching OpenChamber..."
    if (state === "waiting") return `Waiting for server... ${progress}%`
    if (state === "stopping") return "Stopping..."
    if (state === "success") return "Ready!"
    if (state === "failed") return "Start OpenChamber"
    return "Start OpenChamber"
  }

  function isStartingChamber(): boolean {
    const state = startupState()
    return state === "starting" || state === "waiting" || state === "stopping"
  }

  async function saveConnectionSettings() {
    setConnectionMode(connectionMode())

    if (connectionMode() === "remote") {
      setRemoteUrl(remoteUrl())
    }

    if (connectionMode() === "local") {
      const port = parseInt(localPort(), 10)
      if (!isNaN(port) && port >= PORT_MIN && port < PORT_MAX_EXCLUSIVE) {
        saveOpenCodePort(port)
      }
    }

    setOpenChamberConnectionMode(openChamberMode())

    if (openChamberMode() === "remote") {
      setOpenChamberRemoteUrl(openChamberUrl())
    }

    if (openChamberMode() === "local") {
      const port = parseInt(openChamberPort(), 10)
      if (!isNaN(port) && port >= PORT_MIN && port < PORT_MAX_EXCLUSIVE) {
        saveOpenChamberPort(port)
      }
    }

    setOpenChamberTryCfTunnel(openChamberTryCfTunnel())
    setOpenChamberExtraArgs(openChamberExtraArgs())

    updateOpenCodeUrl()
    await handleRetry()
    triggerToast("Connection settings saved")
  }

  function updateOpenCodeUrl() {
    const url = getOpenCodeUrl()
    const updated = platforms().map((p) => (p.id === "opencode" ? { ...p, url } : p))
    savePlatforms(updated)
  }

  async function handlePortScan() {
    setIsScanning(true)
    setScanResult(null)
    const foundPort = await manualPortScan()
    setIsScanning(false)
    if (foundPort) {
      setLocalPort(String(foundPort))
      setScanResult(`Found OpenCode on port ${foundPort}`)
    } else {
      setScanResult("No OpenCode server found")
    }
  }

  async function handleRetry() {
    const connected = await retryConnection(OPENCODE_RETRY_ATTEMPTS, () => {})
    if (connected) {
      setOpenCodeStatus("connected")
    }
  }

  function togglePlatformVisibility(platformId: string) {
    const updated = platforms().map((p) => (p.id === platformId ? { ...p, isVisible: !p.isVisible } : p))
    savePlatforms(updated)
  }

  function removePlatform(platformId: string) {
    const platform = platforms().find((p) => p.id === platformId)
    if (platform?.isBuiltIn) return
    const updated = platforms().filter((p) => p.id !== platformId)
    savePlatforms(updated)
  }

  function movePlatform(platformId: string, direction: number) {
    const sorted = [...platforms()].sort((a, b) => a.order - b.order)
    const currentIndex = sorted.findIndex((p) => p.id === platformId)
    const newIndex = currentIndex + direction
    if (newIndex < 0 || newIndex >= sorted.length) return
    const temp = sorted[currentIndex].order
    sorted[currentIndex].order = sorted[newIndex].order
    sorted[newIndex].order = temp
    savePlatforms(sorted)
  }

  function addPresetPlatform(presetId: string) {
    const preset = PRESET_PLATFORMS.find((p) => p.id === presetId)
    if (!preset) return
    if (platforms().some((p) => p.id === presetId)) return
    const maxOrder = Math.max(...platforms().map((p) => p.order), 0)
    const newPlatform: Platform = {
      ...preset,
      isVisible: true,
      order: maxOrder + 1,
    }
    savePlatforms([...platforms(), newPlatform])
  }

  function addCustomPlatform() {
    const name = customPlatformName().trim()
    let url = customPlatformUrl().trim()
    if (!name || !url) return
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url
    }
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        alert("URL must use http or https protocol")
        return
      }
    } catch {
      alert("Please enter a valid URL")
      return
    }
    const id = "custom-" + Date.now()
    const maxOrder = Math.max(...platforms().map((p) => p.order), 0)
    const newPlatform: Platform = {
      id,
      name,
      url,
      icon: id,
      isBuiltIn: false,
      isVisible: true,
      order: maxOrder + 1,
    }
    savePlatforms([...platforms(), newPlatform])
    setCustomPlatformName("")
    setCustomPlatformUrl("")
  }

  function restoreDefaults() {
    if (confirm("Restore default platforms? Custom platforms will be removed.")) {
      savePlatforms([...DEFAULT_PLATFORMS])
    }
  }

  const availablePresets = () => {
    const existingIds = new Set(platforms().map((p) => p.id))
    return PRESET_PLATFORMS.filter((p) => !existingIds.has(p.id))
  }

  const content = (
    <>
      <Show when={!props.inlineMode}>
        <div class="settings-tabs">
          <button
            class={`settings-tab ${settingsTab() === "platforms" ? "active" : ""}`}
            onClick={() => setSettingsTab("platforms")}
            title="Platforms"
          >
            <span innerHTML={getIcon("apps")} />
            <span class="settings-tab-label">Platforms</span>
          </button>
          <button
            class={`settings-tab ${settingsTab() === "connection" ? "active" : ""}`}
            onClick={() => setSettingsTab("connection")}
            title="Connection"
          >
            <span innerHTML={getIcon("plug")} />
            <span class="settings-tab-label">Connection</span>
          </button>
          <button
            class={`settings-tab ${settingsTab() === "display" ? "active" : ""}`}
            onClick={() => setSettingsTab("display")}
            title="Display"
          >
            <span innerHTML={getIcon("monitor")} />
            <span class="settings-tab-label">Display</span>
          </button>
          <button
            class={`settings-tab ${settingsTab() === "about" ? "active" : ""}`}
            onClick={() => setSettingsTab("about")}
            title="About"
          >
            <span innerHTML={getIcon("info")} />
            <span class="settings-tab-label">About</span>
          </button>
        </div>
      </Show>

      <div class="modal-content">
        <div class="tab-content">
          <Show when={settingsTab() === "platforms"}>
            <div class="settings-section">
              <h3>Active Platforms</h3>
              <div class="platform-list">
                <For each={platforms().sort((a, b) => a.order - b.order)}>
                  {(platform) => (
                    <div class={`platform-item ${platform.isVisible ? "" : "hidden-platform"}`}>
                      <div class="platform-reorder">
                        <button
                          class="reorder-btn"
                          onClick={() => movePlatform(platform.id, -1)}
                          disabled={platform.order === 0}
                        >
                          <span innerHTML={getIcon("chevronUp")} />
                        </button>
                        <button class="reorder-btn" onClick={() => movePlatform(platform.id, 1)}>
                          <span innerHTML={getIcon("chevronDown")} />
                        </button>
                      </div>
                      <span class="platform-item-icon" innerHTML={getIcon(platform.icon, platform.name)} />
                      <div class="platform-item-info">
                        <span class="platform-item-name">{platform.name}</span>
                        <span class="platform-item-url">{platform.url || "Built-in"}</span>
                      </div>
                      <div class="platform-item-actions">
                        <button
                          class="platform-action-btn"
                          onClick={() => togglePlatformVisibility(platform.id)}
                          title={platform.isVisible ? "Hide" : "Show"}
                        >
                          <span innerHTML={getIcon(platform.isVisible ? "eye" : "eyeOff")} />
                        </button>
                        <Show when={!platform.isBuiltIn}>
                          <button
                            class="platform-action-btn danger"
                            onClick={() => removePlatform(platform.id)}
                            title="Remove"
                          >
                            <span innerHTML={getIcon("trash")} />
                          </button>
                        </Show>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>

            <Show when={availablePresets().length > 0}>
              <div class="settings-section">
                <h3>Add Platform</h3>
                <div class="preset-grid">
                  <For each={availablePresets()}>
                    {(preset) => (
                      <button class="preset-btn" onClick={() => addPresetPlatform(preset.id)}>
                        <span class="preset-icon" innerHTML={getIcon(preset.icon)} />
                        <span class="preset-name">{preset.name}</span>
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <div class="settings-section">
              <h3>Add Custom Platform</h3>
              <div class="custom-form">
                <input
                  type="text"
                  placeholder="Platform name"
                  value={customPlatformName()}
                  onInput={(e) => setCustomPlatformName(e.currentTarget.value)}
                />
                <input
                  type="text"
                  placeholder="URL (e.g., https://example.com)"
                  value={customPlatformUrl()}
                  onInput={(e) => setCustomPlatformUrl(e.currentTarget.value)}
                />
                <button class="add-custom-btn" onClick={addCustomPlatform}>
                  Add Platform
                </button>
              </div>
            </div>
          </Show>

          <Show when={settingsTab() === "connection"}>
            <Show when={openCodeStatus() !== "connected" || openChamberStatus() !== "connected"}>
              <div class={`setup-wizard ${props.inlineMode ? "inline-mode" : ""}`}>
                <div class="wizard-header">
                  <div class="wizard-hero-icon">🚀</div>
                  <h2 class="wizard-title">Let's get you set up</h2>
                  <p class="wizard-subtitle">Two quick steps to start chatting with your AI assistant</p>
                </div>

                <div class={`wizard-step ${openCodeStatus() === "connected" ? "step-done" : "step-active"}`}>
                  <div class="wizard-step-header">
                    <span class={`wizard-step-number ${openCodeStatus() === "connected" ? "done" : "active"}`}>
                      {openCodeStatus() === "connected" ? "✓" : "1"}
                    </span>
                    <div class="wizard-step-info">
                      <div class="wizard-step-title-row">
                        <h4>Start OpenCode</h4>
                        <span class={`wizard-step-badge ${openCodeStatus() === "connected" ? "ready" : "waiting"}`}>
                          {openCodeStatus() === "connected" ? "Ready" : "Waiting"}
                        </span>
                      </div>
                      <p>
                        {openCodeStatus() === "connected"
                          ? "The AI brain is running!"
                          : "The AI brain that powers everything"}
                      </p>
                    </div>
                  </div>
                  <Show when={openCodeStatus() !== "connected"}>
                    <div class="wizard-step-content">
                      <p class="wizard-instruction">
                        Press <kbd>Win</kbd> + <kbd>R</kbd>, type <kbd>cmd</kbd>, press <kbd>Enter</kbd>. Then paste:
                      </p>
                      <div class="copy-command-box">
                        <code>opencode serve --port {localPort() || "4096"}</code>
                        <button
                          class="copy-command-btn"
                          onClick={() => {
                            navigator.clipboard.writeText(`opencode serve --port ${localPort() || "4096"}`)
                            triggerToast("Copied to clipboard!")
                          }}
                        >
                          <span innerHTML={getIcon("copy")} />
                          Copy
                        </button>
                      </div>
                      <p class="wizard-expect">
                        <span class="expect-icon">👀</span>
                        You'll see "Server running on port {localPort() || "4096"}" when it's ready
                      </p>
                      <p class="wizard-hint">
                        <span class="hint-icon">💡</span>
                        Don't have OpenCode?{" "}
                        <a href="https://opencode.ai" target="_blank">
                          Install it first
                        </a>{" "}
                        (takes 1 minute)
                      </p>
                    </div>
                  </Show>
                </div>

                <div
                  class={`wizard-step ${openChamberStatus() === "connected" ? "step-done" : openCodeStatus() === "connected" ? "step-active" : "step-pending"}`}
                >
                  <div class="wizard-step-header">
                    <span
                      class={`wizard-step-number ${openChamberStatus() === "connected" ? "done" : openCodeStatus() === "connected" ? "active" : ""}`}
                    >
                      {openChamberStatus() === "connected" ? "✓" : "2"}
                    </span>
                    <div class="wizard-step-info">
                      <div class="wizard-step-title-row">
                        <h4>Start OpenChamber</h4>
                        <span
                          class={`wizard-step-badge ${openChamberStatus() === "connected" ? "ready" : openCodeStatus() === "connected" ? "waiting" : "blocked"}`}
                        >
                          {openChamberStatus() === "connected"
                            ? "Ready"
                            : openCodeStatus() === "connected"
                              ? "Waiting"
                              : "Step 1 first"}
                        </span>
                      </div>
                      <p>
                        {openChamberStatus() === "connected"
                          ? "Chat window is ready!"
                          : "The chat window you'll talk to"}
                      </p>
                    </div>
                  </div>
                  <div class="wizard-step-content">
                    <Show when={openCodeStatus() === "connected"}>
                      <Show when={startupState() === "idle" || startupState() === "failed"}>
                        <button class="start-chamber-btn" onClick={startOpenChamberViaPty}>
                          <span innerHTML={getIcon("play")} />
                          Start OpenChamber
                        </button>
                        <p class="wizard-hint" style="margin-top: 10px;">
                          <span class="hint-icon">✨</span>
                          One click! OpenCode will start OpenChamber for you.
                        </p>
                      </Show>
                      <Show when={startupState() === "starting" || startupState() === "waiting"}>
                        <div class="startup-progress">
                          <div class="startup-spinner" />
                          <p class="startup-message">{getStartupMessage()}</p>
                          <div class="progress-bar">
                            <div class="progress-fill" style={`width: ${startupProgress()}%`} />
                          </div>
                          <p class="startup-hint">This usually takes 5-15 seconds...</p>
                        </div>
                      </Show>
                      <Show when={startupState() === "stopping"}>
                        <div class="startup-progress">
                          <div class="startup-spinner" />
                          <p class="startup-message">Stopping OpenChamber...</p>
                        </div>
                      </Show>
                      <Show when={startupState() === "success"}>
                        <div class="startup-success">
                          <span class="success-check">✓</span>
                          <p>OpenChamber is ready!</p>
                          <div class="process-controls">
                            <button class="control-btn restart" onClick={restartOpenChamber}>
                              <span innerHTML={getIcon("refresh")} />
                              Restart
                            </button>
                            <button class="control-btn stop" onClick={stopOpenChamber}>
                              <span innerHTML={getIcon("close")} />
                              Stop
                            </button>
                          </div>
                        </div>
                      </Show>
                    </Show>
                    <Show when={openCodeStatus() !== "connected"}>
                      <p class="wizard-instruction step-waiting">Complete Step 1 first, then come back here</p>
                    </Show>
                    <details class="manual-option">
                      <summary>Or run manually in terminal</summary>
                      <div class="manual-content">
                        <div class="copy-command-box">
                          <code>{previewOpenChamberCommand()}</code>
                          <button
                            class="copy-command-btn"
                            onClick={() => {
                              navigator.clipboard.writeText(previewOpenChamberCommand())
                              triggerToast("Copied to clipboard!")
                            }}
                          >
                            <span innerHTML={getIcon("copy")} />
                            Copy
                          </button>
                        </div>
                        <p class="wizard-hint">
                          <span class="hint-icon">💡</span>
                          Don't have OpenChamber?{" "}
                          <a href="https://github.com/anthropics/openchamber" target="_blank">
                            Install it first
                          </a>
                        </p>
                      </div>
                    </details>
                  </div>
                </div>

                <button class="wizard-test-btn" onClick={checkBothServices}>
                  <span innerHTML={getIcon("refresh")} />
                  Check Connection
                </button>
              </div>
            </Show>

            <Show when={openCodeStatus() === "connected" && openChamberStatus() === "connected"}>
              <div class="setup-success">
                <span class="success-icon">🎉</span>
                <h2>You're all set!</h2>
                <p>Both services are running. Start chatting with your AI assistant!</p>
                <div class="success-actions">
                  <Show when={props.inlineMode}>
                    <button class="start-chatting-btn" onClick={() => props.onConnectionReady?.()}>
                      Start Chatting
                    </button>
                  </Show>
                  <div class="process-controls inline">
                    <button
                      class="control-btn restart"
                      onClick={restartOpenChamber}
                      disabled={startupState() === "stopping"}
                    >
                      <span innerHTML={getIcon("refresh")} />
                      Restart
                    </button>
                    <button class="control-btn stop" onClick={stopOpenChamber} disabled={startupState() === "stopping"}>
                      <span innerHTML={getIcon("close")} />
                      Stop
                    </button>
                  </div>
                </div>
                <Show when={!props.inlineMode}>
                  <p class="success-hint">Close this panel to start chatting</p>
                </Show>
              </div>
            </Show>

            <details class="expert-settings">
              <summary>
                <span innerHTML={getIcon("settings")} />
                Advanced Settings
                <span class="expert-hint">For power users</span>
              </summary>

              <div class="expert-content">
                <div class="expert-section">
                  <h4>OpenCode Connection</h4>
                  <div class="expert-row">
                    <label>Where is OpenCode running?</label>
                    <div class="connection-mode-tabs compact">
                      <button
                        class={`mode-tab ${connectionMode() === "local" ? "active" : ""}`}
                        onClick={() => setConnectionModeState("local")}
                      >
                        This computer
                      </button>
                      <button
                        class={`mode-tab ${connectionMode() === "remote" ? "active" : ""}`}
                        onClick={() => setConnectionModeState("remote")}
                      >
                        Another computer
                      </button>
                    </div>
                  </div>

                  <Show when={connectionMode() === "local"}>
                    <div class="expert-row">
                      <label>Port number</label>
                      <div class="port-input-row">
                        <input
                          type="number"
                          placeholder="4096"
                          value={localPort()}
                          onInput={(e) => setLocalPort(e.currentTarget.value)}
                        />
                        <button class="scan-btn" onClick={handlePortScan} disabled={isScanning()}>
                          {isScanning() ? "Finding..." : "Auto-detect"}
                        </button>
                      </div>
                      <Show when={scanResult()}>
                        <p class="scan-result">{scanResult()}</p>
                      </Show>
                    </div>
                  </Show>

                  <Show when={connectionMode() === "remote"}>
                    <div class="expert-row">
                      <label>Server URL</label>
                      <input
                        type="text"
                        placeholder="https://your-server.example.com"
                        value={remoteUrl()}
                        onInput={(e) => setRemoteUrlState(e.currentTarget.value)}
                      />
                    </div>
                  </Show>
                </div>

                <div class="expert-section">
                  <h4>OpenChamber Connection</h4>
                  <div class="expert-row">
                    <label>Where is OpenChamber running?</label>
                    <div class="connection-mode-tabs compact">
                      <button
                        class={`mode-tab ${openChamberMode() === "local" ? "active" : ""}`}
                        onClick={() => setOpenChamberMode("local")}
                      >
                        This computer
                      </button>
                      <button
                        class={`mode-tab ${openChamberMode() === "remote" ? "active" : ""}`}
                        onClick={() => setOpenChamberMode("remote")}
                      >
                        Another computer
                      </button>
                    </div>
                  </div>

                  <Show when={openChamberMode() === "local"}>
                    <div class="expert-row">
                      <label>Port number</label>
                      <input
                        type="number"
                        placeholder="4097"
                        value={openChamberPort()}
                        onInput={(e) => setOpenChamberPortState(e.currentTarget.value)}
                      />
                    </div>
                    <div class="expert-row">
                      <label class="toggle-row compact">
                        <span>Share over internet (Cloudflare Tunnel)</span>
                        <input
                          type="checkbox"
                          class="toggle-checkbox"
                          checked={openChamberTryCfTunnel()}
                          onChange={(e) => setOpenChamberTryCfTunnelState(e.currentTarget.checked)}
                        />
                      </label>
                    </div>
                    <div class="expert-row">
                      <label>Extra command options</label>
                      <input
                        type="text"
                        placeholder="e.g., --host 0.0.0.0"
                        value={openChamberExtraArgs()}
                        onInput={(e) => setOpenChamberExtraArgsState(e.currentTarget.value)}
                      />
                    </div>
                  </Show>

                  <Show when={openChamberMode() === "remote"}>
                    <div class="expert-row">
                      <label>OpenChamber URL</label>
                      <input
                        type="text"
                        placeholder="https://your-openchamber.trycloudflare.com"
                        value={openChamberUrl()}
                        onInput={(e) => setOpenChamberUrlState(e.currentTarget.value)}
                      />
                    </div>
                  </Show>
                </div>

                <div class="expert-section">
                  <h4>Project Folder</h4>
                  <div class="expert-row">
                    <label class="toggle-row compact">
                      <span>Use a specific folder for all sessions</span>
                      <input
                        type="checkbox"
                        class="toggle-checkbox"
                        checked={workspaceEnabled()}
                        onChange={(e) => {
                          const enabled = e.currentTarget.checked
                          setWorkspaceEnabledState(enabled)
                          setWorkspaceEnabled(enabled)
                        }}
                      />
                    </label>
                  </div>
                  <Show when={workspaceEnabled()}>
                    <div class="expert-row">
                      <label>Folder path</label>
                      <input
                        type="text"
                        placeholder="C:\Users\you\projects"
                        value={workspaceRoot()}
                        onInput={(e) => {
                          const value = e.currentTarget.value
                          setWorkspaceRoot(value)
                          setWorkspaceDirectory(value)
                        }}
                      />
                    </div>
                  </Show>
                </div>

                <button class="save-connection-btn" onClick={saveConnectionSettings}>
                  Save Changes
                </button>
              </div>
            </details>
          </Show>

          <Show when={settingsTab() === "display"}>
            <div class="settings-section">
              <h3>Theme</h3>
              <div class="theme-options">
                <div class="theme-option active" title="Dark Theme (Default)">
                  <div class="theme-preview"></div>
                  <span>Dark</span>
                </div>
                <div class="theme-option" title="Coming Soon" style="opacity: 0.5; cursor: not-allowed;">
                  <div class="theme-preview" style="background: #f0f0f0; border-color: #ccc;"></div>
                  <span>Light</span>
                </div>
              </div>
            </div>

            <div class="settings-section">
              <h3>Tab Bar</h3>
              <div class="connection-mode-tabs" style="opacity: 0.5; pointer-events: none;">
                <button class="mode-tab active">Top</button>
                <button class="mode-tab">Bottom</button>
              </div>
            </div>

            <div class="settings-section">
              <p class="setting-hint">More display options coming soon.</p>
            </div>
          </Show>

          <Show when={settingsTab() === "about"}>
            <div class="about-header">
              <div class="app-logo-placeholder">
                <span innerHTML={getIcon("home")} style="width: 32px; height: 32px;" />
              </div>
              <div>
                <h3 style="font-size: 16px; margin: 0 0 4px 0;">Eidorail Extension</h3>
                <span class="app-version">v0.1.0</span>
              </div>
              <div class="about-links">
                <a href="https://opencode.ai/docs" target="_blank" class="about-link">
                  <span innerHTML={getIcon("external")} style="width: 14px; height: 14px;" /> Docs
                </a>
                <a href="https://github.com/sst/opencode" target="_blank" class="about-link">
                  <span innerHTML={getIcon("external")} style="width: 14px; height: 14px;" /> GitHub
                </a>
              </div>
            </div>

            <div class="danger-zone">
              <button class="restore-btn" onClick={restoreDefaults}>
                Restore Default Platforms
              </button>
              <button
                class="danger-btn"
                onClick={() => {
                  if (confirm("Clear all extension data? This cannot be undone.")) {
                    localStorage.clear()
                    location.reload()
                  }
                }}
              >
                <span innerHTML={getIcon("trash")} /> Clear All Data
              </button>
            </div>
          </Show>
        </div>
      </div>

      <Show when={showToast()}>
        <div class="toast-container">
          <div class="toast">
            <span innerHTML={getIcon("check")} style="width: 16px; height: 16px; color: #4ade80;" />
            {toastMessage()}
          </div>
        </div>
      </Show>
    </>
  )

  if (props.inlineMode) {
    return (
      <div class="settings-inline">
        <div class="inline-content">{content}</div>
      </div>
    )
  }

  if (props.isModal) {
    return (
      <div class="modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>Settings</h2>
          <button class="modal-close" onClick={() => props.onClose?.()}>
            <span innerHTML={getIcon("close")} />
          </button>
        </div>
        {content}
      </div>
    )
  }

  return <div class="settings-standalone">{content}</div>
}
