import { useEffect, useRef, useState } from 'react'
import {
  KIND_LABELS,
  OP_LABELS,
  changeKind,
  emptyAssertion,
  evaluateAssertions,
  needsExpected,
  needsTarget,
  opsForKind
} from '../../../shared/assertions'
import {
  normalizePoll,
  pollEndLabel,
  POLL_MAX_ATTEMPTS,
  POLL_MAX_INTERVAL_MS,
  POLL_MIN_INTERVAL_MS,
  type PollAttempt,
  type PollEnd
} from '../../../shared/poll'
import type { Assertion, AssertionKind, AssertionOp } from '../../../shared/types'
import { confirmBulkMessage } from '../../../shared/writeGuard'
import { executeRequest } from '../lib/runRequest'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { useRequestStore } from '../store/useRequestStore'
import { Modal } from './Modal'

const field =
  'w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500 disabled:opacity-50'
const label = 'mb-1 block text-xs font-medium text-zinc-400'

const KINDS = Object.keys(KIND_LABELS) as AssertionKind[]
const BODY_PREVIEW_CHARS = 2000

/** Espera `ms` pero se corta enseguida si el usuario detiene el polling */
async function sleep(ms: number, stop: { current: boolean }): Promise<void> {
  const end = Date.now() + ms
  while (!stop.current && Date.now() < end) {
    await new Promise((r) => setTimeout(r, Math.min(100, Math.max(0, end - Date.now()))))
  }
}

export function PollModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const method = useRequestStore((s) => s.method)
  const url = useRequestStore((s) => s.url)

  const [condition, setCondition] = useState<Assertion>(() => ({
    ...emptyAssertion('body'),
    target: 'status',
    op: 'eq',
    expected: 'done'
  }))
  const [attempts, setAttempts] = useState(10)
  const [intervalMs, setIntervalMs] = useState(2000)
  const [running, setRunning] = useState(false)
  const [rows, setRows] = useState<PollAttempt[]>([])
  const [end, setEnd] = useState<PollEnd | null>(null)
  const [lastBody, setLastBody] = useState('')
  const [error, setError] = useState('')
  const stopRef = useRef(false)

  // Si se cierra el modal a media espera, se detiene
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
    if (needsTarget(condition.kind) && !condition.target.trim()) {
      setError('Indica el header o la ruta del JSON que se va a revisar.')
      return
    }

    const opts = normalizePoll({ attempts, intervalMs })
    const draft = {
      method: s.method,
      url: s.url,
      headers: s.headers,
      body: s.body,
      bodyForm: s.bodyForm,
      auth: s.auth
    }
    const env = useEnvironmentStore.getState().getActive()

    const guard = confirmBulkMessage(env, s.method, s.url, opts.attempts, 'El polling')
    if (guard && !confirm(guard)) return

    stopRef.current = false
    setError('')
    setRows([])
    setEnd(null)
    setLastBody('')
    setRunning(true)

    let finished: PollEnd = 'exhausted'
    let made = 0

    for (let n = 1; n <= opts.attempts; n++) {
      if (stopRef.current) {
        finished = 'stopped'
        break
      }
      made = n
      const { response } = await executeRequest(draft, env, { path: s.currentFile })

      let met = false
      let detail = ''
      if (response.ok) {
        const [result] = evaluateAssertions([condition], response)
        met = result?.passed ?? false
        detail = result?.actual ?? result?.message ?? ''
        setLastBody(response.body.slice(0, BODY_PREVIEW_CHARS))
      } else {
        detail = response.error
      }
      setRows((prev) => [
        ...prev,
        { n, status: response.ok ? response.status : null, timeMs: response.timeMs, met, detail }
      ])

      if (met) {
        finished = 'met'
        break
      }
      if (n < opts.attempts) await sleep(opts.intervalMs, stopRef)
    }

    setEnd(stopRef.current && finished === 'exhausted' ? 'stopped' : finished)
    setRunning(false)
    // `made` se guarda en las filas; se usa para el texto final
    setAttemptsMade(made)
  }

  const [attemptsMade, setAttemptsMade] = useState(0)

  const set = (patch: Partial<Assertion>): void => setCondition((c) => ({ ...c, ...patch }))

  return (
    <Modal title="Polling" onClose={onClose} wide>
      <p className="mb-3 truncate text-xs text-zinc-400">
        <span className="font-bold text-zinc-200">{method}</span> {url || '(sin URL)'}
      </p>
      <p className="mb-3 text-xs text-zinc-500">
        Repite la petición hasta que se cumpla la condición. Útil para esperar un job asíncrono.
      </p>

      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className={label}>Revisar</label>
          <select
            value={condition.kind}
            disabled={running}
            onChange={(e) => setCondition((c) => changeKind(c, e.target.value as AssertionKind))}
            className={field}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>
            {condition.kind === 'header' ? 'Header' : 'Ruta (ej: data.status)'}
          </label>
          <input
            value={condition.target}
            disabled={running || !needsTarget(condition.kind)}
            onChange={(e) => set({ target: e.target.value })}
            spellCheck={false}
            className={`${field} font-mono`}
          />
        </div>
        <div>
          <label className={label}>Condición</label>
          <select
            value={condition.op}
            disabled={running}
            onChange={(e) => set({ op: e.target.value as AssertionOp })}
            className={field}
          >
            {opsForKind(condition.kind).map((op) => (
              <option key={op} value={op}>
                {OP_LABELS[op]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Valor</label>
          <input
            value={condition.expected}
            disabled={running || !needsExpected(condition.op)}
            onChange={(e) => set({ expected: e.target.value })}
            spellCheck={false}
            className={`${field} font-mono`}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Intentos máximos (hasta {POLL_MAX_ATTEMPTS})</label>
          <input
            type="number"
            min={1}
            max={POLL_MAX_ATTEMPTS}
            value={attempts}
            disabled={running}
            onChange={(e) => setAttempts(Number(e.target.value))}
            className={field}
          />
        </div>
        <div>
          <label className={label}>
            Espera entre intentos en ms ({POLL_MIN_INTERVAL_MS} a {POLL_MAX_INTERVAL_MS})
          </label>
          <input
            type="number"
            min={POLL_MIN_INTERVAL_MS}
            max={POLL_MAX_INTERVAL_MS}
            step={100}
            value={intervalMs}
            disabled={running}
            onChange={(e) => setIntervalMs(Number(e.target.value))}
            className={field}
          />
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {end && (
        <p
          className={`mt-3 text-xs font-semibold ${end === 'met' ? 'text-emerald-400' : 'text-amber-400'}`}
        >
          {pollEndLabel(end, attemptsMade)}
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
                <th className="px-3 py-2 font-medium">Valor encontrado</th>
                <th className="px-3 py-2 font-medium">Condición</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.n} className="border-t border-zinc-800">
                  <td className="px-3 py-1.5 text-zinc-400">{r.n}</td>
                  <td className="px-3 py-1.5 text-zinc-200">{r.status ?? '—'}</td>
                  <td className="px-3 py-1.5 text-zinc-400">{r.timeMs} ms</td>
                  <td
                    className="max-w-56 truncate px-3 py-1.5 font-mono text-zinc-400"
                    title={r.detail}
                  >
                    {r.detail}
                  </td>
                  <td className={`px-3 py-1.5 ${r.met ? 'text-emerald-400' : 'text-zinc-500'}`}>
                    {r.met ? 'Cumplida' : 'Pendiente'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {lastBody && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-zinc-400">Última respuesta</summary>
          <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-2 font-mono text-[11px] text-zinc-300">
            {lastBody}
          </pre>
        </details>
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
