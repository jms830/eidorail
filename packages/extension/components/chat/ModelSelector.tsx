import { createSignal, For, Show, createMemo, type Component } from "solid-js"
import { useOpenCode } from "../../context/opencode"

export interface ModelSelectorProps {
  selectedAgent: string
  selectedProvider: string
  selectedModel: string
  onAgentChange: (agent: string) => void
  onModelChange: (provider: string, model: string) => void
}

export const ModelSelector: Component<ModelSelectorProps> = (props) => {
  const ctx = useOpenCode()
  const [open, setOpen] = createSignal(false)

  const currentProviderName = createMemo(() => {
    const provider = ctx.state.providers.find((p) => p.id === props.selectedProvider)
    return provider?.name ?? props.selectedProvider
  })

  const currentModelName = createMemo(() => {
    const provider = ctx.state.providers.find((p) => p.id === props.selectedProvider)
    const model = provider?.models[props.selectedModel]
    return model?.name ?? props.selectedModel
  })

  const handleSelect = (providerId: string, modelId: string) => {
    props.onModelChange(providerId, modelId)
    setOpen(false)
  }

  return (
    <div class="model-selector">
      <button class="model-selector-btn" onClick={() => setOpen(!open())}>
        <span class="model-name">{currentModelName()}</span>
        <svg class="model-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <Show when={open()}>
        <div class="model-dropdown-overlay" onClick={() => setOpen(false)} />
        <div class="model-dropdown">
          <div class="model-dropdown-section">
            <div class="model-dropdown-label">Agent</div>
            <div class="agent-options">
              <For each={ctx.state.agents}>
                {(agent) => (
                  <button
                    class={`agent-option ${props.selectedAgent === agent.name ? "active" : ""}`}
                    onClick={() => props.onAgentChange(agent.name)}
                  >
                    {agent.name}
                  </button>
                )}
              </For>
            </div>
          </div>

          <div class="model-dropdown-section">
            <div class="model-dropdown-label">Model</div>
            <div class="model-list">
              <For each={ctx.state.providers}>
                {(provider) => (
                  <div class="provider-group">
                    <div class="provider-name">{provider.name}</div>
                    <For each={Object.entries(provider.models)}>
                      {([modelId, model]) => (
                        <button
                          class={`model-option ${props.selectedProvider === provider.id && props.selectedModel === modelId ? "active" : ""}`}
                          onClick={() => handleSelect(provider.id, modelId)}
                        >
                          {model.name}
                        </button>
                      )}
                    </For>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
