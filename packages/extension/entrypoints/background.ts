import { getCurrentWindowTabs } from "../utils/browser-context"
import {
  getContextMenuPlatforms,
  onSettingsChange,
  onPlatformsChange,
  initStorageFromLocalStorage,
} from "../utils/platform-storage"
import { ok, fail, errorString } from "../utils/message-contracts"
import type { PageSnapshot } from "../utils/message-contracts"
import {
  installDiagnosticsCollectorScript,
  harvestDiagnosticsScript,
  formatDiagnostics,
} from "../utils/page-diagnostics"
import { sleep, withTimeout } from "../utils/async-wait"

type ExtractionResult = { success: boolean; markdown?: string; error?: string }
type CaptureType = "page" | "selection" | "screenshot"

interface PageDimensions {
  scrollWidth: number
  scrollHeight: number
  viewportWidth: number
  viewportHeight: number
  devicePixelRatio: number
  originalScrollX: number
  originalScrollY: number
}

async function captureScreenshot(tabId?: number): Promise<{ screenshot?: string; error?: string }> {
  try {
    if (tabId) {
      const tab = await chrome.tabs.get(tabId)

      if (!tab.active) {
        await chrome.tabs.update(tabId, { active: true })
        await sleep(100)
      }

      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" })
      return { screenshot: dataUrl }
    }

    const dataUrl = await chrome.tabs.captureVisibleTab({ format: "png" })
    return { screenshot: dataUrl }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes("Cannot access") || msg.includes("chrome://") || msg.includes("edge://")) {
      return { error: "Cannot capture browser pages (chrome://, edge://, etc.)" }
    }
    if (msg.includes("No window with id") || msg.includes("No tab with id")) {
      return { error: "Tab not found. Try refreshing the page." }
    }
    return { error: msg }
  }
}

async function ensureTabLoaded(tabId: number): Promise<{ ok: boolean; error?: string }> {
  const tab = await chrome.tabs.get(tabId)
  if (!tab.discarded) return { ok: true }

  await chrome.tabs.update(tabId, { active: true })
  const result = await withTimeout(
    () =>
      new Promise<void>((resolve) => {
        const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
          if (updatedTabId === tabId && info.status === "complete") {
            chrome.tabs.onUpdated.removeListener(listener)
            resolve()
          }
        }
        chrome.tabs.onUpdated.addListener(listener)
      }),
    10000,
    "tab reload",
  )
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

async function capturePageMarkdown(tabId: number): Promise<{ markdown?: string; error?: string }> {
  const loaded = await ensureTabLoaded(tabId)
  if (!loaded.ok) return { error: loaded.error }

  try {
    const result = await chrome.tabs.sendMessage(tabId, { type: "EXTRACT_PAGE_CONTENT" })
    if (result?.success && result.markdown) {
      return { markdown: result.markdown }
    }
  } catch {
    console.log("[Sage] Content script not available, using fallback extraction")
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractPageContentFallback,
    })
    const result = results[0]?.result
    if (result?.success) {
      return { markdown: result.markdown }
    }
    return { error: result?.error || "Failed to extract page content" }
  } catch (error) {
    return { error: `Extraction failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

async function captureSelectionMarkdown(tabId: number): Promise<{ markdown?: string; error?: string }> {
  const loaded = await ensureTabLoaded(tabId)
  if (!loaded.ok) return { error: loaded.error }

  try {
    const result = await chrome.tabs.sendMessage(tabId, { type: "EXTRACT_SELECTION" })
    if (result?.success && result.markdown) {
      return { markdown: result.markdown }
    }
    if (result?.error) {
      return { error: result.error }
    }
  } catch {
    console.log("[Sage] Content script not available, using fallback extraction")
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractSelectionFallback,
    })
    const result = results[0]?.result
    if (result?.success) {
      return { markdown: result.markdown }
    }
    return { error: result?.error || "No text selected" }
  } catch (error) {
    return { error: `Extraction failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

function getPageDimensionsScript(): PageDimensions {
  return {
    scrollWidth: Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
      document.documentElement.offsetWidth,
    ),
    scrollHeight: Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      document.documentElement.offsetHeight,
    ),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    originalScrollX: window.scrollX,
    originalScrollY: window.scrollY,
  }
}

