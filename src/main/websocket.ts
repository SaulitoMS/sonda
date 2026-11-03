import { ipcMain, type WebContents } from 'electron'
import { Agent, WebSocket } from 'undici'
import {
  hexPreview,
  hexToBytes,
  type WsConnectInput,
  type WsConnectResult,
  type WsEvent
} from '../shared/websocket'
import { loadSettings } from './settings'

/** Un mensaje de texto más largo que esto se recorta al mostrarlo (el tamaño real va aparte) */
const MAX_TEXT_CHARS = 512 * 1024

interface Connection {
  id: string
  socket: WebSocket
  sender: WebContents
  dispatcher: Agent
  opened: boolean
  /** Ya se avisó el final de esta conexión: no se emite nada más */
  finished: boolean
}

/** Solo hay una conexión a la vez; abrir otra cierra la anterior */
let current: Connection | null = null

/** En localhost no hay un tercero que suplantar, así que se tolera el cert autofirmado */
const isLoopbackHost = (hostname: string): boolean =>
  hostname === 'localhost' ||
  hostname.endsWith('.localhost') ||
  hostname === '[::1]' ||
  /^127(\.\d{1,3}){3}$/.test(hostname)

function emit(conn: Connection, event: WsEvent): void {
  if (!conn.finished && !conn.sender.isDestroyed()) conn.sender.send('ws:event', event)
}

/** Da por terminada la conexión y libera sus recursos */
function finish(conn: Connection): void {
  conn.finished = true
  if (current === conn) current = null
  void conn.dispatcher.close().catch(() => {})
}

function closeCurrent(): void {
  const conn = current
  if (!conn) return
  try {
    conn.socket.close(1000, 'Cierre desde Sonda')
  } catch {
    // Ya estaba cerrado
  }
  finish(conn)
}

async function connect(sender: WebContents, input: WsConnectInput): Promise<WsConnectResult> {
  closeCurrent()

  let url: URL
  try {
    url = new URL(input.url)
  } catch {
    return { ok: false, error: 'La URL no es válida' }
  }
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    return { ok: false, error: 'La URL debe empezar con ws:// o wss://' }
  }

  const settings = await loadSettings()
  const ignoreTls =
    settings.sslMode === 'ignore' || (settings.sslMode === 'auto' && isLoopbackHost(url.hostname))
  const dispatcher = new Agent({ connect: { rejectUnauthorized: !ignoreTls } })

  let socket: WebSocket
  try {
    socket = new WebSocket(url, {
      protocols: input.protocols.length > 0 ? input.protocols : undefined,
      headers: input.headers,
      dispatcher
    })
  } catch (err) {
    void dispatcher.close().catch(() => {})
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo conectar' }
  }
  socket.binaryType = 'arraybuffer'

  const conn: Connection = {
    id: input.id,
    socket,
    sender,
    dispatcher,
    opened: false,
    finished: false
  }
  current = conn

  socket.addEventListener('open', () => {
    conn.opened = true
    emit(conn, { id: conn.id, kind: 'open', protocol: socket.protocol })
  })

  socket.addEventListener('message', (e) => {
    const data: unknown = e.data
    if (typeof data === 'string') {
      const truncated = data.length > MAX_TEXT_CHARS
      emit(conn, {
        id: conn.id,
        kind: 'message',
        text: truncated ? data.slice(0, MAX_TEXT_CHARS) : data,
        binary: false,
        size: Buffer.byteLength(data),
        truncated
      })
    } else if (data instanceof ArrayBuffer) {
      const bytes = new Uint8Array(data)
      emit(conn, {
        id: conn.id,
        kind: 'message',
        text: hexPreview(bytes),
        binary: true,
        size: bytes.byteLength,
        truncated: false
      })
    }
  })

  socket.addEventListener('error', (e) => {
    const err = e as { message?: string; error?: { message?: string } }
    emit(conn, {
      id: conn.id,
      kind: 'error',
      message: err.message || err.error?.message || 'Error de conexión'
    })
    // Si falla el handshake no siempre llega un 'close': se da por terminada aquí
    if (!conn.opened) finish(conn)
  })

  socket.addEventListener('close', (e) => {
    emit(conn, { id: conn.id, kind: 'close', code: e.code, reason: e.reason, clean: e.wasClean })
    finish(conn)
  })

  // Si se cierra la ventana, la conexión no debe quedar abierta en segundo plano
  sender.once('destroyed', () => {
    if (current === conn) closeCurrent()
  })

  return { ok: true }
}

export function registerWebSocketHandlers(): void {
  ipcMain.handle('ws:connect', (event, input: WsConnectInput) => connect(event.sender, input))

  ipcMain.handle(
    'ws:send',
    (_event, id: string, data: string, binary?: boolean): string | null => {
      if (!current || current.id !== id) return 'No hay una conexión abierta'
      if (current.socket.readyState !== WebSocket.OPEN) return 'La conexión aún no está abierta'
      try {
        if (binary) {
          const bytes = hexToBytes(data)
          if (!bytes) return 'El hexadecimal no es válido (ejemplo: de ad be ef)'
          current.socket.send(bytes)
        } else {
          current.socket.send(data)
        }
        return null
      } catch (err) {
        return err instanceof Error ? err.message : 'No se pudo enviar el mensaje'
      }
    }
  )

  ipcMain.handle('ws:close', (_event, id: string): void => {
    if (current?.id === id) closeCurrent()
  })
}