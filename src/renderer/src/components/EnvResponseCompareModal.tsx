import { useState } from 'react'
import { compareResponses, type ResponseComparison } from '../../../shared/envResponseCompare'
import type { DiffKind } from '../../../shared/responseDiff'
import { executeRequest } from '../lib/runRequest'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { useRequestStore } from '../store/useRequestStore'
import { Modal } from './Modal'

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS']

const field =
  'w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500 disabled:opacity-50'
const label = 'mb-1 block text-xs font-medium text-zinc-400'

const KIND_STYLE: Record<DiffKind, string> = {
  added: 'bg-emerald-500/15 text-emerald-300',
  removed: 'bg-red-500/15 text-red-300',
  changed: 'bg-amber-500/15 text-amber-300'
}
const KIND_LABEL: Record<DiffKind, string> = {
  added: 'solo en B',
  removed: 'solo en A',
  changed: 'distinto'
}

const show = (v: unknown): string => {
  const text = typeof v === 'string' ? v : String(JSON.stringify(v))
  return text.length > 120 ? `${text.slice(0, 120)}…` : text
}

interface Outcome {
  nameA: string
  nameB: string
  cmp: ResponseComparison
}

export function EnvResponseCompareModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const method = useRequestStore((s) => s.method)
  const url = useRequestStore((s) => s.url)
  const envs = useEnvironmentStore((s) => s.data.environments)
  const activeId = useEnvironmentStore((s) => s.data.activeId)

  const [idA, setIdA] = useState(() => activeId ?? envs[0]?.id ?? '')
  const [idB, setIdB] = useState(
    () => envs.find((e) => e.id !== (activeId ?? envs[0]?.id))?.id ?? ''
  )
  const [ignore, setIgnore] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const safe = SAFE_METHODS.includes(method)
  const canRun = safe && !running && url.trim() !== '' && idA !== '' && idB !== '' && idA !== idB

  const run = async (): Promise<void> => {
    const a = envs.find((e) => e.id === idA)
    const b = envs.find((e) => e.id === idB)
    if (!a || !b) return

    const s = useRequestStore.getState()
    const draft = {
      method: s.method,
      url: s.url,
      headers: s.headers,
      body: s.body,
      bodyForm: s.bodyForm,
      auth: s.auth
    }

    setError('')
    setOutcome(null)
    setRunning(true)
    try {
      // En secuencia, para que las cookies de un entorno no se mezclen con las del otro
      const ra = await executeRequest(draft, a, { path: s.currentFile })
      const rb = await executeRequest(draft, b, { path: s.currentFile })
      const paths = ignore
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
      setOutcome({
        nameA: a.name,
        nameB: b.name,
        cmp: compareResponses(ra.response, rb.response, paths)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  const cmp = outcome?.cmp

  return (
    <Modal
      title="Comparar entornos"
      icon="gitCompare"
      description="Envía la petición actual a dos entornos y compara las respuestas"
      onClose={onClose}
      wide
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
          >
            Cerrar
          </button>
          <button
            onClick={() => void run()}
            disabled={!canRun}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {running ? 'Comparando…' : 'Comparar'}
          </button>
        </>
      }
    >
      <div className="space-y-4 p-5">
        {envs.length < 2 && (
          <p className="text-xs text-amber-400">Necesitas al menos dos entornos para comparar.</p>
        )}
        {!safe && (
          <p className="text-xs text-amber-400">
            Solo se comparan GET, HEAD y OPTIONS, para no modificar datos en dos entornos a la vez.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Entorno A</label>
            <select value={idA} onChange={(e) => setIdA(e.target.value)} className={field}>
              {envs.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Entorno B</label>
            <select value={idB} onChange={(e) => setIdB(e.target.value)} className={field}>
              {envs.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={label}>Ignorar rutas del body (separadas por coma)</label>
          <input
            value={ignore}
            onChange={(e) => setIgnore(e.target.value)}
            placeholder="data.updatedAt, meta.requestId"
            spellCheck={false}
            className={field}
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        {cmp && cmp.errors.length > 0 && (
          <div className="space-y-1 rounded-md bg-red-500/10 p-3 text-xs text-red-300">
            {cmp.errors.map((m) => (
              <p key={m}>{m}</p>
            ))}
          </div>
        )}

        {cmp && cmp.errors.length === 0 && outcome && (
          <div className="space-y-3 text-xs">
            <p
              className={`rounded-md p-3 font-medium ${
                cmp.identical
                  ? 'bg-emerald-500/10 text-emerald-300'
                  : 'bg-amber-500/10 text-amber-300'
              }`}
            >
              {cmp.identical
                ? 'Las respuestas son idénticas.'
                : `Hay diferencias entre ${outcome.nameA} y ${outcome.nameB}.`}
            </p>

            <p className="text-zinc-300">
              Status: <span className="font-mono">{cmp.statusA}</span> →{' '}
              <span className="font-mono">{cmp.statusB}</span>
              {cmp.statusSame ? ' (igual)' : ' (distinto)'}
            </p>

            {cmp.headerChanges.length > 0 && (
              <div>
                <p className="mb-1 font-semibold text-zinc-300">
                  Headers ({cmp.headerChanges.length})
                </p>
                <ul className="space-y-1">
                  {cmp.headerChanges.map((h) => (
                    <li key={h.name} className="flex flex-wrap items-center gap-2 font-mono">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${KIND_STYLE[h.kind]}`}>
                        {KIND_LABEL[h.kind]}
                      </span>
                      <span className="text-zinc-200">{h.name}</span>
                      <span className="text-zinc-500">
                        {h.before ?? '—'} → {h.after ?? '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {cmp.bodyChanges.length > 0 && (
              <div>
                <p className="mb-1 font-semibold text-zinc-300">
                  Body {cmp.bodyKind === 'json' ? 'JSON' : 'texto'} ({cmp.bodyChanges.length})
                </p>
                <ul className="max-h-72 space-y-1 overflow-auto">
                  {cmp.bodyChanges.map((c, i) => (
                    <li
                      key={`${c.path}-${i}`}
                      className="flex flex-wrap items-center gap-2 font-mono"
                    >
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${KIND_STYLE[c.kind]}`}>
                        {KIND_LABEL[c.kind]}
                      </span>
                      <span className="text-zinc-200">{c.path}</span>
                      <span className="break-all text-zinc-500">
                        {c.kind === 'added'
                          ? show(c.after)
                          : c.kind === 'removed'
                            ? show(c.before)
                            : `${show(c.before)} → ${show(c.after)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
