import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildVarMap, interpolate } from '../../../shared/variables'
import {
  parseHeaderLines,
  parseProtocols,
  prettyIfJson,
  toWsUrl,
  type WsEvent
} from '../../../shared/websocket'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { Icon } from './Icon'
import { Modal } from './Modal'

type Status = 'idle' | 'connecting' | 'open' | 'closed'
type Dir = 'in' | 'out' | 'info' | 'error'

interface LogItem {
  n: number
  at: number
  dir: Dir
  text: string
  binary?: boolean
  size?: number
  truncated?: boolean
}

/** Se muestran como máximo los últimos mensajes; más allá se descartan los más viejos */
const MAX_LOG = 1000

/** Lo último que se escribió, para no volver a teclearlo al reabrir la ventana */
let lastForm = { url: '', headers: '', protocols: '' }

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

const LogRow = memo(function LogRow({ item }: { item: LogItem }): React.JSX.Element {
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
        <button
          onClick={() => void navigator.clipboard.writeText(item.text)}
          title="Copiar mensaje"
          className="h-fit shrink-0 rounded p-1 text-zinc-600 opacity-0 transition hover:bg-zinc-800 hover:text-zinc-200 group-hover:opacity-100"
        >
          <Icon name="copy" size={12} />
        </button>
      )}
    </li>
  )
})

export function WebSocketModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [url, setUrl] = useState(lastForm.url)
  const [headersText, setHeadersText] = useState(lastForm.headers)
  const [protocolsText, setProtocolsText] = useState(lastForm.protocols)
  const [status, setStatus] = useState<Status>('idle')
  const [log, setLog] = useState<LogItem[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [follow, setFollow] = useState(true)

  /** Id de la conexión vigente: los eventos de cualquier otra se descartan */
  const idRef = useRef<string | null>(null)
  const counter = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)

  const add = useCallback((dir: Dir, text: string, extra: Partial<LogItem> = {}): void => {
    const item: LogItem = { n: ++counter.current, at: Date.now(), dir, text, ...extra }
    setLog((l) => [...l, item].slice(-MAX_LOG))
  }, [])

  useEffect(() => {
    lastForm = { url, headers: headersText, protocols: protocolsText }
  }, [url, headersText, protocolsText])

  // Eventos que llegan del proceso principal
  useEffect(() => {
    return window.api.onWsEvent((ev: WsEvent) => {
      if (ev.id !== idRef.current) return
      switch (ev.kind) {
        case 'open':
          setStatus('open')
          add('info', `Conectado${ev.protocol ? ` · subprotocolo: ${ev.protocol}` : ''}`)
          break
        case 'message':
          add('in', ev.text, { binary: ev.binary, size: ev.size, truncated: ev.truncated })
          break
        case 'error':
          add('error', ev.message)
          setStatus((s) => (s === 'connecting' ? 'closed' : s))
          break
        case 'close':
          setStatus('closed')
          add('info', `Conexión cerrada · código ${ev.code}${ev.reason ? ` · ${ev.reason}` : ''}`)
          break
      }
    })
  }, [add])

  // Al cerrar la ventana no se deja una conexión abierta en segundo plano
  useEffect(() => {
    return () => {
      if (idRef.current) void window.api.wsClose(idRef.current)
    }
  }, [])

  useEffect(() => {
    const el = listRef.current
    if (follow && el) el.scrollTop = el.scrollHeight
  }, [log, follow])

  /** Reemplaza {{variables}} con el entorno activo. null si falta alguna (y avisa) */
  const resolve = (text: string): string | null => {
    const vars = buildVarMap(useEnvironmentStore.getState().getActive())
    const { text: out, missing } = interpolate(text, vars)
    if (missing.length > 0) {
      setError(`Faltan variables: ${missing.map((m) => `{{${m}}}`).join(', ')}`)
      return null
    }
    return out
  }

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

    const id = crypto.randomUUID()
    idRef.current = id
    setStatus('connecting')
    add('info', `Conectando a ${toWsUrl(url)}…`)
    if (ignored.length > 0) {
      add('info', `Se ignoraron headers que pone el handshake solo: ${ignored.join(', ')}`)
    }

    const result = await window.api.wsConnect({
      id,
      url: toWsUrl(rawUrl),
      headers,
      protocols: parseProtocols(rawProtocols)
    })
    if (!result.ok && idRef.current === id) {
      setStatus('closed')
      add('error', result.error)
    }
  }

  const disconnect = (): void => {
    const id = idRef.current
    if (!id) return
    idRef.current = null
    void window.api.wsClose(id)
    setStatus('closed')
    add('info', 'Desconectado')
  }

  const sendMessage = async (): Promise<void> => {
    if (status !== 'open' || !draft || !idRef.current) return
    setError('')
    const text = resolve(draft)
    if (text === null) return
    const failure = await window.api.wsSend(idRef.current, text)
    if (failure) {
      setError(failure)
      return
    }
    add('out', text, { size: new TextEncoder().encode(text).length })
  }

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return q ? log.filter((i) => i.text.toLowerCase().includes(q)) : log
  }, [log, filter])

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
        {live ? (
          <button
            onClick={disconnect}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
          >
            Desconectar
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

      <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
        <span className={`h-2 w-2 rounded-full ${STATUS[status].dot}`} />
        {STATUS[status].text}
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

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <div className="mb-1 mt-4 flex items-center gap-2 text-xs">
        <span className="font-medium text-zinc-400">Mensajes</span>
        <span className="text-zinc-600">
          {filter.trim() ? `${visible.length} de ${log.length}` : log.length}
        </span>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar…"
          spellCheck={false}
          className={`${field} ml-auto w-40 py-1`}
        />
        <label className="flex items-center gap-1 text-zinc-400">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          Seguir
        </label>
        <button
          onClick={() => setLog([])}
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
              <LogRow key={item.n} item={item} />
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 flex items-end gap-2">
        <textarea
          className={`${field} h-16 flex-1 resize-none font-mono`}
          value={draft}
          placeholder={'Mensaje a enviar, por ejemplo {"type":"ping"}'}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void sendMessage()
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
    </Modal>
  )
}