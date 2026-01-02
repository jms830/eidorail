import { createSignal, createEffect, createMemo, Show, For, onMount, onCleanup, type Component } from "solid-js"
import { useOpenCode } from "../../context/opencode"
import { PlusMenu } from "./PlusMenu"
import type { Agent } from "../../utils/opencode-api"

type Base64DataURL = string

interface Attachment {
  id: string
  name: string
  type: string
  data: Base64DataURL
  size: number
}

export const PromptBar: Component = () => {
  const ctx = useOpenCode()
  const [text, setText] = createSignal("")
  const [selectedAgent, setSelectedAgent] = createSignal("build")
  const [selectedProvider, setSelectedProvider] = createSignal("")
  const [selectedModel, setSelectedModel] = createSignal("")
  const [modelDropdownOpen, setModelDropdownOpen] = createSignal(false)
  const [plusMenuOpen, setPlusMenuOpen] = createSignal(false)
  const [attachments, setAttachments] = createSignal<Attachment[]>([])
  const [isDragging, setIsDragging] = createSignal(false)
  let textareaRef: HTMLTextAreaElement | undefined
  let fileInputRef: HTMLInputElement | undefined

  createEffect(() => {
    const providers = ctx.state.providers
    const agents = ctx.state.agents
    if (Array.isArray(providers) && providers.length > 0 && !selectedProvider()) {
      setSelectedProvider(providers[0].id)
      const models = Object.keys(providers[0].models ?? {})
      if (models.length > 0) setSelectedModel(models[0])
    }
    if (Array.isArray(agents) && agents.length > 0 && !selectedAgent()) {
      setSelectedAgent(agents[0].name)
    }
  })

  const isGenerating = () => ctx.currentStatus().type !== "idle"

  const primaryAgents = createMemo(() => {
    const agents = ctx.state.agents
    if (!Array.isArray(agents)) return []
    return agents.filter((a) => a.mode !== "subagent")
  })

  const subAgents = createMemo(() => {
    const agents = ctx.state.agents
    if (!Array.isArray(agents)) return []
    return agents.filter((a) => a.mode === "subagent")
  })

  const currentModelDisplay = () => {
    const providers = ctx.state.providers
    if (!Array.isArray(providers)) return "Model"
    const provider = providers.find((p) => p.id === selectedProvider())
    const model = provider?.models?.[selectedModel()]
    const name = model?.name ?? selectedModel() ?? "Model"
    return name.length > 12 ? name.slice(0, 12) + "…" : name
  }

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return

    const newAttachments: Attachment[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        const data = await fileToBase64(file)
        newAttachments.push({
          id: `att-${Date.now()}-${i}`,
          name: file.name,
          type: file.type || "application/octet-stream",
          data,
          size: file.size,
        })
      } catch (e) {
        console.error("Failed to read file:", file.name, e)
      }
    }

    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments])
    }
  }

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer?.files
    if (files) {
      handleFileSelect(files)
    }
  }

  const handleSubmit = async () => {
    const input = text().trim()
    const hasAttachments = attachments().length > 0

    if (!input && !hasAttachments) return
    if (isGenerating()) return

    const provider = selectedProvider()
    const model = selectedModel()
    if (!provider || !model) return

    const parts: Array<{ type: "text"; text: string } | { type: "file"; url: string; filename: string }> = []

    if (input) {
      parts.push({ type: "text", text: input })
    }

    for (const attachment of attachments()) {
      parts.push({ type: "file", url: attachment.data, filename: attachment.name })
    }

    setText("")
    setAttachments([])
    if (textareaRef) {
      textareaRef.style.height = "auto"
    }

    await ctx.sendMessage(input, selectedAgent(), { providerID: provider, modelID: model }, parts)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === "Escape") {
      if (modelDropdownOpen()) {
        e.preventDefault()
        setModelDropdownOpen(false)
      }
      if (plusMenuOpen()) {
        e.preventDefault()
        setPlusMenuOpen(false)
      }
    }
    if (e.ctrlKey && e.key === "u") {
      e.preventDefault()
      if (fileInputRef) {
        fileInputRef.click()
      }
    }
    if (e.key === "Tab" && !modelDropdownOpen() && !plusMenuOpen()) {
      e.preventDefault()
      const agents = primaryAgents()
      if (agents.length < 2) return

      const currentIdx = agents.findIndex((a) => a.name === selectedAgent())
      if (currentIdx < 0) return

      const nextIdx = e.shiftKey ? (currentIdx - 1 + agents.length) % agents.length : (currentIdx + 1) % agents.length
      setSelectedAgent(agents[nextIdx].name)
    }
  }

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 120) + "px"
  }

  const handleGlobalKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && modelDropdownOpen()) {
      setModelDropdownOpen(false)
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleGlobalKeyDown)
  })

  onCleanup(() => {
    document.removeEventListener("keydown", handleGlobalKeyDown)
  })

  return (
    <div class="prompt-bar">
      <Show when={isDragging()}>
        <div class="drag-overlay">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span>Drop files to attach</span>
        </div>
      </Show>

      <Show when={attachments().length > 0}>
        <div class="attachment-chips">
          <For each={attachments()}>
            {(attachment) => (
              <div class="attachment-chip">
                <Show when={attachment.type.startsWith("image/")}>
                  <img src={attachment.data} alt={attachment.name} class="attachment-preview" />
                </Show>
                <Show when={!attachment.type.startsWith("image/")}>
                  <span class="attachment-name">{attachment.name}</span>
                </Show>
                <button class="attachment-remove" onClick={() => removeAttachment(attachment.id)} title="Remove">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      <div class="prompt-input-row">
        <button class="plus-button" onClick={() => setPlusMenuOpen(!plusMenuOpen())} title="Add attachment">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        <div class="model-selector-inline">
          <button
            class="model-pill"
            onClick={() => setModelDropdownOpen(!modelDropdownOpen())}
            title={`${selectedAgent()} / ${currentModelDisplay()}`}
          >
            <span class="agent-badge">{selectedAgent()}</span>
            <span class="model-name">{currentModelDisplay()}</span>
            <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          <Show when={modelDropdownOpen()}>
            <div class="dropdown-overlay" onClick={() => setModelDropdownOpen(false)} />
            <div class="model-dropdown">
              <div class="dropdown-section">
                <div class="dropdown-label">Primary Agents</div>
                <div class="agent-pills">
                  <For each={primaryAgents()}>
                    {(agent) => (
                      <button
                        class={`agent-pill ${selectedAgent() === agent.name ? "active" : ""}`}
                        onClick={() => setSelectedAgent(agent.name)}
                        title={agent.description}
                      >
                        {agent.name}
                      </button>
                    )}
                  </For>
                </div>
                <Show when={subAgents().length > 0}>
                  <div class="dropdown-label subagent-label">Subagents</div>
                  <div class="agent-pills subagent-pills">
                    <For each={subAgents()}>
                      {(agent) => (
                        <button
                          class={`agent-pill subagent ${selectedAgent() === agent.name ? "active" : ""}`}
                          onClick={() => setSelectedAgent(agent.name)}
                          title={agent.description}
                        >
                          {agent.name}
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
              <div class="dropdown-section">
                <div class="dropdown-label">Model</div>
                <div class="model-options">
                  <For each={Array.isArray(ctx.state.providers) ? ctx.state.providers : []}>
                    {(provider) => (
                      <div class="provider-group">
                        <div class="provider-label">{provider.name}</div>
                        <For each={Object.entries(provider.models ?? {})}>
                          {([modelId, model]) => (
                            <button
                              class={`model-option ${selectedProvider() === provider.id && selectedModel() === modelId ? "active" : ""}`}
                              onClick={() => {
                                setSelectedProvider(provider.id)
                                setSelectedModel(modelId)
                                setModelDropdownOpen(false)
                              }}
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

        <textarea
          ref={textareaRef}
          class="prompt-input"
          placeholder="Send a message..."
          value={text()}
          onInput={(e) => {
            setText(e.currentTarget.value)
            autoResize(e.currentTarget)
          }}
          onKeyDown={handleKeyDown}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          disabled={isGenerating()}
          rows={1}
        />

        <Show
          when={isGenerating()}
          fallback={
            <button
              class="prompt-submit"
              onClick={handleSubmit}
              disabled={!text().trim() && attachments().length === 0}
              title="Send (Enter)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            </button>
          }
        >
          <button class="prompt-abort" onClick={() => ctx.abort()} title="Stop">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        </Show>
      </div>

      <input
        type="file"
        multiple
        style={{ display: "none" }}
        ref={fileInputRef}
        onChange={(e) => {
          const input = e.currentTarget
          handleFileSelect(input.files)
          input.value = ""
        }}
        accept="image/*,.txt,.md,.json,.ts,.tsx,.js,.jsx"
      />

      <PlusMenu
        isOpen={plusMenuOpen()}
        onClose={() => setPlusMenuOpen(false)}
        onUploadFiles={() => {
          if (fileInputRef) fileInputRef.click()
        }}
        onTakeScreenshot={async () => {
          try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
            if (!tab?.id) return
            const dataUrl = await chrome.tabs.captureVisibleTab()
            setAttachments((prev) => [
              ...prev,
              {
                id: `screenshot-${Date.now()}`,
                name: `screenshot-${Date.now()}.png`,
                type: "image/png",
                data: dataUrl,
                size: 0,
              },
            ])
          } catch (e) {
            console.error("Screenshot failed:", e)
          }
        }}
        onCapturePage={async () => {
          try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
            if (!tab?.id) return

            const results = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => {
                return document.documentElement.outerHTML
              },
            })

            const html = results?.[0]?.result
            if (html) {
              setAttachments((prev) => [
                ...prev,
                {
                  id: `page-${Date.now()}`,
                  name: `page-${Date.now()}.html`,
                  type: "text/html",
                  data: `data:text/html;base64,${btoa(unescape(encodeURIComponent(html)))}`,
                  size: html.length,
                },
              ])
            }
          } catch (e) {
            console.error("Page capture failed:", e)
          }
        }}
      />
    </div>
  )
}
