import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { basename, dirname, join } from 'path'
import {
  findLiteralSecrets,
  normalizeSavedWebSocket,
  WS_FILE_EXT,
  type SavedWebSocket,
  type SavedWebSocketItem,
  type SaveWebSocketResult
} from '../shared/websocket'
import { getRoot, safePath, slug, uniquePath } from './collections'

const META_FILE = 'sonda.collection.json'

/** "coleccion/archivo.ws.json" → archivo dentro del workspace. Solo acepta conexiones guardadas */
function safeWsPath(relPath: string): string {
  const file = safePath(relPath)
  const parts = relPath.split('/')
  if (!file.endsWith(WS_FILE_EXT) || parts.length !== 2 || parts.some((p) => p.startsWith('.'))) {
    throw new Error('Ruta no permitida')
  }
  return file
}

async function collectionName(dir: string): Promise<string> {
  try {
    const meta = JSON.parse(await fs.readFile(join(dir, META_FILE), 'utf-8')) as { name?: unknown }
    if (typeof meta.name === 'string' && meta.name) return meta.name
  } catch {
    // Sin metadatos: se usa el nombre de la carpeta
  }
  return basename(dir)
}

async function listSaved(): Promise<SavedWebSocketItem[]> {
  const root = getRoot()
  await fs.mkdir(root, { recursive: true })

  const items: SavedWebSocketItem[] = []
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const dir = join(root, entry.name)
    const name = await collectionName(dir)

    for (const file of await fs.readdir(dir, { withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith(WS_FILE_EXT)) continue
      try {
        const data = normalizeSavedWebSocket(
          JSON.parse(await fs.readFile(join(dir, file.name), 'utf-8'))
        )
        items.push({
          path: `${entry.name}/${file.name}`,
          collectionId: entry.name,
          collectionName: name,
          name: data.name,
          url: data.url
        })
      } catch {
        // Archivo ilegible: se ignora
      }
    }
  }
  return items.sort(
    (a, b) => a.collectionName.localeCompare(b.collectionName) || a.name.localeCompare(b.name)
  )
}

export function registerSavedWebSocketHandlers(): void {
  ipcMain.handle('wsSaved:list', () => listSaved())

  ipcMain.handle('wsSaved:read', async (_e, relPath: string): Promise<SavedWebSocket> => {
    return normalizeSavedWebSocket(JSON.parse(await fs.readFile(safeWsPath(relPath), 'utf-8')))
  })

  ipcMain.handle(
    'wsSaved:save',
    async (
      _e,
      collectionId: string,
      data: unknown,
      relPath?: string
    ): Promise<SaveWebSocketResult> => {
      try {
        const conn = normalizeSavedWebSocket(data)
        const secrets = findLiteralSecrets(conn)
        if (secrets.length > 0) {
          return {
            ok: false,
            error: `Hay credenciales escritas a mano (${secrets.join(', ')}). Usa {{variables}} del entorno: este archivo vive en la colección y se puede versionar.`
          }
        }

        let file: string
        if (relPath) {
          file = safeWsPath(relPath)
        } else {
          if (!collectionId || collectionId.startsWith('.') || /[\\/]/.test(collectionId)) {
            throw new Error('Colección no válida')
          }
          const dir = safePath(collectionId)
          const stat = await fs.stat(dir).catch(() => null)
          if (!stat?.isDirectory()) throw new Error('La colección no existe')
          file = await uniquePath(dir, slug(conn.name), WS_FILE_EXT)
        }

        await fs.writeFile(file, JSON.stringify(conn, null, 2) + '\n', 'utf-8')
        return { ok: true, path: `${basename(dirname(file))}/${basename(file)}` }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'No se pudo guardar' }
      }
    }
  )

  ipcMain.handle('wsSaved:delete', async (_e, relPath: string): Promise<void> => {
    await fs.rm(safeWsPath(relPath), { force: true })
  })
}