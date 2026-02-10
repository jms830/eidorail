import { createSignal, Show, onMount } from "solid-js"
import { getIcon } from "../utils/shared"
import {
  checkCloudCLIStatus,
  retryCloudCLIConnection,
  getCloudCLIStartCommand,
  getClaudeCodeInstallCommand,
  getCloudCLIPort,
} from "../utils/cloudcli-status"

/**
 * CloudCLI Setup Component
 *
 * Guides user through setting up Claude Code CLI + CloudCLI (web UI)
 * Simpler than OpenCode setup - just one command to run
 */

interface CloudCLISetupProps {
  onComplete: () => void
  onBack: () => void
  inlineMode?: boolean
}

type SetupState = "idle" | "checking" | "connected" | "failed"

export function CloudCLISetup(props: CloudCLISetupProps) {
  const [status, setStatus] = createSignal<SetupState>("idle")
  const [progress, setProgress] = createSignal(0)
  const [toastMessage, setToastMessage] = createSignal("")
  const [showToast, setShowToast] = createSignal(false)

  function triggerToast(message: string) {
    setToastMessage(message)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 2000)
  }

  async function checkConnection() {
    setStatus("checking")
    setProgress(0)

    const connected = await retryCloudCLIConnection(5, (attempt) => {
      setProgress(Math.round((attempt / 5) * 100))
    })

    if (connected) {
      setStatus("connected")
      triggerToast("Connected to Claude Code!")
    } else {
      setStatus("failed")
    }
  }

  onMount(() => {
    // Check if already connected
    checkCloudCLIStatus().then((connected) => {
      if (connected) {
        setStatus("connected")
      }
    })
  })

  const installCommand = getClaudeCodeInstallCommand()
  const startCommand = getCloudCLIStartCommand()
  const port = getCloudCLIPort()

  return (
    <div class={`setup-wizard cloudcli-setup ${props.inlineMode ? "inline-mode" : ""}`}>
      <div class="wizard-header">
        <div class="wizard-hero-icon">🟣</div>
        <h2 class="wizard-title">Claude Code Setup</h2>
        <p class="wizard-subtitle">Install the CLI, start the server, and you're in</p>
      </div>

      {/* Step 1: Install Claude Code CLI (Optional) */}
      <div class="wizard-step step-active">
        <div class="wizard-step-header">
          <span class="wizard-step-number">1</span>
          <div class="wizard-step-info">
            <div class="wizard-step-title-row">
              <h4>Install Claude Code CLI</h4>
              <span class="wizard-step-badge optional">Optional</span>
            </div>
            <p>Skip if you already have Claude Code installed</p>
          </div>
        </div>
        <div class="wizard-step-content">
          <div class="copy-command-box">
            <code>{installCommand}</code>
            <button
              type="button"
              class="copy-command-btn"
              onClick={() => {
                navigator.clipboard.writeText(installCommand)
                triggerToast("Copied to clipboard!")
              }}
            >
              <span innerHTML={getIcon("copy")} />
              Copy
            </button>
          </div>
          <p class="wizard-hint">
            <span class="hint-icon">💡</span>
            Already have <code>claude</code> command? Skip to Step 2
          </p>
        </div>
      </div>

      {/* Step 2: Start CloudCLI */}
      <div class={`wizard-step ${status() === "connected" ? "step-done" : "step-active"}`}>
        <div class="wizard-step-header">
          <span class={`wizard-step-number ${status() === "connected" ? "done" : "active"}`}>
            {status() === "connected" ? "✓" : "2"}
          </span>
          <div class="wizard-step-info">
            <div class="wizard-step-title-row">
              <h4>Start CloudCLI</h4>
              <span class={`wizard-step-badge ${status() === "connected" ? "ready" : "waiting"}`}>
                {status() === "connected" ? "Ready" : "Waiting"}
              </span>
            </div>
            <p>{status() === "connected" ? "Connected and ready!" : "Starts a local server Sage connects to"}</p>
          </div>
        </div>

        <div class="wizard-step-content">
          <Show when={status() !== "connected"}>
            <p class="wizard-instruction">Run this command in your terminal:</p>
            <div class="copy-command-box">
              <code>{startCommand}</code>
              <button
                type="button"
                class="copy-command-btn"
                onClick={() => {
                  navigator.clipboard.writeText(startCommand)
                  triggerToast("Copied to clipboard!")
                }}
              >
                <span innerHTML={getIcon("copy")} />
                Copy
              </button>
            </div>
            <p class="wizard-expect">
              <span class="expect-icon">👀</span>
              Look for "Server started at http://localhost:{port}" in your terminal
            </p>
          </Show>

          <Show when={status() === "checking"}>
            <div class="startup-progress">
              <div class="startup-spinner" />
              <p class="startup-message">Checking connection... {progress()}%</p>
              <div class="progress-bar">
                <div class="progress-fill" style={`width: ${progress()}%`} />
              </div>
            </div>
          </Show>

          <Show when={status() === "connected"}>
            <div class="startup-success">
              <span class="success-check">✓</span>
              <p>Claude Code server is running!</p>
            </div>
          </Show>

          <Show when={status() === "failed"}>
            <div class="startup-failed">
              <span class="failed-icon">⚠️</span>
              <p>Couldn't connect — is the server running in your terminal?</p>
            </div>
          </Show>
        </div>
      </div>

      {/* Actions */}
      <div class="wizard-actions">
        <button type="button" class="wizard-back-btn" onClick={() => props.onBack()}>
          <span innerHTML={getIcon("chevronUp")} style="transform: rotate(-90deg)" />
          Back
        </button>

        <Show when={status() !== "connected"}>
          <button type="button" class="wizard-test-btn" onClick={checkConnection} disabled={status() === "checking"}>
            <span innerHTML={getIcon("refresh")} />
            {status() === "checking" ? "Checking..." : "Check Connection"}
          </button>
        </Show>

        <Show when={status() === "connected"}>
          <button type="button" class="wizard-complete-btn" onClick={() => props.onComplete()}>
            <span innerHTML={getIcon("check")} />
            Start Chatting
          </button>
        </Show>
      </div>

      {/* Tips */}
      <details class="setup-tips">
        <summary>
          <span innerHTML={getIcon("info")} />
          Troubleshooting Tips
        </summary>
        <div class="tips-content">
          <ul>
            <li>
              <strong>Port conflict?</strong> Change port in Settings → Connection
            </li>
            <li>
              <strong>Need to install Node.js?</strong>{" "}
              <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">
                Download Node.js
              </a>
            </li>
            <li>
              <strong>Claude Code not working?</strong> Make sure you're logged in: <code>claude login</code>
            </li>
          </ul>
        </div>
      </details>

      {/* Toast */}
      <Show when={showToast()}>
        <div class="toast-container">
          <div class="toast">
            <span innerHTML={getIcon("check")} style="width: 16px; height: 16px; color: #4ade80;" />
            {toastMessage()}
          </div>
        </div>
      </Show>
    </div>
  )
}
