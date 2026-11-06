import { useState } from 'react'
import { useConsoleStore } from '../store/useConsoleStore'
import { Modal } from './Modal'

type Filter = 'all' | 'request' | 'log'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todo' },
  { id: 'request', label: 'Peticiones' },
  { id: 'log', label: 'Logs de scripts' }
]

const time = (at: number): string => new Date(at).toLocaleTimeString()
const ms = (v: number): string => (v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${v} ms`)
const size = (b: number): string =>
  b >= 1024 * 1024
    ? `${(b / 1024 / 1024).toFixed(1)} MB`
    : b >= 1024
      ? `${(b / 1024).toFixed(1)} KB`
      : `${b} B`

const statusColor = (ok: boolean, status?: number): string => {
  if (!ok || status === undefined) return 'text-red-400'
  if (status >= 500) return 'text-red-400'
  if (status >= 400) return 'text-amber-400'
  if (status >= 300) return 'text-sky-400'
  return 'text-emerald-400'
}

interface Props {
  onClose: () => void
}

export function ConsoleModal({ onClose }: Props): React.JSX.Element {
  const entries = useConsoleStore((s) => s.entries)
  const clear = useConsoleStore((s) => s.clear)
  const [filter, setFilter] = useState<Filter>('all')

  const visible = entries.filter((e) => filter === 'all' || e.kind === filter)

  return (
    <Modal
      title="Consola"
      icon="terminal"
      description="Peticiones y logs de scripts de esta sesión. No se guarda en disco."
      onClose={onClose}
      wide
      footer={
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-500">{visible.length} entradas</span>
          <button
            onClick={clear}
            disabled={entries.length === 0}
            className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
          >
            Limpiar
          </button>
        </div>
      }
    >
      <div className="mb-3 flex gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-md px-2.5 py-1 text-xs ${
              filter === f.id
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-xs text-zinc-500">
          Todavía no hay actividad. Envía una petición para verla aquí.
        </p>
      ) : (
        <ul className="space-y-1 font-mono text-[11px]">
          {[...visible].reverse().map((e) =>
            e.kind === 'request' ? (
              <li key={e.id} className="rounded-md bg-zinc-800/60 px-2 py-1.5">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="text-zinc-500">{time(e.at)}</span>
                  <span className="font-semibold text-zinc-200">{e.method}</span>
                  <span className={statusColor(e.ok, e.status)}>{e.ok ? e.status : 'ERROR'}</span>
                  <span className="text-zinc-400">{ms(e.timeMs)}</span>
                  {e.sizeBytes !== undefined && (
                    <span className="text-zinc-400">{size(e.sizeBytes)}</span>
                  )}
                  {e.retries > 0 && (
                    <span className="text-amber-400">
                      {e.retries} {e.retries === 1 ? 'reintento' : 'reintentos'}
                    </span>
                  )}
                </div>
                <div className="break-all text-zinc-300">{e.url}</div>
                {e.error && <div className="text-red-400">{e.error}</div>}
              </li>
            ) : (
              <li
                key={e.id}
                className="rounded-md border-l-2 border-blue-500 bg-zinc-900 px-2 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500">{time(e.at)}</span>
                  <span className="text-blue-400">
                    {e.phase === 'pre' ? 'pre-script' : 'post-script'}
                  </span>
                </div>
                <div className="whitespace-pre-wrap break-all text-zinc-200">{e.text}</div>
              </li>
            )
          )}
        </ul>
      )}
    </Modal>
  )
}
