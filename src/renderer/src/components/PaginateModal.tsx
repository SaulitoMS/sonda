import { useEffect, useRef, useState } from 'react'
import {
  PAGINATE_MAX_DELAY_MS,
  PAGINATE_MAX_PAGES,
  extractItems,
  nextPageUrl,
  normalizePaginate,
  paginateEndLabel,
  type PaginateEnd,
  type PaginateMode,
  type PaginateRow
} from '../../../shared/paginate'
import { confirmBulkMessage } from '../../../shared/writeGuard'
import { downloadText } from '../lib/download'
import { executeRequest } from '../lib/runRequest'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { useRequestStore } from '../store/useRequestStore'
import { Modal } from './Modal'

const field =
  'w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500 disabled:opacity-50'
const label = 'mb-1 block text-xs font-medium text-zinc-400'

const MODE_LABELS: Record<PaginateMode, string> = {
  link: 'Header Link (rel="next")',
  cursor: 'Cursor en el body',
  page: 'Número de página'
}

/** Espera `ms` pero se corta enseguida si el usuario detiene la paginación */
async function sleep(ms: number, stop: { current: boolean }): Promise<void> {
  const end = Date.now() + ms
  while (!stop.current && Date.now() < end) {
    await new Promise((r) => setTimeout(r, Math.min(100, Math.max(0, end - Date.now()))))
  }
}

