import { createSignal, Show, onMount } from "solid-js"
import { checkCloudCLIStatus } from "../utils/cloudcli-status"
import { checkOpenChamberStatus } from "../utils/openchamber-status"
import { checkOpenCodeStatus } from "../utils/opencode-status"
import type { CodeBackend } from "../utils/platform-storage"

/**
 * BackendChoice Component - All-in-One Setup Screen
 *
 * Shows all backend options with live detection status.
 * User can select any option at any time without waiting for detection.
 */

type DetectionStatus = "checking" | "running" | "not-found"

interface BackendChoiceProps {
  onSelect: (backend: CodeBackend) => void
  onChatOnly: () => void
}

export function BackendChoice(props: BackendChoiceProps) {
  const [cloudcliStatus, setCloudcliStatus] = createSignal<DetectionStatus>("checking")
  const [opencodeStatus, setOpencodeStatus] = createSignal<DetectionStatus>("checking")

  onMount(() => {
    // Run detection for both backends in parallel
    checkCloudCLIStatus().then((ok) => {
      setCloudcliStatus(ok ? "running" : "not-found")
    })

    // OpenCode needs both opencode + openchamber running
    Promise.all([checkOpenCodeStatus(), checkOpenChamberStatus()]).then(([opencode, openchamber]) => {
      setOpencodeStatus(opencode && openchamber ? "running" : "not-found")
    })

    // Timeout fallback - if still checking after 5s, mark as not-found
    setTimeout(() => {
      if (cloudcliStatus() === "checking") setCloudcliStatus("not-found")
      if (opencodeStatus() === "checking") setOpencodeStatus("not-found")
    }, 5000)
  })

  return (
    <div class="backend-choice-screen">
      <div class="backend-choice-header">
        <h2>Choose your coding backend</h2>
        <p>Sage connects to a local AI agent — pick one to get started</p>
      </div>

      <div class="backend-cards">
        {/* Claude Code Card */}
        <button
          type="button"
          class={`backend-card ${cloudcliStatus() === "running" ? "running" : ""}`}
          onClick={() => props.onSelect("cloudcli")}
        >
          <div class="backend-card-header">
            <span class="backend-card-icon">🟣</span>
            <div class="backend-card-titles">
              <h3>Claude Code</h3>
              <p>Anthropic's CLI — uses your Claude subscription</p>
            </div>
            <div class={`backend-card-status ${cloudcliStatus()}`}>
              <Show when={cloudcliStatus() === "checking"}>
                <span class="status-spinner" />
                <span>Checking...</span>
              </Show>
              <Show when={cloudcliStatus() === "running"}>
                <span class="status-check">✓</span>
                <span>Running</span>
              </Show>
            </div>
          </div>
          <ul class="backend-card-features">
            <li>Quickest setup — one terminal command</li>
            <li>Billed through your Anthropic plan</li>
          </ul>
          <div class="backend-card-action">
            <span class="backend-card-btn">{cloudcliStatus() === "running" ? "Connect →" : "Set Up →"}</span>
          </div>
        </button>

        {/* OpenCode Card */}
        <button
          type="button"
          class={`backend-card ${opencodeStatus() === "running" ? "running" : ""}`}
          onClick={() => props.onSelect("openchamber")}
        >
          <div class="backend-card-header">
            <span class="backend-card-icon">🟢</span>
            <div class="backend-card-titles">
              <h3>OpenCode</h3>
              <p>Open source — bring your own API key and model</p>
            </div>
            <div class={`backend-card-status ${opencodeStatus()}`}>
              <Show when={opencodeStatus() === "checking"}>
                <span class="status-spinner" />
                <span>Checking...</span>
              </Show>
              <Show when={opencodeStatus() === "running"}>
                <span class="status-check">✓</span>
                <span>Running</span>
              </Show>
            </div>
          </div>
          <ul class="backend-card-features">
            <li>Swap providers freely (OpenAI, Anthropic, local)</li>
            <li>Self-hosted — your keys, your data</li>
          </ul>
          <div class="backend-card-action">
            <span class="backend-card-btn">{opencodeStatus() === "running" ? "Connect →" : "Set Up →"}</span>
          </div>
        </button>

        {/* Chat Only Card */}
        <button type="button" class="backend-card chat-only" onClick={() => props.onChatOnly()}>
          <div class="backend-card-header">
            <span class="backend-card-icon">💬</span>
            <div class="backend-card-titles">
              <h3>Chat Only</h3>
              <p>No backend needed — chat with Claude.ai, ChatGPT, and Gemini in the sidebar</p>
            </div>
          </div>
          <div class="backend-card-action">
            <span class="backend-card-btn">Continue →</span>
          </div>
        </button>
      </div>
    </div>
  )
}
