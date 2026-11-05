import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildVarMap, interpolate, withGlobalVariables } from '../../../shared/variables'
import {
  hexPreview,
  hexToBytes,
  parseHeaderLines,
  parseProtocols,
  prettyIfJson,
  toWsUrl,
  type SavedWebSocket,
  type SavedWebSocketItem,
  type SavedWsMessage,
  type WsConnectInput,
  type WsEvent
} from '../../../shared/websocket'
import { downloadText } from '../lib/download'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { Icon } from './Icon'
import { Modal } from './Modal'

type Status = 'idle' | 'connecting' | 'open' | 'closed'
type Dir = 'in' | 'out' | 'info' | 'error'
type DirFilter = 'all' | 'in' | 'out'
type ConnParams = Omit<WsConnectInput, 'id'>

interface LogItem {
  n: number
  at: number
  dir: Dir
  text: string
  binary?: boolean
  size?: number
  truncated?: boolean
  /** Lo envió Sonda solo (mensaje al conectar o keep-alive) */
  auto?: boolean
}

/** Se muestran como máximo los últimos mensajes; más allá se descartan los más viejos */
const MAX_LOG = 1000
/** Mensajes enviados que se recuerdan para volver a usarlos con Ctrl/⌘ + ↑ */
const MAX_HISTORY = 50
/** Reconexión automática: espera 1 s, 2 s, 4 s… hasta un tope */
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30_000

const DIR_FILTER_LABEL: Record<DirFilter, string> = {
  all: 'Todos',
  in: '↓ Recibidos',
  out: '↑ Enviados'
}

/** Lo último que se escribió, para no volver a teclearlo al reabrir la ventana */
let lastForm = {
  url: '',
  headers: '',
  protocols: '',
  onOpen: '',
  autoReconnect: false,
  keepAlive: false,
  keepAliveSecs: '30',
  keepAliveMsg: '{"type":"ping"}'
}

/** Mensajes enviados antes, del más viejo al más nuevo */
let messageHistory: string[] = []

/** La conexión guardada que está abierta en el formulario (guardar la sobrescribe) */
interface OpenSaved {
  path: string
  collectionId: string
  name: string
}

/** Lo abierto y sus mensajes guardados, para no perderlos al reabrir la ventana */
let lastSaved: { open: OpenSaved | null; messages: SavedWsMessage[] } = {
  open: null,
  messages: []
}

const field =
  'rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500 disabled:opacity-50'
const label = 'mb-1 block text-xs font-medium text-zinc-400'

const STATUS: Record<Status, { text: string; dot: string }> = {
  idle: { text: 'Sin conexión', dot: 'bg-zinc-500' },
  connecting: { text: 'Conectando…', dot: 'animate-pulse bg-amber-400' },
  open: { text: 'Conectado', dot: 'bg-emerald-400' },
  closed: { text: 'Desconectado', dot: 'bg-red-400' }
}

const ROW: Record<Dir, { mark: string; color: string }> = {
  in: { mark: '↓', color: 'text-emerald-400' },
  out: { mark: '↑', color: 'text-blue-400' },
  info: { mark: '•', color: 'text-zinc-500' },
  error: { mark: '✗', color: 'text-red-400' }
}