export function PaginateModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const method = useRequestStore((s) => s.method)
  const url = useRequestStore((s) => s.url)

  const [mode, setMode] = useState<PaginateMode>('link')
  const [maxPages, setMaxPages] = useState(10)
  const [delayMs, setDelayMs] = useState(0)
  const [itemsPath, setItemsPath] = useState('')
  const [cursorPath, setCursorPath] = useState('')
  const [cursorParam, setCursorParam] = useState('cursor')
  const [pageParam, setPageParam] = useState('page')

  const [running, setRunning] = useState(false)
  const [rows, setRows] = useState<PaginateRow[]>([])
  const [end, setEnd] = useState<{ kind: PaginateEnd; pages: number; items: number } | null>(null)
  const [error, setError] = useState('')
  const collected = useRef<unknown[]>([])
  const stopRef = useRef(false)

  // Si se cierra el modal a media paginación, se detiene
  useEffect(() => {
    return () => {
      stopRef.current = true
    }
  }, [])

  const start = async (): Promise<void> => {
    const s = useRequestStore.getState()
    if (!s.url.trim()) {
      setError('La petición no tiene URL.')
      return
    }
    if (mode === 'cursor' && !cursorPath.trim()) {
      setError('Indica la ruta JSON del cursor (ej: meta.next_cursor).')
      return
    }

    const opts = normalizePaginate({
      mode,
      maxPages,
      delayMs,
      itemsPath,
      cursorPath,
      cursorParam,
      pageParam
    })
    const draft = {
      method: s.method,
      url: s.url,
      headers: s.headers,
      body: s.body,
      bodyForm: s.bodyForm,
      auth: s.auth
    }
    const env = useEnvironmentStore.getState().getActive()

    const guard = confirmBulkMessage(env, s.method, s.url, opts.maxPages, 'La paginación')
    if (guard && !confirm(guard)) return

    stopRef.current = false
    collected.current = []
    setError('')
    setRows([])
    setEnd(null)
    setRunning(true)

    let finished: PaginateEnd = 'max'
    let pages = 0
    let currentUrl = s.url
    const visited = new Set<string>()

    for (let n = 1; n <= opts.maxPages; n++) {
      if (stopRef.current) {
        finished = 'stopped'
        break
      }
      visited.add(currentUrl)
      pages = n

      const { response } = await executeRequest({ ...draft, url: currentUrl }, env, {
        path: s.currentFile
      })

      if (!response.ok) {
        setRows((prev) => [
          ...prev,
          { n, url: currentUrl, status: null, timeMs: response.timeMs, items: 0 }
        ])
        finished = 'error'
        break
      }

      let json: unknown = null
      try {
        json = JSON.parse(response.body)
      } catch {
        // No es JSON: solo sirve el modo Link
      }
      const items = extractItems(json, opts.itemsPath)
      collected.current.push(...items)
      setRows((prev) => [
        ...prev,
        {
          n,
          url: currentUrl,
          status: response.status,
          timeMs: response.timeMs,
          items: items.length
        }
      ])

      if (response.status < 200 || response.status >= 300) {
        finished = 'error'
        break
      }
      // Con número de página, una página vacía indica el final
      if (opts.mode === 'page' && items.length === 0) {
        finished = 'empty'
        break
      }

      const next = nextPageUrl(opts, { url: currentUrl, headers: response.headers, json })
      if (!next) {
        finished = 'done'
        break
      }
      if (visited.has(next)) {
        finished = 'loop'
        break
      }
      currentUrl = next
      if (n < opts.maxPages && opts.delayMs > 0) await sleep(opts.delayMs, stopRef)
    }

    setEnd({ kind: finished, pages, items: collected.current.length })
    setRunning(false)
  }

  const copyItems = (): void => {
    void navigator.clipboard.writeText(JSON.stringify(collected.current, null, 2))
  }

  const saveItems = (): void => {
    downloadText('paginacion.json', JSON.stringify(collected.current, null, 2), 'application/json')
  }

  return (
    <Modal title="Paginación" onClose={onClose} wide>
      <p className="mb-3 truncate text-xs text-zinc-400">
        <span className="font-bold text-zinc-200">{method}</span> {url || '(sin URL)'}
      </p>
      <p className="mb-3 text-xs text-zinc-500">
        Pide todas las páginas de un listado y junta los items en un solo JSON.
      </p>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={label}>Cómo avanza</label>
          <select
            value={mode}
            disabled={running}
            onChange={(e) => setMode(e.target.value as PaginateMode)}
            className={field}
          >
            {(Object.keys(MODE_LABELS) as PaginateMode[]).map((m) => (
              <option key={m} value={m}>
                {MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Ruta de los items (vacío = detectar)</label>
          <input
            value={itemsPath}
            disabled={running}
            onChange={(e) => setItemsPath(e.target.value)}
            placeholder="data.items"
            spellCheck={false}
            className={`${field} font-mono`}
          />
        </div>
        {mode === 'cursor' && (
          <div>
            <label className={label}>Ruta del cursor siguiente</label>
            <input
              value={cursorPath}
              disabled={running}
              onChange={(e) => setCursorPath(e.target.value)}
              placeholder="meta.next_cursor"
              spellCheck={false}
              className={`${field} font-mono`}
            />
          </div>
        )}
        {mode === 'cursor' && (
          <div>
            <label className={label}>Parámetro que recibe el cursor</label>
            <input
              value={cursorParam}
              disabled={running}
              onChange={(e) => setCursorParam(e.target.value)}
              spellCheck={false}
              className={`${field} font-mono`}
            />
          </div>
        )}
        {mode === 'page' && (
          <div>
            <label className={label}>Parámetro de página</label>
            <input
              value={pageParam}
              disabled={running}
              onChange={(e) => setPageParam(e.target.value)}
              spellCheck={false}
              className={`${field} font-mono`}
            />
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Páginas máximas (hasta {PAGINATE_MAX_PAGES})</label>
          <input
            type="number"
            min={1}
            max={PAGINATE_MAX_PAGES}
            value={maxPages}
            disabled={running}
            onChange={(e) => setMaxPages(Number(e.target.value))}
            className={field}
          />
        </div>
        <div>
          <label className={label}>Espera entre páginas en ms (0 a {PAGINATE_MAX_DELAY_MS})</label>
          <input
            type="number"
            min={0}
            max={PAGINATE_MAX_DELAY_MS}
            step={100}
            value={delayMs}
            disabled={running}
            onChange={(e) => setDelayMs(Number(e.target.value))}
            className={field}
          />
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {end && (
        <p
          className={`mt-3 text-xs font-semibold ${
            end.kind === 'done' || end.kind === 'empty' ? 'text-emerald-400' : 'text-amber-400'
          }`}
        >
          {paginateEndLabel(end.kind, end.pages, end.items)}
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-3 max-h-48 overflow-auto rounded-md border border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-zinc-900 text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Tiempo</th>
                <th className="px-3 py-2 font-medium">Items</th>
                <th className="px-3 py-2 font-medium">URL</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.n} className="border-t border-zinc-800">
                  <td className="px-3 py-1.5 text-zinc-400">{r.n}</td>
                  <td className="px-3 py-1.5 text-zinc-200">{r.status ?? '—'}</td>
                  <td className="px-3 py-1.5 text-zinc-400">{r.timeMs} ms</td>
                  <td className="px-3 py-1.5 text-zinc-200">{r.items}</td>
                  <td
                    className="max-w-64 truncate px-3 py-1.5 font-mono text-zinc-500"
                    title={r.url}
                  >
                    {r.url}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Cerrar
        </button>
        {end && end.items > 0 && !running && (
          <>
            <button
              onClick={copyItems}
              className="rounded px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Copiar items
            </button>
            <button
              onClick={saveItems}
              className="rounded px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Guardar JSON
            </button>
          </>
        )}
        {running ? (
          <button
            onClick={() => {
              stopRef.current = true
            }}
            className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
          >
            Detener
          </button>
        ) : (
          <button onClick={() => void start()} className="btn btn-primary btn-sm">
            Iniciar
          </button>
        )}
      </div>
    </Modal>
  )
}
