import { For, Show, Switch, Match, type Component } from "solid-js"
import type { MessageWithParts } from "../../context/opencode"
import type { Part } from "../../utils/opencode-api"

export interface MessageItemProps {
  message: MessageWithParts
}

const PartContent: Component<{ part: Part }> = (props) => {
  return (
    <Switch>
      <Match when={props.part.type === "text" && props.part.text}>
        <div class="part-text">{props.part.text}</div>
      </Match>

      <Match when={props.part.type === "tool" && props.part.tool}>
        <div class={`part-tool ${props.part.state?.status ?? "pending"}`}>
          <div class="tool-header">
            <span class="tool-name">{props.part.tool}</span>
            <span class="tool-status">{props.part.state?.status ?? "pending"}</span>
          </div>
          <Show when={props.part.state?.error}>
            <div class="tool-error">{props.part.state?.error}</div>
          </Show>
        </div>
      </Match>

      <Match when={props.part.type === "reasoning" && props.part.text}>
        <div class="part-reasoning">
          <details>
            <summary>Thinking...</summary>
            <div class="reasoning-content">{props.part.text}</div>
          </details>
        </div>
      </Match>

      <Match when={props.part.type === "file"}>
        <div class="part-file">[File attachment]</div>
      </Match>
    </Switch>
  )
}

export const MessageItem: Component<MessageItemProps> = (props) => {
  const isUser = () => props.message.info.role === "user"

  return (
    <div class={`message-item ${isUser() ? "user" : "assistant"}`}>
      <div class="message-role">{isUser() ? "You" : "Assistant"}</div>

      <Show when={isUser() && props.message.info.input?.text}>
        <div class="message-content">{props.message.info.input?.text}</div>
      </Show>

      <Show when={!isUser()}>
        <div class="message-parts">
          <For each={props.message.parts}>{(part) => <PartContent part={part} />}</For>
        </div>
      </Show>

      <Show when={props.message.info.error}>
        <div class="message-error">{props.message.info.error?.data?.message ?? props.message.info.error?.code}</div>
      </Show>
    </div>
  )
}
