import { app, ipcMain, shell } from 'electron'
import { promises as fs } from 'fs'
import { basename, dirname, join, relative, resolve, sep } from 'path'
import { addImportedEnvironment } from './environments'
import type {
  CollectionItem,
  FolderItem,
  HttpMethod,
  ImportResult,
  RequestItem,
  SaveRequestInput,
  SavedRequest,
  SyncOptions,
  SyncPreviewResult,
  SyncResult
} from '../shared/types'
import {
  mergeChange,
  planSync,
  stableStringify,
  stampFor,
  type EndpointStamp,
  type ExistingFile
} from '../shared/specSync'
import { importFromUrl } from './swagger'

const META_FILE = 'sonda.collection.json'

interface CollectionMeta {
  name: string
  baseUrl?: string
  source?: string
  /** Cómo era cada endpoint al importarlo, por ruta relativa a la colección */
  endpoints?: Record<string, EndpointStamp>
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
      source: meta?.source,
      requests: await listRequests(dir),
      folders
    })
  }
  return collections.sort((a, b) => a.name.localeCompare(b.name))
}

/* ---------- Re-sincronizar con la spec ---------- */

/** Lee las peticiones de una colección: las de la raíz y las de sus carpetas (un nivel) */
async function readCollectionFiles(dir: string): Promise<ExistingFile[]> {
  const out: ExistingFile[] = []

  const readFolder = async (sub: string): Promise<void> => {
    const base = sub ? join(dir, sub) : dir
    for (const e of await fs.readdir(base, { withFileTypes: true })) {
      if (!e.isFile() || !e.name.endsWith('.json') || e.name === META_FILE) continue
      try {
        const data = JSON.parse(await fs.readFile(join(base, e.name), 'utf-8')) as SavedRequest
        if (typeof data.method !== 'string') continue
        out.push({
          path: sub ? `${sub}/${e.name}` : e.name,
          request: { ...data, headers: data.headers ?? [], body: data.body ?? '' }
        })
      } catch {
        // archivo ilegible: se ignora
      }
    }
  }

  await readFolder('')
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('.')) await readFolder(e.name)
  }
  return out
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function loadSyncContext(id: string) {
  const dir = safePath(id)
  const meta = await readMeta(dir)
  if (!meta?.source) {
    throw new Error('Esta colección no viene de una spec, no hay nada que sincronizar')
  }

  const spec = await importFromUrl(meta.source)
  const files = await readCollectionFiles(dir)
  const stamps = meta.endpoints ?? {}
  const plan = planSync(spec.requests, files, stamps, meta.baseUrl)

  const baseUrlChange =
    meta.baseUrl && meta.baseUrl !== spec.baseUrl
      ? { from: meta.baseUrl, to: spec.baseUrl }
      : undefined

  return { dir, meta, source: meta.source, spec, stamps, plan, baseUrlChange }
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

      const used = new Set<string>()
      const endpoints: Record<string, EndpointStamp> = {}
      for (const item of spec.requests) {
        const folderDir = item.folder ? join(dir, slug(item.folder)) : dir
        await fs.mkdir(folderDir, { recursive: true })

        const base = slug(item.fileHint)
        let fileBase = base
        let i = 2
        while (used.has(join(folderDir, fileBase))) fileBase = `${base}-${i++}`
        used.add(join(folderDir, fileBase))

        const file = join(folderDir, `${fileBase}.json`)
        await fs.writeFile(file, JSON.stringify(item.request, null, 2) + '\n', 'utf-8')

        // Cómo salió de la spec: permite saber después qué editó el usuario
        endpoints[relative(dir, file).split(sep).join('/')] = stampFor(item)
      }

      await writeMeta(dir, {
        name: spec.name,
        baseUrl: spec.baseUrl,
        source: spec.source,
        endpoints
      })

      // Crea (y activa) un entorno con la baseUrl de la spec
      await addImportedEnvironment(spec.name, spec.baseUrl).catch(() => undefined)

      return { ok: true, collectionId: basename(dir), name: spec.name, count: spec.requests.length }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }
    }
  })

  // Descarga la spec de nuevo y dice qué cambió, sin tocar nada
  ipcMain.handle('swagger:previewSync', async (_e, id: string): Promise<SyncPreviewResult> => {
    try {
      const { plan, spec, source, stamps, baseUrlChange } = await loadSyncContext(id)
      return {
        ok: true,
        source,
        specName: spec.name,
        added: plan.added.map((ep) => ({
          key: ep.key,
          method: ep.request.method,
          name: ep.request.name,
          folder: ep.folder
        })),
        changed: plan.changed.map((c) => ({
          path: `${id}/${c.file.path}`,
          key: c.endpoint.key,
          method: c.file.request.method,
          name: c.file.request.name,
          kinds: c.kinds,
          keptUserEdits: c.keptUserEdits
        })),
        removed: plan.removed.map((f) => ({
          path: `${id}/${f.path}`,
          key: stamps[f.path]?.key ?? '',
          method: f.request.method,
          name: f.request.name
        })),
        unchanged: plan.unchanged.length,
        ...(baseUrlChange ? { baseUrlChange } : {})
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }
    }
  })

  // Vuelve a calcular el plan (la spec pudo cambiar entre medio) y aplica lo elegido
  ipcMain.handle(
    'swagger:applySync',
    async (_e, id: string, options: SyncOptions): Promise<SyncResult> => {
      try {
        const { dir, meta, spec, stamps, plan, baseUrlChange } = await loadSyncContext(id)
        const endpoints: Record<string, EndpointStamp> = { ...stamps }
        const updatedPaths: string[] = []
        const removedPaths: string[] = []
        let added = 0

        // Los archivos de importaciones antiguas que coinciden quedan marcados desde ahora
        for (const m of plan.unchanged) endpoints[m.file.path] = stampFor(m.endpoint)

        if (options.update) {
          for (const c of plan.changed) {
            const merged = mergeChange(c.file, stamps[c.file.path], c.endpoint)
            // Si el usuario conservó todo lo suyo, el archivo puede quedar idéntico
            if (stableStringify(merged) !== stableStringify(c.file.request)) {
              await fs.writeFile(
                safeRequestPath(`${id}/${c.file.path}`),
                JSON.stringify(merged, null, 2) + '\n',
                'utf-8'
              )
              updatedPaths.push(`${id}/${c.file.path}`)
            }
            endpoints[c.file.path] = stampFor(c.endpoint)
          }
        }

        if (options.add) {
          for (const ep of plan.added) {
            const folderDir = ep.folder ? join(dir, slug(ep.folder)) : dir
            await fs.mkdir(folderDir, { recursive: true })
            const file = await uniquePath(folderDir, slug(ep.fileHint), '.json')
            await fs.writeFile(file, JSON.stringify(ep.request, null, 2) + '\n', 'utf-8')
            endpoints[relative(dir, file).split(sep).join('/')] = stampFor(ep)
            added++
          }
        }

        if (options.remove) {
          for (const f of plan.removed) {
            await fs.rm(safeRequestPath(`${id}/${f.path}`), { force: true })
            delete endpoints[f.path]
            removedPaths.push(`${id}/${f.path}`)
            // Si la carpeta queda vacía se borra; si no, rmdir falla y se deja como está
            const sub = dirname(f.path)
            if (sub !== '.') await fs.rmdir(join(dir, sub)).catch(() => undefined)
          }
        }

        await fs.writeFile(
          join(dir, META_FILE),
          JSON.stringify({ ...meta, baseUrl: spec.baseUrl, endpoints }, null, 2) + '\n',
          'utf-8'
        )

        return {
          ok: true,
          added,
          updated: updatedPaths.length,
          removed: removedPaths.length,
          updatedPaths,
          removedPaths,
          ...(baseUrlChange ? { baseUrlChange } : {})
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }
      }
    }
  )
}
