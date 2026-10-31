import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildFuzzCases,
  classifyFuzzResponse,
  type FuzzCase,
  type FuzzVerdict
} from '../../../shared/fuzz'
import { buildVarMap, interpolate } from '../../../shared/variables'
import { executeRequest } from '../lib/runRequest'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { useRequestStore } from '../store/useRequestStore'
import { Modal } from './Modal'

interface Row {
  fuzz: FuzzCase
  verdict: FuzzVerdict
  status: number | null
  timeMs: number
  detail: string
}

const VERDICT_UI: Record<FuzzVerdict, { text: string; cls: string }> = {
  rechazada: { text: '✓ Rechazada', cls: 'text-emerald-400' },
  aceptada: { text: '✕ Aceptó datos inválidos', cls: 'text-red-400' },
  fallo: { text: '✕ Error del servidor', cls: 'text-red-400' },
  dudosa: { text: '? No concluyente', cls: 'text-amber-400' }
}

const Stat = ({
  name,
  value,
  cls
}: {
  name: string
  value: number
  cls: string
}): React.JSX.Element => (
  <div className="rounded-md border border-zinc-800 bg-zinc-950 p-2">
    <p className="text-[11px] text-zinc-500">{name}</p>
    <p className={`text-sm font-semibold ${cls}`}>{value}</p>
  </div>
)

interface Props {
  onClose: () => void
}

export function FuzzModal({ onClose }: Props): React.JSX.Element {
  const method = useRequestStore((s) => s.method)
  const url = useRequestStore((s) => s.url)
  const body = useRequestStore((s) => s.body)
  const requestSchema = useRequestStore((s) => s.requestSchema)

  const [rows, setRows] = useState<Row[]>([])
  const [running, setRunning] = useState(false)
  const [onlyIssues, setOnlyIssues] = useState(false)
  const stopRef = useRef(false)

  useEffect(() => {
    return () => {
      stopRef.current = true
    }
  }, [])

  const plan = useMemo(() => {
    const env = useEnvironmentStore.getState().getActive()
    return buildFuzzCases({
      schema: requestSchema,
      method,
      baseBody: interpolate(body, buildVarMap(env)).text
    })
  }, [requestSchema, method, body])

  const start = async (): Promise<void> => {
    const s = useRequestStore.getState()
    const env = useEnvironmentStore.getState().getActive()
    const hasContentType = s.headers.some(
      (h) => h.enabled && h.key.trim().toLowerCase() === 'content-type'
    )
    const headers = hasContentType
      ? s.headers
      : [
          ...s.headers,
          { id: 'fuzz-content-type', key: 'Content-Type', value: 'application/json', enabled: true }
        ]
    const draft = { method: s.method, url: s.url, headers, auth: s.auth }

    stopRef.current = false
    setRows([])
    setRunning(true)
    const acc: Row[] = []

    for (const c of plan.cases) {
      if (stopRef.current) break
      const { response } = await executeRequest({ ...draft, body: c.body }, env, {
        path: s.currentFile
      })
      const status = response.ok ? response.status : null
      acc.push({
        fuzz: c,
        verdict: classifyFuzzResponse(status),
        status,
        timeMs: response.timeMs,
        detail: response.ok ? response.body.slice(0, 300) : response.error
      })
      setRows([...acc])
    }
    setRunning(false)
  }

  const count = (v: FuzzVerdict): number => rows.filter((r) => r.verdict === v).length
  const visible = onlyIssues
    ? rows.filter((r) => r.verdict === 'aceptada' || r.verdict === 'fallo')
    : rows

  return (
    <Modal title="Fuzzing desde el schema" onClose={onClose} wide>
      <p className="mb-3 truncate text-xs text-zinc-400">
        <span className="font-bold text-zinc-200">{method}</span> {url || '(sin URL)'}
      </p>

      {plan.error ? (
        <p className="text-xs text-amber-400">{plan.error}</p>
      ) : (
        <p className="text-xs text-zinc-400">
          Se enviarán <b className="text-zinc-200">{plan.cases.length}</b> bodies inválidos
          generados a partir del schema. Una API correcta debería rechazarlos todos con un 4xx.
        </p>
      )}

      <p className="mt-2 text-[11px] text-amber-400">
        Cada caso es una petición real. Si la API acepta uno, puede crear o modificar datos: no lo
        uses contra producción.
      </p>

      {rows.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-4 gap-2">
            <Stat name="Rechazadas (bien)" value={count('rechazada')} cls="text-emerald-400" />
            <Stat name="Aceptó inválidos" value={count('aceptada')} cls="text-red-400" />
            <Stat name="Errores 5xx" value={count('fallo')} cls="text-red-400" />
            <Stat name="No concluyentes" value={count('dudosa')} cls="text-amber-400" />
          </div>

          <label className="flex items-center gap-2 text-[11px] text-zinc-400">
            <input
              type="checkbox"
              checked={onlyIssues}
              onChange={(e) => setOnlyIssues(e.target.checked)}
            />
            Mostrar solo problemas
          </label>

          <div className="max-h-72 overflow-y-auto rounded-md border border-zinc-800">
            {visible.map((r) => (
              <div
                key={r.fuzz.id}
                title={`Body enviado:\n${r.fuzz.body.slice(0, 300)}\n\nRespuesta:\n${r.detail}`}
                className="flex items-center gap-3 border-b border-zinc-800 px-2 py-1.5 text-xs last:border-b-0"
              >
                <span className={`w-44 shrink-0 ${VERDICT_UI[r.verdict].cls}`}>
                  {VERDICT_UI[r.verdict].text}
                </span>
                <span className="w-10 shrink-0 text-zinc-300">{r.status ?? '—'}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-300">
                  {r.fuzz.title} <span className="font-mono text-zinc-500">{r.fuzz.path}</span>
                </span>
                <span className="shrink-0 text-zinc-500">{r.timeMs} ms</span>
              </div>
            ))}
            {visible.length === 0 && (
              <p className="p-3 text-xs text-zinc-500">Sin problemas detectados hasta ahora.</p>
            )}
          </div>
          <p className="text-[11px] text-zinc-500">
            Pasa el cursor sobre una fila para ver el body enviado y la respuesta.
          </p>
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
            disabled={plan.cases.length === 0}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Iniciar
          </button>
        )}
      </div>
    </Modal>
  )
}
