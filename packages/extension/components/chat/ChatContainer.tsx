import { Show, onMount, onCleanup, type Component } from "solid-js"
import { OpenCodeProvider, useOpenCode } from "../../context/opencode"
import { CommandProvider, useCommands, type Command } from "../../context/commands"
import { SessionHeader } from "./SessionHeader"
import { VirtualizedMessageList } from "./VirtualizedMessageList"
import { PromptBar } from "./PromptBar"
import { CommandPalette } from "./CommandPalette"
import { getOpenCodePort } from "../../utils/opencode-status"

export interface ChatContainerProps {
  directory?: string
}

const ErrorBanner: Component = () => {
  const ctx = useOpenCode()

  return (
    <Show when={ctx.error()}>
      <div class="error-banner">
        <span class="error-text">{ctx.error()}</span>
        <button class="error-dismiss" onClick={() => ctx.clearError()} title="Dismiss">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </Show>
  )
}

const ChatCommands: Component = () => {
  const opencode = useOpenCode()
  const commands = useCommands()

  onMount(() => {
    const cmds: Command[] = [
      {
        id: "session.new",
        label: "New Session",
        description: "Start a new chat session",
        shortcut: "ctrl+n",
        category: "session",
        action: async () => {
          await opencode.createSession()
        },
      },
      {
        id: "session.refresh",
        label: "Refresh Sessions",
        description: "Reload session list",
        category: "session",
        action: () => opencode.refresh(),
      },
      {
        id: "input.clear",
        label: "Clear Input",
        description: "Clear the message input",
        shortcut: "ctrl+u",
        category: "action",
        action: () => {
          const textarea = document.querySelector(".prompt-input") as HTMLTextAreaElement
          if (textarea) {
            textarea.value = ""
            textarea.dispatchEvent(new Event("input", { bubbles: true }))
          }
        },
      },
      {
        id: "action.abort",
        label: "Stop Generation",
        description: "Abort current generation",
        shortcut: "ctrl+c",
        category: "action",
        action: () => opencode.abort(),
      },
      {
        id: "navigation.scrollBottom",
        label: "Scroll to Bottom",
        description: "Scroll to latest message",
        shortcut: "ctrl+end",
        category: "navigation",
        action: () => {
          const list = document.querySelector(".message-list")
          if (list) list.scrollTop = list.scrollHeight
        },
      },
    ]

    const unregister = commands.register(cmds)
    onCleanup(unregister)
  })

  return null
}

const ChatContent: Component = () => {
  const ctx = useOpenCode()

  return (
    <div class="chat-container">
      <ChatCommands />
      <CommandPalette />

      <Show when={!ctx.isConnected()}>
        <div class="chat-connecting">
          <div class="spinner" />
          <p>Connecting to OpenCode...</p>
          <button class="retry-btn-small" onClick={() => ctx.refresh()}>
            Retry
          </button>
        </div>
      </Show>

      <Show when={ctx.isConnected()}>
        <ErrorBanner />
        <SessionHeader />
        <div class="chat-content">
          <VirtualizedMessageList />
          <PromptBar />
        </div>
      </Show>
    </div>
  )
}

export const ChatContainer: Component<ChatContainerProps> = (props) => {
  const port = getOpenCodePort()

  return (
    <CommandProvider>
      <OpenCodeProvider port={port} directory={props.directory}>
        <ChatContent />
      </OpenCodeProvider>
    </CommandProvider>
  )
}
