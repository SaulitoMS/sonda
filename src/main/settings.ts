import { app, ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { DEFAULT_SETTINGS, normalizeSettings, proxyError } from '../shared/settings'
import type { AppSettings } from '../shared/types'

// Fuera del workspace: son ajustes de esta máquina (el proxy no debe versionarse con Git)
const settingsFile = (): string => join(app.getPath('userData'), 'settings.json')

let cache: AppSettings | null = null

export async function loadSettings(): Promise<AppSettings> {
  if (cache) return cache
  try {
    cache = normalizeSettings(JSON.parse(await fs.readFile(settingsFile(), 'utf-8')))
  } catch {
    cache = { ...DEFAULT_SETTINGS }
  }
  return cache
}

export async function saveSettings(raw: unknown): Promise<AppSettings> {
  const next = normalizeSettings(raw)
  const error = proxyError(next.proxyUrl)
  if (error) throw new Error(error)

  await fs.mkdir(dirname(settingsFile()), { recursive: true })
  await fs.writeFile(settingsFile(), JSON.stringify(next, null, 2) + '\n', 'utf-8')
  cache = next
  return next
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:load', (): Promise<AppSettings> => loadSettings())
  ipcMain.handle('settings:save', (_event, raw: unknown): Promise<AppSettings> => saveSettings(raw))
}