const formatSize = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`

const formatTime = (at: number): string => {
  const time = new Date(at).toLocaleTimeString('es', { hour12: false })
  return `${time}.${String(at % 1000).padStart(3, '0')}`
}

const LogRow = memo(function LogRow({
  item,
  onReuse
}: {
  item: LogItem
  onReuse: (text: string) => void
}): React.JSX.Element {
  const row = ROW[item.dir]
  const isMessage = item.dir === 'in' || item.dir === 'out'
  const shown = useMemo(
    () => (isMessage && !item.binary ? prettyIfJson(item.text).text : item.text),
    [isMessage, item.binary, item.text]
  )

  return (
    <li className="group flex gap-2 border-b border-zinc-800/60 px-2 py-1.5">
      <span className={`w-3 shrink-0 text-center font-bold ${row.color}`}>{row.mark}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-x-2 text-[10px] text-zinc-500">
          <span>{formatTime(item.at)}</span>
          {item.size !== undefined && <span>{formatSize(item.size)}</span>}
          {item.auto && <span className="rounded bg-zinc-800 px-1 text-sky-300">auto</span>}
          {item.binary && <span className="rounded bg-zinc-800 px-1 text-amber-300">binario</span>}
          {item.truncated && <span className="text-amber-300">recortado para mostrarlo</span>}
        </div>
        <pre
          className={`selectable max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-xs ${
            item.dir === 'error'
              ? 'text-red-300'
              : item.dir === 'info'
                ? 'text-zinc-400'
                : 'text-zinc-200'
          }`}
        >
          {shown}
        </pre>
      </div>
      {isMessage && (
        <div className="flex h-fit shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
          {!item.binary && (
            <button
              onClick={() => onReuse(item.text)}
              title="Pasar al editor para editarlo y reenviarlo"
              className="rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <Icon name="upload" size={12} />
            </button>
          )}
          <button
            onClick={() => void navigator.clipboard.writeText(item.text)}
            title="Copiar mensaje"
            className="rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <Icon name="copy" size={12} />
          </button>
        </div>
      )}
    </li>
  )
})

export function WebSocketModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [url, setUrl] = useState(lastForm.url)
  const [headersText, setHeadersText] = useState(lastForm.headers)
  const [protocolsText, setProtocolsText] = useState(lastForm.protocols)
  const [onOpenText, setOnOpenText] = useState(lastForm.onOpen)
  const [autoReconnect, setAutoReconnect] = useState(lastForm.autoReconnect)
  const [keepAlive, setKeepAlive] = useState(lastForm.keepAlive)
  const [keepAliveSecs, setKeepAliveSecs] = useState(lastForm.keepAliveSecs)
  const [keepAliveMsg, setKeepAliveMsg] = useState(lastForm.keepAliveMsg)
  const [status, setStatus] = useState<Status>('idle')
  const [retrying, setRetrying] = useState(false)
  const [log, setLog] = useState<LogItem[]>([])
  const [stats, setStats] = useState({ inMsgs: 0, outMsgs: 0, inBytes: 0, outBytes: 0 })
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [dirFilter, setDirFilter] = useState<DirFilter>('all')
  const [follow, setFollow] = useState(true)
  const [binaryMode, setBinaryMode] = useState(false)
  /** En modo binario: bytes del borrador (null si no es hex válido o aún tiene {{variables}}) */
  const draftBytes = binaryMode && !draft.includes('{{') ? hexToBytes(draft) : null

  const collections = useCollectionsStore((s) => s.collections)
  const [saved, setSaved] = useState<SavedWebSocketItem[]>([])
  const [openSaved, setOpenSaved] = useState<OpenSaved | null>(lastSaved.open)
  const [messages, setMessages] = useState<SavedWsMessage[]>(lastSaved.messages)
  const [savePanel, setSavePanel] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveCollection, setSaveCollection] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const refreshSaved = useCallback((): void => {
    window.api.listSavedWebSockets().then(setSaved, () => setSaved([]))
  }, [])

  useEffect(() => {
    refreshSaved()
  }, [refreshSaved])

  useEffect(() => {
    lastSaved = { open: openSaved, messages }
  }, [openSaved, messages])

  /** Id de la conexión vigente: los eventos de cualquier otra se descartan */
  const idRef = useRef<string | null>(null)
  const counter = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)
  /** Datos ya resueltos de la última conexión, para poder reconectar igual */
  const paramsRef = useRef<ConnParams | null>(null)
  /** La conexión llegó a abrirse (distingue un handshake fallido de una caída) */
  const openedRef = useRef(false)
  /** El usuario desconectó o cerró la ventana: no se reconecta */
  const userClosedRef = useRef(false)
  const attemptRef = useRef(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openSocketRef = useRef<((p: ConnParams, label: string) => Promise<void>) | null>(null)
  const optsRef = useRef({ autoReconnect, onOpen: onOpenText })
  const historyIdx = useRef(-1)
  const stash = useRef('')

  const add = useCallback((dir: Dir, text: string, extra: Partial<LogItem> = {}): void => {
    const item: LogItem = { n: ++counter.current, at: Date.now(), dir, text, ...extra }
    setLog((l) => [...l, item].slice(-MAX_LOG))
    if (dir === 'in' || dir === 'out') {
      const bytes = extra.size ?? 0
      setStats((s) =>
        dir === 'in'
          ? { ...s, inMsgs: s.inMsgs + 1, inBytes: s.inBytes + bytes }
          : { ...s, outMsgs: s.outMsgs + 1, outBytes: s.outBytes + bytes }
      )
    }
  }, [])

  /** Reemplaza {{variables}} con el entorno activo. null si falta alguna (y avisa) */
  const resolve = useCallback((text: string): string | null => {
    const store = useEnvironmentStore.getState()
    const vars = buildVarMap(withGlobalVariables(store.getActive(), store.data.globals))
    const { text: out, missing } = interpolate(text, vars)
    if (missing.length > 0) {
      setError(`Faltan variables: ${missing.map((m) => `{{${m}}}`).join(', ')}`)
      return null
    }
    return out
  }, [])

  /** Manda un mensaje por la conexión vigente y lo anota en el registro (en modo binario `text` es hex) */
  const sendRaw = useCallback(
    async (text: string, auto = false, binary = false): Promise<boolean> => {
      const id = idRef.current
      if (!id) return false
      const bytes = binary ? hexToBytes(text) : null
      if (binary && !bytes) {
        setError('El hexadecimal no es válido (ejemplo: de ad be ef)')
        return false
      }
      const failure = await window.api.wsSend(id, text, binary)
      if (failure) {
        setError(failure)
        return false
      }
      if (bytes) add('out', hexPreview(bytes), { binary: true, size: bytes.byteLength, auto })
      else add('out', text, { size: new TextEncoder().encode(text).length, auto })
      return true
    },
    [add]
  )

  const clearRetryTimer = useCallback((): void => {
    if (retryTimer.current) clearTimeout(retryTimer.current)
    retryTimer.current = null
    setRetrying(false)
  }, [])

  const openSocket = useCallback(
    async (params: ConnParams, label: string): Promise<void> => {
      const id = crypto.randomUUID()
      idRef.current = id
      openedRef.current = false
      setStatus('connecting')
      add('info', label)
      const result = await window.api.wsConnect({ id, ...params })
      if (!result.ok && idRef.current === id) {
        setStatus('closed')
        add('error', result.error)
      }
    },
    [add]
  )

  /** Programa un reintento con espera creciente, salvo que el usuario haya desconectado */
  const scheduleReconnect = useCallback((): void => {
    if (!optsRef.current.autoReconnect || userClosedRef.current) return
    if (!paramsRef.current || retryTimer.current) return
    const attempt = attemptRef.current++
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS)
    setRetrying(true)
    add('info', `Reintentando en ${Math.round(delay / 1000)} s (intento ${attempt + 1})…`)
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null
      setRetrying(false)
      const params = paramsRef.current
      if (params && !userClosedRef.current) {
        void openSocketRef.current?.(params, `Reconectando (intento ${attempt + 1})…`)
      }
    }, delay)
  }, [add])

  useEffect(() => {
    openSocketRef.current = openSocket
  }, [openSocket])

  useEffect(() => {
    lastForm = {
      url,
      headers: headersText,
      protocols: protocolsText,
      onOpen: onOpenText,
      autoReconnect,
      keepAlive,
      keepAliveSecs,
      keepAliveMsg
    }
    optsRef.current = { autoReconnect, onOpen: onOpenText }
  }, [
    url,
    headersText,
    protocolsText,
    onOpenText,
    autoReconnect,
    keepAlive,
    keepAliveSecs,
    keepAliveMsg
  ])

  // Eventos que llegan del proceso principal
  useEffect(() => {
    return window.api.onWsEvent((ev: WsEvent) => {
      if (ev.id !== idRef.current) return
      switch (ev.kind) {
        case 'open': {
          openedRef.current = true
          attemptRef.current = 0
          setStatus('open')
          add('info', `Conectado${ev.protocol ? ` · subprotocolo: ${ev.protocol}` : ''}`)
          const first = optsRef.current.onOpen.trim()
          if (first) {
            const text = resolve(first)
            if (text !== null) void sendRaw(text, true)
          }
          break
        }
        case 'message':
          add('in', ev.text, { binary: ev.binary, size: ev.size, truncated: ev.truncated })
          break
        case 'error':
          add('error', ev.message)
          setStatus((s) => (s === 'connecting' ? 'closed' : s))
          // Si el handshake falla no llega un 'close': se reintenta desde aquí
          if (!openedRef.current) scheduleReconnect()
          break
        case 'close':
          setStatus('closed')
          add('info', `Conexión cerrada · código ${ev.code}${ev.reason ? ` · ${ev.reason}` : ''}`)
          scheduleReconnect()
          break
      }
    })
  }, [add, resolve, sendRaw, scheduleReconnect])

  // Al cerrar la ventana no se deja una conexión abierta (ni un reintento pendiente)
  useEffect(() => {
    return () => {
      userClosedRef.current = true
      if (retryTimer.current) clearTimeout(retryTimer.current)
      if (idRef.current) void window.api.wsClose(idRef.current)
    }
  }, [])

  // Keep-alive: manda un mensaje cada cierto tiempo mientras la conexión esté abierta
  useEffect(() => {
    if (status !== 'open' || !keepAlive || !keepAliveMsg.trim()) return
    const secs = Math.max(1, Number(keepAliveSecs) || 30)
    const timer = setInterval(() => {
      const text = resolve(keepAliveMsg)
      if (text !== null) void sendRaw(text, true)
    }, secs * 1000)
    return () => clearInterval(timer)
  }, [status, keepAlive, keepAliveSecs, keepAliveMsg, resolve, sendRaw])

  useEffect(() => {
    const el = listRef.current
    if (follow && el) el.scrollTop = el.scrollHeight
  }, [log, follow])

  const connect = async (): Promise<void> => {
    setError('')
    if (!url.trim()) {
      setError('Escribe la URL del servidor, por ejemplo ws://localhost:3000')
      return
    }
    const rawUrl = resolve(url)
    const rawHeaders = resolve(headersText)
    const rawProtocols = resolve(protocolsText)
    if (rawUrl === null || rawHeaders === null || rawProtocols === null) return

    const { headers, invalid, ignored } = parseHeaderLines(rawHeaders)
    if (invalid.length > 0) {
      setError(`Headers mal escritos (usa "Nombre: valor"): ${invalid.join(' · ')}`)
      return
    }

    clearRetryTimer()
    userClosedRef.current = false
    attemptRef.current = 0
    const params: ConnParams = {
      url: toWsUrl(rawUrl),
      headers,
      protocols: parseProtocols(rawProtocols)
    }
    paramsRef.current = params
    if (ignored.length > 0) {
      add('info', `Se ignoraron headers que pone el handshake solo: ${ignored.join(', ')}`)
    }
    await openSocket(params, `Conectando a ${toWsUrl(url)}…`)
  }

  const disconnect = (): void => {
    userClosedRef.current = true
    attemptRef.current = 0
    clearRetryTimer()
    const id = idRef.current
    if (!id) return
    idRef.current = null
    void window.api.wsClose(id)
    setStatus('closed')
    add('info', 'Desconectado')
  }

  const rememberMessage = (text: string): void => {
    if (messageHistory[messageHistory.length - 1] !== text) {
      messageHistory = [...messageHistory, text].slice(-MAX_HISTORY)
    }
    historyIdx.current = -1
  }

  /** Ctrl/⌘ + ↑ recorre los mensajes enviados antes; Ctrl/⌘ + ↓ vuelve al borrador */
  const browseHistory = (step: -1 | 1): void => {
    const list = messageHistory
    if (list.length === 0) return
    let idx = historyIdx.current
    if (step === -1) {
      if (idx === -1) {
        stash.current = draft
        idx = list.length - 1
      } else {
        idx = Math.max(0, idx - 1)
      }
    } else {
      if (idx === -1) return
      idx += 1
      if (idx >= list.length) idx = -1
    }
    historyIdx.current = idx
    setDraft(idx === -1 ? stash.current : list[idx])
  }

  const sendMessage = async (): Promise<void> => {
    if (status !== 'open' || !draft || !idRef.current) return
    setError('')
    const text = resolve(draft)
    if (text === null) return
    if (await sendRaw(text, false, binaryMode)) rememberMessage(draft)
  }

  const exportLog = (): void => {
    const data = log.map((i) => ({
      time: new Date(i.at).toISOString(),
      dir: i.dir,
      text: i.text,
      ...(i.size !== undefined && { size: i.size }),
      ...(i.binary && { binary: true }),
      ...(i.auto && { auto: true })
    }))
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    downloadText(`websocket-${stamp}.json`, JSON.stringify(data, null, 2), 'application/json')
  }

  const clearLog = (): void => {
    setLog([])
    setStats({ inMsgs: 0, outMsgs: 0, inBytes: 0, outBytes: 0 })
  }

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return log.filter(
      (i) =>
        (dirFilter === 'all' || i.dir === dirFilter) && (!q || i.text.toLowerCase().includes(q))
    )
  }, [log, filter, dirFilter])

  /** Si el borrador parece JSON: ¿es válido? (las {{variables}} cuentan como un valor cualquiera) */
  const draftJson = useMemo((): 'ok' | 'bad' | null => {
    const t = draft.trim()
    if (!(t.startsWith('{') || t.startsWith('['))) return null
    try {
      JSON.parse(t.replace(/\{\{[^}]+\}\}/g, '0'))
      return 'ok'
    } catch {
      return 'bad'
    }
  }, [draft])

  const openSavedConnection = async (path: string): Promise<void> => {
    setConfirmDelete(false)
    setSavePanel(false)
    if (!path) {
      setOpenSaved(null)
      return
    }
    setError('')
    try {
      const c = await window.api.readSavedWebSocket(path)
      setUrl(c.url)
      setHeadersText(c.headers)
      setProtocolsText(c.protocols)
      setOnOpenText(c.onOpen)
      setAutoReconnect(c.autoReconnect)
      setKeepAlive(c.keepAlive)
      setKeepAliveSecs(String(c.keepAliveSecs))
      setKeepAliveMsg(c.keepAliveMsg)
      setMessages(c.messages)
      setOpenSaved({ path, collectionId: path.split('/')[0], name: c.name })
    } catch {
      setError('No se pudo abrir la conexión guardada (¿se borró el archivo?)')
      refreshSaved()
    }
  }

  const startSave = (): void => {
    setError('')
    setConfirmDelete(false)
    setSaveName(openSaved?.name ?? '')
    setSaveCollection(
      openSaved && collections.some((c) => c.id === openSaved.collectionId)
        ? openSaved.collectionId
        : (collections[0]?.id ?? '')
    )
    setSavePanel(true)
  }

  const saveConnection = async (): Promise<void> => {
    const name = saveName.trim()
    if (!name) {
      setError('Ponle un nombre a la conexión')
      return
    }
    if (!saveCollection) {
      setError('Elige la colección donde guardarla')
      return
    }
    setError('')
    const data: SavedWebSocket = {
      type: 'websocket',
      name,
      url,
      headers: headersText,
      protocols: protocolsText,
      onOpen: onOpenText,
      autoReconnect,
      keepAlive,
      keepAliveSecs: Math.max(1, Number(keepAliveSecs) || 30),
      keepAliveMsg,
      messages
    }
    // Mismo nombre y misma colección que la abierta: se actualiza ese archivo; si no, se crea otro
    const overwrite =
      openSaved && openSaved.collectionId === saveCollection && openSaved.name === name
        ? openSaved.path
        : undefined
    const result = await window.api.saveWebSocket(saveCollection, data, overwrite)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setOpenSaved({ path: result.path, collectionId: saveCollection, name })
    setSavePanel(false)
    refreshSaved()
    const where = collections.find((c) => c.id === saveCollection)?.name ?? saveCollection
    add('info', `Conexión guardada en la colección «${where}»`)
  }

  const deleteSavedConnection = async (): Promise<void> => {
    if (!openSaved) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    await window.api.deleteSavedWebSocket(openSaved.path)
    setConfirmDelete(false)
    setOpenSaved(null)
    refreshSaved()
  }

  const addSavedMessage = (): void => {
    if (!draft.trim() || messages.some((m) => m.text === draft && m.binary === binaryMode)) return
    const name = draft.replace(/\s+/g, ' ').trim().slice(0, 28)
    setMessages((l) => [...l, { name, text: draft, binary: binaryMode }].slice(-100))
  }

  const loadSavedMessage = (m: SavedWsMessage): void => {
    historyIdx.current = -1
    setBinaryMode(m.binary)
    setDraft(m.text)
  }

  const live = status === 'connecting' || status === 'open'

  return (
    <Modal title="WebSocket" onClose={onClose} wide>
      <p className="mb-3 text-xs text-zinc-500">
        Conéctate a un servidor WebSocket, envía mensajes y mira lo que llega en tiempo real. Admite{' '}
        <code className="text-zinc-400">{'{{variables}}'}</code> del entorno activo y también{' '}
        <code className="text-zinc-400">http://</code> o{' '}
        <code className="text-zinc-400">https://</code> (se convierten a ws y wss). Al cerrar esta
        ventana se cierra la conexión.
      </p>

      <div className="mb-3 rounded-md border border-zinc-800 bg-zinc-900/60 p-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-zinc-400">Guardadas</span>
          <select
            value={openSaved?.path ?? ''}
            disabled={live}
            onChange={(e) => void openSavedConnection(e.target.value)}
            className={`${field} min-w-0 flex-1 py-1`}
          >
            <option value="">
              {saved.length === 0
                ? 'Aún no hay conexiones guardadas'
                : 'Abrir una conexión guardada…'}
            </option>
            {[...new Set(saved.map((s) => s.collectionId))].map((cid) => (
              <optgroup
                key={cid}
                label={saved.find((s) => s.collectionId === cid)?.collectionName ?? cid}
              >
                {saved
                  .filter((s) => s.collectionId === cid)
                  .map((s) => (
                    <option key={s.path} value={s.path}>
                      {s.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <button
            onClick={startSave}
            className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-zinc-300 hover:bg-zinc-700"
          >
            <Icon name="save" size={12} />
            Guardar…
          </button>
          {openSaved && (
            <button
              onClick={() => void deleteSavedConnection()}
              className={`rounded px-2 py-1 ${
                confirmDelete
                  ? 'bg-red-600 text-white hover:bg-red-500'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {confirmDelete ? '¿Seguro? Borra el archivo' : 'Eliminar'}
            </button>
          )}
        </div>

        {savePanel &&
          (collections.length === 0 ? (
            <p className="mt-2 text-xs text-amber-300">
              Crea o importa una colección primero: la conexión se guarda dentro de una.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-end gap-2 text-xs">
              <label className="min-w-0 flex-1">
                <span className={label}>Nombre</span>
                <input
                  className={`${field} w-full py-1`}
                  value={saveName}
                  placeholder="Chat en vivo"
                  autoFocus
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveConnection()
                  }}
                />
              </label>
              <label>
                <span className={label}>Colección</span>
                <select
                  className={`${field} py-1`}
                  value={saveCollection}
                  onChange={(e) => setSaveCollection(e.target.value)}
                >
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => void saveConnection()}
                className="rounded bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-500"
              >
                Guardar
              </button>
              <button
                onClick={() => setSavePanel(false)}
                className="rounded bg-zinc-800 px-3 py-1.5 text-zinc-300 hover:bg-zinc-700"
              >
                Cancelar
              </button>
            </div>
          ))}

        <p className="mt-1.5 text-[10px] text-zinc-600">
          Se guarda como un archivo <code>.ws.json</code> dentro de la colección. Usa{' '}
          <code>{'{{variables}}'}</code> en vez de tokens: las credenciales escritas a mano no se
          guardan.
        </p>
      </div>

      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className={label}>URL</span>
          <input
            className={`${field} w-full font-mono`}
            value={url}
            disabled={live}
            placeholder="ws://localhost:3000/chat"
            spellCheck={false}
            autoFocus
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !live) void connect()
            }}
          />
        </label>
        {live || retrying ? (
          <button
            onClick={disconnect}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
          >
            {live ? 'Desconectar' : 'Cancelar reintento'}
          </button>
        ) : (
          <button
            onClick={() => void connect()}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
          >
            Conectar
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
        <span className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              retrying ? 'animate-pulse bg-amber-400' : STATUS[status].dot
            }`}
          />
          {retrying ? 'Reintentando…' : STATUS[status].text}
        </span>
        {(stats.inMsgs > 0 || stats.outMsgs > 0) && (
          <span className="text-zinc-500">
            ↓ {stats.inMsgs} ({formatSize(stats.inBytes)}) · ↑ {stats.outMsgs} (
            {formatSize(stats.outBytes)})
          </span>
        )}
      </div>

      <details className="mt-2" open={!!(headersText || protocolsText)}>
        <summary className="cursor-pointer text-xs font-medium text-zinc-400 hover:text-zinc-200">
          Headers y subprotocolos
        </summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label>
            <span className={label}>Headers (uno por línea)</span>
            <textarea
              className={`${field} h-20 w-full resize-none font-mono`}
              value={headersText}
              disabled={live}
              placeholder={'Authorization: Bearer {{token}}\nOrigin: http://localhost:3000'}
              spellCheck={false}
              onChange={(e) => setHeadersText(e.target.value)}
            />
          </label>
          <label>
            <span className={label}>Subprotocolos (separados por coma)</span>
            <textarea
              className={`${field} h-20 w-full resize-none font-mono`}
              value={protocolsText}
              disabled={live}
              placeholder="graphql-transport-ws, chat"
              spellCheck={false}
              onChange={(e) => setProtocolsText(e.target.value)}
            />
          </label>
        </div>
      </details>

      <details className="mt-2" open={!!(onOpenText || autoReconnect || keepAlive)}>
        <summary className="cursor-pointer text-xs font-medium text-zinc-400 hover:text-zinc-200">
          Automatización
        </summary>
        <div className="mt-2 grid gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={autoReconnect}
              onChange={(e) => setAutoReconnect(e.target.checked)}
            />
            Reconectar solo si se cae la conexión (espera 1, 2, 4… hasta 30 s)
          </label>

          <label>
            <span className={label}>Mensaje al conectar (se envía apenas abre la conexión)</span>
            <textarea
              className={`${field} h-14 w-full resize-none font-mono`}
              value={onOpenText}
              placeholder={'{"type":"connection_init"}'}
              spellCheck={false}
              onChange={(e) => setOnOpenText(e.target.value)}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={keepAlive}
                onChange={(e) => setKeepAlive(e.target.checked)}
              />
              Keep-alive cada
            </label>
            <input
              type="number"
              min={1}
              value={keepAliveSecs}
              onChange={(e) => setKeepAliveSecs(e.target.value)}
              className={`${field} w-16 py-1`}
            />
            <span>s enviando</span>
            <input
              value={keepAliveMsg}
              spellCheck={false}
              onChange={(e) => setKeepAliveMsg(e.target.value)}
              className={`${field} min-w-0 flex-1 py-1 font-mono`}
            />
          </div>
        </div>
      </details>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <div className="mb-1 mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-zinc-400">Mensajes</span>
        <span className="text-zinc-600">
          {filter.trim() || dirFilter !== 'all' ? `${visible.length} de ${log.length}` : log.length}
        </span>
        <div className="ml-auto flex overflow-hidden rounded border border-zinc-700">
          {(['all', 'in', 'out'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDirFilter(d)}
              className={`px-2 py-1 ${
                dirFilter === d ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              {DIR_FILTER_LABEL[d]}
            </button>
          ))}
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar…"
          spellCheck={false}
          className={`${field} w-36 py-1`}
        />
        <label className="flex items-center gap-1 text-zinc-400">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          Seguir
        </label>
        <button
          onClick={exportLog}
          disabled={log.length === 0}
          title="Guardar el registro como JSON"
          className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
        >
          <Icon name="download" size={12} />
          Exportar
        </button>
        <button
          onClick={clearLog}
          disabled={log.length === 0}
          className="rounded bg-zinc-800 px-2 py-1 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
        >
          Limpiar
        </button>
      </div>

      <div
        ref={listRef}
        className="h-[34vh] min-h-[160px] overflow-auto rounded-md border border-zinc-700 bg-zinc-950"
      >
        {visible.length === 0 ? (
          <p className="p-3 text-xs text-zinc-600">
            {log.length === 0 ? 'Aún no hay mensajes.' : 'Ningún mensaje coincide con el filtro.'}
          </p>
        ) : (
          <ul>
            {visible.map((item) => (
              <LogRow key={item.n} item={item} onReuse={setDraft} />
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 flex items-end gap-2">
        <textarea
          className={`${field} h-16 flex-1 resize-none font-mono`}
          value={draft}
          placeholder={
            binaryMode
              ? 'Bytes en hexadecimal, por ejemplo de ad be ef'
              : 'Mensaje a enviar, por ejemplo {"type":"ping"}'
          }
          spellCheck={false}
          onChange={(e) => {
            historyIdx.current = -1
            setDraft(e.target.value)
          }}
          onKeyDown={(e) => {
            if (!(e.metaKey || e.ctrlKey)) return
            if (e.key === 'Enter') {
              e.preventDefault()
              void sendMessage()
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              browseHistory(-1)
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              browseHistory(1)
            }
          }}
        />
        <button
          onClick={() => void sendMessage()}
          disabled={status !== 'open' || !draft}
          title="Enviar (Ctrl/⌘ + Enter)"
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
        >
          <Icon name="send" size={13} />
          Enviar
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className="text-zinc-500" title="Se guardan junto con la conexión">
          Mensajes guardados
        </span>
        {messages.map((m, i) => (
          <span
            key={`${i}-${m.name}`}
            className="flex items-center overflow-hidden rounded border border-zinc-700 bg-zinc-800"
          >
            <button
              onClick={() => loadSavedMessage(m)}
              title={m.text}
              className="max-w-[160px] truncate px-1.5 py-0.5 text-zinc-300 hover:bg-zinc-700"
            >
              {m.binary && <span className="mr-1 text-amber-300">bin</span>}
              {m.name}
            </button>
            <button
              onClick={() => setMessages((l) => l.filter((_, j) => j !== i))}
              title="Quitar"
              className="px-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"
            >
              ×
            </button>
          </span>
        ))}
        <button
          onClick={addSavedMessage}
          disabled={!draft.trim()}
          className="rounded border border-dashed border-zinc-700 px-1.5 py-0.5 text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
        >
          + Guardar el del editor
        </button>
      </div>

      <div className="mt-1 flex items-center gap-3 text-[10px] text-zinc-500">
        <div className="flex overflow-hidden rounded border border-zinc-700">
          {([false, true] as const).map((bin) => (
            <button
              key={String(bin)}
              onClick={() => setBinaryMode(bin)}
              className={`px-2 py-0.5 ${
                binaryMode === bin ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              {bin ? 'Binario (hex)' : 'Texto'}
            </button>
          ))}
        </div>
        {binaryMode ? (
          draft.trim() &&
          !draft.includes('{{') &&
          (draftBytes ? (
            <span className="text-emerald-400">{draftBytes.length} bytes</span>
          ) : (
            <span className="text-amber-300">Hex no válido</span>
          ))
        ) : (
          <>
            {draftJson === 'ok' && <span className="text-emerald-400">JSON válido</span>}
            {draftJson === 'bad' && <span className="text-amber-300">JSON con errores</span>}
            <button
              onClick={() => setDraft(prettyIfJson(draft).text)}
              disabled={draftJson !== 'ok'}
              className="rounded px-1 text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
            >
              Formatear
            </button>
          </>
        )}
        <span className="ml-auto">Ctrl/⌘ + ↑ ↓ para recorrer mensajes anteriores</span>
      </div>

      <div className="mt-1 flex items-center gap-3 text-[10px] text-zinc-500">
        {draftJson === 'ok' && <span className="text-emerald-400">JSON válido</span>}
        {draftJson === 'bad' && <span className="text-amber-300">JSON con errores</span>}
        <button
          onClick={() => setDraft(prettyIfJson(draft).text)}
          disabled={draftJson !== 'ok'}
          className="rounded px-1 text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
        >
          Formatear
        </button>
        <span className="ml-auto">Ctrl/⌘ + ↑ ↓ para recorrer mensajes anteriores</span>
      </div>
    </Modal>
  )
}
