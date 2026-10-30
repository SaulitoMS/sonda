import { useEffect, useMemo, useRef, useState } from 'react'
import { classifyResult, type RunStatus } from '../../../shared/classify'
import { buildReport, reportFileName, reportToHtml, reportToJson } from '../../../shared/report'
import { useTabsStore } from '../store/useTabsStore'
import type {
  AssertionResult,
  HttpMethod,
  RequestItem,
  SavedRequest,
  SchemaValidation,
  SendRequestResult
} from '../../../shared/types'
import { downloadText } from '../lib/download'
import { METHOD_COLORS } from '../lib/methodColors'
import { persistExtractions } from '../lib/persistExtractions'
import { executeRequest } from '../lib/runRequest'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { useRequestStore } from '../store/useRequestStore'
import { Modal } from './Modal'

const SAFE_METHODS: HttpMethod[] = ['GET', 'HEAD', 'OPTIONS']

interface Entry {
  item: RequestItem
  group: string
}

interface Row {
  entry: Entry
  status: RunStatus
  detail: string
  httpStatus?: number
  timeMs: number
  saved?: SavedRequest
  response?: SendRequestResult
  validation?: SchemaValidation | null
  assertionResults?: AssertionResult[]
  /** Cuántas veces se envió (solo se muestra si hubo reintentos) */
  attempts?: number
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Fallos que suelen ser pasajeros (red, timeout, 429 o 5xx): los únicos que vale la pena reintentar */
const isTransient = (response: SendRequestResult): boolean =>
  !response.ok || response.status === 429 || response.status >= 500

const clampInt = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min

const ICON: Record<RunStatus, { mark: string; color: string }> = {
  pass: { mark: '✓', color: 'text-emerald-400' },
  warn: { mark: '⚠', color: 'text-amber-400' },
  fail: { mark: '✗', color: 'text-red-400' }
}

interface Props {
  collectionId: string
  onClose: () => void
}

export function RunnerModal({ collectionId, onClose }: Props): React.JSX.Element {
  const collection = useCollectionsStore((s) => s.collections.find((c) => c.id === collectionId))

  const [includeWrites, setIncludeWrites] = useState(false)
  const [stopOnFail, setStopOnFail] = useState(false)
  const [retries, setRetries] = useState(0)
  const [delayMs, setDelayMs] = useState(0)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const [stoppedEarly, setStoppedEarly] = useState(false)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState<Row[]>([])
  const runId = useRef(0)
  // Petición en vuelo, para poder cancelarla al pulsar "Detener"
  const activeRequest = useRef<string | null>(null)
  // Entorno con el que se hizo la ejecución, para anotarlo en el reporte
  const runEnvName = useRef<string | null>(null)

  // Al cerrar el modal se cancela cualquier ejecución en curso
  useEffect(() => {
    const ref = runId
    return () => {
      ref.current++
    }
  }, [])

  const all = useMemo<Entry[]>(() => {
    if (!collection) return []
    return [
      ...collection.folders.flatMap((f) => f.requests.map((item) => ({ item, group: f.name }))),
      ...collection.requests.map((item) => ({ item, group: '' }))
    ]
  }, [collection])

  const planned = includeWrites ? all : all.filter((e) => SAFE_METHODS.includes(e.item.method))
  const writeCount = all.length - all.filter((e) => SAFE_METHODS.includes(e.item.method)).length

  /** Envía una petición de la cola y la valida (sin reintentos) */
  const runOne = async (entry: Entry): Promise<Row> => {
    // El entorno se lee en cada vuelta: una petición anterior pudo guardar variables (ej: token)
    const env = useEnvironmentStore.getState().getActive()
    try {
      const saved = await window.api.readRequest(entry.item.path)
      const requestId = crypto.randomUUID()
      activeRequest.current = requestId
      const { response, validation, requestValidation, assertionResults, extractions } =
        await executeRequest(saved, env, { requestId })
      activeRequest.current = null
      const persistWarnings = await persistExtractions(extractions)
      const problems = [
        ...extractions
          .filter((e) => !e.ok)
          .map((e) => `No se extrajo {{${e.variable || '?'}}}: ${e.message}`),
        ...persistWarnings
      ]
      const base = classifyResult(response, validation, assertionResults, requestValidation)
      const verdict =
        base.status === 'pass' && problems.length > 0
          ? { status: 'warn' as RunStatus, detail: problems[0] }
          : base
      return {
        entry,
        ...verdict,
        httpStatus: response.ok ? response.status : undefined,
        timeMs: response.timeMs,
        saved,
        response,
        validation,
        assertionResults
      }
    } catch (err) {
      activeRequest.current = null
      return {
        entry,
        status: 'fail',
        detail: err instanceof Error ? err.message : 'Error desconocido',
        timeMs: 0
      }
    }
  }

  const run = async (queue: Entry[] = planned): Promise<void> => {
    const myRun = ++runId.current
    runEnvName.current = useEnvironmentStore.getState().getActive()?.name ?? null
    setRows([])
    setFinished(false)
    setStoppedEarly(false)
    setTotal(queue.length)
    setRunning(true)

    for (const [index, entry] of queue.entries()) {
      if (runId.current !== myRun) return

      // Pausa opcional entre peticiones (útil con APIs que limitan por ritmo)
      if (index > 0 && delayMs > 0) {
        await sleep(delayMs)
        if (runId.current !== myRun) return
      }

      let row = await runOne(entry)

      // Reintenta solo fallos pasajeros; un 404 o una aserción fallida no mejoran por insistir
      let attempt = 1
      while (
        attempt <= retries &&
        row.status === 'fail' &&
        row.response &&
        isTransient(row.response)
      ) {
        if (runId.current !== myRun) return
        await sleep(Math.max(delayMs, 500))
        if (runId.current !== myRun) return
        row = await runOne(entry)
        attempt++
        row.attempts = attempt
      }

      if (runId.current !== myRun) return
      setRows((r) => [...r, row])

      if (stopOnFail && row.status === 'fail') {
        setStoppedEarly(true)
        break
      }
    }

    setRunning(false)
    setFinished(true)
  }

  const stop = (): void => {
    runId.current++
    if (activeRequest.current) void window.api.cancelRequest(activeRequest.current)
    setRunning(false)
    setFinished(true)
  }

  const openRow = (row: Row): void => {
    if (!row.saved) return
    useTabsStore.getState().openSaved(row.saved, row.entry.item.path)
    useRequestStore.setState({
      response: row.response ?? null,
      validation: row.validation ?? null,
      assertionResults: row.assertionResults ?? [],
      warnings: []
    })
    onClose()
  }

  const exportReport = (format: 'json' | 'html'): void => {
    const report = buildReport({
      collection: collection?.name ?? '',
      environment: runEnvName.current,
      rows: rows.map((r) => ({
        group: r.entry.group,
        name: r.entry.item.name,
        method: r.entry.item.method,
        path: r.entry.item.path,
        status: r.status,
        detail: r.detail,
        httpStatus: r.httpStatus,
        timeMs: r.timeMs,
        assertionResults: r.assertionResults,
        validation: r.validation
      }))
    })
    if (format === 'json') {
      downloadText(reportFileName(report, 'json'), reportToJson(report), 'application/json')
    } else {
      downloadText(reportFileName(report, 'html'), reportToHtml(report), 'text/html')
    }
  }

  const count = (s: RunStatus): number => rows.filter((r) => r.status === s).length
  const started = running || finished

  return (
    <Modal title={`Ejecutar colección: ${collection?.name ?? ''}`} onClose={onClose} wide>
      {!started && (
        <div className="space-y-3 text-xs text-zinc-300">
          <p>
            Se enviarán <b>{planned.length}</b> de {all.length} peticiones usando el entorno activo
            y se validará cada respuesta contra su schema y sus aserciones.
          </p>
          {writeCount > 0 && (
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-amber-200">
              <input
                type="checkbox"
                checked={includeWrites}
                onChange={(e) => setIncludeWrites(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Incluir las {writeCount} peticiones que modifican datos (POST, PUT, PATCH, DELETE).
                Pueden crear, cambiar o borrar datos reales en el servidor.
              </span>
            </label>
          )}
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={stopOnFail}
              onChange={(e) => setStopOnFail(e.target.checked)}
            />
            <span>Detener al primer fallo</span>
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Reintentos ante error de red, 429 o 5xx (0 a 3)</span>
            <input
              type="number"
              min={0}
              max={3}
              value={retries}
              onChange={(e) => setRetries(clampInt(Number(e.target.value), 0, 3))}
              className="w-20 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-right"
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Pausa entre peticiones (ms, 0 a 10000)</span>
            <input
              type="number"
              min={0}
              max={10000}
              step={100}
              value={delayMs}
              onChange={(e) => setDelayMs(clampInt(Number(e.target.value), 0, 10000))}
              className="w-20 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-right"
            />
          </label>
        </div>
      )}

      {started && (
        <>
          <div className="mb-3 flex items-center gap-4 text-xs">
            <span className="text-emerald-400">✓ {count('pass')}</span>
            <span className="text-amber-400">⚠ {count('warn')}</span>
            <span className="text-red-400">✗ {count('fail')}</span>
            <span className="text-zinc-500">
              {rows.length}/{total}
            </span>
          </div>

          <div className="max-h-[50vh] overflow-auto rounded-md border border-zinc-800">
            {rows.map((row) => (
              <div
                key={row.entry.item.path}
                onClick={() => openRow(row)}
                className="flex cursor-pointer items-start gap-3 border-b border-zinc-800 px-3 py-1.5 text-xs last:border-b-0 hover:bg-zinc-800/60"
                title="Abrir en el editor"
              >
                <span className={`w-4 shrink-0 font-bold ${ICON[row.status].color}`}>
                  {ICON[row.status].mark}
                </span>
                <span className={`w-12 shrink-0 font-bold ${METHOD_COLORS[row.entry.item.method]}`}>
                  {row.entry.item.method}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-zinc-200">
                    {row.entry.group && <span className="text-zinc-500">{row.entry.group} / </span>}
                    {row.entry.item.name}
                    {row.attempts && row.attempts > 1 && (
                      <span className="ml-2 text-[11px] text-amber-400">
                        ({row.attempts} intentos)
                      </span>
                    )}
                  </span>
                  {row.detail && (
                    <span className="block truncate text-[11px] text-zinc-500" title={row.detail}>
                      {row.detail}
                    </span>
                  )}
                </span>
                <span className="w-10 shrink-0 text-right text-zinc-400">
                  {row.httpStatus ?? '—'}
                </span>
                <span className="w-16 shrink-0 text-right text-zinc-500">{row.timeMs} ms</span>
              </div>
            ))}
            {running && rows.length < total && (
              <p className="px-3 py-2 text-xs text-zinc-500">Ejecutando…</p>
            )}
          </div>
          {stoppedEarly && (
            <p className="mt-2 text-xs text-amber-300">
              Ejecución detenida en el primer fallo ({total - rows.length}{' '}
              {total - rows.length === 1 ? 'petición sin ejecutar' : 'peticiones sin ejecutar'}).
            </p>
          )}
        </>
      )}

      <div className="mt-4 flex justify-end gap-2">
        {rows.length > 0 && !running && (
          <div className="mr-auto flex gap-2">
            <button
              onClick={() => exportReport('json')}
              className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
            >
              Exportar JSON
            </button>
            <button
              onClick={() => exportReport('html')}
              className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
            >
              Exportar HTML
            </button>
            {rows.some((r) => r.status === 'fail') && (
              <button
                onClick={() =>
                  void run(rows.filter((r) => r.status === 'fail').map((r) => r.entry))
                }
                className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
              >
                Repetir fallidas
              </button>
            )}
          </div>
        )}
        <button
          onClick={onClose}
          className="rounded px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Cerrar
        </button>
        {running ? (
          <button
            onClick={stop}
            className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
          >
            Detener
          </button>
        ) : (
          <button
            onClick={() => void run()}
            disabled={planned.length === 0}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {finished ? 'Ejecutar de nuevo' : 'Ejecutar'}
          </button>
        )}
      </div>
    </Modal>
  )
}