import { useEffect, useMemo, useRef, useState } from 'react'
import { classifyResult, type RunStatus } from '../../../shared/classify'
import type {
  AssertionResult,
  HttpMethod,
  RequestItem,
  SavedRequest,
  SchemaValidation,
  SendRequestResult
} from '../../../shared/types'
import { METHOD_COLORS } from '../lib/methodColors'
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
}

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
  const loadSaved = useRequestStore((s) => s.loadSaved)

  const [includeWrites, setIncludeWrites] = useState(false)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const runId = useRef(0)

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

  const run = async (): Promise<void> => {
    const myRun = ++runId.current
    const env = useEnvironmentStore.getState().getActive()
    setRows([])
    setFinished(false)
    setRunning(true)

    for (const entry of planned) {
      if (runId.current !== myRun) return
      let row: Row
      try {
        const saved = await window.api.readRequest(entry.item.path)
        const { response, validation, requestValidation, assertionResults } = await executeRequest(
          saved,
          env
        )
        const verdict = classifyResult(response, validation, assertionResults, requestValidation)
        row = {
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
        row = {
          entry,
          status: 'fail',
          detail: err instanceof Error ? err.message : 'Error desconocido',
          timeMs: 0
        }
      }
      if (runId.current !== myRun) return
      setRows((r) => [...r, row])
    }

    setRunning(false)
    setFinished(true)
  }

  const stop = (): void => {
    runId.current++
    setRunning(false)
    setFinished(true)
  }

  const openRow = (row: Row): void => {
    if (!row.saved) return
    loadSaved(row.saved, row.entry.item.path)
    useRequestStore.setState({
      response: row.response ?? null,
      validation: row.validation ?? null,
      assertionResults: row.assertionResults ?? [],
      warnings: []
    })
    onClose()
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
        </div>
      )}

      {started && (
        <>
          <div className="mb-3 flex items-center gap-4 text-xs">
            <span className="text-emerald-400">✓ {count('pass')}</span>
            <span className="text-amber-400">⚠ {count('warn')}</span>
            <span className="text-red-400">✗ {count('fail')}</span>
            <span className="text-zinc-500">
              {rows.length}/{planned.length}
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
            {running && rows.length < planned.length && (
              <p className="px-3 py-2 text-xs text-zinc-500">Ejecutando…</p>
            )}
          </div>
        </>
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
            onClick={stop}
            className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
          >
            Detener
          </button>
        ) : (
          <button
            onClick={run}
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