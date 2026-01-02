import { createSignal, createMemo, For, Show, onMount, onCleanup, type Component } from "solid-js"
import { useCommands, type Command } from "../../context/commands"

export const CommandPalette: Component = () => {
  const ctx = useCommands()
  const [query, setQuery] = createSignal("")
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  let inputRef: HTMLInputElement | undefined

  const filteredCommands = createMemo(() => {
    const q = query().toLowerCase().trim()
    const cmds = ctx.commands()
    if (!q) return cmds
    return cmds.filter((cmd) => {
      const label = cmd.label.toLowerCase()
      const desc = (cmd.description ?? "").toLowerCase()
      return label.includes(q) || desc.includes(q)
    })
  })

  const groupedCommands = createMemo(() => {
    const cmds = filteredCommands()
    const groups: Record<string, Command[]> = {}
    for (const cmd of cmds) {
      const cat = cmd.category ?? "action"
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(cmd)
    }
    return groups
  })

  const flatCommands = createMemo(() => filteredCommands())

  const handleKeyDown = (e: KeyboardEvent) => {
    const cmds = flatCommands()
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, cmds.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const cmd = cmds[selectedIndex()]
      if (cmd) {
        ctx.execute(cmd.id)
        setQuery("")
        setSelectedIndex(0)
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      ctx.close()
      setQuery("")
      setSelectedIndex(0)
    }
  }

  onMount(() => {
    inputRef?.focus()
  })

  const formatShortcut = (shortcut?: string) => {
    if (!shortcut) return null
    return shortcut
      .replace("ctrl", "⌃")
      .replace("cmd", "⌘")
      .replace("shift", "⇧")
      .replace("alt", "⌥")
      .replace("+", "")
      .toUpperCase()
  }

  const categoryLabel = (cat: string) => {
    const labels: Record<string, string> = {
      session: "Session",
      agent: "Agent",
      model: "Model",
      navigation: "Navigation",
      action: "Actions",
    }
    return labels[cat] ?? cat
  }

  return (
    <Show when={ctx.isOpen()}>
      <div class="command-palette-overlay" onClick={() => ctx.close()} />
      <div class="command-palette">
        <div class="command-search">
          <svg class="command-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands..."
            value={query()}
            onInput={(e) => {
              setQuery(e.currentTarget.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
          />
          <span class="command-hint">esc to close</span>
        </div>
        <div class="command-list">
          <Show when={flatCommands().length > 0} fallback={<div class="command-empty">No commands found</div>}>
            <For each={Object.entries(groupedCommands())}>
              {([category, cmds]) => (
                <div class="command-group">
                  <div class="command-group-label">{categoryLabel(category)}</div>
                  <For each={cmds}>
                    {(cmd) => {
                      const idx = flatCommands().indexOf(cmd)
                      return (
                        <button
                          class={`command-item ${idx === selectedIndex() ? "selected" : ""}`}
                          onClick={() => {
                            ctx.execute(cmd.id)
                            setQuery("")
                            setSelectedIndex(0)
                          }}
                          onMouseEnter={() => setSelectedIndex(idx)}
                        >
                          <span class="command-label">{cmd.label}</span>
                          <Show when={cmd.shortcut}>
                            <span class="command-shortcut">{formatShortcut(cmd.shortcut)}</span>
                          </Show>
                        </button>
                      )
                    }}
                  </For>
                </div>
              )}
            </For>
          </Show>
        </div>
      </div>
    </Show>
  )
}
