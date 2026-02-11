import { render } from "solid-js/web"
import { createSignal, For, Show, onMount, onCleanup, ErrorBoundary } from "solid-js"
import "./style.css"
import { checkOpenCodeStatus } from "../../utils/opencode-status"
import { checkOpenChamberStatus, getOpenChamberUrl } from "../../utils/openchamber-status"
import { checkCloudCLIStatus, getCloudCLIUrl } from "../../utils/cloudcli-status"
import { launchOpenCodeInTerminal } from "../../utils/terminal-launcher"
import { type Platform, getIcon, loadPlatforms } from "../../utils/shared"
import { SettingsPanel } from "../../components/SettingsPanel"
import { SetupWizard } from "../../components/SetupWizard"
import { ContextBar } from "./ContextBar"
import { getOpenCodePort } from "../../utils/opencode-status"
import {
  getSettingsFromLocalStorage,
  saveSettingsToLocalStorage,
  initStorageFromLocalStorage,
  type CodeBackend,
} from "../../utils/platform-storage"
import { shouldShowSetupWizard, detectCodeBackend, getActiveBackend } from "../../utils/backend-detection"

type ConnectionState = "checking" | "opencode-missing" | "openchamber-missing" | "cloudcli-missing" | "connected"

function App() {
  const settings = getSettingsFromLocalStorage()
  const [platforms, setPlatforms] = createSignal<Platform[]>(loadPlatforms())
  const [currentView, setCurrentView] = createSignal(settings.defaultPlatform)
  const [loadedIframes, setLoadedIframes] = createSignal<Set<string>>(new Set([settings.defaultPlatform]))
  const [settingsOpen, setSettingsOpen] = createSignal(false)
  const [toastMessage, setToastMessage] = createSignal<string | null>(null)

  const [connectionState, setConnectionState] = createSignal<ConnectionState>("checking")
  const [showWizard, setShowWizard] = createSignal(shouldShowSetupWizard())
  const [activeBackend, setActiveBackend] = createSignal<CodeBackend>(getActiveBackend())

  async function checkConnections(silent = false) {
    if (!silent) setConnectionState("checking")

    const backend = activeBackend()

    // CloudCLI backend: check only CloudCLI
    if (backend === "cloudcli") {
      const cloudcliOk = await checkCloudCLIStatus()
      if (!cloudcliOk) {
        setConnectionState("cloudcli-missing")
        return
      }
      setConnectionState("connected")
      return
    }

    // OpenChamber backend (or none): check OpenCode + OpenChamber
    const openCodeOk = await checkOpenCodeStatus()
    if (!openCodeOk) {
      setConnectionState("opencode-missing")
      return
    }

    const openChamberOk = await checkOpenChamberStatus()
    if (!openChamberOk) {
      setConnectionState("openchamber-missing")
      return
    }

    setConnectionState("connected")
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "visible") {
      checkConnections(true)
    }
  }

  function showToast(message: string) {
    setToastMessage(message)
    setTimeout(() => setToastMessage(null), 3000)
  }

  async function copyTextToClipboard(text: string) {
    await navigator.clipboard.writeText(text)
  }

  async function copyImageToClipboard(dataUrl: string) {
    const response = await fetch(dataUrl)
    const blob = await response.blob()
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
  }

  function handleContextMenuMessage(message: {
    type: string
    platformId: string
    clipboardData: { text?: string; imageDataUrl?: string }
  }) {
    if (message.type !== "CONTEXT_MENU_CAPTURE") return

    switchView(message.platformId)

    const { text, imageDataUrl } = message.clipboardData
    if (text) {
      copyTextToClipboard(text).then(() => showToast("Copied! Paste with Ctrl+V"))
    } else if (imageDataUrl) {
      copyImageToClipboard(imageDataUrl).then(() => showToast("Screenshot copied! Paste with Ctrl+V"))
    }
  }

  function handleWizardComplete(backend: CodeBackend) {
    // Update local state
    setActiveBackend(backend)
    setShowWizard(false)

    // Save to storage
    saveSettingsToLocalStorage({
      ...getSettingsFromLocalStorage(),
      codeBackend: backend,
      codeBackendSetupComplete: true,
      showSetupWizardOnStart: false,
    })

    // If "Chat Only" selected, switch to Claude.ai tab
    if (backend === "none") {
      setCurrentView("claude")
      // Make sure Claude tab is loaded
      if (!loadedIframes().has("claude")) {
        setLoadedIframes((prev) => new Set([...prev, "claude"]))
      }
      return
    }

    // Check connections for the selected backend
    checkConnections()
  }

  onMount(() => {
    initStorageFromLocalStorage()

    // If showing wizard, don't check connections yet (wizard will handle it)
    if (!showWizard()) {
      checkConnections()
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    chrome.runtime.onMessage.addListener(handleContextMenuMessage)
  })

  onCleanup(() => {
    document.removeEventListener("visibilitychange", handleVisibilityChange)
    chrome.runtime.onMessage.removeListener(handleContextMenuMessage)
  })

  function switchView(platformId: string) {
    setCurrentView(platformId)
    if (!loadedIframes().has(platformId)) {
      setLoadedIframes((prev) => new Set([...prev, platformId]))
    }
    if (platformId === "opencode" && connectionState() !== "connected") {
      checkConnections()
    }
  }

  function getCodeBackendUrl(): string {
    const backend = activeBackend()
    if (backend === "cloudcli") {
      return getCloudCLIUrl()
    }
    return getOpenChamberUrl()
  }

  function openExternal() {
    const platform = platforms().find((p) => p.id === currentView())
    const url = platform?.id === "opencode" ? getCodeBackendUrl() : platform?.url
    if (!url) return

    if (typeof chrome !== "undefined" && chrome.tabs) {
      chrome.tabs.create({ url, active: true })
      return
    }

    window.open(url, "_blank")
  }

  function handlePlatformsChange(newPlatforms: Platform[]) {
    const ids = new Set(newPlatforms.map((p) => p.id))

    setLoadedIframes((prev) => new Set(Array.from(prev).filter((id) => ids.has(id))))

    if (!ids.has(currentView())) setCurrentView("opencode")

    setPlatforms(newPlatforms)
  }

  return (
    <Show
      when={!showWizard()}
      fallback={
        <div class="sage-container wizard-mode">
          <SetupWizard onComplete={handleWizardComplete} />
        </div>
      }
    >
      <div class="sage-container">
        <header class="platform-bar">
          <div class="platform-tabs">
            <For
              each={platforms()
                .filter((p) => p.isVisible)
                .sort((a, b) => a.order - b.order)}
            >
              {(platform) => (
                <button
                  type="button"
                  class={`platform-tab ${currentView() === platform.id ? "active" : ""}`}
                  onClick={() => switchView(platform.id)}
                  title={platform.name}
                >
                  <span class="platform-icon" innerHTML={getIcon(platform.icon, platform.name)} />
                </button>
              )}
            </For>
            <button
              type="button"
              class="platform-tab add-btn"
              title="Add Platform"
              onClick={() => setSettingsOpen(true)}
            >
              <span class="platform-icon" innerHTML={getIcon("plus")} />
            </button>
          </div>
          <div class="platform-actions">
            <button type="button" class="action-btn" onClick={openExternal} title="Open in new tab">
              <span class="action-icon" innerHTML={getIcon("external")} />
            </button>
            <button
              type="button"
              class="action-btn"
              onClick={() => launchOpenCodeInTerminal(getOpenCodePort())}
              title="Launch Terminal"
            >
              <span class="action-icon" innerHTML={getIcon("terminal")} />
            </button>
            <button type="button" class="action-btn" onClick={() => setSettingsOpen(true)} title="Settings">
              <span class="action-icon" innerHTML={getIcon("settings")} />
            </button>
          </div>
        </header>

        <main class="view-container">
          <For each={platforms().filter((p) => p.isVisible)}>
            {(platform) => (
              <div class={`view-panel ${currentView() === platform.id ? "active" : ""}`} data-view={platform.id}>
                <Show when={platform.id === "opencode"}>
                  <Show when={connectionState() === "checking"}>
                    <div class="checking-status">
                      <div class="spinner" />
                      <p>Connecting...</p>
                    </div>
                  </Show>
                  <Show when={connectionState() === "connected"}>
                    <iframe
                      src={getCodeBackendUrl()}
                      class="platform-frame openchamber-frame"
                      title={activeBackend() === "cloudcli" ? "CloudCLI" : "OpenChamber"}
                      allow="clipboard-read; clipboard-write"
                    />
                  </Show>
                  <Show when={connectionState() === "cloudcli-missing"}>
                    <SettingsPanel
                      inlineMode={true}
                      onConnectionReady={() => checkConnections()}
                      onPlatformsChange={handlePlatformsChange}
                    />
                  </Show>
                  <Show when={connectionState() === "opencode-missing" || connectionState() === "openchamber-missing"}>
                    <SettingsPanel
                      inlineMode={true}
                      onConnectionReady={() => checkConnections()}
                      onPlatformsChange={handlePlatformsChange}
                    />
                  </Show>
                </Show>

                <Show when={platform.id !== "opencode" && loadedIframes().has(platform.id)}>
                  <iframe
                    src={platform.url}
                    class="platform-frame"
                    title={platform.name}
                    allow="clipboard-read; clipboard-write"
                  />
                </Show>
              </div>
            )}
          </For>
        </main>

        <ContextBar />

        <Show when={toastMessage()}>
          <div class="global-toast">{toastMessage()}</div>
        </Show>

        <Show when={settingsOpen()}>
          <div
            class="modal-overlay"
            onClick={() => setSettingsOpen(false)}
            onKeyDown={(e) => e.key === "Escape" && setSettingsOpen(false)}
          >
            <SettingsPanel
              isModal={true}
              onClose={() => setSettingsOpen(false)}
              onPlatformsChange={handlePlatformsChange}
            />
          </div>
        </Show>
      </div>
    </Show>
  )
}

const root = document.getElementById("root")
if (root) {
  render(
    () => (
      <ErrorBoundary
        fallback={(error, reset) => (
          <div class="checking-status">
            <p>Something went wrong.</p>
            <button type="button" class="action-btn" onClick={reset}>
              Retry
            </button>
            <pre>{String(error)}</pre>
          </div>
        )}
      >
        <App />
      </ErrorBoundary>
    ),
    root,
  )
}
