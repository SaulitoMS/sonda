import { useState } from 'react'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { Icon, type IconName } from './Icon'
import { Modal } from './Modal'

type Source = 'swagger' | 'file'

const SOURCES: { id: Source; label: string; icon: IconName }[] = [
  { id: 'swagger', label: 'Swagger / OpenAPI', icon: 'globe' },
  { id: 'file', label: 'Postman / Insomnia / Hoppscotch / Bruno / HAR / .http', icon: 'upload' }
]

export function ImportModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const refresh = useCollectionsStore((s) => s.refresh)
  const loadEnvironments = useEnvironmentStore((s) => s.load)
  const [source, setSource] = useState<Source>('swagger')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<{ count: number; warnings: string[] } | null>(null)

  const switchSource = (s: Source): void => {
    if (loading) return
    setSource(s)
    setError('')
    setNotice(null)
  }

  // ── Swagger / OpenAPI ──
  const runSwagger = async (src: string): Promise<void> => {
    if (!src.trim() || loading) return
    setLoading(true)
    setError('')
    const result = await window.api.importSwagger(src.trim())
    setLoading(false)

    if (!result.ok) {
      setError(result.error)
      return
    }
    await Promise.all([refresh(), loadEnvironments()])
    onClose()
  }

  const pickSwaggerFile = async (): Promise<void> => {
    if (loading) return
    const file = await window.api.pickFile()
    if (!file) return
    setUrl(file)
    await runSwagger(file)
  }

  // ── Postman / Insomnia / HAR / .http ──
  const runFile = async (): Promise<void> => {
    if (loading) return
    setLoading(true)
    setError('')
    const result = await window.api.importPostman()
    setLoading(false)

    // null = el usuario canceló el selector de archivos
    if (!result) return
    if (!result.ok) {
      setError(result.error)
      return
    }
    await Promise.all([refresh(), loadEnvironments()])
    if (result.warnings?.length) {
      setNotice({ count: result.count, warnings: result.warnings })
      return
    }
    onClose()
  }

  return (
    <Modal title="Importar" onClose={onClose}>
      {/* Selector de origen */}
      <div className="mb-4 flex w-full items-center gap-0.5 rounded-lg bg-zinc-800 p-0.5">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            onClick={() => switchSource(s.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              source === s.id
                ? 'bg-zinc-900 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Icon name={s.icon} size={14} className={source === s.id ? 'text-blue-400' : ''} />
            {s.label}
          </button>
        ))}
      </div>

      {source === 'swagger' ? (
        <>
          <p className="mb-3 text-xs text-zinc-400">
            Pega la URL del JSON/YAML de la spec o la de su documentación (Swagger UI, /docs…), o
            elige un archivo local. Sonda creará una colección con todos los endpoints y un entorno
            con su baseUrl.
          </p>

          <div className="flex gap-2">
            <input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runSwagger(url)
              }}
              placeholder="https://petstore3.swagger.io/api/v3/openapi.json"
              spellCheck={false}
              disabled={loading}
              className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-xs outline-none placeholder:text-zinc-500 focus:border-blue-500"
            />
            <button
              onClick={pickSwaggerFile}
              disabled={loading}
              title="Importar desde un archivo .json / .yaml / .yml"
              className="shrink-0 rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              Archivo…
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 text-xs text-zinc-400">
            Elige un archivo exportado desde Postman, Insomnia, Hoppscotch o Bruno (.json), una
            captura HAR (.har) o un archivo HTTP de VS Code o JetBrains (.http, .rest). El formato
            se detecta automáticamente y se crea una colección con sus peticiones y variables.
          </p>

          <button
            onClick={runFile}
            disabled={loading}
            className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-700 bg-zinc-800/40 px-4 py-8 text-zinc-400 transition-colors hover:border-blue-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-blue-400">
              <Icon name="upload" size={20} />
            </span>
            <span className="text-xs font-medium">
              {loading ? 'Importando…' : 'Elegir archivo…'}
            </span>
            <span className="text-[11px] text-zinc-500">
              .json (Postman / Insomnia / Hoppscotch / Bruno) · .har · .http / .rest
            </span>
          </button>
        </>
      )}

      {error && (
        <p className="selectable mt-3 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300">
          {error}
        </p>
      )}

      {notice && (
        <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
            <Icon name="alert" size={14} />
            Se importaron {notice.count} peticiones con avisos
          </p>
          <ul className="selectable mt-2 max-h-40 list-disc space-y-1 overflow-auto pl-5 text-xs text-zinc-300">
            {notice.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="btn btn-ghost">
          {notice ? 'Cerrar' : 'Cancelar'}
        </button>
        {source === 'swagger' && (
          <button
            onClick={() => runSwagger(url)}
            disabled={loading || !url.trim()}
            className="btn btn-primary"
          >
            {loading ? 'Importando…' : 'Importar'}
          </button>
        )}
      </div>
    </Modal>
  )
}
