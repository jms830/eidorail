import { Show, type Component } from "solid-js"

export interface PlusMenuProps {
  isOpen: boolean
  onClose: () => void
  onUploadFiles: () => void
  onTakeScreenshot: () => void
  onCapturePage: () => void
}

export const PlusMenu: Component<PlusMenuProps> = (props) => {
  return (
    <Show when={props.isOpen}>
      <div class="dropdown-overlay" onClick={props.onClose} />
      <div class="plus-menu">
        <div class="plus-menu-section">
          <button
            class="plus-menu-item"
            onClick={() => {
              props.onUploadFiles()
              props.onClose()
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Upload Files</span>
          </button>
          <button
            class="plus-menu-item"
            onClick={() => {
              props.onTakeScreenshot()
              props.onClose()
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <span>Take Screenshot</span>
          </button>
          <button
            class="plus-menu-item"
            onClick={() => {
              props.onCapturePage()
              props.onClose()
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <span>Capture Page</span>
          </button>
        </div>
      </div>
    </Show>
  )
}
