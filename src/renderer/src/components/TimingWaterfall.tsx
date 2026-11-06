import { timingBreakdown, type TimingPhase } from '../../../shared/timingBreakdown'
import type { ConnectionTiming } from '../../../shared/types'

const COLORS: Record<TimingPhase['id'], string> = {
  dns: 'bg-violet-500',
  connect: 'bg-amber-500',
  wait: 'bg-blue-500',
  download: 'bg-emerald-500'
}

interface Props {
  timeMs: number
  ttfbMs?: number
  connection?: ConnectionTiming
}

export function TimingWaterfall({ timeMs, ttfbMs, connection }: Props): React.JSX.Element | null {
  const phases = timingBreakdown(timeMs, ttfbMs, connection)
  if (phases.length === 0) return null

  const total = phases.reduce((sum, p) => sum + p.ms, 0) || 1

  // Posición de cada barra: lo que suman las fases anteriores (sin reasignar variables)
  const bars = phases.map((p, i) => {
    const before = phases.slice(0, i).reduce((sum, q) => sum + q.ms, 0)
    const left = (before / total) * 100
    const width = Math.min(Math.max((p.ms / total) * 100, 1.5), 100 - left)
    return { phase: p, left, width }
  })

  return (
    <div className="selectable mb-5 text-xs">
      <p className="mb-2 font-semibold text-zinc-300">Tiempos ({timeMs} ms)</p>

      <ul className="space-y-1.5">
        {bars.map(({ phase, left, width }) => (
          <li key={phase.id} className="flex items-center gap-3">
            <span className="w-36 shrink-0 text-zinc-400">{phase.label}</span>
            <span className="relative h-3 flex-1 rounded bg-zinc-800">
              <span
                className={`absolute top-0 h-3 rounded ${COLORS[phase.id]}`}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            </span>
            <span className="w-16 shrink-0 text-right font-mono text-zinc-300">{phase.ms} ms</span>
          </li>
        ))}
      </ul>

      {connection?.reused && (
        <p className="mt-2 text-zinc-500">
          Se reutilizó una conexión abierta, por eso no hay DNS ni handshake.
        </p>
      )}
    </div>
  )
}
