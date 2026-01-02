import { Show, type Component } from "solid-js"
import { useOpenCode } from "../../context/opencode"

export const StatusIndicator: Component = () => {
  const ctx = useOpenCode()

  const status = () => ctx.currentStatus()
  const isActive = () => status().type !== "idle"

  return (
    <Show when={isActive()}>
      <div class="status-indicator">
        <div class="status-spinner" />
        <span class="status-text">
          <Show
            when={status().type === "generating"}
            fallback={
              <Show when={status().type === "tool"} fallback="Processing...">
                Running {status().tool}...
              </Show>
            }
          >
            Generating...
          </Show>
        </span>
        <button class="status-abort" onClick={() => ctx.abort()} title="Stop">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        </button>
      </div>
    </Show>
  )
}
