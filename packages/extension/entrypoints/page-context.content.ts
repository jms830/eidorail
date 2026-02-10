import { Readability } from "@mozilla/readability"
import { htmlToMarkdown, formatCapturedContent } from "../utils/markdown-converter"

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",

  main() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === "EXTRACT_PAGE_CONTENT") {
        const result = extractPageContent()
        sendResponse(result)
        return true
      }

      if (message.type === "EXTRACT_SELECTION") {
        const result = extractSelection()
        sendResponse(result)
        return true
      }

      if (message.type === "EXTRACT_PAGE_SNAPSHOT") {
        const result = extractPageSnapshot()
        sendResponse(result)
        return true
      }
    })
  },
})

function extractPageContent(): { success: boolean; markdown?: string; error?: string } {
  const clone = document.cloneNode(true) as Document
  const reader = new Readability(clone)
  const article = reader.parse()

  if (!article || !article.content) {
    return { success: false, error: "Could not parse page content" }
  }

  const markdown = htmlToMarkdown(article.content)
  const title = article.title || document.title || "Untitled"
  const formatted = formatCapturedContent({
    title,
    url: window.location.href,
    content: markdown,
    type: "page",
  })

  return { success: true, markdown: formatted }
}

function extractSelection(): { success: boolean; markdown?: string; error?: string } {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) {
    return { success: false, error: "No text selected" }
  }

  const range = selection.getRangeAt(0)
  const container = document.createElement("div")
  container.appendChild(range.cloneContents())

  const html = container.innerHTML
  if (!html.trim()) {
    return { success: false, error: "Selection is empty" }
  }

  const markdown = htmlToMarkdown(html)
  const formatted = formatCapturedContent({
    title: document.title,
    url: window.location.href,
    content: markdown,
    type: "selection",
  })

  return { success: true, markdown: formatted }
}

interface SnapshotResult {
  success: boolean
  snapshot?: {
    url: string
    title: string
    capturedAt: number
    headings: Array<{ level: number; text: string }>
    links: number
    images: number
    forms: Array<{ action: string; fields: string[] }>
    wordCount: number
    lang: string
  }
  error?: string
}

function extractPageSnapshot(): SnapshotResult {
  const headings: Array<{ level: number; text: string }> = []
  document.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h) => {
    headings.push({ level: parseInt(h.tagName[1], 10), text: (h.textContent || "").trim().slice(0, 200) })
  })

  const links = document.querySelectorAll("a[href]").length
  const images = document.querySelectorAll("img").length

  const forms: Array<{ action: string; fields: string[] }> = []
  document.querySelectorAll("form").forEach((form) => {
    const fields: string[] = []
    form.querySelectorAll("input,select,textarea").forEach((el) => {
      const name = el.getAttribute("name") || el.getAttribute("id") || el.getAttribute("type") || "unknown"
      fields.push(name)
    })
    forms.push({ action: (form as HTMLFormElement).action || "", fields })
  })

  const text = document.body.innerText || ""
  const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length

  return {
    success: true,
    snapshot: {
      url: window.location.href,
      title: document.title,
      capturedAt: Date.now(),
      headings,
      links,
      images,
      forms,
      wordCount,
      lang: document.documentElement.lang || "",
    },
  }
}
