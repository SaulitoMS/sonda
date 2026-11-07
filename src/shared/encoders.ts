export function toBase64(text: string): string {
  let bin = ''
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** Acepta Base64 normal y base64url, con o sin padding */
export function fromBase64(input: string): string {
  const clean = input.trim().replace(/-/g, '+').replace(/_/g, '/')
  const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4)
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

/** Base64url (sin +, / ni padding): el formato de los JWT y de muchos tokens en URLs */
export const toBase64Url = (text: string): string =>
  toBase64(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export const urlEncode = (text: string): string => encodeURIComponent(text)

export const urlDecode = (text: string): string => decodeURIComponent(text.trim())

export type HashAlgo = 'SHA-1' | 'SHA-256' | 'SHA-512'

export async function hashText(algo: HashAlgo, text: string): Promise<string> {
  const digest = await crypto.subtle.digest(algo, new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Convierte un timestamp (segundos o milisegundos) o una fecha a todos los formatos útiles */
export function describeTimestamp(input: string): string {
  const raw = input.trim()
  let ms: number
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw)
    ms = Math.abs(n) < 1e11 ? n * 1000 : n // por debajo de 1e11 se asume que son segundos
  } else {
    ms = Date.parse(raw)
  }
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) throw new Error('No es un timestamp ni una fecha reconocible')
  return [
    `ISO 8601 (UTC): ${date.toISOString()}`,
    `Local:          ${date.toLocaleString()}`,
    `Segundos:       ${Math.floor(ms / 1000)}`,
    `Milisegundos:   ${ms}`
  ].join('\n')
}

/** Da formato legible (2 espacios) a un JSON */
export const formatJson = (text: string): string => JSON.stringify(JSON.parse(text), null, 2)

/** Quita espacios y saltos de línea de un JSON */
export const minifyJson = (text: string): string => JSON.stringify(JSON.parse(text))

/** Escapa un texto para meterlo dentro de un string JSON (sin las comillas de los extremos) */
export const escapeJsonString = (text: string): string => JSON.stringify(text).slice(1, -1)

/** Inverso de escapeJsonString: acepta el texto con o sin las comillas de los extremos */
export function unescapeJsonString(text: string): string {
  const raw = text.trim()
  const quoted = raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"') ? raw : `"${raw}"`
  const out: unknown = JSON.parse(quoted)
  if (typeof out !== 'string') throw new Error('No es un texto JSON válido')
  return out
}

export function toHex(text: string): string {
  return Array.from(new TextEncoder().encode(text))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ')
}

/** Acepta "48 6f", "48:6f", "48,6f", "0x48 0x6f" o "486f" */
export function fromHex(input: string): string {
  const clean = input.replace(/0x/gi, '').replace(/[\s,:-]/g, '')
  if (clean === '' || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error('Hex inválido: usa pares de dígitos (ej: 48 6f 6c 61)')
  }
  const bytes = Uint8Array.from(clean.match(/../g) ?? [], (h) => parseInt(h, 16))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

/** "a=1&b=2&b=3", "?a=1" o una URL completa → JSON. Las claves repetidas se vuelven arreglo */
export function queryToJson(input: string): string {
  const raw = input.trim().split('#')[0]
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw
  const out = Object.create(null) as Record<string, string | string[]>
  for (const [key, value] of new URLSearchParams(query)) {
    const prev = out[key]
    if (prev === undefined) out[key] = value
    else out[key] = Array.isArray(prev) ? [...prev, value] : [prev, value]
  }
  if (Object.keys(out).length === 0) throw new Error('No se encontraron parámetros')
  return JSON.stringify(out, null, 2)
}

/** Objeto JSON → query string. Los arreglos repiten la clave y los objetos anidados van como JSON */
export function jsonToQuery(input: string): string {
  const data: unknown = JSON.parse(input)
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Se esperaba un objeto JSON, por ejemplo {"page": 1}')
  }
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const items = Array.isArray(value) ? value : [value]
    for (const item of items) {
      if (item === null || item === undefined) continue
      params.append(key, typeof item === 'object' ? JSON.stringify(item) : String(item))
    }
  }
  return params.toString()
}

/** Escapa los caracteres que HTML interpreta: & < > " ' */
export const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0'
}

/** Revierte entidades HTML: las nombradas más comunes y las numéricas (&#233; y &#xE9;) */
export function unescapeHtml(text: string): string {
  return text.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|(\w+));/g, (match, dec, hex, name) => {
    if (name) return NAMED_ENTITIES[name] ?? match
    const code = dec ? Number(dec) : parseInt(hex, 16)
    return code <= 0x10ffff ? String.fromCodePoint(code) : match
  })
}
