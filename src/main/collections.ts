import { app, ipcMain, shell } from 'electron'
import { promises as fs } from 'fs'
import { basename, join, relative, resolve, sep } from 'path'
import { addImportedEnvironment } from './environments'
import type {
  CollectionItem,
  FolderItem,
  HttpMethod,
  ImportResult,
  RequestItem,
  SaveRequestInput,
  SavedRequest
} from '../shared/types'
import { importFromUrl } from './swagger'

const META_FILE = 'sonda.collection.json'

interface CollectionMeta {
  name: string
  baseUrl?: string
  source?: string
  createdAt: string
}

const getRoot = (): string => join(app.getPath('documents'), 'Sonda')

/** Resuelve una ruta dentro del workspace y bloquea intentos de salirse (../) */
function safePath(...segments: string[]): string {
  const root = getRoot()
  const target = resolve(root, ...segments)
  if (target === root || !target.startsWith(root + sep)) throw new Error('Ruta no permitida')
  return target
}

function safeRequestPath(relPath: string): string {
  const file = safePath(relPath)
  if (!file.endsWith('.json') || basename(file) === META_FILE) throw new Error('Ruta no permitida')
  return file
}

const toRel = (file: string): string => relative(getRoot(), file).split(sep).join('/')

const slug = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'sin-nombre'

const exists = (p: string): Promise<boolean> =>
  fs.access(p).then(
    () => true,
    () => false
  )

async function uniquePath(dir: string, base: string, ext: string): Promise<string> {
  let candidate = join(dir, base + ext)
  let i = 2
  while (await exists(candidate)) {
    candidate = join(dir, `${base}-${i}${ext}`)
    i++
  }
  return candidate
}

async function writeMeta(dir: string, meta: Omit<CollectionMeta, 'createdAt'>): Promise<void> {
  const data: CollectionMeta = { ...meta, createdAt: new Date().toISOString() }
  await fs.writeFile(join(dir, META_FILE), JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

async function readMeta(dir: string): Promise<CollectionMeta | null> {
  try {
    return JSON.parse(await fs.readFile(join(dir, META_FILE), 'utf-8')) as CollectionMeta
  } catch {
    return null
  }
}

async function readRequestItem(file: string): Promise<RequestItem | null> {
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf-8')) as Partial<SavedRequest>
    if (typeof data.method !== 'string') return null
    return {
      path: toRel(file),
      name: data.name || basename(file, '.json'),
      method: data.method as HttpMethod
    }
  } catch {
    return null
  }
}

async function listRequests(dir: string): Promise<RequestItem[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const items: RequestItem[] = []
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.json') || e.name === META_FILE) continue
    const item = await readRequestItem(join(dir, e.name))
    if (item) items.push(item)
  }
  return items.sort((a, b) => a.name.localeCompare(b.name))
}

async function listCollections(): Promise<CollectionItem[]> {
  const root = getRoot()
  await fs.mkdir(root, { recursive: true })

  const collections: CollectionItem[] = []
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue

    const dir = join(root, entry.name)
    const meta = await readMeta(dir)

    const folders: FolderItem[] = []
    for (const child of await fs.readdir(dir, { withFileTypes: true })) {
      if (!child.isDirectory() || child.name.startsWith('.')) continue
      folders.push({ name: child.name, requests: await listRequests(join(dir, child.name)) })
    }
    folders.sort((a, b) => a.name.localeCompare(b.name))

    collections.push({
      id: entry.name,
      name: meta?.name ?? entry.name,
      baseUrl: meta?.baseUrl,
      requests: await listRequests(dir),
      folders
    })
  }
  return collections.sort((a, b) => a.name.localeCompare(b.name))
}

export function registerCollectionHandlers(): void {
  ipcMain.handle('collections:list', () => listCollections())

  ipcMain.handle('collections:create', async (_e, name: string): Promise<CollectionItem> => {
    const clean = String(name).trim()
    if (!clean) throw new Error('El nombre no puede estar vacío')
    await fs.mkdir(getRoot(), { recursive: true })
    const dir = await uniquePath(getRoot(), slug(clean), '')
    await fs.mkdir(dir, { recursive: true })
    await writeMeta(dir, { name: clean })
    return { id: basename(dir), name: clean, requests: [], folders: [] }
  })

  ipcMain.handle('collections:delete', async (_e, id: string): Promise<void> => {
    await fs.rm(safePath(id), { recursive: true, force: true })
  })

  ipcMain.handle('collections:readRequest', async (_e, relPath: string): Promise<SavedRequest> => {
    const data = JSON.parse(await fs.readFile(safeRequestPath(relPath), 'utf-8')) as SavedRequest
    return { ...data, headers: data.headers ?? [], body: data.body ?? '' }
  })

  ipcMain.handle(
    'collections:saveRequest',
    async (_e, input: SaveRequestInput): Promise<string> => {
      const content = JSON.stringify(input.request, null, 2) + '\n'

      if (input.relPath) {
        await fs.writeFile(safeRequestPath(input.relPath), content, 'utf-8')
        return input.relPath
      }

      if (!input.collectionId) throw new Error('Falta la colección')
      const dir = input.folder
        ? safePath(input.collectionId, slug(input.folder))
        : safePath(input.collectionId)
      await fs.mkdir(dir, { recursive: true })
      const file = await uniquePath(dir, slug(input.request.name), '.json')
      await fs.writeFile(file, content, 'utf-8')
      return toRel(file)
    }
  )

  ipcMain.handle('collections:deleteRequest', async (_e, relPath: string): Promise<void> => {
    await fs.rm(safeRequestPath(relPath), { force: true })
  })

  ipcMain.handle('collections:openWorkspace', async (): Promise<void> => {
    await fs.mkdir(getRoot(), { recursive: true })
    await shell.openPath(getRoot())
  })

  ipcMain.handle('swagger:import', async (_e, url: string): Promise<ImportResult> => {
    try {
      const spec = await importFromUrl(url)

      await fs.mkdir(getRoot(), { recursive: true })
      const dir = await uniquePath(getRoot(), slug(spec.name), '')
      await fs.mkdir(dir, { recursive: true })
      await writeMeta(dir, { name: spec.name, baseUrl: spec.baseUrl, source: spec.source })

      const used = new Set<string>()
      for (const item of spec.requests) {
        const folderDir = item.folder ? join(dir, slug(item.folder)) : dir
        await fs.mkdir(folderDir, { recursive: true })

        const base = slug(item.fileHint)
        let fileBase = base
        let i = 2
        while (used.has(join(folderDir, fileBase))) fileBase = `${base}-${i++}`
        used.add(join(folderDir, fileBase))

        await fs.writeFile(
          join(folderDir, `${fileBase}.json`),
          JSON.stringify(item.request, null, 2) + '\n',
          'utf-8'
        )
      }

      // Crea (y activa) un entorno con la baseUrl de la spec
      await addImportedEnvironment(spec.name, spec.baseUrl).catch(() => undefined)

      return { ok: true, collectionId: basename(dir), name: spec.name, count: spec.requests.length }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }
    }
  })
}
