import { app, dialog, ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { dirname, isAbsolute, join, resolve } from 'path'
import { DEFAULT_SETTINGS, normalizeSettings, proxyError } from '../shared/settings'
import type { AppSettings } from '../shared/types'

// Fuera del workspace: son ajustes de esta máquina (el proxy no debe versionarse con Git)
const settingsFile = (): string => join(app.getPath('userData'), 'settings.json')

let cache: AppSettings | null = null

/** Carpeta del workspace. Síncrona: usa los ajustes ya cargados (se cargan al arrancar) */
export function getWorkspacePath(): string {
  const custom = cache?.workspacePath
  return custom ? resolve(custom) : join(app.getPath('documents'), 'Sonda')
}

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

  if (next.workspacePath) {
    if (!isAbsolute(next.workspacePath)) {
      throw new Error('La carpeta del workspace debe ser una ruta absoluta')
    }
    await fs.mkdir(next.workspacePath, { recursive: true })
  }

  await fs.mkdir(dirname(settingsFile()), { recursive: true })
  await fs.writeFile(settingsFile(), JSON.stringify(next, null, 2) + '\n', 'utf-8')
  cache = next
  return next
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:load', (): Promise<AppSettings> => loadSettings())
  ipcMain.handle('settings:save', (_event, raw: unknown): Promise<AppSettings> => saveSettings(raw))
  ipcMain.handle('files:pickFolder', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
}
