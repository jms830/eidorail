import { createSignal, createMemo, For, Show, onMount, onCleanup, type Component } from "solid-js"
import { useOpenCode } from "../../context/opencode"

export const SessionHeader: Component = () => {
  const ctx = useOpenCode()
  const [dropdownOpen, setDropdownOpen] = createSignal(false)
  const [searchQuery, setSearchQuery] = createSignal("")
  let searchInputRef: HTMLInputElement | undefined

  const currentTitle = () => {
    const session = ctx.currentSession()
    return session?.summary?.title ?? session?.title ?? "New Chat"
  }

  const filteredSessions = createMemo(() => {
    const query = searchQuery().toLowerCase().trim()
    const sessions = Array.isArray(ctx.state.sessions) ? ctx.state.sessions : []
    if (!query) return sessions.slice(0, 20)
    return sessions
      .filter((s) => {
        const title = (s.summary?.title ?? s.title ?? "").toLowerCase()
        return title.includes(query)
      })
      .slice(0, 20)
  })

  const handleNewSession = async () => {
    setDropdownOpen(false)
    setSearchQuery("")
    await ctx.createSession()
  }

  const handleSelectSession = (id: string) => {
    setDropdownOpen(false)
    setSearchQuery("")
    ctx.setCurrentSessionId(id)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setDropdownOpen(false)
      setSearchQuery("")
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown)
  })

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeyDown)
  })

  const openDropdown = () => {
    setDropdownOpen(true)
    setTimeout(() => searchInputRef?.focus(), 50)
  }

  const formatTime = (ts: number) => {
    const date = new Date(ts)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) return "Today"
    if (days === 1) return "Yesterday"
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div class="session-header">
      <button class="session-selector" onClick={openDropdown}>
        <span class="session-title">{currentTitle()}</span>
        <svg class="session-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <button class="new-session-btn" onClick={handleNewSession} title="New Chat">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      <Show when={dropdownOpen()}>
        <div
          class="session-dropdown-overlay"
          onClick={() => {
            setDropdownOpen(false)
            setSearchQuery("")
          }}
        />
        <div class="session-dropdown">
          <div class="session-search">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search sessions..."
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setDropdownOpen(false)
                  setSearchQuery("")
                }
              }}
            />
          </div>
          <div class="session-dropdown-header">
            <span>{searchQuery() ? "Results" : "Recent"}</span>
            <button class="dropdown-new-btn" onClick={handleNewSession}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New
            </button>
          </div>
          <div class="session-list">
            <Show
              when={filteredSessions().length > 0}
              fallback={<div class="no-sessions">{searchQuery() ? "No matching sessions" : "No sessions yet"}</div>}
            >
              <For each={filteredSessions()}>
                {(session) => (
                  <button
                    class={`session-item ${ctx.currentSessionId() === session.id ? "active" : ""}`}
                    onClick={() => handleSelectSession(session.id)}
                  >
                    <span class="session-item-title">{session.summary?.title ?? session.title ?? "Untitled"}</span>
                    <span class="session-item-time">{formatTime(session.time.updated)}</span>
                  </button>
                )}
              </For>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )
}
