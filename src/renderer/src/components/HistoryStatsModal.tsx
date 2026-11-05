import { useMemo, useState } from 'react'
import { computeStats, type StatsSort } from '../../../shared/historyStats'
import { METHOD_COLORS } from '../lib/methodColors'
import { useHistoryStore } from '../store/useHistoryStore'
import { Modal } from './Modal'

const SORTS: { id: StatsSort; label: string }[] = [
  { id: 'p95', label: 'Más lentos (p95)' },
  { id: 'errors', label: 'Más errores' },
  { id: 'count', label: 'Más usados' }
]

const ms = (v: number): string => (v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${v} ms`)

interface Props {
  onClose: () => void
}

export function HistoryStatsModal({ onClose }: Props): React.JSX.Element {
  const entries = useHistoryStore((s) => s.entries)
  const [sort, setSort] = useState<StatsSort>('p95')
  const stats = useMemo(() => computeStats(entries, sort), [entries, sort])

  return (
    <Modal title="Salud de la API" onClose={onClose} wide>
      <div className="flex flex-col gap-3 overflow-auto p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">
            Calculado con las {entries.length} peticiones del historial.
          </p>
          <div className="flex gap-1">
            {SORTS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSort(s.id)}
                className={`rounded px-2.5 py-1 text-xs ${
                  sort === s.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {stats.length === 0 ? (
          <p className="py-8 text-center text-xs text-zinc-500">
            Aún no hay historial. Envía algunas peticiones y vuelve.
          </p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] text-zinc-500">
              <tr>
                <th className="py-1.5 pr-2 font-medium">Endpoint</th>
                <th className="px-2 font-medium">Envíos</th>
                <th className="px-2 font-medium">Errores</th>
                <th className="px-2 font-medium">Prom.</th>
                <th className="px-2 font-medium">p50</th>
                <th className="px-2 font-medium">p95</th>
                <th className="pl-2 font-medium">Máx.</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.key} className="border-t border-zinc-800 text-zinc-300">
                  <td className="py-1.5 pr-2">
                    <span className={`mr-2 font-mono text-[10px] ${METHOD_COLORS[s.method] ?? ''}`}>
                      {s.method}
                    </span>
                    <span className="font-mono">{s.path}</span>
                  </td>
                  <td className="px-2">{s.count}</td>
                  <td
                    className={`px-2 ${
                      s.errorRate >= 0.5
                        ? 'text-red-400'
                        : s.errorRate > 0
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                    }`}
                  >
                    {s.errors} ({Math.round(s.errorRate * 100)}%)
                  </td>
                  <td className="px-2">{ms(s.avgMs)}</td>
                  <td className="px-2">{ms(s.p50Ms)}</td>
                  <td className={`px-2 ${s.p95Ms >= 1000 ? 'text-amber-400' : ''}`}>
                    {ms(s.p95Ms)}
                  </td>
                  <td className="pl-2">{ms(s.maxMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  )
}
