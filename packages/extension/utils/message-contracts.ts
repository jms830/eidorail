/**
 * Typed message contracts for background ↔ sidepanel communication.
 * Background handlers use ok() / fail() envelopes.
 * Sidepanel consumers use sendSageMessage() for typed round-trips.
 */

import type { GroupedTabs } from "../utils/browser-context"
import type { PageDiagnostics } from "../utils/page-diagnostics"

export const MSG = {
  GET_CURRENT_TAB: "GET_CURRENT_TAB",
  CAPTURE_SCREENSHOT: "CAPTURE_SCREENSHOT",
  CAPTURE_FULL_PAGE_SCREENSHOT: "CAPTURE_FULL_PAGE_SCREENSHOT",
  GET_PAGE_CONTENT: "GET_PAGE_CONTENT",
  GET_TABS_WITH_GROUPS: "GET_TABS_WITH_GROUPS",
  CAPTURE_PAGE_MARKDOWN: "CAPTURE_PAGE_MARKDOWN",
  CAPTURE_SELECTION_MARKDOWN: "CAPTURE_SELECTION_MARKDOWN",
  CAPTURE_DIAGNOSTICS: "CAPTURE_DIAGNOSTICS",
  CAPTURE_PAGE_SNAPSHOT: "CAPTURE_PAGE_SNAPSHOT",
  IMPORT_PROJECT: "IMPORT_PROJECT",
  PING: "PING",
  CONTEXT_MENU_CAPTURE: "CONTEXT_MENU_CAPTURE",
} as const

export type MsgType = (typeof MSG)[keyof typeof MSG]

interface GetCurrentTabRequest {
  type: typeof MSG.GET_CURRENT_TAB
}

interface CaptureScreenshotRequest {
  type: typeof MSG.CAPTURE_SCREENSHOT
  tabId?: number
}

interface CaptureFullPageScreenshotRequest {
  type: typeof MSG.CAPTURE_FULL_PAGE_SCREENSHOT
  tabId: number
}

interface GetPageContentRequest {
  type: typeof MSG.GET_PAGE_CONTENT
  tabId: number
}

interface GetTabsWithGroupsRequest {
  type: typeof MSG.GET_TABS_WITH_GROUPS
}

interface CapturePageMarkdownRequest {
  type: typeof MSG.CAPTURE_PAGE_MARKDOWN
  tabId: number
}

interface CaptureSelectionMarkdownRequest {
  type: typeof MSG.CAPTURE_SELECTION_MARKDOWN
  tabId: number
}

interface CaptureDiagnosticsRequest {
  type: typeof MSG.CAPTURE_DIAGNOSTICS
  tabId: number
  install?: boolean
}

interface CapturePageSnapshotRequest {
  type: typeof MSG.CAPTURE_PAGE_SNAPSHOT
  tabId: number
}

interface ImportProjectRequest {
  type: typeof MSG.IMPORT_PROJECT
}

interface PingRequest {
  type: typeof MSG.PING
}

export type SageRequest =
  | GetCurrentTabRequest
  | CaptureScreenshotRequest
  | CaptureFullPageScreenshotRequest
  | GetPageContentRequest
  | GetTabsWithGroupsRequest
  | CapturePageMarkdownRequest
  | CaptureSelectionMarkdownRequest
  | CaptureDiagnosticsRequest
  | CapturePageSnapshotRequest
  | ImportProjectRequest
  | PingRequest

interface TabPayload {
  tab: chrome.tabs.Tab
}

interface ScreenshotPayload {
  screenshot: string
}

interface ContentPayload {
  content: string
}

interface TabsPayload {
  tabs: GroupedTabs
}

interface MarkdownPayload {
  markdown: string
}

interface ImportPayload {
  success: true
}

interface DiagnosticsPayload {
  diagnostics: PageDiagnostics
  markdown: string
}

export interface PageSnapshot {
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

interface SnapshotPayload {
  snapshot: PageSnapshot
}

interface PongPayload {
  pong: true
  version: string
}

export interface ResponseMap {
  [MSG.GET_CURRENT_TAB]: TabPayload
  [MSG.CAPTURE_SCREENSHOT]: ScreenshotPayload
  [MSG.CAPTURE_FULL_PAGE_SCREENSHOT]: ScreenshotPayload
  [MSG.GET_PAGE_CONTENT]: ContentPayload
  [MSG.GET_TABS_WITH_GROUPS]: TabsPayload
  [MSG.CAPTURE_PAGE_MARKDOWN]: MarkdownPayload
  [MSG.CAPTURE_SELECTION_MARKDOWN]: MarkdownPayload
  [MSG.CAPTURE_DIAGNOSTICS]: DiagnosticsPayload
  [MSG.CAPTURE_PAGE_SNAPSHOT]: SnapshotPayload
  [MSG.IMPORT_PROJECT]: ImportPayload
  [MSG.PING]: PongPayload
}

export type SageResponse<T = unknown> =
  | { ok: true; data: T; error?: undefined }
  | { ok: false; data?: undefined; error: string }

export function ok<T>(data: T): SageResponse<T> {
  return { ok: true, data }
}

export function fail(error: string): SageResponse<never> {
  return { ok: false, error }
}

export function errorString(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function sendSageMessage<T extends SageRequest>(
  message: T,
): Promise<SageResponse<ResponseMap[T["type"]]>> {
  return chrome.runtime.sendMessage(message)
}
