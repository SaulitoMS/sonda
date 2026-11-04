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