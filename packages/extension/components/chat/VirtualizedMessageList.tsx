import { For, Show, createSignal, createEffect, onMount, onCleanup, type Component } from "solid-js"
import { useOpenCode } from "../../context/opencode"
import { MessageItem } from "./MessageItem"

export const VirtualizedMessageList: Component = () => {
  const ctx = useOpenCode()
  let containerRef: HTMLDivElement | undefined

  const [shouldAutoScroll, setShouldAutoScroll] = createSignal(true)
  const [showScrollButton, setShowScrollButton] = createSignal(false)

  const messages = () => ctx.currentMessages()

  const handleScroll = () => {
    if (!containerRef) return
    const atBottom = containerRef.scrollHeight - containerRef.scrollTop - containerRef.clientHeight < 80
    setShouldAutoScroll(atBottom)
    setShowScrollButton(!atBottom && messages().length > 0)
  }

  const scrollToBottom = (smooth = false) => {
    if (!containerRef) return
    containerRef.scrollTo({
      top: containerRef.scrollHeight,
      behavior: smooth ? "smooth" : "instant",
    })
    setShouldAutoScroll(true)
    setShowScrollButton(false)
  }

  createEffect(() => {
    const _ = messages()
    if (shouldAutoScroll()) {
      queueMicrotask(() => scrollToBottom())
    }
  })

  onMount(() => {
    scrollToBottom()
  })

  return (
    <div class="message-list-wrapper">
      <div class="message-list" ref={containerRef} onScroll={handleScroll}>
        <Show
          when={messages().length > 0}
          fallback={
            <div class="empty-state">
              <p>Start a conversation</p>
            </div>
          }
        >
          <For each={messages()}>{(message) => <MessageItem message={message} />}</For>
        </Show>
      </div>

      <Show when={showScrollButton()}>
        <button class="scroll-to-bottom" onClick={() => scrollToBottom(true)} title="Scroll to bottom">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </button>
      </Show>
    </div>
  )
}