function collectPageSnapshotScript(): PageSnapshot {
  const headings: PageSnapshot["headings"] = []
  document.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h) => {
    headings.push({ level: parseInt(h.tagName[1], 10), text: (h.textContent || "").trim().slice(0, 200) })
  })

  const links = document.querySelectorAll("a[href]").length
  const images = document.querySelectorAll("img").length

  const forms: PageSnapshot["forms"] = []
  document.querySelectorAll("form").forEach((form) => {
    const fields: string[] = []
    form.querySelectorAll("input,select,textarea").forEach((el) => {
      const name = el.getAttribute("name") || el.getAttribute("id") || el.getAttribute("type") || "unknown"
      fields.push(name)
    })
    forms.push({ action: form.action || "", fields })
  })

  const text = document.body.innerText || ""
  const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length

  return {
    url: window.location.href,
    title: document.title,
    capturedAt: Date.now(),
    headings,
    links,
    images,
    forms,
    wordCount,
    lang: document.documentElement.lang || "",
  }
}

function scrollToScript(x: number, y: number): void {
  window.scrollTo(x, y)
}

function restoreScrollScript(x: number, y: number): void {
  window.scrollTo(x, y)
}

async function captureFullPageScreenshot(tabId: number): Promise<{ screenshot?: string; error?: string }> {
  const loaded = await ensureTabLoaded(tabId)
  if (!loaded.ok) return { error: loaded.error }

  try {
    const tab = await chrome.tabs.get(tabId)
    if (!tab.active) {
      await chrome.tabs.update(tabId, { active: true })
      await sleep(150)
    }

    const dimResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: getPageDimensionsScript,
    })
    const dimensions = dimResults[0]?.result as PageDimensions
    if (!dimensions) {
      return { error: "Could not get page dimensions" }
    }

    const {
      scrollWidth,
      scrollHeight,
      viewportWidth,
      viewportHeight,
      devicePixelRatio,
      originalScrollX,
      originalScrollY,
    } = dimensions

    if (scrollHeight <= viewportHeight && scrollWidth <= viewportWidth) {
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId!, { format: "png" })
      return { screenshot: dataUrl }
    }

    const tiles: { dataUrl: string; x: number; y: number }[] = []
    const ySteps = Math.ceil(scrollHeight / viewportHeight)
    const xSteps = Math.ceil(scrollWidth / viewportWidth)

    for (let yi = 0; yi < ySteps; yi++) {
      for (let xi = 0; xi < xSteps; xi++) {
        const scrollX = xi * viewportWidth
        const scrollY = yi * viewportHeight

        await chrome.scripting.executeScript({
          target: { tabId },
          func: scrollToScript,
          args: [scrollX, scrollY],
        })

        await sleep(150)

        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId!, { format: "png" })
        tiles.push({ dataUrl, x: scrollX, y: scrollY })

        await sleep(400)
      }
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      func: restoreScrollScript,
      args: [originalScrollX, originalScrollY],
    })

    const stitchResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: stitchTilesInPage,
      args: [tiles, scrollWidth, scrollHeight, viewportWidth, viewportHeight, devicePixelRatio],
    })

    const finalDataUrl = stitchResults[0]?.result as string
    if (!finalDataUrl) {
      return { error: "Failed to stitch screenshots" }
    }

    return { screenshot: finalDataUrl }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return { error: `Full page capture failed: ${msg}` }
  }
}

function stitchTilesInPage(
  tiles: { dataUrl: string; x: number; y: number }[],
  totalWidth: number,
  totalHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  dpr: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas")
    canvas.width = totalWidth * dpr
    canvas.height = totalHeight * dpr

    const ctx = canvas.getContext("2d")
    if (!ctx) {
      reject("Could not get canvas context")
      return
    }

    let loaded = 0
    const images: { img: HTMLImageElement; x: number; y: number }[] = []

    for (const tile of tiles) {
      const img = new Image()
      img.onload = () => {
        images.push({ img, x: tile.x * dpr, y: tile.y * dpr })
        loaded++
        if (loaded === tiles.length) {
          for (const { img, x, y } of images) {
            ctx.drawImage(img, x, y)
          }
          resolve(canvas.toDataURL("image/png"))
        }
      }
      img.onerror = () => reject("Failed to load tile image")
      img.src = tile.dataUrl
    }
  })
}

