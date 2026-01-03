import { render } from "solid-js/web"
import { createSignal, For, Show, onMount, onCleanup, ErrorBoundary } from "solid-js"
import "./style.css"
import { checkOpenCodeStatus } from "../../utils/opencode-status"
import { checkOpenChamberStatus, getOpenChamberUrl } from "../../utils/openchamber-status"
import { launchOpenCodeInTerminal } from "../../utils/terminal-launcher"
import { type Platform, getIcon, loadPlatforms } from "../../utils/shared"
import { SettingsPanel } from "../../components/SettingsPanel"
import { ContextBar } from "./ContextBar"
import { getOpenCodePort } from "../../utils/opencode-status"

type ConnectionState = "checking" | "opencode-missing" | "openchamber-missing" | "connected"

function App() {
  const [platforms, setPlatforms] = createSignal<Platform[]>(loadPlatforms())
  const [currentView, setCurrentView] = createSignal("opencode")
  const [loadedIframes, setLoadedIframes] = createSignal<Set<string>>(new Set(["opencode"]))
  const [settingsOpen, setSettingsOpen] = createSignal(false)

  const [connectionState, setConnectionState] = createSignal<ConnectionState>("checking")

  async function checkConnections(silent = false) {
    if (!silent) setConnectionState("checking")

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

  onMount(() => {
    checkConnections()
    document.addEventListener("visibilitychange", handleVisibilityChange)
  })

  onCleanup(() => {
    document.removeEventListener("visibilitychange", handleVisibilityChange)
  })

  function switchView(platformId: string) {
    setCurrentView(platformId)
    if (!loadedIframes().has(platformId)) {
      setLoadedIframes((prev) => new Set([...prev, platformId]))
    }
  }

  function openExternal() {
    const platform = platforms().find((p) => p.id === currentView())
    const url = platform?.id === "opencode" ? getOpenChamberUrl() : platform?.url
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
    <div class="eidorail-container">
      <header class="platform-bar">
        <div class="platform-tabs">
          <For
            each={platforms()
              .filter((p) => p.isVisible)
              .sort((a, b) => a.order - b.order)}
          >
            {(platform) => (
              <button
                class={`platform-tab ${currentView() === platform.id ? "active" : ""}`}
                onClick={() => switchView(platform.id)}
                title={platform.name}
              >
                <span class="platform-icon" innerHTML={getIcon(platform.icon, platform.name)} />
              </button>
            )}
          </For>
          <button class="platform-tab add-btn" title="Add Platform" onClick={() => setSettingsOpen(true)}>
            <span class="platform-icon" innerHTML={getIcon("plus")} />
          </button>
        </div>
        <div class="platform-actions">
          <button class="action-btn" onClick={openExternal} title="Open in new tab">
            <span class="action-icon" innerHTML={getIcon("external")} />
          </button>
          <button
            class="action-btn"
            onClick={() => launchOpenCodeInTerminal(getOpenCodePort())}
            title="Launch Terminal"
          >
            <span class="action-icon" innerHTML={getIcon("terminal")} />
          </button>
          <button class="action-btn" onClick={() => setSettingsOpen(true)} title="Settings">
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
                    src={getOpenChamberUrl()}
                    class="platform-frame openchamber-frame"
                    allow="clipboard-read; clipboard-write"
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
                <iframe src={platform.url} class="platform-frame" allow="clipboard-read; clipboard-write" />
              </Show>
            </div>
          )}
        </For>
      </main>

      <ContextBar />

      <Show when={settingsOpen()}>
        <div class="modal-overlay" onClick={() => setSettingsOpen(false)}>
          <SettingsPanel
            isModal={true}
            onClose={() => setSettingsOpen(false)}
            onPlatformsChange={handlePlatformsChange}
          />
        </div>
      </Show>
    </div>
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
            <button class="action-btn" onClick={reset}>
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
