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

/** "de ad be ef", "0xDE 0xAD" o "dead,beef" → bytes. null si no es hexadecimal válido o está vacío */
export function hexToBytes(text: string): Uint8Array | null {
  const clean = text.replace(/(^|[\s,:_-])0x/gi, '$1').replace(/[\s,:_-]+/g, '')
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(clean)) return null
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return bytes
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

/* ---------- Conexiones guardadas en las colecciones ---------- */

/** Las conexiones guardadas son archivos `nombre.ws.json` dentro de la carpeta de la colección */
export const WS_FILE_EXT = '.ws.json'

export interface SavedWsMessage {
  name: string
  text: string
  /** true = `text` son bytes en hexadecimal */
  binary: boolean
}

/**
 * Una conexión WebSocket guardada. No tiene campo `method`, así que el resto de la app
 * (lista de peticiones, sincronizar con la spec, exportar a Postman) la ignora.
 */
export interface SavedWebSocket {
  type: 'websocket'
  name: string
  url: string
  /** "Nombre: valor", uno por línea, tal como se escribe en la ventana (con {{variables}}) */
  headers: string
  protocols: string
  /** Mensaje que se envía apenas abre la conexión */
  onOpen: string
  autoReconnect: boolean
  keepAlive: boolean
  keepAliveSecs: number
  keepAliveMsg: string
  messages: SavedWsMessage[]
}

export interface SavedWebSocketItem {
  /** Ruta relativa al workspace: "coleccion/archivo.ws.json" */
  path: string
  collectionId: string
  collectionName: string
  name: string
  url: string
}

export type SaveWebSocketResult = { ok: true; path: string } | { ok: false; error: string }

const MAX_SAVED_MESSAGES = 100

/** Valida lo que viene de disco o de la ventana: lo inválido vuelve a su valor por defecto */
export function normalizeSavedWebSocket(raw: unknown): SavedWebSocket {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
  const secs =
    typeof r.keepAliveSecs === 'number' && Number.isFinite(r.keepAliveSecs)
      ? Math.min(3600, Math.max(1, Math.round(r.keepAliveSecs)))
      : 30

  const messages = Array.isArray(r.messages)
    ? r.messages.flatMap((m: unknown): SavedWsMessage[] => {
        if (!m || typeof m !== 'object') return []
        const { name, text, binary } = m as Record<string, unknown>
        if (typeof text !== 'string' || !text) return []
        return [{ name: str(name) || text.slice(0, 28), text, binary: binary === true }]
      })
    : []

  return {
    type: 'websocket',
    name: str(r.name).trim() || 'Sin nombre',
    url: str(r.url),
    headers: str(r.headers),
    protocols: str(r.protocols),
    onOpen: str(r.onOpen),
    autoReconnect: r.autoReconnect === true,
    keepAlive: r.keepAlive === true,
    keepAliveSecs: secs,
    keepAliveMsg: str(r.keepAliveMsg, '{"type":"ping"}'),
    messages: messages.slice(0, MAX_SAVED_MESSAGES)
  }
}

const SECRET_HEADER =
  /^(authorization|proxy-authorization|cookie|x-api-key|api-key|x-auth-token|x-access-token|x-csrf-token|x-xsrf-token)$/i
const SECRET_QUERY =
  /[?&](access_token|refresh_token|id_token|token|api[-_]?key|apikey|secret|client_secret|password|pwd|signature)=([^&#]*)/gi
const SECRET_JSON_FIELD =
  /"(access_token|refresh_token|id_token|token|api[-_]?key|apikey|secret|client_secret|password|passwd|pwd|authorization)"\s*:\s*"([^"]+)"/gi

/**
 * Credenciales escritas a mano (y no como {{variable}}) en los headers, la URL o los mensajes.
 * Un archivo de colección se versiona con Git: ahí solo deben ir {{variables}}.
 */
export function findLiteralSecrets(
  conn: Pick<SavedWebSocket, 'url' | 'headers' | 'onOpen' | 'keepAliveMsg' | 'messages'>
): string[] {
  const found = new Set<string>()

  for (const line of conn.headers.split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i <= 0) continue
    const name = line.slice(0, i).trim()
    const value = line.slice(i + 1).trim()
    if (SECRET_HEADER.test(name) && value && !value.includes('{{')) found.add(`header ${name}`)
  }

  for (const m of conn.url.matchAll(SECRET_QUERY)) {
    if (m[2] && !m[2].includes('{{')) found.add(`URL ?${m[1]}`)
  }

  const texts = [
    conn.onOpen,
    conn.keepAliveMsg,
    ...conn.messages.filter((m) => !m.binary).map((m) => m.text)
  ]
  for (const text of texts) {
    for (const m of text.matchAll(SECRET_JSON_FIELD)) {
      if (!m[2].includes('{{')) found.add(`mensaje "${m[1]}"`)
    }
  }
  return [...found]
}
