const MAX_ENTRIES = 50
const MAX_ENTRY_LENGTH = 2000

export interface DiagnosticEntry {
  ts: number
  level: "log" | "warn" | "error" | "info" | "debug"
  args: string[]
  source?: string
}

export interface PageDiagnostics {
  url: string
  title: string
  capturedAt: number
  console: DiagnosticEntry[]
  errors: Array<{ message: string; source?: string; line?: number; col?: number; ts: number }>
  performance: {
    domContentLoaded?: number
    load?: number
    firstPaint?: number
    firstContentfulPaint?: number
  }
  meta: {
    doctype: string
    charset: string
    viewport: string
    lang: string
  }
}

function truncate(val: string): string {
  return val.length > MAX_ENTRY_LENGTH ? val.slice(0, MAX_ENTRY_LENGTH) + "…" : val
}

export function collectDiagnosticsScript(): PageDiagnostics {
  const entries: DiagnosticEntry[] = []
  const errors: PageDiagnostics["errors"] = []

  const perf: PageDiagnostics["performance"] = {}
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
    if (nav) {
      perf.domContentLoaded = Math.round(nav.domContentLoadedEventEnd)
      perf.load = Math.round(nav.loadEventEnd)
    }
    const paints = performance.getEntriesByType("paint")
    for (const p of paints) {
      if (p.name === "first-paint") perf.firstPaint = Math.round(p.startTime)
      if (p.name === "first-contentful-paint") perf.firstContentfulPaint = Math.round(p.startTime)
    }
  } catch {
    // Performance API may not be available
  }

  const doctype = document.doctype
    ? `<!DOCTYPE ${document.doctype.name}${document.doctype.publicId ? ` PUBLIC "${document.doctype.publicId}"` : ""}>`
    : ""
  const charset =
    document.characterSet || (document.querySelector("meta[charset]") as HTMLMetaElement)?.getAttribute("charset") || ""
  const viewport = (document.querySelector('meta[name="viewport"]') as HTMLMetaElement)?.content || ""
  const lang = document.documentElement.lang || ""

  return {
    url: window.location.href,
    title: document.title,
    capturedAt: Date.now(),
    console: entries.slice(0, 50),
    errors,
    performance: perf,
    meta: { doctype, charset, viewport, lang },
  }
}

export function installDiagnosticsCollectorScript(): void {
  const key = "__sage_diag"
  if ((window as unknown as Record<string, unknown>)[key]) return
  ;(window as unknown as Record<string, unknown>)[key] = true

  const store: { entries: DiagnosticEntry[]; errors: PageDiagnostics["errors"] } = {
    entries: [],
    errors: [],
  }
  ;(window as unknown as Record<string, unknown>).__sage_diag_store = store

  const orig = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
  }

  for (const level of ["log", "warn", "error", "info", "debug"] as const) {
    console[level] = (...args: unknown[]) => {
      orig[level].apply(console, args)
      if (store.entries.length < 50) {
        store.entries.push({
          ts: Date.now(),
          level,
          args: args.map((a) => {
            if (a === null) return "null"
            if (a === undefined) return "undefined"
            if (typeof a === "string") return a.length > 2000 ? a.slice(0, 2000) + "…" : a
            if (typeof a === "number" || typeof a === "boolean") return String(a)
            if (a instanceof Error) return `${a.name}: ${a.message}`
            try {
              const s = JSON.stringify(a)
              return s.length > 2000 ? s.slice(0, 2000) + "…" : s
            } catch {
              return String(a)
            }
          }),
        })
      }
    }
  }

  window.addEventListener("error", (e) => {
    if (store.errors.length < 50) {
      store.errors.push({
        message: e.message || "Unknown error",
        source: e.filename,
        line: e.lineno,
        col: e.colno,
        ts: Date.now(),
      })
    }
  })

  window.addEventListener("unhandledrejection", (e) => {
    if (store.errors.length < 50) {
      const reason = e.reason instanceof Error ? `${e.reason.name}: ${e.reason.message}` : String(e.reason)
      store.errors.push({ message: `Unhandled rejection: ${reason}`, ts: Date.now() })
    }
  })
}

