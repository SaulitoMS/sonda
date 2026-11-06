import { applyQuery, parseQuery } from './params'
import { queryJson } from './jsonQuery'

export const PAGINATE_MAX_PAGES = 100
export const PAGINATE_MAX_DELAY_MS = 5000

export type PaginateMode = 'link' | 'cursor' | 'page'

export interface PaginateOptions {
  mode: PaginateMode
  maxPages: number
  delayMs: number
  /** Ruta JSON de los items (ej: data.items). Vacío = detectar el primer array */
  itemsPath: string
  /** Modo cursor: ruta JSON del cursor siguiente (ej: meta.next_cursor) */
  cursorPath: string
  /** Modo cursor: parámetro de query que recibe el cursor (ej: cursor) */
  cursorParam: string
  /** Modo página: parámetro de query con el número de página (ej: page) */
  pageParam: string
}

export interface PaginateRow {
  n: number
  url: string
  /** null si la petición no obtuvo respuesta */
  status: number | null
  timeMs: number
  items: number
}

export type PaginateEnd = 'done' | 'empty' | 'max' | 'error' | 'loop' | 'stopped'

const toInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
  return Math.min(max, Math.max(min, n))
}

const toText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** Deja las opciones dentro de los límites; lo inválido vuelve al valor por defecto */
export function normalizePaginate(
  raw: Partial<Record<keyof PaginateOptions, unknown>>
): PaginateOptions {
  return {
    mode: raw.mode === 'cursor' || raw.mode === 'page' ? raw.mode : 'link',
    maxPages: toInt(raw.maxPages, 10, 1, PAGINATE_MAX_PAGES),
    delayMs: toInt(raw.delayMs, 0, 0, PAGINATE_MAX_DELAY_MS),
    itemsPath: toText(raw.itemsPath),
    cursorPath: toText(raw.cursorPath),
    cursorParam: toText(raw.cursorParam) || 'cursor',
    pageParam: toText(raw.pageParam) || 'page'
  }
}

/** URL del `rel="next"` de un header Link (RFC 8288). Resuelve URLs relativas contra `currentUrl` */
export function parseLinkNext(header: string | undefined, currentUrl: string): string | null {
  if (!header) return null
  for (const part of header.match(/<[^>]*>[^<]*/g) ?? []) {
    const target = /<([^>]*)>/.exec(part)?.[1]
    const rel = /;\s*rel\s*=\s*"?([^";,]+)"?/i.exec(part)?.[1]
    if (!target || !rel) continue
    if (!rel.toLowerCase().split(/\s+/).includes('next')) continue
    try {
      return new URL(target, currentUrl).toString()
    } catch {
      return target
    }
  }
  return null
}

/** Pone (o reemplaza) un parámetro de query sin tocar el resto ni las {{variables}} */
export function setQueryParam(url: string, key: string, value: string): string {
  const encoded = encodeURIComponent(value)
  const params = parseQuery(url)
  const i = params.findIndex((p) => p.key === key)
  if (i >= 0) params[i] = { key, value: encoded }
  else params.push({ key, value: encoded })
  return applyQuery(url, params)
}

/** Items de una página. Con `path` vacío: el body si es un array, o su primera propiedad que sea un array */
export function extractItems(json: unknown, path: string): unknown[] {
  if (path.trim()) {
    const found = queryJson(json, path)
    return found.found && Array.isArray(found.value) ? found.value : []
  }
  if (Array.isArray(json)) return json
  if (json && typeof json === 'object') {
    return Object.values(json as Record<string, unknown>).find(Array.isArray) ?? []
  }
  return []
}

export interface PaginateContext {
  /** URL de la página que se acaba de pedir */
  url: string
  /** Headers de la respuesta (en minúsculas) */
  headers: Record<string, string>
  /** Body ya parseado; null si no era JSON */
  json: unknown
}

/** URL de la página siguiente, o null si ya no hay más */
export function nextPageUrl(opts: PaginateOptions, ctx: PaginateContext): string | null {
  if (opts.mode === 'link') return parseLinkNext(ctx.headers['link'], ctx.url)

  if (opts.mode === 'cursor') {
    if (!opts.cursorPath) return null
    const found = queryJson(ctx.json, opts.cursorPath)
    const v = found.value
    if (!found.found || (typeof v !== 'string' && typeof v !== 'number') || v === '') return null
    return setQueryParam(ctx.url, opts.cursorParam, String(v))
  }

  const current = Number(parseQuery(ctx.url).find((p) => p.key === opts.pageParam)?.value)
  const page = Number.isInteger(current) && current >= 0 ? current : 1
  return setQueryParam(ctx.url, opts.pageParam, String(page + 1))
}

export function paginateEndLabel(end: PaginateEnd, pages: number, items: number): string {
  const resumen = `${pages} página(s), ${items} item(s)`
  if (end === 'done') return `Terminó: no hay más páginas (${resumen})`
  if (end === 'empty') return `Terminó: la última página vino vacía (${resumen})`
  if (end === 'max') return `Se llegó al máximo de páginas (${resumen})`
  if (end === 'loop') return `Detenido: la API repitió una página ya pedida (${resumen})`
  if (end === 'stopped') return `Detenido manualmente (${resumen})`
  return `Se detuvo por un error o un status no exitoso (${resumen})`
}
