import { For, Show, createEffect, type Component } from "solid-js"
import { useOpenCode } from "../../context/opencode"
import { MessageItem } from "./MessageItem"

export const MessageList: Component = () => {
  const ctx = useOpenCode()
  let scrollRef: HTMLDivElement | undefined

  createEffect(() => {
    const messages = ctx.currentMessages()
    if (messages.length > 0 && scrollRef) {
      scrollRef.scrollTop = scrollRef.scrollHeight
    }
  })

  return (
    <div class="message-list" ref={scrollRef}>
      <Show
        when={ctx.currentMessages().length > 0}
        fallback={
          <div class="empty-state">
            <p>Start a conversation</p>
          </div>
        }
      >
        <For each={ctx.currentMessages()}>{(message) => <MessageItem message={message} />}</For>
      </Show>
    </div>
  )
}