function extractPageContentFallback(): ExtractionResult {
  const title = document.title || "Untitled"
  const url = window.location.href

  const mainContent = document.querySelector("main, article, [role='main'], .main-content, #main-content")
  const content = mainContent || document.body

  const clone = content.cloneNode(true) as HTMLElement
  clone.querySelectorAll("script, style, nav, header, footer, aside, iframe, noscript").forEach((el) => el.remove())

  clone.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((h) => {
    h.textContent = `${"#".repeat(parseInt(h.tagName[1]))} ${h.textContent?.trim()}`
  })

  const text = clone.innerText || clone.textContent || ""
  const cleanedText = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n\n")

  const timestamp = new Date().toLocaleString()
  const formatted = `# ${title}\n\n> **Source**: ${url}\n> **Captured**: ${timestamp}\n\n${cleanedText}`

  return { success: true, markdown: formatted }
}

function extractSelectionFallback(): ExtractionResult {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) {
    return { success: false, error: "No text selected" }
  }

  const text = selection.toString().trim()
  if (!text) {
    return { success: false, error: "Selection is empty" }
  }

  const title = document.title || "Untitled"
  const url = window.location.href
  const formatted = `> Selected from [${title}](${url})\n\n${text}`

  return { success: true, markdown: formatted }
}

async function createContextMenus(): Promise<void> {
  await chrome.contextMenus.removeAll()

  const platforms = await getContextMenuPlatforms()
  if (platforms.length === 0) return

  chrome.contextMenus.create({
    id: "sage-parent",
    title: "Sage Sidebar",
    contexts: ["page", "selection"],
  })

  for (const platform of platforms) {
    chrome.contextMenus.create({
      id: `send-page-${platform.id}`,
      parentId: "sage-parent",
      title: `Send Page to ${platform.name}`,
      contexts: ["page"],
    })

    chrome.contextMenus.create({
      id: `send-selection-${platform.id}`,
      parentId: "sage-parent",
      title: `Send Selection to ${platform.name}`,
      contexts: ["selection"],
    })
  }

  chrome.contextMenus.create({
    id: "sage-separator",
    parentId: "sage-parent",
    type: "separator",
    contexts: ["page", "selection"],
  })

  for (const platform of platforms) {
    chrome.contextMenus.create({
      id: `send-screenshot-${platform.id}`,
      parentId: "sage-parent",
      title: `Send Screenshot to ${platform.name}`,
      contexts: ["page", "selection"],
    })
  }
}

function parseMenuItemId(menuItemId: string): { type: CaptureType; platformId: string } | null {
  const match = menuItemId.match(/^send-(page|selection|screenshot)-(.+)$/)
  if (!match) return null
  return { type: match[1] as CaptureType, platformId: match[2] }
}

async function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab: chrome.tabs.Tab | undefined,
): Promise<void> {
  if (!tab?.id) return

  const parsed = parseMenuItemId(String(info.menuItemId))
  if (!parsed) return

  const { type, platformId } = parsed

  let clipboardData: { text?: string; imageDataUrl?: string } | null = null

  if (type === "page") {
    const result = await capturePageMarkdown(tab.id)
    if (result.markdown) clipboardData = { text: result.markdown }
  } else if (type === "selection") {
    const result = await captureSelectionMarkdown(tab.id)
    if (result.markdown) clipboardData = { text: result.markdown }
  } else if (type === "screenshot") {
    const result = await captureFullPageScreenshot(tab.id)
    if (result.screenshot) clipboardData = { imageDataUrl: result.screenshot }
  }

  if (!clipboardData) return

  await chrome.sidePanel.open({ tabId: tab.id }).catch(console.warn)

  chrome.runtime.sendMessage({
    type: "CONTEXT_MENU_CAPTURE",
    platformId,
    clipboardData,
  })
}

