import { useMemo, useState } from 'react'
import { dayLabel, filterHistory, latencySeries, type HistoryEntry } from '../../../shared/history'
import { compareEntries } from '../../../shared/historyCompare'
import { DEFAULT_IGNORE } from '../../../shared/snapshot'
import { applyHistory } from '../lib/applyHistory'
import { METHOD_COLORS } from '../lib/methodColors'
import { useHistoryStore } from '../store/useHistoryStore'
import { Modal } from './Modal'
import { buildHar } from '../../../shared/harExport'
import { downloadText } from '../lib/download'

const statusClass = (e: HistoryEntry): string => {
  if (!e.response.ok) return 'bg-red-500/20 text-red-400'
  const s = e.response.status
  if (s >= 500) return 'bg-red-500/20 text-red-400'
  if (s >= 400) return 'bg-amber-500/20 text-amber-400'
  if (s >= 300) return 'bg-sky-500/20 text-sky-400'
  return 'bg-emerald-500/20 text-emerald-400'
}

const statusText = (e: HistoryEntry): string =>
  e.response.ok ? String(e.response.status) : 'Error'

const hour = (at: number): string =>
  new Date(at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })

/** Mini gráfica de los últimos tiempos de una misma petición. Con menos de 3 puntos no se dibuja */
function Sparkline({ values }: { values: number[] }): React.JSX.Element {
  if (values.length < 3) return <span className="w-16 shrink-0" />
  const w = 64
  const h = 16
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w
      const y = h - 2 - ((v - min) / span) * (h - 4)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={w} height={h} className="shrink-0 text-sky-400">
      <title>{`Últimos ${values.length} envíos: de ${min} a ${max} ms`}</title>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface Props {
  onClose: () => void
  onRestored: () => void
}

const showValue = (v: unknown): string => {
  const text = JSON.stringify(v) ?? 'undefined'
  return text.length > 80 ? `${text.slice(0, 77)}…` : text
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** Diferencias entre dos envíos elegidos del historial */
function ComparisonView({ a, b }: { a: HistoryEntry; b: HistoryEntry }): React.JSX.Element {
  const [ignoreVolatile, setIgnoreVolatile] = useState(true)
  const result = useMemo(
    () => compareEntries(a, b, ignoreVolatile ? DEFAULT_IGNORE : []),
    [a, b, ignoreVolatile]
  )

  return (
    <div className="selectable mt-3 space-y-2 rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-xs">
      <label className="flex items-center gap-2 text-zinc-400">
        <input
          type="checkbox"
          checked={ignoreVolatile}
          onChange={(e) => setIgnoreVolatile(e.target.checked)}
        />
        Ignorar campos que cambian solos ({DEFAULT_IGNORE.join(', ')})
      </label>

      {result.state === 'invalid' ? (
        <p className="text-amber-400">{result.reason}</p>
      ) : (
        <>
          <div className="space-y-0.5 font-mono text-zinc-500">
            {[result.before, result.after].map((e, i) => (
              <p key={e.id} className="truncate" title={e.url}>
                {i === 0 ? 'Antes  ' : 'Después'} · {e.method} {e.url} ·{' '}
                {e.response.ok ? e.response.status : 'Error'} · {hour(e.at)}
              </p>
            ))}
          </div>

          <p
            className={`font-semibold ${result.identical ? 'text-emerald-400' : 'text-amber-400'}`}
          >
            {result.changes.length > 0
              ? plural(result.changes.length, 'cambio', 'cambios')
              : result.identical
                ? 'Las dos respuestas son idénticas'
                : 'Sin cambios en el body, pero cambió el status'}
          </p>

          {result.statusBefore !== result.statusAfter && (
            <p className="font-mono text-amber-300">
              Status: {result.statusBefore} → {result.statusAfter}
            </p>
          )}

          <ul className="max-h-56 space-y-1.5 overflow-auto font-mono">
            {result.changes.map((c, i) => (
              <li key={i} className="flex flex-wrap gap-2">
                <span
                  className={
                    c.kind === 'added'
                      ? 'text-emerald-400'
                      : c.kind === 'removed'
                        ? 'text-red-400'
                        : 'text-amber-400'
                  }
                >
                  {c.kind === 'added' ? '+' : c.kind === 'removed' ? '−' : '~'}
                </span>
                <span className="font-semibold text-blue-300">{c.path}</span>
                {c.kind === 'changed' && (
                  <span className="text-zinc-300">
                    {showValue(c.before)} → {showValue(c.after)}
                  </span>
                )}
                {c.kind === 'added' && <span className="text-zinc-300">{showValue(c.after)}</span>}
                {c.kind === 'removed' && (
                  <span className="text-zinc-500 line-through">{showValue(c.before)}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export function HistoryModal({ onClose, onRestored }: Props): React.JSX.Element {
  const { entries, remove, clear } = useHistoryStore()
  const [query, setQuery] = useState('')
  const [compareMode, setCompareMode] = useState(false)
  // Ids de los envíos elegidos para comparar (máximo 2; al elegir un tercero sale el más viejo)
  const [picked, setPicked] = useState<string[]>([])

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

  const pickedEntries = picked
    .map((id) => entries.find((e) => e.id === id))
    .filter((e): e is HistoryEntry => e !== undefined)

  const restore = (e: HistoryEntry): void => {
    applyHistory(e)
    onRestored()
    onClose()
  }

  const togglePick = (id: string): void =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2)))

  const toggleCompare = (): void => {
    setCompareMode((on) => !on)
    setPicked([])
  }

  const clearAll = (): void => {
    if (confirm('¿Borrar todo el historial?')) clear()
  }

  const exportHar = (): void => {
    const d = new Date()
    const p = (n: number): string => String(n).padStart(2, '0')
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
    downloadText(
      `sonda-historial-${stamp}.har`,
      buildHar(filterHistory(entries, query)),
      'application/json'
    )
  }

  return (
    <Modal title="Historial" onClose={onClose} wide>
      <div className="mb-3 flex items-center gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por método, URL o status…"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs outline-none placeholder:text-zinc-500 focus:border-blue-500"
        />
        <button
          onClick={toggleCompare}
          disabled={entries.length < 2}
          title="Elige dos envíos para ver en qué se diferencian sus respuestas"
          className={`shrink-0 rounded-md px-3 py-2 text-xs disabled:opacity-40 ${
            compareMode
              ? 'bg-blue-600 font-semibold text-white'
              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
          }`}
        >
          Comparar
        </button>
        <button
          onClick={exportHar}
          disabled={groups.length === 0}
          title="Exportar el historial (o lo que filtre la búsqueda) como HAR"
          className="shrink-0 rounded-md bg-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
        >
          Exportar HAR
        </button>
      </div>

      {compareMode && (
        <p className="mb-2 text-[11px] text-zinc-500">
          Elige dos envíos de la lista ({picked.length}/2).
        </p>
      )}

      <div className={`${compareMode ? 'max-h-[30vh]' : 'max-h-[55vh]'} min-h-32 overflow-auto`}>
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
                onClick={() => (compareMode ? togglePick(e.id) : restore(e))}
                className={`group flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-xs ${
                  picked.includes(e.id) ? 'bg-blue-500/15' : 'hover:bg-zinc-800/70'
                }`}
              >
                {compareMode && (
                  <span className="w-3 shrink-0 text-blue-400">
                    {picked.includes(e.id) ? '●' : '○'}
                  </span>
                )}
                <span className={`w-12 shrink-0 font-bold ${METHOD_COLORS[e.method]}`}>
                  {e.method}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-zinc-300" title={e.url}>
                  {e.url}
                </span>
                <Sparkline values={latencySeries(entries, e)} />
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${statusClass(e)}`}>
                  {statusText(e)}
                </span>
                <span className="w-14 shrink-0 text-right text-zinc-500">
                  {e.response.timeMs} ms
                </span>
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

      {compareMode && pickedEntries.length === 2 && (
        <ComparisonView a={pickedEntries[0]} b={pickedEntries[1]} />
      )}

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={clearAll}
          disabled={entries.length === 0}
          className="rounded-md px-3 py-2 text-xs text-zinc-500 hover:text-red-400 disabled:opacity-40"
        >
          Borrar historial
        </button>
        <button onClick={onClose} className="btn btn-ghost">
          Cerrar
        </button>
      </div>
    </Modal>
  )
}