export function harvestDiagnosticsScript(): PageDiagnostics {
  const store = (window as unknown as Record<string, unknown>).__sage_diag_store as
    | { entries: DiagnosticEntry[]; errors: PageDiagnostics["errors"] }
    | undefined

  const perf: PageDiagnostics["performance"] = {}
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
    if (nav) {
      perf.domContentLoaded = Math.round(nav.domContentLoadedEventEnd)
      perf.load = Math.round(nav.loadEventEnd)
    }
    const paints = performance.getEntriesByType("paint")
    for (const p of paints) {
      if (p.name === "first-paint") perf.firstPaint = Math.round(p.startTime)
      if (p.name === "first-contentful-paint") perf.firstContentfulPaint = Math.round(p.startTime)
    }
  } catch {
    // Performance API not available
  }

  const doctype = document.doctype
    ? `<!DOCTYPE ${document.doctype.name}${document.doctype.publicId ? ` PUBLIC "${document.doctype.publicId}"` : ""}>`
    : ""
  const charset =
    document.characterSet || (document.querySelector("meta[charset]") as HTMLMetaElement)?.getAttribute("charset") || ""
  const viewport = (document.querySelector('meta[name="viewport"]') as HTMLMetaElement)?.content || ""
  const lang = document.documentElement.lang || ""

  return {
    url: window.location.href,
    title: document.title,
    capturedAt: Date.now(),
    console: store?.entries ?? [],
    errors: store?.errors ?? [],
    performance: perf,
    meta: { doctype, charset, viewport, lang },
  }
}

export function formatDiagnostics(diag: PageDiagnostics): string {
  const lines: string[] = []
  lines.push(`# Page Diagnostics: ${diag.title}`)
  lines.push("")
  lines.push(`> **URL**: ${diag.url}`)
  lines.push(`> **Captured**: ${new Date(diag.capturedAt).toLocaleString()}`)
  lines.push("")

  if (diag.meta.lang || diag.meta.charset || diag.meta.viewport) {
    lines.push("## Meta")
    if (diag.meta.lang) lines.push(`- **Lang**: ${diag.meta.lang}`)
    if (diag.meta.charset) lines.push(`- **Charset**: ${diag.meta.charset}`)
    if (diag.meta.viewport) lines.push(`- **Viewport**: ${diag.meta.viewport}`)
    lines.push("")
  }

  const p = diag.performance
  if (p.domContentLoaded || p.load || p.firstPaint || p.firstContentfulPaint) {
    lines.push("## Performance")
    if (p.firstPaint) lines.push(`- **First Paint**: ${p.firstPaint}ms`)
    if (p.firstContentfulPaint) lines.push(`- **FCP**: ${p.firstContentfulPaint}ms`)
    if (p.domContentLoaded) lines.push(`- **DOM Content Loaded**: ${p.domContentLoaded}ms`)
    if (p.load) lines.push(`- **Load**: ${p.load}ms`)
    lines.push("")
  }

  if (diag.errors.length > 0) {
    lines.push(`## Errors (${diag.errors.length})`)
    for (const err of diag.errors) {
      const loc = err.source ? ` (${err.source}:${err.line || "?"}:${err.col || "?"})` : ""
      lines.push(`- \`${err.message}\`${loc}`)
    }
    lines.push("")
  }

  if (diag.console.length > 0) {
    const warnings = diag.console.filter((e) => e.level === "warn" || e.level === "error")
    if (warnings.length > 0) {
      lines.push(`## Console Warnings/Errors (${warnings.length})`)
      for (const entry of warnings) {
        lines.push(`- **[${entry.level}]** ${entry.args.join(" ")}`)
      }
      lines.push("")
    }
  }

  if (lines.length <= 4) {
    lines.push("*No issues detected.*")
  }

  return lines.join("\n")
}
