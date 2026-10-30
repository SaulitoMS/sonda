import { useMemo, useState } from 'react'
import { dayLabel, filterHistory, type HistoryEntry } from '../../../shared/history'
import { applyHistory } from '../lib/applyHistory'
import { METHOD_COLORS } from '../lib/methodColors'
import { useHistoryStore } from '../store/useHistoryStore'
import { Modal } from './Modal'

const statusClass = (e: HistoryEntry): string => {
  if (!e.response.ok) return 'bg-red-500/20 text-red-400'
  const s = e.response.status
  if (s >= 500) return 'bg-red-500/20 text-red-400'
  if (s >= 400) return 'bg-amber-500/20 text-amber-400'
  if (s >= 300) return 'bg-sky-500/20 text-sky-400'
  return 'bg-emerald-500/20 text-emerald-400'
}

const statusText = (e: HistoryEntry): string => (e.response.ok ? String(e.response.status) : 'Error')

const hour = (at: number): string =>
  new Date(at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })

interface Props {
  onClose: () => void
  onRestored: () => void
}

export function HistoryModal({ onClose, onRestored }: Props): React.JSX.Element {
  const { entries, remove, clear } = useHistoryStore()
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const out: { label: string; items: HistoryEntry[] }[] = []
    for (const e of filterHistory(entries, query)) {
      const label = dayLabel(e.at)
      const last = out[out.length - 1]
      if (last && last.label === label) last.items.push(e)
      else out.push({ label, items: [e] })
    }
    return out
  }, [entries, query])

  const restore = (e: HistoryEntry): void => {
    applyHistory(e)
    onRestored()
    onClose()
  }

  const clearAll = (): void => {
    if (confirm('¿Borrar todo el historial?')) clear()
  }

  return (
    <Modal title="Historial" onClose={onClose} wide>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por método, URL o status…"
        spellCheck={false}
        className="mb-3 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs outline-none placeholder:text-zinc-500 focus:border-blue-500"
      />

      <div className="max-h-[55vh] min-h-32 overflow-auto">
        {entries.length === 0 && (
          <p className="p-3 text-xs text-zinc-500">
            Aún no hay peticiones. Las que envíes aparecerán aquí.
          </p>
        )}
        {entries.length > 0 && groups.length === 0 && (
          <p className="p-3 text-xs text-zinc-500">Sin resultados para “{query}”.</p>
        )}

        {groups.map((g) => (
          <div key={g.label} className="mb-3">
            <div className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              {g.label}
            </div>
            {g.items.map((e) => (
              <div
                key={e.id}
                onClick={() => restore(e)}
                className="group flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-xs hover:bg-zinc-800/70"
              >
                <span className={`w-12 shrink-0 font-bold ${METHOD_COLORS[e.method]}`}>
                  {e.method}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-zinc-300" title={e.url}>
                  {e.url}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${statusClass(e)}`}>
                  {statusText(e)}
                </span>
                <span className="w-14 shrink-0 text-right text-zinc-500">{e.response.timeMs} ms</span>
                <span className="w-12 shrink-0 text-right text-zinc-600 group-hover:hidden">
                  {hour(e.at)}
                </span>
                <button
                  onClick={(ev) => {
                    ev.stopPropagation()
                    remove(e.id)
                  }}
                  className="hidden w-12 shrink-0 text-right text-zinc-500 hover:text-red-400 group-hover:block"
                  title="Quitar del historial"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={clearAll}
          disabled={entries.length === 0}
          className="rounded-md px-3 py-2 text-xs text-zinc-500 hover:text-red-400 disabled:opacity-40"
        >
          Borrar historial
        </button>
        <button
          onClick={onClose}
          className="rounded-md px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200"
        >
          Cerrar
        </button>
      </div>
    </Modal>
  )
}