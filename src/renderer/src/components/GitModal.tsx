import { useEffect, useState } from 'react'
import {
  parseDiff,
  type GitActionResult,
  type GitChange,
  type GitDiffLineKind,
  type GitDiffResult,
  type GitStatusResult
} from '../../../shared/git'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { Modal } from './Modal'

const CHANGE: Record<GitChange, { label: string; className: string }> = {
  new: { label: 'Nueva', className: 'text-emerald-400' },
  modified: { label: 'Modificada', className: 'text-amber-400' },
  deleted: { label: 'Eliminada', className: 'text-red-400' },
  renamed: { label: 'Renombrada', className: 'text-blue-400' },
  conflict: { label: 'Conflicto', className: 'text-red-400' }
}

const DIFF_LINE: Record<GitDiffLineKind, string> = {
  add: 'bg-emerald-500/10 text-emerald-300',
  del: 'bg-red-500/10 text-red-300',
  hunk: 'text-blue-400',
  context: 'text-zinc-400',
  meta: 'text-zinc-500'
}

export function GitModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const refreshCollections = useCollectionsStore((s) => s.refresh)
  const [data, setData] = useState<GitStatusResult | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [diff, setDiff] = useState<{ path: string; result: GitDiffResult } | null>(null)

  useEffect(() => {
    let alive = true
    window.api.gitStatus().then((result) => {
      if (alive) setData(result)
    })
    return () => {
      alive = false
    }
  }, [])

  const run = async (action: () => Promise<GitActionResult>): Promise<boolean> => {
    setBusy(true)
    setError('')
    const result = await action()
    if (!result.ok) setError(result.error)
    setData(await window.api.gitStatus())
    setSelected(null)
    setDiff(null)
    setBusy(false)
    return result.ok
  }

  const commit = async (): Promise<void> => {
    if (await run(() => window.api.gitCommit(message))) setMessage('')
  }

  const openDiff = async (path: string): Promise<void> => {
    if (selected === path) {
      setSelected(null)
      return
    }
    setSelected(path)
    const result = await window.api.gitDiff(path)
    setDiff({ path, result })
  }

  const discard = async (path: string): Promise<void> => {
    const ok = confirm(
      `¿Descartar los cambios de "${path}"?\n\nVolverá a como estaba en el último commit. Esto no se puede deshacer.`
    )
    if (!ok) return
    await run(() => window.api.gitDiscard(path))
    // El archivo cambió en disco: se recarga el árbol de colecciones
    await refreshCollections()
  }

  const repo = data?.ok && data.state === 'repo' ? data : null
  const files = repo?.status.files ?? []

  // Solo se muestra el diff si corresponde al archivo elegido (evita mezclar respuestas tardías)
  const diffView = selected !== null && diff?.path === selected ? diff.result : null
  const diffLines = diffView?.ok ? parseDiff(diffView.diff).filter((l) => l.kind !== 'meta') : []

  // Descartar solo tiene sentido en archivos que ya estuvieron en un commit
  const selectedFile = files.find((f) => f.path === selected)
  const canDiscard =
    !!selectedFile &&
    (selectedFile.change === 'modified' || selectedFile.change === 'deleted') &&
    (repo?.commits.length ?? 0) > 0

  return (
    <Modal title="Git" onClose={onClose} wide>
      {data === null && <p className="p-4 text-xs text-zinc-500">Cargando…</p>}

      {data && !data.ok && (
        <p className="selectable whitespace-pre-wrap rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300">
          {data.error}
        </p>
      )}

      {data?.ok && data.state === 'no-git' && (
        <p className="text-xs text-zinc-400">
          Git no está instalado o no se encuentra en el PATH. Instálalo desde git-scm.com y vuelve a
          abrir esta herramienta.
        </p>
      )}

      {data?.ok && data.state === 'no-repo' && (
        <>
          <p className="mb-3 text-xs text-zinc-400">
            Tu carpeta de trabajo todavía no es un repositorio. Al iniciarlo, podrás ver qué
            peticiones cambiaron y guardar versiones de tus colecciones. La papelera de Sonda no se
            versiona.
          </p>
          <button
            onClick={() => void run(() => window.api.gitInit())}
            disabled={busy}
            className="btn btn-primary"
          >
            {busy ? 'Iniciando…' : 'Iniciar repositorio'}
          </button>
        </>
      )}

      {repo && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded bg-zinc-800 px-2 py-1 font-mono text-zinc-200">
              {repo.status.branch}
            </span>
            {repo.status.ahead > 0 && (
              <span className="text-zinc-400">↑ {repo.status.ahead} por subir</span>
            )}
            {repo.status.behind > 0 && (
              <span className="text-zinc-400">↓ {repo.status.behind} por bajar</span>
            )}
          </div>

          <div className="max-h-56 overflow-auto rounded-md border border-zinc-800">
            {files.length === 0 ? (
              <p className="p-4 text-xs text-zinc-500">No hay cambios sin guardar.</p>
            ) : (
              <ul className="divide-y divide-zinc-800 text-xs">
                {files.map((f) => (
                  <li key={f.path}>
                    <button
                      onClick={() => void openDiff(f.path)}
                      title="Ver cambios"
                      className={`flex w-full items-center gap-3 px-3 py-1.5 text-left transition-colors hover:bg-zinc-800/60 ${
                        selected === f.path ? 'bg-zinc-800' : ''
                      }`}
                    >
                      <span className={`w-20 shrink-0 ${CHANGE[f.change].className}`}>
                        {CHANGE[f.change].label}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate font-mono text-zinc-300"
                        title={f.path}
                      >
                        {f.path}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {selected && (
            <div className="mt-3 overflow-hidden rounded-md border border-zinc-800">
              <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-1.5 text-[11px]">
                <span className="min-w-0 truncate font-mono text-zinc-500" title={selected}>
                  {selected}
                </span>
                {canDiscard && (
                  <button
                    onClick={() => void discard(selected)}
                    disabled={busy}
                    className="shrink-0 rounded px-2 py-1 text-red-400 hover:bg-zinc-800 disabled:opacity-40"
                  >
                    Descartar cambios
                  </button>
                )}
              </div>

              {diffView === null ? (
                <p className="p-3 text-xs text-zinc-500">Cargando…</p>
              ) : !diffView.ok ? (
                <p className="p-3 text-xs text-red-300">{diffView.error}</p>
              ) : diffLines.length === 0 ? (
                <p className="p-3 text-xs text-zinc-500">
                  No hay diferencias de texto para mostrar.
                </p>
              ) : (
                <div className="selectable max-h-64 overflow-auto py-1 font-mono text-[11px] leading-5">
                  {diffLines.map((line, i) => (
                    <div key={i} className={`whitespace-pre px-3 ${DIFF_LINE[line.kind]}`}>
                      {line.text || ' '}
                    </div>
                  ))}
                  {diffView.truncated && (
                    <p className="px-3 pt-1 text-zinc-500">… diff recortado por ser muy largo</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && message.trim() && files.length > 0 && !busy) void commit()
              }}
              placeholder="Mensaje del commit, ej: feat(users): agregar login"
              spellCheck={false}
              disabled={busy}
              className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs outline-none placeholder:text-zinc-500 focus:border-blue-500"
            />
            <button
              onClick={() => void commit()}
              disabled={busy || !message.trim() || files.length === 0}
              className="btn btn-primary shrink-0"
            >
              {busy ? 'Guardando…' : `Commit (${files.length})`}
            </button>
          </div>

          {repo.commits.length > 0 && (
            <ul className="mt-4 space-y-1 text-xs">
              {repo.commits.map((c) => (
                <li key={c.hash} className="flex items-center gap-3">
                  <span className="font-mono text-zinc-500">{c.hash}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-300" title={c.subject}>
                    {c.subject}
                  </span>
                  <span className="shrink-0 text-zinc-500">
                    {new Date(c.date).toLocaleDateString('es')}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 text-[11px] text-zinc-500">
            Sonda guarda los commits en tu computadora. Para subirlos a GitHub o GitLab usa
            <span className="font-mono"> git push</span> desde una terminal.
          </p>
        </>
      )}

      {error && (
        <p className="selectable mt-3 whitespace-pre-wrap rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <button onClick={onClose} className="btn btn-ghost">
          Cerrar
        </button>
      </div>
    </Modal>
  )
}