// Platforms that need manual content script injection in sidepanel iframes
const COMPACT_MODE_URLS = [
  { pattern: /^https:\/\/app\.ninjacat\.io\//, script: "content-scripts/ninjacat-compact.js" },
  { pattern: /^https:\/\/app\.mymarketingreports\.com\//, script: "content-scripts/ninjacat-compact.js" },
]

function shouldInjectCompactMode(url: string): string | null {
  if (!url.includes("sage=compact")) return null
  for (const { pattern, script } of COMPACT_MODE_URLS) {
    if (pattern.test(url)) return script
  }
  return null
}

export default defineBackground(() => {
  console.log("[Sage] Background service worker started")

  initStorageFromLocalStorage().then(() => createContextMenus())
  onSettingsChange(() => createContextMenus())
  onPlatformsChange(() => createContextMenus())

  chrome.contextMenus.onClicked.addListener(handleContextMenuClick)

  // Inject compact mode scripts into iframes within sidepanel
  // Content scripts don't auto-inject into iframes in extension pages
  chrome.webNavigation.onDOMContentLoaded.addListener((details) => {
    const script = shouldInjectCompactMode(details.url)
    if (!script) return

    console.log("[Sage] Injecting compact mode into:", details.url, "frame:", details.frameId)

    chrome.scripting
      .executeScript({
        target: { tabId: details.tabId, frameIds: [details.frameId] },
        files: [script],
      })
      .catch((error) => {
        // This is expected to fail for regular tabs where content script already injected
        console.log("[Sage] Script injection skipped (likely already injected):", error.message)
      })
  })

  // Open sidepanel when extension icon is clicked
  chrome.action.onClicked.addListener((tab) => {
    if (!tab.id) return
    chrome.sidePanel.open({ tabId: tab.id }).catch((error) => {
      console.warn("[Sage] Failed to open sidepanel:", error)
    })
  })

  // Handle keyboard commands
  chrome.commands.onCommand.addListener((command) => {
    if (command !== "toggle-side-panel") return

    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => {
        if (!tab?.id) return
        return chrome.sidePanel.open({ tabId: tab.id })
      })
      .catch((error) => {
        console.warn("[Sage] Failed to toggle sidepanel:", error)
      })
  })

  // Set sidepanel behavior to open on action click
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
    console.warn("[Sage] Failed to set sidepanel behavior:", error)
  })

  // Listen for messages from sidepanel or content scripts
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("[Sage] Received message:", message.type)

    switch (message.type) {
      case "GET_CURRENT_TAB":
        chrome.tabs
          .query({ active: true, currentWindow: true })
          .then(([tab]) => sendResponse(ok({ tab })))
          .catch((err) => sendResponse(fail(errorString(err))))
        return true

      case "CAPTURE_SCREENSHOT":
        captureScreenshot(message.tabId)
          .then((r) =>
            r.screenshot
              ? sendResponse(ok({ screenshot: r.screenshot }))
              : sendResponse(fail(r.error || "Screenshot capture failed")),
          )
          .catch((err) => sendResponse(fail(errorString(err))))
        return true

      case "CAPTURE_FULL_PAGE_SCREENSHOT":
        if (message.tabId) {
          captureFullPageScreenshot(message.tabId)
            .then((r) =>
              r.screenshot
                ? sendResponse(ok({ screenshot: r.screenshot }))
                : sendResponse(fail(r.error || "Full page capture failed")),
            )
            .catch((err) => sendResponse(fail(errorString(err))))
          return true
        }
        sendResponse(fail("No tabId provided"))
        return true

      case "GET_PAGE_CONTENT":
        if (message.tabId) {
          ensureTabLoaded(message.tabId)
            .then((loaded) => {
              if (!loaded.ok) {
                sendResponse(fail(loaded.error || "Tab load failed"))
                return
              }
              return chrome.scripting.executeScript({
                target: { tabId: message.tabId },
                func: () => document.body.innerText,
              })
            })
            .then((results) => {
              if (results) sendResponse(ok({ content: results[0]?.result || "" }))
            })
            .catch((err) => sendResponse(fail(errorString(err))))
          return true
        }
        break

      case "GET_TABS_WITH_GROUPS":
        getCurrentWindowTabs()
          .then((tabs) => sendResponse(ok({ tabs })))
          .catch((err) => sendResponse(fail(errorString(err))))
        return true

      case "CAPTURE_PAGE_MARKDOWN":
        if (message.tabId) {
          capturePageMarkdown(message.tabId)
            .then((r) =>
              r.markdown
                ? sendResponse(ok({ markdown: r.markdown }))
                : sendResponse(fail(r.error || "Markdown extraction failed")),
            )
            .catch((err) => sendResponse(fail(errorString(err))))
          return true
        }
        sendResponse(fail("No tabId provided"))
        return true

      case "CAPTURE_SELECTION_MARKDOWN":
        if (message.tabId) {
          captureSelectionMarkdown(message.tabId)
            .then((r) =>
              r.markdown
                ? sendResponse(ok({ markdown: r.markdown }))
                : sendResponse(fail(r.error || "Selection extraction failed")),
            )
            .catch((err) => sendResponse(fail(errorString(err))))
          return true
        }
        sendResponse(fail("No tabId provided"))
        return true

      case "CAPTURE_DIAGNOSTICS":
        if (message.tabId) {
          const diagTabId = message.tabId as number
          ensureTabLoaded(diagTabId)
            .then(async (loaded) => {
              if (!loaded.ok) {
                sendResponse(fail(loaded.error || "Tab load failed"))
                return
              }
              if (message.install) {
                await chrome.scripting.executeScript({
                  target: { tabId: diagTabId },
                  func: installDiagnosticsCollectorScript,
                  world: "MAIN",
                })
              }
              const results = await chrome.scripting.executeScript({
                target: { tabId: diagTabId },
                func: harvestDiagnosticsScript,
                world: "MAIN",
              })
              const diag = results[0]?.result
              if (!diag) {
                sendResponse(fail("Failed to collect diagnostics"))
                return
              }
              sendResponse(ok({ diagnostics: diag, markdown: formatDiagnostics(diag) }))
            })
            .catch((err) => sendResponse(fail(errorString(err))))
          return true
        }
        sendResponse(fail("No tabId provided"))
        return true

      case "CAPTURE_PAGE_SNAPSHOT":
        if (message.tabId) {
          const snapTabId = message.tabId as number
          ensureTabLoaded(snapTabId)
            .then(async (loaded) => {
              if (!loaded.ok) {
                sendResponse(fail(loaded.error || "Tab load failed"))
                return
              }
              // Try content script first (richer extraction when available)
              try {
                const csResult = await chrome.tabs.sendMessage(snapTabId, { type: "EXTRACT_PAGE_SNAPSHOT" })
                if (csResult?.success && csResult.snapshot) {
                  sendResponse(ok({ snapshot: csResult.snapshot }))
                  return
                }
              } catch {
                console.log("[Sage] Content script not available for snapshot, using fallback")
              }
              // Fallback: inject script directly
              const results = await chrome.scripting.executeScript({
                target: { tabId: snapTabId },
                func: collectPageSnapshotScript,
              })
              const snapshot = results[0]?.result
              if (!snapshot) {
                sendResponse(fail("Failed to collect page snapshot"))
                return
              }
              sendResponse(ok({ snapshot }))
            })
            .catch((err) => sendResponse(fail(errorString(err))))
          return true
        }
        sendResponse(fail("No tabId provided"))
        return true

      default:
        console.log("[Sage] Unknown message type:", message.type)
    }
  })

  // Listen for external messages from Eidolon Sync extension
  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    console.log("[Sage] External message from:", sender.id, message.type)

    switch (message.type) {
      case "IMPORT_PROJECT":
        sendResponse(ok({ success: true as const }))
        break

      case "PING":
        sendResponse(ok({ pong: true as const, version: "0.1.0" }))
        break

      default:
        sendResponse(fail("Unknown message type"))
    }
  })
})
