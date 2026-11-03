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