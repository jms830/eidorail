import type { Platform } from "./shared"
import { DEFAULT_PLATFORMS } from "./shared"

const STORAGE_KEY = "eidorail-platforms"
const SETTINGS_KEY = "eidorail-settings"

export interface ContextMenuPlatform {
  id: string
  enabled: boolean
  order: number
}

export interface EidorailSettings {
  defaultPlatform: string
  contextMenuPlatforms: ContextMenuPlatform[]
}

const DEFAULT_CONTEXT_MENU_PLATFORMS: ContextMenuPlatform[] = [
  { id: "chatgpt", enabled: true, order: 0 },
  { id: "claude", enabled: true, order: 1 },
  { id: "gemini", enabled: true, order: 2 },
  { id: "opencode", enabled: true, order: 3 },
]

const DEFAULT_SETTINGS: EidorailSettings = {
  defaultPlatform: "opencode",
  contextMenuPlatforms: DEFAULT_CONTEXT_MENU_PLATFORMS,
}

export async function getSettings(): Promise<EidorailSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY)
  if (!result[SETTINGS_KEY]) return { ...DEFAULT_SETTINGS }
  return { ...DEFAULT_SETTINGS, ...result[SETTINGS_KEY] }
}

export async function saveSettings(settings: Partial<EidorailSettings>): Promise<void> {
  const current = await getSettings()
  const updated = { ...current, ...settings }
  await chrome.storage.local.set({ [SETTINGS_KEY]: updated })
  syncSettingsToLocalStorage(updated)
}

export async function getPlatforms(): Promise<Platform[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  if (!result[STORAGE_KEY]) return [...DEFAULT_PLATFORMS]

  const saved = result[STORAGE_KEY] as Platform[]
  const savedIds = new Set(saved.map((p) => p.id))
  const defaults = DEFAULT_PLATFORMS.filter((p) => !savedIds.has(p.id))
  return [...saved, ...defaults]
}

export async function savePlatforms(platforms: Platform[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: platforms })
  syncPlatformsToLocalStorage(platforms)
}

export async function getVisiblePlatforms(): Promise<Platform[]> {
  const platforms = await getPlatforms()
  return platforms.filter((p) => p.isVisible).sort((a, b) => a.order - b.order)
}

export async function getContextMenuPlatforms(): Promise<Array<Platform & { contextOrder: number }>> {
  const [platforms, settings] = await Promise.all([getPlatforms(), getSettings()])
  const enabledIds = new Map(settings.contextMenuPlatforms.filter((c) => c.enabled).map((c) => [c.id, c.order]))

  return platforms
    .filter((p) => p.isVisible && enabledIds.has(p.id))
    .map((p) => ({ ...p, contextOrder: enabledIds.get(p.id)! }))
    .sort((a, b) => a.contextOrder - b.contextOrder)
}

function syncPlatformsToLocalStorage(platforms: Platform[]): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(platforms))
  }
}

function syncSettingsToLocalStorage(settings: EidorailSettings): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  }
}

export function getSettingsFromLocalStorage(): EidorailSettings {
  if (typeof localStorage === "undefined") return { ...DEFAULT_SETTINGS }
  const saved = localStorage.getItem(SETTINGS_KEY)
  if (!saved) return { ...DEFAULT_SETTINGS }
  return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) }
}

export function saveSettingsToLocalStorage(settings: EidorailSettings): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  }
  chrome.storage.local.set({ [SETTINGS_KEY]: settings }).catch(console.warn)
}

export async function initStorageFromLocalStorage(): Promise<void> {
  if (typeof localStorage === "undefined") return

  const platformsJson = localStorage.getItem(STORAGE_KEY)
  const settingsJson = localStorage.getItem(SETTINGS_KEY)

  const updates: Record<string, unknown> = {}
  if (platformsJson) updates[STORAGE_KEY] = JSON.parse(platformsJson)
  if (settingsJson) updates[SETTINGS_KEY] = JSON.parse(settingsJson)

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates)
  }
}

export function onSettingsChange(callback: (settings: EidorailSettings) => void): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
    if (changes[SETTINGS_KEY]) {
      callback(changes[SETTINGS_KEY].newValue as EidorailSettings)
    }
  }
  chrome.storage.local.onChanged.addListener(listener)
  return () => chrome.storage.local.onChanged.removeListener(listener)
}

export function onPlatformsChange(callback: (platforms: Platform[]) => void): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
    if (changes[STORAGE_KEY]) {
      callback(changes[STORAGE_KEY].newValue as Platform[])
    }
  }
  chrome.storage.local.onChanged.addListener(listener)
  return () => chrome.storage.local.onChanged.removeListener(listener)
}
