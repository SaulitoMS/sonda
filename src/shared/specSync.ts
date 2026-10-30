import type { SavedRequest, SyncChangeKind } from './types'

/** Cómo era el endpoint cuando se importó o sincronizó: sirve para saber qué editó el usuario */
export interface EndpointStamp {
  /** "GET /pet/{petId}" */
  key: string
  url: string
  body: string
}

/** Un endpoint tal como lo genera hoy el importador */
export interface SpecEndpoint {
  key: string
  folder: string
  fileHint: string
  request: SavedRequest
}

export interface ExistingFile {
  /** Ruta relativa a la carpeta de la colección, con "/" (ej: "pet/get-pet.json") */
  path: string
  request: SavedRequest
}

export interface Matched {
  file: ExistingFile
  endpoint: SpecEndpoint
}

export interface PlannedChange extends Matched {
  /** Qué cambió en la spec respecto a lo importado */
  kinds: SyncChangeKind[]
  /** De esos, lo que el usuario también editó: su versión se conserva */
  keptUserEdits: SyncChangeKind[]
}

export interface SyncPlan {
  added: SpecEndpoint[]
  changed: PlannedChange[]
  /** Archivos importados de la spec cuyo endpoint ya no existe */
  removed: ExistingFile[]
  unchanged: Matched[]
}

export const stampFor = (ep: SpecEndpoint): EndpointStamp => ({
  key: ep.key,
  url: ep.request.url,
  body: ep.request.body
})

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)])
    )
  }
  return value
}

/** JSON con las claves ordenadas, para comparar objetos sin depender del orden */
export const stableStringify = (value: unknown): string =>
  JSON.stringify(sortKeys(value ?? null))

const differs = (a: unknown, b: unknown): boolean => stableStringify(a) !== stableStringify(b)

/**
 * Compara la spec actual con lo que hay en la colección.
 * @param stamps marcas por ruta relativa; las colecciones importadas antes de que existieran no tienen
 * @param baseUrl para reconocer archivos viejos que guardaron la URL completa en vez de {{baseUrl}}
 */
export function planSync(
  endpoints: SpecEndpoint[],
  files: ExistingFile[],
  stamps: Record<string, EndpointStamp>,
  baseUrl?: string
): SyncPlan {
  const byKey = new Map<string, ExistingFile>()
  for (const f of files) {
    const stamp = stamps[f.path]
    if (stamp) byKey.set(stamp.key, f)
  }

  const used = new Set<string>()
  const plan: SyncPlan = { added: [], changed: [], removed: [], unchanged: [] }

  for (const ep of endpoints) {
    let file = byKey.get(ep.key)

    if (!file) {
      // Archivo de una importación antigua (sin marcas): se reconoce por método + URL
      const urls = new Set([
        ep.request.url,
        baseUrl ? ep.request.url.split('{{baseUrl}}').join(baseUrl) : ep.request.url
      ])
      file = files.find(
        (f) =>
          !stamps[f.path] &&
          !used.has(f.path) &&
          f.request.method === ep.request.method &&
          urls.has(f.request.url)
      )
    }

    if (!file || used.has(file.path)) {
      plan.added.push(ep)
      continue
    }
    used.add(file.path)

    const stamp = stamps[file.path]
    const kinds: SyncChangeKind[] = []
    const kept: SyncChangeKind[] = []

    if (stamp) {
      if (ep.request.url !== stamp.url) {
        kinds.push('url')
        if (file.request.url !== stamp.url) kept.push('url')
      }
      if (ep.request.body !== stamp.body) {
        kinds.push('body')
        if (file.request.body !== stamp.body) kept.push('body')
      }
    }
    if (differs(file.request.requestSchema, ep.request.requestSchema)) kinds.push('requestSchema')
    if (differs(file.request.responseSchemas, ep.request.responseSchemas)) {
      kinds.push('responseSchemas')
    }

    if (kinds.length === 0) plan.unchanged.push({ file, endpoint: ep })
    else plan.changed.push({ file, endpoint: ep, kinds, keptUserEdits: kept })
  }

  plan.removed = files.filter((f) => stamps[f.path] && !used.has(f.path))
  return plan
}

/**
 * Aplica los cambios de la spec a un archivo respetando lo del usuario:
 * la URL y el body solo se reemplazan si el usuario no los tocó; auth, aserciones,
 * extracciones y headers propios nunca se pierden.
 */
export function mergeChange(
  file: ExistingFile,
  stamp: EndpointStamp | undefined,
  ep: SpecEndpoint
): SavedRequest {
  const cur = file.request
  const gen = ep.request

  const url = stamp && cur.url === stamp.url ? gen.url : cur.url
  const body = stamp && cur.body === stamp.body ? gen.body : cur.body

  const headers = [...(cur.headers ?? [])]
  for (const h of gen.headers) {
    if (!headers.some((x) => x.key.toLowerCase() === h.key.toLowerCase())) headers.push(h)
  }

  const next: SavedRequest = { ...cur, url, body, headers }
  if (gen.requestSchema) next.requestSchema = gen.requestSchema
  else delete next.requestSchema
  if (gen.responseSchemas) next.responseSchemas = gen.responseSchemas
  else delete next.responseSchemas
  return next
}