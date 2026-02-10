/**
 * Robust element locator that supports multiple selector strategies.
 * Adapted from opencode-browser's locator system.
 *
 * Strategies: css, label, aria, placeholder, name, role, text, id
 * Usage: `label:Email Address`, `aria:Submit`, `placeholder:Search`, `css:.my-class`
 *
 * Designed to run inside content script / executeScript context.
 */

const MAX_DEPTH = 6

type LocatorKind = "css" | "label" | "aria" | "placeholder" | "name" | "role" | "text" | "id"

interface Locator {
  kind: LocatorKind
  value: string
  raw: string
}

const LOCATOR_ALIASES: Record<string, LocatorKind> = {
  css: "css",
  label: "label",
  field: "label",
  aria: "aria",
  "aria-label": "aria",
  placeholder: "placeholder",
  name: "name",
  role: "role",
  text: "text",
  id: "id",
}

function stripQuotes(v: string): string {
  return v.replace(/^['"]|['"]$/g, "")
}

function normalizeText(v: string): string {
  return v.replace(/\s+/g, " ").trim().toLowerCase()
}

function matchesText(haystack: string, needle: string): boolean {
  if (!needle) return false
  const norm = normalizeText(needle)
  if (!norm) return false
  const h = normalizeText(haystack)
  return h === norm || h.includes(norm)
}

export function parseLocator(raw: string): Locator {
  const trimmed = raw.trim()
  if (!trimmed) return { kind: "css", value: "", raw: "" }

  const match = trimmed.match(/^([a-zA-Z_-]+)\s*(=|:)\s*(.+)$/)
  if (match) {
    const kind = LOCATOR_ALIASES[match[1].toLowerCase()]
    if (kind) return { kind, value: stripQuotes(match[3]), raw: trimmed }
  }
  return { kind: "css", value: trimmed, raw: trimmed }
}

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false
  const style = window.getComputedStyle(el)
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0"
}

function deepQueryAll(selector: string, root?: Document | Element | ShadowRoot): Element[] {
  const out: Element[] = []
  const seen = new WeakSet<Element>()

  function walk(node: Document | Element | ShadowRoot, depth: number) {
    if (!node || depth > MAX_DEPTH) return
    try {
      const matches = (node as Element).querySelectorAll?.(selector) ?? []
      for (const el of matches) {
        if (!seen.has(el)) {
          seen.add(el)
          out.push(el)
        }
      }
    } catch {
      return
    }

    const all = (node as Element).querySelectorAll?.("*") ?? []
    for (const el of all) {
      if ((el as HTMLElement).shadowRoot) {
        walk((el as HTMLElement).shadowRoot!, depth + 1)
      }
    }

    const frames = (node as Element).querySelectorAll?.("iframe") ?? []
    for (const frame of frames) {
      try {
        const doc = (frame as HTMLIFrameElement).contentDocument
        if (doc) walk(doc, depth + 1)
      } catch {
        // cross-origin, skip
      }
    }
  }

  walk(root ?? document, 0)
  return out
}

function findByAttribute(attr: string, target: string, tags?: string[]): Element[] {
  if (!target) return []
  return deepQueryAll(`[${attr}]`).filter((el) => {
    if (tags?.length && !tags.includes(el.tagName)) return false
    return matchesText(el.getAttribute(attr) ?? "", target)
  })
}

function findByLabel(target: string): Element[] {
  if (!target) return []
  const results: Element[] = []
  const seen = new WeakSet<Element>()

  for (const label of deepQueryAll("label")) {
    if (!matchesText(label.textContent ?? "", target)) continue
    const control = (label as HTMLLabelElement).control ?? label.querySelector("input, textarea, select")
    if (control && !seen.has(control)) {
      seen.add(control)
      results.push(control)
    }
  }

  for (const el of deepQueryAll("[aria-labelledby]")) {
    const ids = (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean)
    const text = ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ")
    if (matchesText(text, target) && !seen.has(el)) {
      seen.add(el)
      results.push(el)
    }
  }

  return results
}

function findByText(target: string): Element[] {
  if (!target) return []
  const candidates = deepQueryAll(
    "button, a, label, option, summary, [role='button'], [role='link'], [role='tab'], [role='menuitem']",
  )
  const results: Element[] = []
  const seen = new WeakSet<Element>()

  for (const el of candidates) {
    if (matchesText(el.textContent ?? "", target) && !seen.has(el)) {
      seen.add(el)
      results.push(el)
    }
  }

  for (const el of deepQueryAll("input[type='button'], input[type='submit'], input[type='reset']")) {
    if (matchesText((el as HTMLInputElement).value ?? "", target) && !seen.has(el)) {
      seen.add(el)
      results.push(el)
    }
  }

  return results
}

function resolveLocator(locator: Locator): Element[] {
  switch (locator.kind) {
    case "css":
      return locator.value ? deepQueryAll(locator.value) : []
    case "label":
      return findByLabel(locator.value)
    case "aria":
      return findByAttribute("aria-label", locator.value)
    case "placeholder":
      return findByAttribute("placeholder", locator.value, ["INPUT", "TEXTAREA"])
    case "name":
      return findByAttribute("name", locator.value)
    case "role":
      return deepQueryAll("[role]").filter((el) => matchesText(el.getAttribute("role") ?? "", locator.value))
    case "text":
      return findByText(locator.value)
    case "id": {
      const escaped = CSS?.escape?.(locator.value) ?? locator.value.replace(/[^a-zA-Z0-9_-]/g, "\\$&")
      return deepQueryAll(`#${escaped}`)
    }
  }
}

export interface LocatorResult {
  selector: string
  matches: Element[]
  chosen: Element | null
}

export function resolveSelector(selectorInput: string | string[], index = 0): LocatorResult {
  const selectors = Array.isArray(selectorInput)
    ? selectorInput
    : selectorInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)

  for (const sel of selectors) {
    const locator = parseLocator(sel)
    if (!locator.value) continue
    const matches = resolveLocator(locator)
    if (!matches.length) continue
    const visible = matches.filter(isVisible)
    const chosen = visible[index] ?? matches[index] ?? null
    return { selector: locator.raw, matches, chosen }
  }

  return { selector: selectors[0] ?? "", matches: [], chosen: null }
}

export { deepQueryAll, isVisible }
