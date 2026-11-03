/** Lo que el proceso principal le avisa a la ventana sobre una conexión WebSocket */
export type WsEvent =
  | { id: string; kind: 'open'; protocol: string }
  | {
      id: string
      kind: 'message'
      text: string
      binary: boolean
      /** Tamaño real en bytes (text puede venir recortado) */
      size: number
      truncated: boolean
    }
  | { id: string; kind: 'close'; code: number; reason: string; clean: boolean }
  | { id: string; kind: 'error'; message: string }

export interface WsConnectInput {
  /** Id que elige la ventana para reconocer los eventos de esta conexión */
  id: string
  url: string
  headers: Record<string, string>
  protocols: string[]
}

export type WsConnectResult = { ok: true } | { ok: false; error: string }

/** Headers que el handshake de WebSocket pone por su cuenta: mandarlos a mano lo rompería */
const MANAGED_HEADERS = /^(host|upgrade|connection|content-length|sec-websocket-.+)$/i

/** Acepta http(s)://, ws(s):// o nada: "localhost:3000/chat" se vuelve ws://localhost:3000/chat */
export function toWsUrl(raw: string): string {
  const text = raw.trim()
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return `ws://${text}`
  return text.replace(/^http(s?):\/\//i, (_m, s: string) => `ws${s.toLowerCase()}://`)
}

/** "Nombre: valor", uno por línea. Ignora líneas vacías y comentarios con # */
export function parseHeaderLines(text: string): {
  headers: Record<string, string>
  invalid: string[]
  ignored: string[]
} {
  const headers: Record<string, string> = {}
  const invalid: string[] = []
  const ignored: string[] = []

  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf(':')
    const name = i > 0 ? t.slice(0, i).trim() : ''
    if (!name || /\s/.test(name)) {
      invalid.push(t)
      continue
    }
    if (MANAGED_HEADERS.test(name)) {
      ignored.push(name)
      continue
    }
    headers[name] = t.slice(i + 1).trim()
  }
  return { headers, invalid, ignored }
}

/** Subprotocolos separados por coma o espacio: "graphql-ws, chat" */
export function parseProtocols(text: string): string[] {
  return text
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/** Primeros bytes en hexadecimal, para mensajes binarios: "de ad be ef … (+1024 bytes)" */
export function hexPreview(bytes: Uint8Array, max = 64): string {
  const head = Array.from(bytes.subarray(0, max), (b) => b.toString(16).padStart(2, '0')).join(' ')
  return bytes.length > max ? `${head} … (+${bytes.length - max} bytes)` : head
}

/** Si el texto es JSON lo devuelve indentado; si no, tal cual */
export function prettyIfJson(text: string): { text: string; json: boolean } {
  const t = text.trim()
  if (!(t.startsWith('{') || t.startsWith('['))) return { text, json: false }
  try {
    return { text: JSON.stringify(JSON.parse(t), null, 2), json: true }
  } catch {
    return { text, json: false }
  }
}