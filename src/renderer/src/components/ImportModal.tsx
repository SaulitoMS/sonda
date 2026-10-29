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

  const submit = async (): Promise<void> => {
    if (!url.trim() || loading) return
    setLoading(true)
    setError('')
    const result = await window.api.importSwagger(url.trim())
    setLoading(false)

    if (!result.ok) {
      setError(result.error)
      return
    }
    await Promise.all([refresh(), loadEnvironments()])
    onClose()
  }

  return (
    <Modal title="Importar Swagger / OpenAPI" onClose={onClose}>
      <p className="mb-3 text-xs text-zinc-400">
        Pega la URL del JSON/YAML de la spec o la de su documentación (Swagger UI, /docs…). Sonda
        creará una colección con todos los endpoints y un entorno con su baseUrl.
      </p>

      <input
        autoFocus
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
        placeholder="https://petstore3.swagger.io/api/v3/openapi.json"
        spellCheck={false}
        disabled={loading}
        className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-xs outline-none placeholder:text-zinc-500 focus:border-blue-500"
      />

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
          onClick={submit}
          disabled={loading || !url.trim()}
          className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? 'Importando…' : 'Importar'}
        </button>
      </div>
    </Modal>
  )
}
