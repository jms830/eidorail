import {
  createContext,
  useContext,
  createSignal,
  createMemo,
  onMount,
  onCleanup,
  type ParentComponent,
  type Accessor,
} from "solid-js"

export interface Command {
  id: string
  label: string
  description?: string
  shortcut?: string
  category?: "session" | "agent" | "model" | "navigation" | "action"
  action: () => void | Promise<void>
}

export interface CommandContextValue {
  commands: Accessor<Command[]>
  register: (commands: Command[]) => () => void
  execute: (id: string) => void
  isOpen: Accessor<boolean>
  open: () => void
  close: () => void
  toggle: () => void
}

const CommandContext = createContext<CommandContextValue>()

export function useCommands(): CommandContextValue {
  const ctx = useContext(CommandContext)
  if (!ctx) throw new Error("useCommands must be used within CommandProvider")
  return ctx
}

export const CommandProvider: ParentComponent = (props) => {
  const [registrations, setRegistrations] = createSignal<Command[][]>([])
  const [isOpen, setIsOpen] = createSignal(false)

  const commands = createMemo(() => {
    return registrations().flat()
  })

  const register = (cmds: Command[]) => {
    setRegistrations((prev) => [...prev, cmds])
    return () => {
      setRegistrations((prev) => prev.filter((c) => c !== cmds))
    }
  }

  const execute = (id: string) => {
    const cmd = commands().find((c) => c.id === id)
    if (cmd) {
      cmd.action()
      setIsOpen(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "p") {
      e.preventDefault()
      setIsOpen((prev) => !prev)
      return
    }

    if (e.key === "Escape" && isOpen()) {
      e.preventDefault()
      setIsOpen(false)
      return
    }

    if (isOpen()) return

    for (const cmd of commands()) {
      if (cmd.shortcut && matchShortcut(cmd.shortcut, e)) {
        e.preventDefault()
        cmd.action()
        return
      }
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown)
  })

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeyDown)
  })

  const value: CommandContextValue = {
    commands,
    register,
    execute,
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((prev) => !prev),
  }

  return <CommandContext.Provider value={value}>{props.children}</CommandContext.Provider>
}

function matchShortcut(shortcut: string, e: KeyboardEvent): boolean {
  const parts = shortcut.toLowerCase().split("+")
  const key = parts.pop()

  const needsCtrl = parts.includes("ctrl") || parts.includes("cmd")
  const needsShift = parts.includes("shift")
  const needsAlt = parts.includes("alt")

  if (needsCtrl !== (e.ctrlKey || e.metaKey)) return false
  if (needsShift !== e.shiftKey) return false
  if (needsAlt !== e.altKey) return false

  if (key === "tab") return e.key === "Tab"
  if (key === "enter") return e.key === "Enter"
  if (key === "escape") return e.key === "Escape"

  return e.key.toLowerCase() === key
}
