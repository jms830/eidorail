import { createSignal, Show } from "solid-js"
import { BackendChoice } from "./BackendChoice"
import { CloudCLISetup } from "./CloudCLISetup"
import { WorkspacePicker } from "./WorkspacePicker"
import { SettingsPanel } from "./SettingsPanel"
import type { CodeBackend } from "../utils/platform-storage"

/**
 * SetupWizard Component
 *
 * Thin orchestrator for the setup flow:
 * 1. Show BackendChoice (all-in-one selection with live detection)
 * 2. Show WorkspacePicker (pick default project folder)
 * 3. Based on selection, show appropriate setup component
 * 4. On completion, notify parent
 */

type WizardStep = "choice" | "workspace" | "cloudcli-setup" | "openchamber-setup"

interface SetupWizardProps {
  onComplete: (backend: CodeBackend) => void
}

export function SetupWizard(props: SetupWizardProps) {
  const [step, setStep] = createSignal<WizardStep>("choice")
  const [selectedBackend, setSelectedBackend] = createSignal<CodeBackend>("none")

  function handleSelect(backend: CodeBackend) {
    setSelectedBackend(backend)
    // Go to workspace picker for code backends
    setStep("workspace")
  }

  function handleChatOnly() {
    // Skip setup entirely, complete with "none"
    props.onComplete("none")
  }

  function handleWorkspaceComplete() {
    // After workspace selection, go to backend-specific setup
    const backend = selectedBackend()
    if (backend === "cloudcli") {
      setStep("cloudcli-setup")
    } else if (backend === "openchamber") {
      setStep("openchamber-setup")
    }
  }

  function handleWorkspaceSkip() {
    // Skip workspace, go directly to backend setup
    handleWorkspaceComplete()
  }

  function handleSetupComplete() {
    props.onComplete(selectedBackend())
  }

  function handleBackToChoice() {
    setStep("choice")
    setSelectedBackend("none")
  }

  function handleBackToWorkspace() {
    setStep("workspace")
  }

  return (
    <div class="setup-wizard-container">
      {/* Choice Screen (All-in-One) */}
      <Show when={step() === "choice"}>
        <BackendChoice onSelect={handleSelect} onChatOnly={handleChatOnly} />
      </Show>

      {/* Workspace Picker */}
      <Show when={step() === "workspace"}>
        <div class="workspace-picker-wrapper">
          <WorkspacePicker onComplete={handleWorkspaceComplete} onSkip={handleWorkspaceSkip} />
          <div class="wizard-back-row">
            <button type="button" class="wizard-back-btn" onClick={handleBackToChoice}>
              ← Back to options
            </button>
          </div>
        </div>
      </Show>

      {/* Claude Code Setup */}
      <Show when={step() === "cloudcli-setup"}>
        <CloudCLISetup onComplete={handleSetupComplete} onBack={handleBackToWorkspace} />
      </Show>

      {/* OpenCode Setup - Reuse existing SettingsPanel inline mode */}
      <Show when={step() === "openchamber-setup"}>
        <div class="openchamber-setup-wrapper">
          <div class="wizard-header">
            <div class="wizard-hero-icon">🟢</div>
            <h2 class="wizard-title">OpenCode Setup</h2>
            <p class="wizard-subtitle">Set up your open source AI coding environment</p>
          </div>

          <SettingsPanel inlineMode={true} onConnectionReady={handleSetupComplete} />

          <details class="setup-tips">
            <summary>Enable Browser Automation</summary>
            <div class="tips-content">
              <p>
                Give OpenCode access to your browser for live debugging, testing, and automation. Run this in your
                terminal:
              </p>
              <code class="block-code">bunx @different-ai/opencode-browser@latest install</code>
              <p>
                This installs the{" "}
                <a href="https://github.com/different-ai/opencode-browser" target="_blank" rel="noopener noreferrer">
                  opencode-browser
                </a>{" "}
                plugin, which lets OpenCode control Chrome using your existing profile and logins.
              </p>
            </div>
          </details>

          <div class="wizard-back-row">
            <button type="button" class="wizard-back-btn" onClick={handleBackToWorkspace}>
              ← Back to workspace
            </button>
          </div>
        </div>
      </Show>
    </div>
  )
}
