import { useEffect, useRef, useState } from 'react'
import {
  summarizeBenchmark,
  type BenchmarkRun,
  type BenchmarkSummary
} from '../../../shared/benchmark'
import { executeRequest } from '../lib/runRequest'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { useRequestStore } from '../store/useRequestStore'
import { Modal } from './Modal'

const MAX_RUNS = 200
const MAX_CONCURRENCY = 10

const field =
  'w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500'
const label = 'mb-1 block text-xs font-medium text-zinc-400'

const clamp = (value: number, max: number): number =>
  Math.min(max, Math.max(1, Math.round(Number.isFinite(value) ? value : 1)))

const Stat = ({ name, value }: { name: string; value: string }): React.JSX.Element => (
  <div className="rounded-md border border-zinc-800 bg-zinc-950 p-2">
    <p className="text-[11px] text-zinc-500">{name}</p>
    <p className="text-sm font-semibold text-zinc-100">{value}</p>
  </div>
)

interface Props {
  onClose: () => void
}

export function BenchmarkModal({ onClose }: Props): React.JSX.Element {
  const method = useRequestStore((s) => s.method)
  const url = useRequestStore((s) => s.url)

  const [count, setCount] = useState(20)
  const [concurrency, setConcurrency] = useState(2)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<BenchmarkSummary | null>(null)
  const [error, setError] = useState('')
  const stopRef = useRef(false)

  // Si se cierra el modal a media prueba, se detiene
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

    const runsTotal = clamp(count, MAX_RUNS)
    const workers = Math.min(clamp(concurrency, MAX_CONCURRENCY), runsTotal)
    const draft = {
      method: s.method,
      url: s.url,
      headers: s.headers,
      body: s.body,
      bodyForm: s.bodyForm,
      auth: s.auth
    }
    const env = useEnvironmentStore.getState().getActive()

    stopRef.current = false
    setError('')
    setSummary(null)
    setDone(0)
    setTotal(runsTotal)
    setRunning(true)

    const runs: BenchmarkRun[] = []
    let next = 0
    const startedAt = performance.now()

    const worker = async (): Promise<void> => {
      while (!stopRef.current && next < runsTotal) {
        next++
        const { response } = await executeRequest(draft, env, { path: s.currentFile })
        runs.push(
          response.ok
            ? { status: response.status, timeMs: response.timeMs }
            : { status: null, timeMs: response.timeMs, error: response.error }
        )
        setDone(runs.length)
      }
    }

    await Promise.all(Array.from({ length: workers }, worker))

    if (runs.length > 0) {
      setSummary(summarizeBenchmark(runs, Math.round(performance.now() - startedAt)))
    }
    setRunning(false)
  }

  const t = summary?.timing

  return (
    <Modal title="Prueba de rendimiento" onClose={onClose} wide>
      <p className="mb-3 truncate text-xs text-zinc-400">
        <span className="font-bold text-zinc-200">{method}</span> {url || '(sin URL)'}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Número de envíos (máx. {MAX_RUNS})</label>
          <input
            type="number"
            min={1}
            max={MAX_RUNS}
            value={count}
            disabled={running}
            onChange={(e) => setCount(Number(e.target.value))}
            className={field}
          />
        </div>
        <div>
          <label className={label}>Concurrencia (máx. {MAX_CONCURRENCY})</label>
          <input
            type="number"
            min={1}
            max={MAX_CONCURRENCY}
            value={concurrency}
            disabled={running}
            onChange={(e) => setConcurrency(Number(e.target.value))}
            className={field}
          />
        </div>
      </div>

      <p className="mt-2 text-[11px] text-amber-400">
        Cada envío es una petición real. Si es POST, PUT o DELETE se ejecutará N veces: no la
        uses contra producción.
      </p>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {running && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded bg-zinc-800">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${total ? (done / total) * 100 : 0}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            {done} / {total}
          </p>
        </div>
      )}

      {summary && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-4 gap-2">
            <Stat name="Éxito" value={`${summary.successRate}%`} />
            <Stat name="Enviadas" value={`${summary.total}`} />
            <Stat name="Fallidas" value={`${summary.failed}`} />
            <Stat name="Peticiones/s" value={`${summary.requestsPerSecond}`} />
          </div>

          {t ? (
            <div className="grid grid-cols-5 gap-2">
              <Stat name="Mínimo" value={`${t.min} ms`} />
              <Stat name="Promedio" value={`${t.avg} ms`} />
              <Stat name="p50" value={`${t.p50} ms`} />
              <Stat name="p95" value={`${t.p95} ms`} />
              <Stat name="Máximo" value={`${t.max} ms`} />
            </div>
          ) : (
            <p className="text-xs text-zinc-500">Ninguna petición obtuvo respuesta.</p>
          )}

          <div className="flex flex-wrap gap-2 text-[11px]">
            {Object.entries(summary.statusCounts).map(([status, n]) => (
              <span key={status} className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300">
                {status}: {n}
              </span>
            ))}
          </div>

          {summary.firstError && (
            <p className="text-xs text-red-400">Primer error: {summary.firstError}</p>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Cerrar
        </button>
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
          <button
            onClick={() => void start()}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
          >
            Iniciar
          </button>
        )}
      </div>
    </Modal>
  )
}