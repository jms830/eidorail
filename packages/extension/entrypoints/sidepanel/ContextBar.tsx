import { createSignal, Show, onMount, onCleanup } from "solid-js"
import type { TabInfo } from "../../utils/browser-context"
import { canCaptureUrl, getAllWindowsTabs, formatTabTree } from "../../utils/browser-context"
import { sendSageMessage, MSG } from "../../utils/message-contracts"
import { TabPicker } from "./TabPicker"

type CaptureState = "idle" | "loading" | "success" | "error"

export function ContextBar() {
  const [targetTab, setTargetTab] = createSignal<TabInfo | null>(null)
  const [showPicker, setShowPicker] = createSignal(false)
  const [screenshotState, setScreenshotState] = createSignal<CaptureState>("idle")
  const [pageState, setPageState] = createSignal<CaptureState>("idle")
  const [selectionState, setSelectionState] = createSignal<CaptureState>("idle")
  const [tabTreeState, setTabTreeState] = createSignal<CaptureState>("idle")
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null)
  const [showCopiedToast, setShowCopiedToast] = createSignal(false)

  const timeouts = new Set<number>()

  function schedule(fn: () => void, ms: number) {
    const id = window.setTimeout(() => {
      timeouts.delete(id)
      fn()
    }, ms)
    timeouts.add(id)
  }

  onCleanup(() => {
    for (const id of timeouts) clearTimeout(id)
    timeouts.clear()
  })

  onMount(async () => {
    const res = await sendSageMessage({ type: MSG.GET_CURRENT_TAB })
    if (res.ok && res.data.tab?.id) {
      setTargetTab({
        id: res.data.tab.id,
        title: res.data.tab.title || "Untitled",
        url: res.data.tab.url || "",
        favIconUrl: res.data.tab.favIconUrl,
        active: true,
      })
    }
  })

  function resetState(setter: (s: CaptureState) => void) {
    schedule(() => setter("idle"), 1500)
  }

  async function handleScreenshot() {
    const tab = targetTab()
    if (!tab || !canCaptureUrl(tab.url)) {
      setErrorMessage("Cannot capture this page")
      return
    }

    setScreenshotState("loading")
    const res = await sendSageMessage({ type: MSG.CAPTURE_FULL_PAGE_SCREENSHOT, tabId: tab.id })

    if (!res.ok) {
      setScreenshotState("error")
      setErrorMessage(res.error)
      resetState(setScreenshotState)
      return
    }

    await copyImageToClipboard(res.data.screenshot)
    setScreenshotState("success")
    resetState(setScreenshotState)
  }

  async function handlePageCapture() {
    const tab = targetTab()
    if (!tab || !canCaptureUrl(tab.url)) {
      setErrorMessage("Cannot capture this page")
      return
    }

    setPageState("loading")
    const res = await sendSageMessage({ type: MSG.CAPTURE_PAGE_MARKDOWN, tabId: tab.id })

    if (!res.ok) {
      setPageState("error")
      setErrorMessage(res.error)
      resetState(setPageState)
      return
    }

    await copyToClipboard(res.data.markdown)
    setPageState("success")
    resetState(setPageState)
  }

  async function handleSelectionCapture() {
    const tab = targetTab()
    if (!tab || !canCaptureUrl(tab.url)) {
      setErrorMessage("Cannot capture from this page")
      return
    }

    setSelectionState("loading")
    const res = await sendSageMessage({ type: MSG.CAPTURE_SELECTION_MARKDOWN, tabId: tab.id })

    if (!res.ok) {
      setSelectionState("error")
      setErrorMessage(res.error)
      resetState(setSelectionState)
      return
    }

    await copyToClipboard(res.data.markdown)
    setSelectionState("success")
    resetState(setSelectionState)
  }

  async function handleTabTree() {
    setTabTreeState("loading")
    try {
      const tree = await getAllWindowsTabs()
      const markdown = formatTabTree(tree)
      await copyToClipboard(markdown)
      setTabTreeState("success")
      resetState(setTabTreeState)
    } catch (err) {
      setTabTreeState("error")
      setErrorMessage("Failed to capture tab tree")
      resetState(setTabTreeState)
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setShowCopiedToast(true)
      schedule(() => setShowCopiedToast(false), 1500)
    } catch (err) {
      console.warn("[ContextBar] Clipboard write failed:", err)
      setErrorMessage("Clipboard access denied")
      resetState(setSelectionState)
      resetState(setScreenshotState)
    }
  }

  async function copyImageToClipboard(dataUrl: string) {
    try {
      const response = await fetch(dataUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      setShowCopiedToast(true)
      schedule(() => setShowCopiedToast(false), 1500)
    } catch (err) {
      console.warn("[ContextBar] Image clipboard write failed:", err)
      setErrorMessage("Clipboard access denied")
      resetState(setScreenshotState)
    }
  }

  function handleTabSelect(tab: TabInfo) {
    setTargetTab(tab)
    setShowPicker(false)
  }

  function getButtonIcon(state: CaptureState, defaultIcon: string) {
    if (state === "loading") return ICONS.spinner
    if (state === "success") return ICONS.check
    if (state === "error") return ICONS.error
    return defaultIcon
  }

  function getButtonClass(state: CaptureState) {
    if (state === "success") return "context-action-btn success"
    if (state === "error") return "context-action-btn error"
    return "context-action-btn"
  }

  const canCapture = () => {
    const tab = targetTab()
    return tab && canCaptureUrl(tab.url)
  }

  return (
    <div class="context-bar">
      <button
        class="context-tab-info"
        onClick={() => setShowPicker(!showPicker())}
        title={targetTab()?.title || "Select a tab"}
      >
        <Show when={targetTab()?.favIconUrl} fallback={<span class="context-tab-icon" innerHTML={ICONS.globe} />}>
          <img src={targetTab()!.favIconUrl} alt="" class="context-tab-favicon" />
        </Show>
        <span class="context-tab-title">{truncateTitle(targetTab()?.title || "No tab selected")}</span>
        <span class="context-tab-chevron" innerHTML={ICONS.chevronDown} />
      </button>

      <div class="context-actions">
        <button
          class={getButtonClass(screenshotState())}
          onClick={handleScreenshot}
          disabled={!canCapture() || screenshotState() === "loading"}
          title="Full Page Screenshot"
        >
          <span innerHTML={getButtonIcon(screenshotState(), ICONS.camera)} />
        </button>
        <button
          class={getButtonClass(pageState())}
          onClick={handlePageCapture}
          disabled={!canCapture() || pageState() === "loading"}
          title="Page → Markdown"
        >
          <span innerHTML={getButtonIcon(pageState(), ICONS.page)} />
        </button>
        <button
          class={getButtonClass(selectionState())}
          onClick={handleSelectionCapture}
          disabled={!canCapture() || selectionState() === "loading"}
          title="Selection → Markdown"
        >
          <span innerHTML={getButtonIcon(selectionState(), ICONS.selection)} />
        </button>
        <button
          class={getButtonClass(tabTreeState())}
          onClick={handleTabTree}
          disabled={tabTreeState() === "loading"}
          title="Tab Tree → Markdown"
        >
          <span innerHTML={getButtonIcon(tabTreeState(), ICONS.tree)} />
        </button>
      </div>

      <Show when={showPicker()}>
        <TabPicker onSelect={handleTabSelect} onClose={() => setShowPicker(false)} currentTabId={targetTab()?.id} />
      </Show>

      <Show when={errorMessage()}>
        <div class="context-toast error">{errorMessage()}</div>
      </Show>

      <Show when={showCopiedToast()}>
        <div class="context-toast success">Copied!</div>
      </Show>
    </div>
  )
}

function truncateTitle(title: string, maxLen = 30): string {
  if (title.length <= maxLen) return title
  return title.slice(0, maxLen - 1) + "…"
}

const ICONS = {
  globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  page: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  selection: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 10H3"/><path d="M21 6H3"/><path d="M21 14H3"/><path d="M17 18H3"/></svg>`,
  tree: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
  spinner: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 019.5 6.8" stroke-linecap="round"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
  error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
}
