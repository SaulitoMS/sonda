import type { TimeTrend } from '../../../shared/responseTrend'

const W = 72
const H = 18

export function TimeTrendChart({ trend }: { trend: TimeTrend }): React.JSX.Element {
  const span = Math.max(1, trend.max - trend.min)
  const points = trend.times.map((t, i) => {
    const x = (i / (trend.times.length - 1)) * W
    const y = H - 2 - ((t - trend.min) / span) * (H - 4)
    return [x, y] as const
  })
  const [lastX, lastY] = points[points.length - 1]
  const delta = trend.lastVsPrevious
  const notable = delta !== null && Math.abs(delta) >= 0.25

  return (
    <span
      className="flex items-center gap-1.5"
      title={`Últimos ${trend.times.length} envíos · mín ${trend.min} ms · prom ${trend.avg} ms · máx ${trend.max} ms`}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="text-zinc-500">
        <polyline
          points={points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={lastX} cy={lastY} r={2} className="fill-sky-400" />
      </svg>
      {notable && delta !== null && (
        <span
          className={`font-medium ${delta > 0 ? 'text-red-400' : 'text-emerald-400'}`}
          title="Frente al promedio de los envíos anteriores"
        >
          {delta > 0 ? '+' : ''}
          {Math.round(delta * 100)} %
        </span>
      )}
    </span>
  )
}
