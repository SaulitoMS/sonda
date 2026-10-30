import { useMemo, useState } from 'react'
import type { DiffKind } from '../../../shared/responseDiff'
import {
  compareSnapshot,
  DEFAULT_IGNORE,
  MAX_SNAPSHOT_CHARS,
  parseIgnore,
  snapshotKey
} from '../../../shared/snapshot'
import { useRequestStore } from '../store/useRequestStore'
import { useSnapshotStore } from '../store/useSnapshotStore'
import { Modal } from './Modal'

const field =
  'w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500'
const label = 'mb-1 block text-xs font-medium text-zinc-400'

const KIND_UI: Record<DiffKind, { sign: string; cls: string }> = {
  added: { sign: '+', cls: 'text-emerald-400' },
  removed: { sign: '−', cls: 'text-red-400' },
  changed: { sign: '~', cls: 'text-amber-400' }
}

const short = (v: unknown): string => {
  const text = JSON.stringify(v) ?? 'undefined'
  return text.length > 70 ? `${text.slice(0, 70)}…` : text
}

interface Props {
  onClose: () => void
}

export function SnapshotModal({ onClose }: Props): React.JSX.Element {
  const method = useRequestStore((s) => s.method)
  const url = useRequestStore((s) => s.url)
  const currentFile = useRequestStore((s) => s.currentFile)
  const response = useRequestStore((s) => s.response)

  const key = snapshotKey(currentFile, method, url)
  const snapshot = useSnapshotStore((s) => s.snapshots[key])
  const save = useSnapshotStore((s) => s.save)
  const remove = useSnapshotStore((s) => s.remove)
  const setIgnore = useSnapshotStore((s) => s.setIgnore)

  const [ignoreText, setIgnoreText] = useState(() => (snapshot?.ignore ?? DEFAULT_IGNORE).join(', '))
  const [error, setError] = useState('')

  const current = response && response.ok ? response : null

  const comparison = useMemo(
    () => (snapshot && current ? compareSnapshot(snapshot, current) : null),
    [snapshot, current]
  )

  const saveCurrent = (): void => {
    if (!current) return
    setError('')
    if (current.body.length > MAX_SNAPSHOT_CHARS) {
      setError('La respuesta es demasiado grande para guardarla como línea base.')
      return
    }
    try {
      JSON.parse(current.body)
    } catch {
      setError('Solo se pueden guardar respuestas JSON.')
      return
    }
    const ok = save({
      key,
      method,
      url: url.trim(),
      status: current.status,
      body: current.body,
      savedAt: Date.now(),
      ignore: parseIgnore(ignoreText)
    })
    if (!ok) setError('No hay espacio en el almacenamiento local. Limpia el historial e inténtalo de nuevo.')
  }

  return (
    <Modal title="Línea base de respuesta" onClose={onClose} wide>
      <p className="mb-3 truncate text-xs text-zinc-400">
        <span className="font-bold text-zinc-200">{method}</span> {url || '(sin URL)'}
      </p>

      <div>
        <label className={label}>Campos a ignorar al comparar (separados por coma)</label>
        <input
          value={ignoreText}
          onChange={(e) => setIgnoreText(e.target.value)}
          onBlur={() => snapshot && setIgnore(key, parseIgnore(ignoreText))}
          spellCheck={false}
          className={field}
        />
        <p className="mt-1 text-[11px] text-zinc-500">
          Se ignoran en cualquier nivel del JSON. Útil para fechas, ids de traza, etc.
        </p>
      </div>

      <div className="mt-4 text-xs text-zinc-400">
        {snapshot ? (
          <p>
            Línea base: status <b className="text-zinc-200">{snapshot.status}</b>, guardada el{' '}
            {new Date(snapshot.savedAt).toLocaleString()}.
          </p>
        ) : (
          <p>Esta petición aún no tiene línea base.</p>
        )}
        {!current && (
          <p className="mt-1 text-amber-400">
            Envía la petición para tener una respuesta con la que trabajar.
          </p>
        )}
      </div>

      {comparison?.state === 'invalid' && (
        <p className="mt-3 text-xs text-amber-400">{comparison.reason}</p>
      )}

      {comparison?.state === 'ready' && (
        <div className="mt-3 space-y-2">
          {comparison.statusBefore !== comparison.statusAfter && (
            <p className="text-xs text-red-400">
              Cambió el status: {comparison.statusBefore} → {comparison.statusAfter}
            </p>
          )}
          {comparison.identical ? (
            <p className="text-xs text-emerald-400">✓ La respuesta coincide con la línea base.</p>
          ) : (
            comparison.changes.length > 0 && (
              <div className="max-h-64 overflow-y-auto rounded-md border border-zinc-800">
                {comparison.changes.map((c, i) => (
                  <div
                    key={`${c.path}-${i}`}
                    className="flex gap-2 border-b border-zinc-800 px-2 py-1.5 font-mono text-[11px] last:border-b-0"
                  >
                    <span className={`w-3 shrink-0 font-bold ${KIND_UI[c.kind].cls}`}>
                      {KIND_UI[c.kind].sign}
                    </span>
                    <span className="shrink-0 text-zinc-200">{c.path}</span>
                    <span className="min-w-0 truncate text-zinc-500">
                      {c.kind === 'added' && short(c.after)}
                      {c.kind === 'removed' && short(c.before)}
                      {c.kind === 'changed' && `${short(c.before)} → ${short(c.after)}`}
                    </span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Cerrar
        </button>
        {snapshot && (
          <button
            onClick={() => remove(key)}
            className="rounded px-3 py-1.5 text-xs text-red-400 hover:bg-zinc-800"
          >
            Eliminar línea base
          </button>
        )}
        <button
          onClick={saveCurrent}
          disabled={!current}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {snapshot ? 'Actualizar con la respuesta actual' : 'Guardar respuesta actual'}
        </button>
      </div>
    </Modal>
  )
}