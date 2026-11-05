import { ipcMain } from 'electron'
import { randomBytes } from 'crypto'
import { promises as fs } from 'fs'
import { basename, dirname, join, relative, resolve, sep } from 'path'
import type { TrashItem, TrashKind } from '../shared/types'
import { getWorkspacePath } from './settings'

const META_FILE = 'sonda.collection.json'
/** Pasado este tiempo, lo que sigue en la papelera se borra de verdad */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

const trashRoot = (): string => join(getWorkspacePath(), '.sonda', 'trash')

const exists = (p: string): Promise<boolean> =>
  fs.access(p).then(
    () => true,
    () => false
  )

/** Si el destino ya existe, devuelve uno libre: "x-restaurada.json", "x-restaurada-2.json"… */
async function freeName(target: string): Promise<string> {
  if (!(await exists(target))) return target
  const ext = target.endsWith('.json') ? '.json' : ''
  const base = ext ? target.slice(0, -ext.length) : target
  let candidate = `${base}-restaurada${ext}`
  for (let i = 2; await exists(candidate); i++) candidate = `${base}-restaurada-${i}${ext}`
  return candidate
}

async function displayName(kind: TrashKind, absPath: string): Promise<string> {
  try {
    const file = kind === 'request' ? absPath : join(absPath, META_FILE)
    const data = JSON.parse(await fs.readFile(file, 'utf-8')) as { name?: unknown }
    if (typeof data.name === 'string' && data.name) return data.name
  } catch {
    // sin nombre legible: se usa el del archivo
  }
  return basename(absPath, '.json')
}

/** Mueve una petición o colección a la papelera en lugar de borrarla */
export async function moveToTrash(
  kind: TrashKind,
  absPath: string,
  originalPath: string
): Promise<void> {
  const name = await displayName(kind, absPath)
  const id = `${Date.now()}-${randomBytes(3).toString('hex')}`
  const dir = join(trashRoot(), id)
  await fs.mkdir(dir, { recursive: true })
  try {
    await fs.rename(absPath, join(dir, 'data'))
  } catch (error) {
    await fs.rm(dir, { recursive: true, force: true })
    // Si ya no existía, no hay nada que borrar (igual que antes con force: true)
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  const item: TrashItem = { id, kind, name, originalPath, deletedAt: Date.now() }
  await fs.writeFile(join(dir, 'entry.json'), JSON.stringify(item, null, 2) + '\n', 'utf-8')
}

async function listTrash(): Promise<TrashItem[]> {
  let ids: string[]
  try {
    ids = await fs.readdir(trashRoot())
  } catch {
    return []
  }
  const items: TrashItem[] = []
  for (const id of ids) {
    const dir = join(trashRoot(), id)
    try {
      const item = JSON.parse(await fs.readFile(join(dir, 'entry.json'), 'utf-8')) as TrashItem
      if (Date.now() - item.deletedAt > MAX_AGE_MS) {
        await fs.rm(dir, { recursive: true, force: true })
        continue
      }
      items.push({ ...item, id })
    } catch {
      // entrada incompleta: se ignora
    }
  }
  return items.sort((a, b) => b.deletedAt - a.deletedAt)
}

/** Devuelve la ruta (relativa al workspace) donde quedó lo restaurado */
async function restoreFromTrash(id: string): Promise<string> {
  const dir = join(trashRoot(), basename(id))
  const item = JSON.parse(await fs.readFile(join(dir, 'entry.json'), 'utf-8')) as TrashItem

  const root = resolve(getWorkspacePath())
  const target = resolve(root, item.originalPath)
  if (
    !target.startsWith(root + sep) ||
    item.originalPath.split('/').some((p) => p.startsWith('.'))
  ) {
    throw new Error('Ruta no permitida')
  }

  if (item.kind === 'request') {
    // Si la colección ya no existe, se vuelve a crear para que aparezca en la barra lateral
    await fs.mkdir(dirname(target), { recursive: true })
    const collectionDir = join(root, item.originalPath.split('/')[0])
    if (!(await exists(join(collectionDir, META_FILE)))) {
      const meta = { name: basename(collectionDir), createdAt: new Date().toISOString() }
      await fs.writeFile(
        join(collectionDir, META_FILE),
        JSON.stringify(meta, null, 2) + '\n',
        'utf-8'
      )
    }
  }

  const dest = await freeName(target)
  await fs.rename(join(dir, 'data'), dest)
  await fs.rm(dir, { recursive: true, force: true })
  return relative(root, dest).split(sep).join('/')
}

export function registerTrashHandlers(): void {
  ipcMain.handle('trash:list', (): Promise<TrashItem[]> => listTrash())
  ipcMain.handle('trash:restore', (_e, id: string): Promise<string> => restoreFromTrash(id))
  ipcMain.handle('trash:empty', async (): Promise<void> => {
    await fs.rm(trashRoot(), { recursive: true, force: true })
  })
}
