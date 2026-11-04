import { useState } from 'react'
import { compareResponses, type EnvComparison } from '../../../shared/envCompare'
import type { DiffKind } from '../../../shared/responseDiff'
import { executeRequest } from '../lib/runRequest'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { useRequestStore } from '../store/useRequestStore'
import { Modal } from './Modal'

const MAX_SHOWN = 50

const field =
  'w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500'
const label = 'mb-1 block text-xs font-medium text-zinc-400'

const KIND_STYLE: Record<DiffKind, string> = {
  added: 'text-emerald-400',
  removed: 'text-red-400',
  changed: 'text-amber-400'
}
const KIND_LABEL: Record<DiffKind, string> = {
  added: 'solo en B',
  removed: 'solo en A',
  changed: 'distinto'
}

const short = (v: unknown): string => {
  const t = typeof v === 'string' ? v : (JSON.stringify(v) ?? '')
  return t.length > 60 ? `${t.slice(0, 60)}…` : t
}

export function EnvCompareModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const envs = useEnvironmentStore((s) => s.data.environments)
  const activeId = useEnvironmentStore((s) => s.data.activeId)
  const method = useRequestStore((s) => s.method)
  const url = useRequestStore((s) => s.url)

  const firstId = activeId ?? envs[0]?.id ?? ''
  const [idA, setIdA] = useState(firstId)
  const [idB, setIdB] = useState(envs.find((e) => e.id !== firstId)?.id ?? '')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<EnvComparison | null>(null)

  const envA = envs.find((e) => e.id === idA)
  const envB = envs.find((e) => e.id === idB)

  const run = async (): Promise<void> => {
    const s = useRequestStore.getState()
    if (!s.url.trim()) {
      setError('La petición no tiene URL.')
      return
    }
    if (!envA || !envB || envA.id === envB.id) {
      setError('Elige dos entornos distintos.')
      return
    }

    const draft = {
      method: s.method,
      url: s.url,
      headers: s.headers,
      body: s.body,
      bodyForm: s.bodyForm,
      auth: s.auth
    }

    setError('')
    setResult(null)
    setRunning(true)
    try {
      const [a, b] = await Promise.all([
        executeRequest(draft, envA, { path: s.currentFile }),
        executeRequest(draft, envB, { path: s.currentFile })
      ])
      setResult(compareResponses(a.response, b.response))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo comparar')
    } finally {
      setRunning(false)
    }
  }

  return (
    <Modal title="Comparar entornos" onClose={onClose} wide>
      <p className="mb-3 truncate text-xs text-zinc-400">
        <span className="font-bold text-zinc-200">{method}</span> {url || '(sin URL)'}
      </p>

      {envs.length < 2 ? (
        <p className="text-xs text-zinc-500">Necesitas al menos dos entornos para comparar.</p>
      ) : (
        <div className="flex items-end gap-3">
          <label className="flex-1">
            <span className={label}>Entorno A</span>
            <select className={field} value={idA} onChange={(e) => setIdA(e.target.value)}>
              {envs.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1">
            <span className={label}>Entorno B</span>
            <select className={field} value={idB} onChange={(e) => setIdB(e.target.value)}>
              {envs.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={run}
            disabled={running}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {running ? 'Comparando…' : 'Comparar'}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {result?.kind === 'error' && (
        <div className="mt-4 space-y-1 text-xs text-red-400">
          {result.errorA && (
            <p>
              {envA?.name}: {result.errorA}
            </p>
          )}
          {result.errorB && (
            <p>
              {envB?.name}: {result.errorB}
            </p>
          )}
        </div>
      )}

      {result?.kind === 'compared' && (
        <div className="mt-4 space-y-4">
          <p
            className={`text-xs font-semibold ${result.identical ? 'text-emerald-400' : 'text-amber-400'}`}
          >
            {result.identical
              ? 'Las respuestas son equivalentes ✓'
              : 'Hay diferencias entre los dos entornos'}
          </p>

          <div className="grid grid-cols-2 gap-2">
            {[
              { name: envA?.name, status: result.statusA, time: result.timeA },
              { name: envB?.name, status: result.statusB, time: result.timeB }
            ].map((c, i) => (
              <div key={i} className="rounded-md border border-zinc-800 bg-zinc-950 p-2">
                <p className="text-[11px] text-zinc-500">{c.name}</p>
                <p
                  className={`text-sm font-semibold ${
                    result.statusA !== result.statusB ? 'text-amber-400' : 'text-zinc-100'
                  }`}
                >
                  {c.status} <span className="text-xs font-normal text-zinc-400">{c.time} ms</span>
                </p>
              </div>
            ))}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-zinc-300">
              Headers{' '}
              <span className="font-normal text-zinc-500">
                ({result.headerDiffs.length}{' '}
                {result.headerDiffs.length === 1 ? 'diferencia' : 'diferencias'})
              </span>
            </p>
            {result.headerDiffs.slice(0, MAX_SHOWN).map((h) => (
              <p key={h.name} className="truncate font-mono text-[11px] text-zinc-400">
                <span className={KIND_STYLE[h.kind]}>{KIND_LABEL[h.kind]}</span> {h.name}
                {h.kind === 'changed' && ` : ${short(h.a)} → ${short(h.b)}`}
                {h.kind === 'added' && ` : ${short(h.b)}`}
                {h.kind === 'removed' && ` : ${short(h.a)}`}
              </p>
            ))}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-zinc-300">
              Body{' '}
              <span className="font-normal text-zinc-500">
                {result.bodyMode === 'json'
                  ? `(JSON, ${result.bodyChanges.length} ${result.bodyChanges.length === 1 ? 'cambio' : 'cambios'})`
                  : result.bodyEqual
                    ? '(texto, igual)'
                    : '(texto, distinto)'}
              </span>
            </p>
            <div className="max-h-56 overflow-auto">
              {result.bodyChanges.slice(0, MAX_SHOWN).map((c) => (
                <p key={c.path} className="truncate font-mono text-[11px] text-zinc-400">
                  <span className={KIND_STYLE[c.kind]}>{KIND_LABEL[c.kind]}</span> {c.path}
                  {c.kind === 'changed' && ` : ${short(c.before)} → ${short(c.after)}`}
                  {c.kind === 'added' && ` : ${short(c.after)}`}
                  {c.kind === 'removed' && ` : ${short(c.before)}`}
                </p>
              ))}
              {result.bodyChanges.length > MAX_SHOWN && (
                <p className="mt-1 text-[11px] text-zinc-500">
                  …y {result.bodyChanges.length - MAX_SHOWN} más
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          onClick={onClose}
          className="rounded px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Cerrar
        </button>
      </div>
    </Modal>
  )
}
