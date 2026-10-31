import { promises as fs } from 'fs'
import { homedir } from 'os'
import { basename, join, relative, resolve, sep } from 'path'
import { sortByOrder } from '../shared/reorder'
import type {
  AuthConfig,
  CollectionItem,
  EnvironmentsData,
  FolderItem,
  HttpMethod,
  KeyValueData,
  RequestItem,
  SavedRequest
} from '../shared/types'

const META_FILE = 'sonda.collection.json'

interface Meta {
  name?: string
  baseUrl?: string
  source?: string
  auth?: AuthConfig
  headers?: KeyValueData[]
  order?: string[]
}

/** Misma carpeta que usa la app de escritorio (Documentos/Sonda), salvo que se indique otra */
export const defaultWorkspace = (): string =>
  process.env.SONDA_WORKSPACE || join(homedir(), 'Documents', 'Sonda')

async function readMeta(dir: string): Promise<Meta | null> {
  try {
    return JSON.parse(await fs.readFile(join(dir, META_FILE), 'utf-8')) as Meta
  } catch {
    return null
  }
}

async function listRequests(root: string, dir: string, order?: string[]): Promise<RequestItem[]> {
  const items: RequestItem[] = []
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (!e.isFile() || !e.name.endsWith('.json') || e.name === META_FILE) continue
    const file = join(dir, e.name)
    try {
      const data = JSON.parse(await fs.readFile(file, 'utf-8')) as Partial<SavedRequest>
      if (typeof data.method !== 'string') continue
      items.push({
        path: relative(root, file).split(sep).join('/'),
        name: data.name || basename(file, '.json'),
        method: data.method as HttpMethod
      })
    } catch {
      // archivo ilegible: se ignora, igual que en la app
    }
  }
  return sortByOrder(
    items,
    order,
    (r) => basename(r.path),
    (r) => r.name
  )
}

/** Lee las colecciones del workspace sin depender de Electron (mismo formato que la app) */
export async function loadCollections(root: string): Promise<CollectionItem[]> {
  let entries
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    throw new Error(`No existe el workspace: ${root}`)
  }

  const collections: CollectionItem[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue

    const dir = join(root, entry.name)
    const meta = await readMeta(dir)

    const folders: FolderItem[] = []
    for (const child of await fs.readdir(dir, { withFileTypes: true })) {
      if (!child.isDirectory() || child.name.startsWith('.')) continue
      const folderMeta = await readMeta(join(dir, child.name))
      folders.push({
        name: child.name,
        requests: await listRequests(root, join(dir, child.name), folderMeta?.order),
        ...(folderMeta?.auth ? { auth: folderMeta.auth } : {}),
        ...(folderMeta?.headers?.length ? { headers: folderMeta.headers } : {})
      })
    }

    collections.push({
      id: entry.name,
      name: meta?.name ?? entry.name,
      baseUrl: meta?.baseUrl,
      source: meta?.source,
      ...(meta?.auth ? { auth: meta.auth } : {}),
      ...(meta?.headers?.length ? { headers: meta.headers } : {}),
      requests: await listRequests(root, dir, meta?.order),
      folders: sortByOrder(
        folders,
        meta?.order,
        (f) => f.name,
        (f) => f.name
      )
    })
  }
  return collections.sort((a, b) => a.name.localeCompare(b.name))
}

/** Busca una colección por id (nombre de carpeta) o por nombre, sin distinguir mayúsculas */
export function findCollection(
  collections: CollectionItem[],
  selector: string
): CollectionItem | undefined {
  const s = selector.trim().toLowerCase()
  return (
    collections.find((c) => c.id.toLowerCase() === s) ??
    collections.find((c) => c.name.toLowerCase() === s)
  )
}

export async function readRequest(root: string, relPath: string): Promise<SavedRequest> {
  const file = resolve(root, relPath)
  if (!file.startsWith(resolve(root) + sep) || !file.endsWith('.json')) {
    throw new Error('Ruta no permitida')
  }
  const data = JSON.parse(await fs.readFile(file, 'utf-8')) as SavedRequest
  return { ...data, headers: data.headers ?? [], body: data.body ?? '' }
}

/**
 * Entornos guardados por la app. Los valores marcados como secretos están cifrados con el keychain
 * del sistema y aquí llegan vacíos: se aportan con --var o con variables SONDA_VAR_<nombre>.
 */
export async function loadEnvironments(root: string): Promise<EnvironmentsData> {
  try {
    const data = JSON.parse(
      await fs.readFile(join(root, '.sonda', 'environments.json'), 'utf-8')
    ) as EnvironmentsData
    return { activeId: data.activeId ?? null, environments: data.environments ?? [] }
  } catch {
    return { activeId: null, environments: [] }
  }
}
