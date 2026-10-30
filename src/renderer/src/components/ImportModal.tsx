import { useState } from 'react'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { Modal } from './Modal'

export function ImportModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const refresh = useCollectionsStore((s) => s.refresh)
  const loadEnvironments = useEnvironmentStore((s) => s.load)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const run = async (source: string): Promise<void> => {
    if (!source.trim() || loading) return
    setLoading(true)
    setError('')
    const result = await window.api.importSwagger(source.trim())
    setLoading(false)

    if (!result.ok) {
      setError(result.error)
      return
    }
    await Promise.all([refresh(), loadEnvironments()])
    onClose()
  }

  const pickFile = async (): Promise<void> => {
    if (loading) return
    const file = await window.api.pickFile()
    if (!file) return
    setUrl(file)
    await run(file)
  }

  return (
    <Modal title="Importar Swagger / OpenAPI" onClose={onClose}>
      <p className="mb-3 text-xs text-zinc-400">
        Pega la URL del JSON/YAML de la spec o la de su documentación (Swagger UI, /docs…), o elige
        un archivo local. Sonda creará una colección con todos los endpoints y un entorno con su
        baseUrl.
      </p>

      <div className="flex gap-2">
        <input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') run(url)
          }}
          placeholder="https://petstore3.swagger.io/api/v3/openapi.json"
          spellCheck={false}
          disabled={loading}
          className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-xs outline-none placeholder:text-zinc-500 focus:border-blue-500"
        />
        <button
          onClick={pickFile}
          disabled={loading}
          title="Importar desde un archivo .json / .yaml / .yml"
          className="shrink-0 rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          Archivo…
        </button>
      </div>

      {error && (
        <p className="selectable mt-3 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-md px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200"
        >
          Cancelar
        </button>
        <button
          onClick={() => run(url)}
          disabled={loading || !url.trim()}
          className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? 'Importando…' : 'Importar'}
        </button>
      </div>
    </Modal>
  )
}
